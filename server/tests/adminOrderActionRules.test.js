// Aturan murni Step 6.4.2 & 6.4.3 (adminOrderRules.service.js, productionRules.service.js) — harus sama dengan
// client utils/rules/adminOrder.js & utils/rules/production.js (validation rule "Status (admin)", UC-21, BR-03, FR-29).

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ADMIN_ORDER_ERROR, normalizePickupCode, checkPickupCode, validateAdminStatusChange, checkMarkPaidAtStore,
  httpStatusForRuleError,
} = require('../src/services/adminOrderRules.service');
const {
  buildProductionEntries, countProductionByDate, groupProductionList, buildMonthGrid,
} = require('../src/services/productionRules.service');

const order = (overrides = {}) => ({
  order_status: 'dikonfirmasi', fulfillment_type: 'pickup', payment_option: 'online', payment_status: 'paid',
  pickup_code: 'PK1234', ...overrides,
});

test('urutan status: Dikonfirmasi → Sedang Disiapkan → Siap Diambil (pickup) / Dalam Pengiriman (delivery) → Selesai', () => {
  assert.equal(validateAdminStatusChange(order(), { to: 'sedang_disiapkan' }), null);
  assert.equal(validateAdminStatusChange(order({ order_status: 'sedang_disiapkan' }), { to: 'siap_diambil' }), null);
  assert.equal(
    validateAdminStatusChange(order({ order_status: 'sedang_disiapkan', fulfillment_type: 'delivery' }), { to: 'dalam_pengiriman', courierName: 'Pak Budi' }),
    null
  );
  assert.equal(validateAdminStatusChange(order({ order_status: 'siap_diambil' }), { to: 'selesai', pickupCode: 'pk 1234' }), null);
  assert.equal(validateAdminStatusChange(order({ order_status: 'dalam_pengiriman', fulfillment_type: 'delivery' }), { to: 'selesai' }), null);

  // Loncat, mundur, cabang salah, status tidak dikenal
  assert.equal(validateAdminStatusChange(order(), { to: 'selesai' }), ADMIN_ORDER_ERROR.NOT_SEQUENTIAL('Sedang Disiapkan'));
  assert.equal(validateAdminStatusChange(order({ order_status: 'sedang_disiapkan' }), { to: 'dikonfirmasi' }), ADMIN_ORDER_ERROR.NOT_SEQUENTIAL('Siap Diambil'));
  assert.equal(validateAdminStatusChange(order({ order_status: 'sedang_disiapkan' }), { to: 'dalam_pengiriman' }), ADMIN_ORDER_ERROR.NOT_SEQUENTIAL('Siap Diambil'));
  assert.equal(validateAdminStatusChange(order(), { to: 'dibatalkan' }), ADMIN_ORDER_ERROR.NOT_SEQUENTIAL('Sedang Disiapkan'));
  assert.equal(validateAdminStatusChange(order(), { to: 'xyz' }), ADMIN_ORDER_ERROR.NOT_SEQUENTIAL('Sedang Disiapkan'));
});

test('status final, menunggu pembayaran, dan status basi (from) ditolak dengan urutan pesan sama dengan mock', () => {
  assert.equal(validateAdminStatusChange(order({ order_status: 'selesai' }), { to: 'selesai' }), ADMIN_ORDER_ERROR.FINAL('Selesai'));
  assert.equal(validateAdminStatusChange(order({ order_status: 'dibatalkan' }), { from: 'dikonfirmasi', to: 'sedang_disiapkan' }), ADMIN_ORDER_ERROR.FINAL('Dibatalkan'));
  assert.equal(validateAdminStatusChange(order({ order_status: 'menunggu_pembayaran' }), { to: 'dikonfirmasi' }), ADMIN_ORDER_ERROR.WAITING_PAYMENT);
  assert.equal(
    validateAdminStatusChange(order({ order_status: 'sedang_disiapkan' }), { from: 'dikonfirmasi', to: 'sedang_disiapkan' }),
    ADMIN_ORDER_ERROR.STALE('Sedang Disiapkan')
  );
  // from kosong = tidak diperiksa (sama dengan mock)
  assert.equal(validateAdminStatusChange(order(), { from: null, to: 'sedang_disiapkan' }), null);
});

