// T1 (ROADMAP 6.4.10 · FR-12 – FR-16 · BR-06 · BR-09 · BR-12 · C-14 · AD-11): pengaturan toko basi saat checkout.
// Owner menyimpan pengaturan selagi checkout menunggu kunci store_settings (kait whileWaitingSettingsLock di
// tests/helpers/orderDb.js) → checkout membaca ulang setelah kunci; field yang dipakai pesanan berubah → 409 + rollback
// penuh (tanpa pesanan, stok, klaim voucher, poin). Perubahan yang tidak dipakai pesanan → tetap 201.
// BATAS BUKTI: fake membuktikan logika (baca ulang SETELAH kunci, perbandingan, rollback); perilaku InnoDB sungguhan
// (Owner benar-benar commit selagi checkout menunggu kunci) dibuktikan di tests-mysql/09-checkout-settings.it.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { installOrderDb } = require('./helpers/orderDb');
const { changedCheckoutSettings } = require('../src/services/checkoutSettingsRules.service');

process.env.JWT_SECRET = 'test-secret-only';
const app = require('../src/app');

const NOW = new Date('2026-10-20T01:00:00Z'); // Selasa 08.00 WIB
const dayKey = (n) => new Date(Date.UTC(2026, 9, 20 + n)).toISOString().slice(0, 10);
const dbDay = (n) => new Date(`${dayKey(n)}T00:00:00.000Z`);
const TODAY = dayKey(0);
const time = (hhmm) => new Date(`1970-01-01T${hhmm}:00.000Z`);
const STALE = 'Pengaturan toko baru saja diperbarui. Muat ulang halaman checkout lalu coba lagi.';

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
async function place(overrides = {}) {
  const body = {
    items: [{ cart_item_id: 'c1', product_id: '1', quantity: 2, note: '' }], fulfillment: 'pickup', address_id: null,
    ready_date: TODAY, time_slot: '09.00–11.00', voucher_code: null, use_points: false, method_code: 'qris', ...overrides,
  };
  const res = await fetch(`${baseUrl}/orders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFor('1')}` }, body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}
const tables = () => JSON.stringify(db.t, (_k, v) => (typeof v === 'bigint' ? String(v) : v));
/** Owner "commit" perubahan selagi checkout menunggu kunci store_settings */
const ownerSavesWhileWaiting = (change) => {
  db.hooks.whileWaitingSettingsLock = () => {
    change(db.t);
    db.afterRollback = [change]; // commit Owner tidak ikut dibatalkan bila checkout di-rollback
    db.hooks.whileWaitingSettingsLock = null;
  };
};
/** Tabel setelah perubahan Owner — pembanding "tidak ada data parsial" (perubahan Owner sendiri tetap ada) */
function expectedAfter(change) {
  const copy = JSON.parse(tables());
  change(copy);
  return JSON.stringify(copy);
}

// ── Aturan murni ─────────────────────────────────────────────────────────────────────────────────

test('changedCheckoutSettings: hanya field yang dipakai pesanan; jam operasional dibandingkan kanonik', () => {
  const settings = {
    preorder_cutoff_time: '17:00', payment_timeout_minutes: 30, latitude: -6.2, longitude: 106.8, delivery_radius_km: 10,
    delivery_fee_per_km: 2500, redeem_points_unit: 100, redeem_value: 5000, store_name: 'Oven & Co.', whatsapp_number: '+62', earn_amount_per_point: 1000,
  };
  const hours = [{ day_of_week: 2, is_open: true, open_time: '07:00', close_time: '20:00' }, { day_of_week: 1, is_open: false, open_time: null, close_time: null }];
  const used = { settings, operatingHours: hours };
  const pickupOnline = { delivery: false, usePoints: false, payAtStore: false };
  const same = (s, h = hours) => ({ settings: { ...settings, ...s }, operatingHours: h });

  assert.deepEqual(changedCheckoutSettings(used, same({}, [...hours].reverse()), pickupOnline), [], 'urutan jam tidak berpengaruh');
  assert.deepEqual(changedCheckoutSettings(used, same({ store_name: 'Baru', whatsapp_number: '+6281', earn_amount_per_point: 2000 }), pickupOnline), []);
  assert.deepEqual(changedCheckoutSettings(used, same({ delivery_fee_per_km: 3000, redeem_value: 9000 }), pickupOnline), [], 'pickup tanpa poin');
  assert.deepEqual(changedCheckoutSettings(used, same({ payment_timeout_minutes: 15 }), { ...pickupOnline, payAtStore: true }), [], 'Bayar di Toko');
  assert.deepEqual(changedCheckoutSettings(used, same({ payment_timeout_minutes: 15 }), pickupOnline), ['payment_timeout_minutes']);
  assert.deepEqual(changedCheckoutSettings(used, same({ preorder_cutoff_time: '16:00' }), pickupOnline), ['preorder_cutoff_time']);
  assert.deepEqual(
    changedCheckoutSettings(used, same({ delivery_fee_per_km: 3000, delivery_radius_km: 5, latitude: -6.3 }), { ...pickupOnline, delivery: true }),
    ['latitude', 'delivery_radius_km', 'delivery_fee_per_km'],
  );
  assert.deepEqual(changedCheckoutSettings(used, same({ redeem_points_unit: 50 }), { ...pickupOnline, usePoints: true }), ['redeem_points_unit']);
  const closedTuesday = [hours[1], { ...hours[0], is_open: false, open_time: null, close_time: null }];
  assert.deepEqual(changedCheckoutSettings(used, same({}, closedTuesday), pickupOnline), ['operating_hours']);
  assert.deepEqual(changedCheckoutSettings(used, same({}, [hours[0]]), pickupOnline), ['operating_hours'], 'baris jam hilang');
  assert.ok(changedCheckoutSettings(used, { settings: null, operatingHours: hours }, pickupOnline).length > 0, 'pengaturan hilang');
});

