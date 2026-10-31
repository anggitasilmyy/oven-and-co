// Regresi tingkat HTTP: POST /api/orders, GET /api/orders/:orderNumber/payment, GET /api/payment-methods
// (FR-12 – FR-16 · BR-01 – BR-07 · BR-09 · BR-10 · BR-12 · TF-12). Prisma dipalsukan (tests/helpers/orderDb.js);
// jam dikunci ke Selasa 20 Okt 2026 08.00 WIB agar slot waktu deterministik. Tes ini TIDAK membuktikan
// locking/transaksi MySQL — hanya bahwa service memakai kunci, UPDATE bersyarat, dan rollback sebagaimana mestinya.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { installOrderDb } = require('./helpers/orderDb');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

const NOW = new Date('2026-10-20T01:00:00Z'); // 08.00 WIB
const dayKey = (n) => new Date(Date.UTC(2026, 9, 20 + n)).toISOString().slice(0, 10);
const dbDay = (n) => new Date(`${dayKey(n)}T00:00:00.000Z`);
const TODAY = dayKey(0);

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

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });

const call = async (method, path, token, body) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json() };
};

const item = (overrides = {}) => ({ cart_item_id: 'c1', product_id: '1', quantity: 2, note: '', ...overrides });
const orderBody = (overrides = {}) => ({
  items: [item()], fulfillment: 'pickup', address_id: null, ready_date: TODAY, time_slot: '09.00–11.00',
  voucher_code: null, use_points: false, method_code: 'qris', ...overrides,
});
const place = (overrides, sub = '1') => call('POST', '/orders', tokenFor(sub), orderBody(overrides));

const snapshot = () => JSON.stringify(db.t, (key, value) => (typeof value === 'bigint' ? String(value) : value));
const stockOf = (productId) => db.t.dailyStocks.find((s) => s.productId === BigInt(productId)).qtySold;
const lastOrder = () => db.t.orders[db.t.orders.length - 1];

// ── Autentikasi & peran ──────────────────────────────────────────────────────────────────────────

test('tamu (tanpa token) → 401 untuk buat pesanan & halaman bayar; tidak ada yang ditulis', async () => {
  const before = snapshot();
  for (const [method, path, body] of [['POST', '/orders', orderBody()], ['GET', '/orders/OVC-261020-001/payment']]) {
    const { status, json } = await call(method, path, null, body);
    assert.equal(status, 401, `${method} ${path}`);
    assert.equal(json.message, 'Autentikasi diperlukan.');
  }
  assert.equal(snapshot(), before);
});