test('kurir wajib & maks. 100 karakter; Selesai wajib lunas & kode pickup cocok', () => {
  const delivering = order({ order_status: 'sedang_disiapkan', fulfillment_type: 'delivery' });
  assert.equal(validateAdminStatusChange(delivering, { to: 'dalam_pengiriman', courierName: '   ' }), ADMIN_ORDER_ERROR.COURIER_REQUIRED);
  assert.equal(validateAdminStatusChange(delivering, { to: 'dalam_pengiriman', courierName: 'a'.repeat(101) }), ADMIN_ORDER_ERROR.COURIER_TOO_LONG);
  assert.equal(validateAdminStatusChange(delivering, { to: 'dalam_pengiriman', courierName: ` ${'a'.repeat(100)} ` }), null);

  const ready = order({ order_status: 'siap_diambil', payment_option: 'pay_at_store', payment_status: 'unpaid' });
  assert.equal(validateAdminStatusChange(ready, { to: 'selesai', pickupCode: 'PK1234' }), ADMIN_ORDER_ERROR.UNPAID_AT_STORE);
  assert.equal(validateAdminStatusChange(order({ order_status: 'dalam_pengiriman', fulfillment_type: 'delivery', payment_status: 'unpaid' }), { to: 'selesai' }), ADMIN_ORDER_ERROR.UNPAID);
  assert.equal(validateAdminStatusChange(order({ order_status: 'siap_diambil' }), { to: 'selesai' }), ADMIN_ORDER_ERROR.PICKUP_CODE_REQUIRED);
  assert.equal(validateAdminStatusChange(order({ order_status: 'siap_diambil' }), { to: 'selesai', pickupCode: 'PK9999' }), ADMIN_ORDER_ERROR.PICKUP_CODE_MISMATCH);
});

test('UC-21 kode pickup: dinormalisasi, hanya saat Siap Diambil, pesanan tanpa kode tidak pernah cocok', () => {
  assert.equal(normalizePickupCode(' pk 12 34 '), 'PK1234');
  assert.equal(normalizePickupCode(null), '');
  assert.equal(checkPickupCode(order({ order_status: 'siap_diambil' }), 'pk1234'), null);
  assert.equal(checkPickupCode(order({ order_status: 'sedang_disiapkan' }), 'PK1234'), ADMIN_ORDER_ERROR.PICKUP_NOT_READY);
  assert.equal(checkPickupCode(order({ order_status: 'siap_diambil', pickup_code: null }), ''), ADMIN_ORDER_ERROR.PICKUP_CODE_REQUIRED);
  assert.equal(checkPickupCode(order({ order_status: 'siap_diambil', pickup_code: null }), 'PK'), ADMIN_ORDER_ERROR.PICKUP_CODE_MISMATCH);
});

test('tandai lunas hanya Bayar di Toko belum lunas saat Siap Diambil', () => {
  const store = order({ order_status: 'siap_diambil', payment_option: 'pay_at_store', payment_status: 'unpaid' });
  assert.equal(checkMarkPaidAtStore(store), null);
  assert.equal(checkMarkPaidAtStore({ ...store, payment_option: 'online' }), ADMIN_ORDER_ERROR.NOT_PAY_AT_STORE);
  assert.equal(checkMarkPaidAtStore({ ...store, payment_status: 'paid' }), ADMIN_ORDER_ERROR.ALREADY_PAID);
  assert.equal(checkMarkPaidAtStore({ ...store, order_status: 'dikonfirmasi' }), ADMIN_ORDER_ERROR.PAY_NOT_READY);
  assert.equal(checkMarkPaidAtStore({ ...store, order_status: 'dibatalkan' }), ADMIN_ORDER_ERROR.FINAL('Dibatalkan'));
});