// ── HTTP: Owner menyimpan selagi checkout menunggu kunci store_settings ─────────────────────────

const STALE_CASES = [
  ['tarif ongkir per km (delivery)', { fulfillment: 'delivery', address_id: '10' }, (t) => { t.storeSetting.deliveryFeePerKm = '3000.00'; }],
  ['radius pengiriman (delivery)', { fulfillment: 'delivery', address_id: '10' }, (t) => { t.storeSetting.deliveryRadiusKm = '1.00'; }],
  ['koordinat toko (delivery)', { fulfillment: 'delivery', address_id: '10' }, (t) => { t.storeSetting.latitude = '-6.2100000'; }],
  ['batas pembayaran online', {}, (t) => { t.storeSetting.paymentTimeoutMinutes = 15; }],
  ['batas pemesanan pre-order', {}, (t) => { t.storeSetting.preorderCutoffTime = time('10:00'); }],
  ['nilai tukar poin (pakai poin)', { use_points: true, items: [{ cart_item_id: 'c1', product_id: '1', quantity: 4, note: '' }] }, (t) => { t.storeSetting.redeemValue = '9000.00'; }],
  ['jam operasional', {}, (t) => { t.operatingHours.push({ hourId: 2, dayOfWeek: 2, openTime: null, closeTime: null, isOpen: false }); }],
];

for (const [label, overrides, change] of STALE_CASES) {
  test(`T1 ${label} berubah selagi checkout menunggu kunci → 409 + rollback penuh (tanpa pesanan/stok/voucher/poin)`, async () => {
    const expected = expectedAfter(change);
    ownerSavesWhileWaiting(change);
    const { status, json } = await place({ voucher_code: 'HEMAT10', ...overrides });
    assert.deepEqual([status, json.message], [409, STALE]);
    assert.equal(tables(), expected, 'hanya perubahan Owner yang tersisa');
    // Muat ulang lalu coba lagi → berhasil dengan pengaturan baru
    db.hooks.whileWaitingSettingsLock = null;
    const retry = await place({ voucher_code: 'HEMAT10', ...overrides });
    if (label.startsWith('radius')) assert.equal(retry.status, 400, 'radius baru 1 km → alamat di luar radius');
    else if (label.startsWith('jam')) assert.equal(retry.status, 400, 'toko kini tutup hari ini → slot tidak sah');
    else assert.equal(retry.status, 201, JSON.stringify(retry.json));
  });
}

test('T1 perubahan yang TIDAK dipakai pesanan (nama, WhatsApp, poin perolehan; ongkir/poin untuk pickup tanpa poin) → tetap 201', async () => {
  ownerSavesWhileWaiting((t) => {
    Object.assign(t.storeSetting, { storeName: 'Oven & Co. Baru', whatsappNumber: '+6281299999999', earnAmountPerPoint: '2000.00', deliveryFeePerKm: '9000.00', redeemValue: '1.00' });
  });
  const { status } = await place();
  assert.equal(status, 201);
  assert.equal(db.t.orders.length, 1);
});

test('T1 Bayar di Toko tidak bergantung pada batas pembayaran online → tetap 201 walau timeout berubah', async () => {
  db.t.operatingHours = [2].map((d) => ({ hourId: d, dayOfWeek: d, openTime: time('07:00'), closeTime: time('20:00'), isOpen: true }));
  ownerSavesWhileWaiting((t) => { t.storeSetting.paymentTimeoutMinutes = 5; });
  const { status } = await place({ method_code: 'pay_at_store' });
  assert.equal(status, 201);
});

test('T1 pengaturan sama → 201; ongkir pesanan memakai nilai yang dibaca ulang setelah kunci (bukan nilai lain)', async () => {
  const ok = await place({ fulfillment: 'delivery', address_id: '10' });
  assert.equal(ok.status, 201);
  const order = db.t.orders.at(-1);
  assert.equal(order.shippingFee, Math.ceil(order.distanceKm) * 2500);
});