test('token rusak, kedaluwarsa, salah secret, akun nonaktif → 401 SESSION_INVALID', async () => {
  const expired = jwt.sign({ sub: '1', exp: Math.floor(NOW.getTime() / 1000) - 60 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
  const wrongSecret = jwt.sign({ sub: '1' }, 'secret-lain', { algorithm: 'HS256' });

  for (const token of ['token-palsu', expired, wrongSecret, tokenFor('5')]) {
    for (const [method, path, body] of [['POST', '/orders', orderBody()], ['GET', '/orders/OVC-261020-001/payment']]) {
      const { status, json } = await call(method, path, token, body);
      assert.equal(status, 401);
      assert.equal(json.code, 'SESSION_INVALID');
    }
  }
  assert.equal(db.t.orders.length, 0);
});

test('staf & owner → 403 untuk endpoint pesanan pelanggan', async () => {
  for (const sub of ['3', '4']) {
    assert.equal((await place({}, sub)).status, 403);
    assert.equal((await call('GET', '/orders/OVC-261020-001/payment', tokenFor(sub))).status, 403);
  }
  assert.equal(db.t.orders.length, 0);
});

test('GET /payment-methods: hanya Staf/Owner (filter admin), metode aktif saja', async () => {
  assert.equal((await call('GET', '/payment-methods')).status, 401);
  assert.equal((await call('GET', '/payment-methods', tokenFor('1'))).status, 403);

  const { status, json } = await call('GET', '/payment-methods', tokenFor('3'));
  assert.equal(status, 200);
  assert.deepEqual(json.data.map((m) => m.method_code).sort(), ['bca_va', 'pay_at_store', 'qris']);
  assert.deepEqual(Object.keys(json.data[0]).sort(), ['is_active', 'method_code', 'method_group', 'name']);
});

// ── Pembuatan pesanan ────────────────────────────────────────────────────────────────────────────

test('pickup online: harga dari server, stok ready berkurang, pembayaran pending 30 menit, riwayat status', async () => {
  const { status, json } = await place({
    items: [item({ price: 1, line_total: 1, name: 'murah' }), item({ cart_item_id: 'c2', product_id: '2', variant_id: '21', quantity: 1 })],
    user_id: '2', subtotal: 1, total: 1, order_status: 'selesai', payment_status: 'paid',
  });

  assert.equal(status, 201);
  assert.deepEqual(json, { status: 'success', data: { order_number: 'OVC-261020-001', payment_option: 'online' } });

  const order = lastOrder();
  assert.equal(order.userId, 1n);
  assert.equal(order.subtotal, 2 * 28000 + (25000 + 5000));
  assert.equal(order.shippingFee, 0);
  assert.equal(order.total, 86000);
  assert.equal(order.orderStatus, 'menunggu_pembayaran');
  assert.equal(order.paymentStatus, 'unpaid');
  assert.equal(order.paymentOption, 'online');
  assert.match(order.pickupCode, /^PK\d{4}$/);
  assert.equal(order.readyDate.toISOString().slice(0, 10), TODAY);

  assert.deepEqual(db.t.orderItems.map((i) => [i.productId, i.variantId, i.quantity, i.unitPrice, i.note]), [
    [1n, null, 2, 28000, null], [2n, 21n, 1, 30000, null],
  ]);
  const payment = db.t.payments[0];
  assert.equal(payment.methodCode, 'qris');
  assert.equal(payment.amount, 86000);
  assert.equal(payment.status, 'pending');
  assert.equal(payment.paymentCode, 'QRIS-SIM-OVC-261020-001');
  assert.equal(payment.gatewayRef, 'SIM-OVC-261020-001');
  assert.equal(payment.expiredAt.toISOString(), '2026-10-20T01:30:00.000Z');
  assert.deepEqual(db.t.statusHistories.map((h) => [h.status, h.changedBy]), [['menunggu_pembayaran', 1n]]);

  assert.equal(stockOf(1), 4);
  assert.equal(stockOf(2), 5);
  assert.match(db.locks[0].sql, /FROM users WHERE user_id = \? FOR UPDATE/);
  assert.deepEqual(db.locks[0].values, [1n]);
});

test('Bayar di Toko (pickup, semua ready): langsung dikonfirmasi, batas bayar = jam tutup WIB, tanpa kode bayar', async () => {
  const { status, json } = await place({ method_code: 'pay_at_store' });

  assert.equal(status, 201);
  assert.equal(json.data.payment_option, 'pay_at_store');
  assert.equal(lastOrder().orderStatus, 'dikonfirmasi');
  assert.equal(db.t.payments[0].paymentCode, null);
  assert.equal(db.t.payments[0].gatewayRef, null);
  assert.equal(db.t.payments[0].expiredAt.toISOString(), '2026-10-20T13:00:00.000Z'); // 20.00 WIB
  assert.deepEqual(db.t.statusHistories.map((h) => h.status), ['dikonfirmasi']);
});

test('BR-05: Bayar di Toko untuk pre-order atau delivery ditolak; metode nonaktif/tidak dikenal ditolak', async () => {
  const before = snapshot();
  const cases = [
    [{ items: [item({ product_id: '3', quantity: 1 })], ready_date: dayKey(1), method_code: 'pay_at_store' }, 'Tidak tersedia untuk pre-order dan delivery'],
    [{ fulfillment: 'delivery', address_id: '10', method_code: 'pay_at_store' }, 'Tidak tersedia untuk pre-order dan delivery'],
    [{ method_code: 'ovo' }, 'Pilih metode pembayaran.'],
    [{ method_code: 'tidak_ada' }, 'Pilih metode pembayaran.'],
  ];
  for (const [overrides, message] of cases) {
    const { status, json } = await place(overrides);
    assert.equal(status, 400, message);
    assert.equal(json.message, message);
  }
  assert.equal(snapshot(), before);
});

test('delivery: alamat milik sendiri dalam radius → ongkir dari jarak, salinan alamat; alamat lain/jauh ditolak', async () => {
  const before = snapshot();
  assert.deepEqual((await place({ fulfillment: 'delivery', address_id: '20' })).json.message, 'Pilih alamat pengiriman.');
  const far = await place({ fulfillment: 'delivery', address_id: '11' });
  assert.equal(far.status, 400);
  assert.equal(far.json.message, 'Alamat di luar radius pengiriman 10 km');
  assert.equal(snapshot(), before);

  assert.equal((await place({ fulfillment: 'delivery', address_id: '10' })).status, 201);
  const order = lastOrder();
  assert.equal(order.addressId, 10n);
  assert.equal(order.pickupCode, null);
  assert.equal(order.deliveryAddressSnapshot, 'Rumah · Anisa (+6281234567890) · Jl. Dekat 1');
  assert.ok(order.distanceKm > 2 && order.distanceKm < 2.5);
  assert.equal(order.shippingFee, Math.ceil(order.distanceKm) * 2500);
  assert.equal(order.total, 56000 + order.shippingFee);
});

test('voucher + tukar poin (BR-10): diskon dari server, klaim terpakai, kuota −1, poin redeem dicatat', async () => {
  const { status } = await place({ items: [item({ quantity: 4 })], voucher_code: ' hemat10 ', use_points: true });

  assert.equal(status, 201);
  const order = lastOrder();
  // 4 × 28.000 = 112.000 − 10.000 voucher = 102.000; saldo 1.250 → 12 × 100 poin = Rp 60.000
  assert.equal(order.voucherId, 1n);
  assert.equal(order.voucherDiscount, 10000);
  assert.equal(order.pointsUsed, 1200);
  assert.equal(order.pointsDiscount, 60000);
  assert.equal(order.total, 42000);
  assert.equal(db.t.payments[0].amount, 42000);
  assert.ok(db.t.userVouchers.find((c) => c.userId === 1n && c.voucherId === 1n).usedAt instanceof Date);
  assert.equal(db.t.userVouchers.find((c) => c.userId === 2n && c.voucherId === 1n).usedAt, null);
  assert.equal(db.t.vouchers.find((v) => v.voucherId === 1n).quota, 4);
  const redeem = db.t.pointTransactions.find((p) => p.type === 'redeem');
  assert.deepEqual([redeem.userId, redeem.points, redeem.orderId], [1n, -1200, order.orderId]);
});

test('voucher tidak berlaku (belum diklaim, sudah dipakai, kuota habis, tidak dikenal, produk tidak cocok) → 400', async () => {
  const before = snapshot();
  for (const code of ['BELUMKLAIM', 'TERPAKAI', 'HABIS', 'TIDAKADA', 'CAKE15']) {
    const { status, json } = await place({ voucher_code: code });
    assert.equal(status, 400, code);
    assert.equal(json.message, 'Voucher tidak berlaku untuk pesanan ini');
  }
  assert.equal(snapshot(), before);
});

test('kuota voucher terakhir dipakai pelanggan lain di sela validasi → 409 & stok/klaim/poin dibatalkan', async () => {
  db.t.vouchers.find((v) => v.voucherId === 1n).quota = 1;
  // Kunci baris pengguna tidak menyerialkan pelanggan berbeda → kuota dijaga UPDATE bersyarat (quota > 0)
  db.hooks.beforeStockUpdate = () => { db.t.vouchers.find((v) => v.voucherId === 1n).quota = 0; };

  const { status, json } = await place({ voucher_code: 'HEMAT10', use_points: true });

  assert.deepEqual([status, json.message], [409, 'Voucher tidak berlaku untuk pesanan ini']);
  assert.equal(db.t.orders.length, 0);
  assert.equal(stockOf(1), 2);
  assert.equal(db.t.userVouchers.find((c) => c.userId === 1n && c.voucherId === 1n).usedAt, null);
  assert.equal(db.t.pointTransactions.length, 2);
});

test('klaim voucher yang sama dipakai bersamaan oleh pelanggan yang sama → hanya satu yang berhasil', async () => {
  // Meniru kondisi tanpa kunci: klaim ditandai terpakai setelah dibaca transaksi ini
  db.hooks.beforeStockUpdate = () => {
    db.t.userVouchers.find((c) => c.userId === 1n && c.voucherId === 1n).usedAt = new Date(NOW);
  };

  const { status } = await place({ voucher_code: 'HEMAT10' });

  assert.equal(status, 409);
  assert.equal(db.t.vouchers.find((v) => v.voucherId === 1n).quota, 5);
  assert.equal(db.t.orders.length, 0);
});

test('produk nonaktif / varian tidak dikenal / desain orang lain → 400 tidak tersedia, tanpa perubahan', async () => {
  const before = snapshot();
  for (const items of [
    [item({ product_id: '4' })],
    [item({ product_id: '2', variant_id: '99' })],
    [item({ product_id: '6', design_id: '61', quantity: 1 })],
    [item({ product_id: '999' })],
  ]) {
    const { status, json } = await place({ items, ready_date: dayKey(3) });
    assert.equal(status, 400);
    assert.equal(json.message, 'Ada produk yang sudah tidak tersedia. Hapus dari keranjang.');
  }
  assert.equal(snapshot(), before);
});

test('stok ready tidak cukup → 409; stok habis di sela validasi (request bersamaan) → 409 & semua dibatalkan', async () => {
  const before = snapshot();
  const short = await place({ items: [item({ product_id: '2', quantity: 2 })] });
  assert.deepEqual([short.status, short.json.message], [409, 'Stok produk ready tidak mencukupi. Periksa keranjang.']);
  assert.equal(snapshot(), before);

  // Pesanan lain mengambil sisa stok setelah keranjang dihitung tetapi sebelum UPDATE bersyarat
  db.hooks.beforeStockUpdate = () => { db.t.dailyStocks.find((s) => s.productId === 1n).qtySold = 9; };
  const race = await place({ voucher_code: 'HEMAT10', use_points: true });
  assert.equal(race.status, 409);
  assert.equal(db.t.orders.length, 0);
  assert.equal(db.t.userVouchers.find((c) => c.userId === 1n && c.voucherId === 1n).usedAt, null);
  assert.equal(db.t.pointTransactions.length, 2);
  assert.match(db.raw[0].sql, /qty_planned - qty_sold >= \?/);
});

test('custom cake: harga & tanggal dari desain; desain yang terpakai pesanan lain (bersamaan) → 409', async () => {
  const ok = await place({ items: [item({ product_id: '6', design_id: '60', quantity: 1 })], ready_date: dayKey(3) });
  assert.equal(ok.status, 201);
  assert.equal(lastOrder().subtotal, 480000);
  // Urutan kunci: pengguna → penomoran pesanan (store_settings) → desain
  assert.deepEqual(db.locks.map((l) => l.values[0]), [1n, undefined, 60n]);
  assert.match(db.locks[1].sql, /FROM store_settings ORDER BY setting_id LIMIT 1 FOR UPDATE/);
  assert.match(db.locks[2].sql, /FROM custom_cake_designs WHERE design_id = \? FOR UPDATE/);

  // Desain sekali pakai: setelah dipesan, keranjang menandainya tidak tersedia
  const again = await place({ items: [item({ product_id: '6', design_id: '60', quantity: 1 })], ready_date: dayKey(3) });
  assert.equal(again.status, 400);

  // Request lain memakai desain yang sama di sela validasi & kunci → ditolak di dalam transaksi
  db = installOrderDb(fakePrisma, { today: dbDay(0), plusDays: dbDay });
  const countBefore = fakePrisma.orderItem.count;
  fakePrisma.orderItem.count = async () => 1;
  const race = await place({ items: [item({ product_id: '6', design_id: '60', quantity: 1 })], ready_date: dayKey(3) });
  fakePrisma.orderItem.count = countBefore;
  assert.deepEqual([race.status, race.json.message], [409, 'Desain kue sudah dipakai pada pesanan lain. Buat desain baru.']);
  assert.equal(db.t.orders.length, 0);
});

test('tanggal & slot: ready wajib hari ini; pre-order ≥ tanggal siap & ≤ jendela 14 hari; slot yang sudah lewat ditolak', async () => {
  const preorder = [item({ product_id: '3', quantity: 1 })];
  const cases = [
    [{ ready_date: dayKey(1) }, 'Tanggal ambil/antar tidak valid.'],
    [{ items: preorder, ready_date: TODAY }, 'Tanggal ambil/antar tidak valid.'],
    [{ items: preorder, ready_date: dayKey(14) }, 'Tanggal ambil/antar tidak valid.'],
    [{ time_slot: '07.00–09.00' }, 'Pilih slot waktu dalam jam operasional.'], // sudah dimulai (08.00 WIB)
    [{ time_slot: '10.00–12.00' }, 'Pilih slot waktu dalam jam operasional.'], // label tidak dikenal
  ];
  for (const [overrides, message] of cases) {
    const { status, json } = await place(overrides);
    assert.equal(status, 400, message);
    assert.equal(json.message, message);
  }
  assert.equal(db.t.orders.length, 0);

  assert.equal((await place({ items: preorder, ready_date: dayKey(13) })).status, 201);
  // Tutup pada hari itu → tidak ada slot
  db.t.operatingHours = [{ hourId: 1, dayOfWeek: 3, openTime: null, closeTime: null, isOpen: false }];
  const closed = await place({ items: preorder, ready_date: dayKey(1) }); // Rabu
  assert.equal(closed.json.message, 'Pilih slot waktu dalam jam operasional.');
});

test('validasi body: kosong, delivery tanpa alamat, pickup dengan alamat, cart_item_id hilang → 400 tanpa query', async () => {
  const cases = [
    [{ items: [] }, 'Keranjang masih kosong.'],
    [{ fulfillment: 'delivery', address_id: null }, 'Pilih alamat pengiriman.'],
    [{ address_id: '10' }, 'Alamat pengiriman hanya untuk pesanan delivery.'],
    [{ items: [item({ cart_item_id: undefined })] }, 'Item 1: cart_item_id wajib diisi.'],
    [{ use_points: 'ya' }, 'Pilihan tukar poin tidak valid.'],
    [{ method_code: '' }, 'Pilih metode pembayaran.'],
  ];
  for (const [overrides, message] of cases) {
    const { status, json } = await place(overrides);
    assert.equal(status, 400, message);
    assert.equal(json.message, message);
  }
  assert.equal(db.locks.length, 0);
});

test('nomor pesanan berurutan per hari; bentrok UNIQUE (pesanan bersamaan) → dihitung ulang', async () => {
  assert.equal((await place({ items: [item({ quantity: 1 })] })).json.data.order_number, 'OVC-261020-001');
  assert.equal((await place({ items: [item({ quantity: 1 })] })).json.data.order_number, 'OVC-261020-002');

  let collided = false;
  db.hooks.beforeOrderCreate = (data) => {
    if (!collided) {
      collided = true;
      const concurrent = { orderId: 999n, orderNumber: data.orderNumber, userId: 2n };
      db.t.orders.push(concurrent);
      db.committedElsewhere.push(concurrent);
    }
  };
  const { status, json } = await place({ items: [item({ quantity: 1 })] });
  assert.equal(status, 201);
  assert.equal(json.data.order_number, 'OVC-261020-004');
  assert.equal(stockOf(1), 5); // stok percobaan pertama ikut dibatalkan
});

test('error database → 500 pesan umum; transaksi gagal tidak meninggalkan stok/voucher/poin berubah', async (t) => {
  t.mock.method(console, 'error', () => {});
  const before = snapshot();
  db.failOn = 'order.create';

  const { status, json } = await place({ voucher_code: 'HEMAT10', use_points: true });

  assert.equal(status, 500);
  assert.deepEqual(json, { status: 'error', message: 'Terjadi kesalahan pada server.' });
  assert.equal(snapshot(), before);
});

// ── Halaman bayar ────────────────────────────────────────────────────────────────────────────────

test('GET /orders/:no/payment: bentuk data C-15/C-16 untuk pemilik; pelanggan lain 404; nomor rusak 400', async () => {
  await place({});

  const { status, json } = await call('GET', '/orders/OVC-261020-001/payment', tokenFor('1'));
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(json.data).sort(), [
    'item_count', 'method', 'order', 'pay_at_store_allowed', 'payment', 'points_to_earn', 'seconds_left',
  ]);
  assert.equal(json.data.order.order_number, 'OVC-261020-001');
  assert.equal(json.data.order.user_id, '1');
  assert.equal(json.data.order.total, 56000);
  assert.equal(json.data.order.ready_date, TODAY);
  assert.equal(json.data.payment.status, 'pending');
  assert.equal(json.data.payment.amount, 56000);
  assert.deepEqual(json.data.method, { method_code: 'qris', name: 'QRIS', method_group: 'qris', is_active: true });
  assert.equal(json.data.item_count, 2);
  assert.equal(json.data.seconds_left, 1800);
  assert.equal(json.data.points_to_earn, 56);
  assert.equal(json.data.pay_at_store_allowed, true);

  const other = await call('GET', '/orders/OVC-261020-001/payment', tokenFor('2'));
  assert.deepEqual([other.status, other.json.message], [404, 'Pesanan tidak ditemukan.']);

  const bad = await call('GET', '/orders/bukan-nomor/payment', tokenFor('1'));
  assert.deepEqual([bad.status, bad.json.code], [400, 'INVALID_ID']);
});

test('GET /orders/:no/payment tidak mengubah status walau batas bayar sudah lewat (pembatalan otomatis = job 6.5)', async () => {
  await place({});
  db.t.payments[0].expiredAt = new Date(NOW.getTime() - 60000);
  const before = snapshot();

  const { json } = await call('GET', '/orders/OVC-261020-001/payment', tokenFor('1'));

  assert.equal(json.data.seconds_left, 0);
  assert.equal(json.data.order.order_status, 'menunggu_pembayaran');
  assert.equal(snapshot(), before);
});

test('hotfix nomor pesanan: kunci penomoran (store_settings) diambil sebelum nomor terakhir dibaca & stok diambil', async () => {
  const ok = await place();
  assert.equal(ok.status, 201);
  const begin = db.ops.lastIndexOf('tx:begin');
  const ops = db.ops.slice(begin + 1);
  // Kunci pengguna lalu penomoran = dua pembacaan pertama transaksi
  assert.deepEqual(ops.slice(0, 2), ['lock:users', 'lock:store_settings']);
  const lockAt = ops.indexOf('lock:store_settings');
  assert.ok(lockAt < ops.indexOf('executeRaw'), JSON.stringify(ops));
  assert.ok(lockAt < ops.indexOf('order.findMany'), JSON.stringify(ops));
  // Pesanan berikutnya hari yang sama mendapat nomor urut berikutnya (format tetap OVC-YYMMDD-NNN)
  const next = await place();
  const numbers = [ok.json.data.order_number, next.json.data.order_number];
  assert.match(numbers[0], /^OVC-\d{6}-\d{3}$/);
  assert.equal(Number(numbers[1].slice(-3)), Number(numbers[0].slice(-3)) + 1);
});