test('HTTP status: isian salah 400, status pesanan tidak memungkinkan 409', () => {
  for (const message of [ADMIN_ORDER_ERROR.COURIER_REQUIRED, ADMIN_ORDER_ERROR.COURIER_TOO_LONG, ADMIN_ORDER_ERROR.PICKUP_CODE_REQUIRED, ADMIN_ORDER_ERROR.PICKUP_CODE_MISMATCH]) {
    assert.equal(httpStatusForRuleError(message), 400, message);
  }
  for (const message of [
    ADMIN_ORDER_ERROR.FINAL('Selesai'), ADMIN_ORDER_ERROR.STALE('Selesai'), ADMIN_ORDER_ERROR.WAITING_PAYMENT,
    ADMIN_ORDER_ERROR.NOT_SEQUENTIAL('Selesai'), ADMIN_ORDER_ERROR.UNPAID_AT_STORE, ADMIN_ORDER_ERROR.UNPAID,
    ADMIN_ORDER_ERROR.PICKUP_NOT_READY, ADMIN_ORDER_ERROR.NOT_PICKUP, ADMIN_ORDER_ERROR.ALREADY_PAID,
    ADMIN_ORDER_ERROR.NOT_PAY_AT_STORE, ADMIN_ORDER_ERROR.PAY_NOT_READY,
  ]) {
    assert.equal(httpStatusForRuleError(message), 409, message);
  }
});

test('grid bulan dimulai Senin, tanggal luar bulan ditandai inMonth=false (sama dengan client buildMonthGrid)', () => {
  const nov = buildMonthGrid('2026-11'); // 1 Nov 2026 = Minggu
  assert.equal(nov.length, 6);
  assert.deepEqual(nov[0][0], { date: '2026-10-26', inMonth: false });
  assert.deepEqual(nov[0][6], { date: '2026-11-01', inMonth: true });
  assert.deepEqual(nov[5][6], { date: '2026-12-06', inMonth: false });
  const feb = buildMonthGrid('2027-02'); // 1 Feb 2027 = Senin, 28 hari → tepat 4 minggu
  assert.equal(feb.length, 4);
  assert.deepEqual([feb[0][0].date, feb[3][6].date], ['2027-02-01', '2027-02-28']);
  assert.ok(buildMonthGrid('2028-02').flat().some((d) => d.date === '2028-02-29')); // kabisat
});

test('produksi: hanya pre-order & custom dari status produksi; pill = jumlah pesanan; daftar per produk / per desain', () => {
  const base = { date: '2026-11-03', fulfillment_type: 'pickup', time_slot: '09.00–11.00', design_id: null };
  const items = [
    { ...base, order_number: 'A', order_status: 'dikonfirmasi', product_id: '3', availability_type: 'preorder', quantity: 2 },
    { ...base, order_number: 'A', order_status: 'dikonfirmasi', product_id: '3', availability_type: 'preorder', quantity: 1 },
    { ...base, order_number: 'A', order_status: 'dikonfirmasi', product_id: '6', availability_type: 'custom', quantity: 1, design_id: '60' },
    { ...base, order_number: 'B', order_status: 'selesai', product_id: '3', availability_type: 'preorder', quantity: 4 },
    { ...base, order_number: 'C', order_status: 'menunggu_pembayaran', product_id: '3', availability_type: 'preorder', quantity: 9 },
    { ...base, order_number: 'D', order_status: 'dibatalkan', product_id: '3', availability_type: 'preorder', quantity: 9 },
    { ...base, order_number: 'E', order_status: 'dikonfirmasi', product_id: '1', availability_type: 'ready', quantity: 9 },
    { ...base, order_number: 'F', order_status: 'sedang_disiapkan', product_id: '6', availability_type: 'custom', quantity: 1, design_id: '61', date: '2026-11-04' },
  ];
  const entries = buildProductionEntries(items);
  assert.deepEqual(entries.map((e) => e.order_number), ['A', 'A', 'A', 'B', 'F']);
  assert.deepEqual(countProductionByDate(entries), {
    '2026-11-03': { preorder: 2, custom: 1 },
    '2026-11-04': { preorder: 0, custom: 1 },
  });
  const groups = groupProductionList(entries, '2026-11-03');
  assert.deepEqual(groups.map((g) => [g.key, g.quantity]), [['product-3', 7], ['design-60', 1]]);
  assert.deepEqual(groups[0].orders.map((o) => [o.order_number, o.quantity]), [['A', 3], ['B', 4]]);
  assert.deepEqual(groupProductionList(entries, '2026-11-05'), []);
});
