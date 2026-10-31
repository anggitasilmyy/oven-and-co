// Step 6.4.9 (hasil audit AD-09) — klaim voucher checkout bersyarat: POST /api/orders (FR-13 · BR-10).
// Voucher dievaluasi checkout dari SELECT biasa; Owner bisa mengubah/menonaktifkan voucher sebelum klaim. Klaim (UPDATE
// vouchers bersyarat) harus gagal 409 bila voucher tidak lagi sama/berlaku, dan seluruh checkout di-rollback.
// Perubahan Owner disisipkan lewat hook `beforeStockUpdate` (setelah voucher dievaluasi, sebelum klaim). Prisma
// dipalsukan (tests/helpers/orderDb.js) — urutan kunci & current read MySQL dibuktikan di uji integrasi MySQL 8.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { installOrderDb } = require('./helpers/orderDb');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

const NOW = new Date('2026-10-20T01:00:00Z'); // Selasa 20 Okt 2026 08.00 WIB
const dayKey = (n) => new Date(Date.UTC(2026, 9, 20 + n)).toISOString().slice(0, 10);
const dbDay = (n) => new Date(`${dayKey(n)}T00:00:00.000Z`);

let db;
let server;
let baseUrl;

test.before(async () => {
  test.mock.timers.enable({ apis: ['Date'], now: NOW });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test.beforeEach(() => {
  db = installOrderDb(fakePrisma, { today: dbDay(0), plusDays: dbDay });
});

const token = jwt.sign({ sub: '1' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const place = async (overrides = {}) => {
  const res = await fetch(`${baseUrl}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      items: [{ cart_item_id: 'c1', product_id: '1', quantity: 2, note: '' }], fulfillment: 'pickup', address_id: null,
      ready_date: dayKey(0), time_slot: '09.00–11.00', voucher_code: 'HEMAT10', use_points: true, method_code: 'qris', ...overrides,
    }),
  });
  return { status: res.status, json: await res.json() };
};
const hemat10 = () => db.t.vouchers.find((v) => v.voucherId === 1n);
const claimOf = () => db.t.userVouchers.find((c) => c.userId === 1n && c.voucherId === 1n);
const stockSold = () => db.t.dailyStocks.find((s) => s.productId === 1n).qtySold;
/**
 * Owner mengubah voucher SETELAH checkout mengevaluasinya dan SEBELUM klaim. Baris diganti objek baru (versi baru),
 * karena findUnique palsu mengembalikan objek tabel yang sama — Prisma sungguhan selalu mengembalikan salinan.
 */
const ownerChangesBeforeClaim = (patch) => {
  db.hooks.beforeStockUpdate = () => {
    const i = db.t.vouchers.findIndex((v) => v.voucherId === 1n);
    db.t.vouchers[i] = { ...db.t.vouchers[i], ...patch };
  };
};

/** Keadaan yang tidak boleh diubah checkout yang ditolak (diambil SEBELUM checkout dimulai) */
function captureState() {
  return {
    orders: db.t.orders.length,
    orderItems: db.t.orderItems.length,
    payments: db.t.payments.length,
    statusHistories: db.t.statusHistories.length,
    pointTransactions: db.t.pointTransactions.length,
    stockSold: stockSold(),
    claimUsedAt: claimOf().usedAt,
    quota: hemat10().quota,
  };
}

/**
 * Checkout ditolak → semua tabel yang disentuh checkout sama dengan sebelum checkout dimulai, termasuk vouchers.quota
 * (klaim tidak mengurangi kuota). Catatan fake: $transaction palsu memulihkan SELURUH tabel dari snapshot awal transaksi,
 * jadi perubahan Owner yang disisipkan lewat hook ikut kembali; di MySQL commit Owner tetap tersimpan (dibuktikan di uji
 * integrasi MySQL 8). Fake juga memakai satu klien untuk tx & global — bukti rollback sesungguhnya ada di uji MySQL.
 */
function assertRolledBack(before) {
  assert.equal(db.t.orders.length, before.orders, 'orders');
  assert.equal(db.t.orderItems.length, before.orderItems, 'order_items');
  assert.equal(db.t.payments.length, before.payments, 'payments');
  assert.equal(db.t.statusHistories.length, before.statusHistories, 'order_status_histories');
  assert.equal(db.t.pointTransactions.length, before.pointTransactions, 'point_transactions');
  assert.equal(stockSold(), before.stockSold, 'daily_stocks.qty_sold');
  assert.equal(claimOf().usedAt, before.claimUsedAt, 'user_vouchers.used_at');
  assert.equal(hemat10().quota, before.quota, 'vouchers.quota');
}

const rejects = [
  ['dinonaktifkan', { isActive: false }],
  ['nilai diskon diubah', { discountValue: '1000.00' }],
  ['jenis diskon diubah', { discountType: 'percent', discountValue: '10.00' }],
  ['dibatasi ke produk lain', { productId: 6n }],
  ['dibatasi ke produk yang sama di keranjang (berbeda dari yang dievaluasi)', { productId: 1n }],
  ['kode diubah', { code: 'HEMAT10BARU' }],
  ['periode berakhir kemarin', { validTo: dbDay(-1) }],
  ['periode mulai besok', { validFrom: dbDay(1) }],
  ['kuota habis', { quota: 0 }],
];
for (const [label, patch] of rejects) {
  test(`Owner lebih dahulu — voucher ${label} sebelum klaim → 409 & seluruh checkout rollback`, async () => {
    const before = captureState();
    assert.equal(before.claimUsedAt, null); // prasyarat: klaim belum terpakai
    ownerChangesBeforeClaim(patch);
    const { status, json } = await place();
    assert.deepEqual([status, json.message], [409, 'Voucher tidak berlaku untuk pesanan ini']);
    assertRolledBack(before);
  });
}

test('kuota berubah oleh checkout lain (masih > 0) → tetap berhasil; kuota dikurangi dari nilai TERBARU', async () => {
  ownerChangesBeforeClaim({ quota: 2 }); // dua pemakaian lain di sela evaluasi (awal 5)
  const { status } = await place();
  assert.equal(status, 201);
  assert.deepEqual([hemat10().quota, db.t.orders[0].voucherDiscount, db.t.orders[0].voucherId], [1, 10000, 1n]);
});

test('perubahan yang tidak memengaruhi diskon (judul, kuota dinaikkan, periode diperpanjang) → tetap berhasil', async () => {
  ownerChangesBeforeClaim({ title: 'Judul baru', quota: 50, validTo: dbDay(30) });
  const { status } = await place();
  assert.equal(status, 201);
  assert.deepEqual([hemat10().quota, claimOf().usedAt instanceof Date], [49, true]);
});

test('tanpa perubahan → berhasil seperti sebelumnya (kuota −1, klaim terpakai, poin ditukar)', async () => {
  const { status } = await place();
  assert.equal(status, 201);
  assert.deepEqual([hemat10().quota, claimOf().usedAt instanceof Date, db.t.orders[0].voucherDiscount], [4, true, 10000]);
  assert.ok(db.t.pointTransactions.some((p) => p.type === 'redeem'));
});

test('voucher khusus produk (CAKE15, 15%) yang tidak berubah tetap berhasil — syarat product_id & DECIMAL cocok', async () => {
  const { status, json } = await place({
    voucher_code: 'CAKE15', use_points: false, ready_date: dayKey(3),
    items: [{ cart_item_id: 'c9', product_id: '6', design_id: '60', quantity: 1, note: '' }],
  });
  assert.equal(status, 201, JSON.stringify(json));
  assert.deepEqual([db.t.orders[0].voucherDiscount, db.t.vouchers.find((v) => v.voucherId === 2n).quota], [72000, 4]); // 15% × 480.000
});

test('voucher khusus produk diubah ke produk lain sebelum klaim → 409 walau keranjang tetap', async () => {
  // Pesanan custom saja tidak mengambil stok ready (hook stok tidak terpicu) → sisipkan perubahan tepat di awal klaim
  const original = fakePrisma.userVoucher.updateMany;
  fakePrisma.userVoucher.updateMany = async (args) => {
    const i = db.t.vouchers.findIndex((v) => v.voucherId === 2n);
    db.t.vouchers[i] = { ...db.t.vouchers[i], productId: 1n };
    return original(args);
  };
  const { status } = await place({
    voucher_code: 'CAKE15', use_points: false, ready_date: dayKey(3),
    items: [{ cart_item_id: 'c9', product_id: '6', design_id: '60', quantity: 1, note: '' }],
  });
  assert.equal(status, 409);
  assert.deepEqual([db.t.orders.length, db.t.vouchers.find((v) => v.voucherId === 2n).quota], [0, 5]);
});

// ── Checkout lebih dahulu: klaim sudah berhasil, baru Owner mengubah voucher ─────────────────────────────────────
// Hook `beforeOrderCreate` berjalan SETELAH claimVoucher (kuota sudah dikurangi, klaim terpakai) dan sebelum pesanan
// ditulis — meniru Owner yang menyimpan perubahan saat checkout masih memegang kunci baris voucher. Owner hanya
// mengubah informasi (bukan kuota), sama dengan PUT AD-09 yang tidak menulis kuota bila kuota form = expected_quota.
test('Checkout lebih dahulu — Owner mengubah diskon & menonaktifkan SETELAH klaim → checkout 201 dengan aturan lama, perubahan Owner tersimpan, kuota tidak tertimpa', async () => {
  const before = captureState();
  let ownerSawQuota = null;
  db.hooks.beforeOrderCreate = () => {
    const i = db.t.vouchers.findIndex((v) => v.voucherId === 1n);
    ownerSawQuota = db.t.vouchers[i].quota; // kuota setelah klaim checkout
    db.t.vouchers[i] = { ...db.t.vouchers[i], discountValue: '1000.00', isActive: false, title: 'Diubah Owner' };
  };
  const { status, json } = await place();
  assert.equal(status, 201, JSON.stringify(json));

  // Diskon pesanan memakai aturan yang diklaim (Rp 10.000), bukan aturan baru (Rp 1.000)
  const order = db.t.orders.find((o) => o.orderNumber === json.data.order_number);
  assert.deepEqual([order.voucherId, order.voucherDiscount], [1n, 10000]);
  // Perubahan Owner tetap tersimpan setelah checkout selesai
  assert.deepEqual([hemat10().discountValue, hemat10().isActive, hemat10().title], ['1000.00', false, 'Diubah Owner']);
  // Kuota: tepat −1 dari sebelum checkout; Owner melihat nilai setelah klaim dan tidak menimpanya
  assert.deepEqual([ownerSawQuota, hemat10().quota], [before.quota - 1, before.quota - 1]);
  // Tepat satu klaim terpakai, satu pesanan bervoucher, satu pembayaran
  assert.ok(claimOf().usedAt instanceof Date);
  assert.equal(db.t.orders.filter((o) => o.voucherId === 1n).length, 1);
  assert.equal(db.t.orders.length, before.orders + 1);
  assert.equal(db.t.payments.length, before.payments + 1);

  // Tidak ada duplikasi klaim: checkout berikutnya dengan voucher yang sama ditolak tanpa sisa data
  db.hooks.beforeOrderCreate = undefined;
  const after = captureState();
  const again = await place();
  assert.ok([400, 409].includes(again.status) && again.json.message === 'Voucher tidak berlaku untuk pesanan ini', JSON.stringify(again.json));
  assertRolledBack(after);
});

test('Checkout lebih dahulu — kuota terakhir: klaim checkout menghabiskan kuota, perubahan Owner sesudahnya tidak memulihkan kuota', async () => {
  const i0 = db.t.vouchers.findIndex((v) => v.voucherId === 1n);
  db.t.vouchers[i0] = { ...db.t.vouchers[i0], quota: 1 };
  db.hooks.beforeOrderCreate = () => {
    const i = db.t.vouchers.findIndex((v) => v.voucherId === 1n);
    db.t.vouchers[i] = { ...db.t.vouchers[i], validTo: dbDay(60) }; // Owner memperpanjang periode
  };
  const { status } = await place();
  assert.equal(status, 201);
  assert.deepEqual([hemat10().quota, hemat10().validTo.getTime()], [0, dbDay(60).getTime()]);
  assert.equal(db.t.orders.filter((o) => o.voucherId === 1n).length, 1);
});
