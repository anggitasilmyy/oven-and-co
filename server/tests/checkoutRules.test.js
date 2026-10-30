// Aturan biaya & pembayaran checkout (services/checkoutRules.service.js) — Phase 2 · Tahap 1
// Nilai uji mengikuti SPEC §5 / §10 dan perilaku client/src/utils/rules/checkout.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  distanceKm,
  getDeliveryQuote,
  isVoucherActiveOn,
  evaluateVoucher,
  getRedeemablePoints,
  calculateOrderTotal,
  getCombinedReadyDate,
  isPayAtStoreAllowed,
  buildCheckoutQuote,
  PAYMENT_METHOD_ERROR,
  resolvePaymentMethod,
} = require('../src/services/checkoutRules.service');

// store_settings contoh (SPEC §10: radius 10 km, Rp 2.500/km; BR-09: 100 poin = Rp 5.000)
const settings = {
  delivery_radius_km: 10,
  delivery_fee_per_km: 2500,
  redeem_points_unit: 100,
  redeem_value: 5000,
};

const voucher = (overrides = {}) => ({
  voucher_id: '1',
  code: 'WEEKEND15',
  discount_type: 'percent',
  discount_value: 15,
  product_id: null,
  quota: 5,
  valid_from: '2026-10-01',
  valid_to: '2026-10-31',
  is_active: true,
  ...overrides,
});
const claim = (overrides = {}) => ({ user_id: '7', voucher_id: '1', used_at: null, ...overrides });
const lines = [
  { product_id: '1', availability_type: 'ready', line_total: 56000, ready_date: '2026-10-23' },
  { product_id: '2', availability_type: 'preorder', line_total: 44000, ready_date: '2026-10-25' },
];

test('distanceKm: haversine 2 desimal; koordinat kosong/tidak valid → null', () => {
  assert.equal(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }), 0);
  // 0,1° lintang ≈ 11,12 km
  assert.equal(distanceKm({ latitude: -6.2, longitude: 106.8 }, { latitude: -6.1, longitude: 106.8 }), 11.12);
  assert.equal(distanceKm({ latitude: null, longitude: 106.8 }, { latitude: -6.1, longitude: 106.8 }), null);
  assert.equal(distanceKm({ latitude: 'x', longitude: 106.8 }, { latitude: -6.1, longitude: 106.8 }), null);
});

test('ongkir BR-12: jarak dibulatkan ke atas × tarif; batas radius inklusif; di luar radius/jarak null → ditolak', () => {
  assert.deepEqual(getDeliveryQuote(3.2, settings), { distance: 3.2, withinRadius: true, fee: 10000 });
  assert.deepEqual(getDeliveryQuote(10, settings), { distance: 10, withinRadius: true, fee: 25000 });
  assert.deepEqual(getDeliveryQuote(10.01, settings), { distance: 10.01, withinRadius: false, fee: 0 });
  assert.equal(getDeliveryQuote(null, settings).withinRadius, false);
  assert.equal(getDeliveryQuote(1, { ...settings, delivery_radius_km: null }).withinRadius, false);
});

test('voucher aktif: is_active, kuota > 0, dalam periode (batas inklusif)', () => {
  assert.equal(isVoucherActiveOn(voucher(), '2026-10-01'), true);
  assert.equal(isVoucherActiveOn(voucher(), '2026-10-31'), true);
  assert.equal(isVoucherActiveOn(voucher(), '2026-11-01'), false);
  assert.equal(isVoucherActiveOn(voucher({ quota: 0 }), '2026-10-23'), false);
  assert.equal(isVoucherActiveOn(voucher({ is_active: false }), '2026-10-23'), false);
  assert.equal(isVoucherActiveOn(voucher({ valid_to: null }), '2026-10-23'), false);
});

test('evaluateVoucher: persen dibulatkan ke bawah, nominal dibatasi dasar, per produk', () => {
  const todayKey = '2026-10-23';
  // 15% × 100.000
  assert.deepEqual(evaluateVoucher({ voucher: voucher(), claim: claim(), todayKey, lines }), { valid: true, discount: 15000 });
  // 15% × 33.333 = 4.999,95 → 4.999
  assert.equal(
    evaluateVoucher({ voucher: voucher(), claim: claim(), todayKey, lines: [{ product_id: '1', line_total: 33333 }] }).discount,
    4999
  );
  // nominal tidak melebihi dasar
  const amount = voucher({ discount_type: 'amount', discount_value: 80000 });
  assert.equal(evaluateVoucher({ voucher: amount, claim: claim(), todayKey, lines: [lines[1]] }).discount, 44000);
  // hanya produk tertentu; id BigInt/string dianggap sama
  const perProduct = voucher({ product_id: 2n });
  assert.deepEqual(evaluateVoucher({ voucher: perProduct, claim: claim(), todayKey, lines }), { valid: true, discount: 6600 });
  assert.equal(evaluateVoucher({ voucher: voucher({ product_id: '9' }), claim: claim(), todayKey, lines }).valid, false);
});

test('evaluateVoucher: tanpa klaim, sudah dipakai, atau tidak aktif → tidak berlaku', () => {
  const todayKey = '2026-10-23';
  const invalid = { valid: false, discount: 0 };
  assert.deepEqual(evaluateVoucher({ voucher: voucher(), claim: null, todayKey, lines }), invalid);
  assert.deepEqual(evaluateVoucher({ voucher: null, claim: claim(), todayKey, lines }), invalid);
  assert.deepEqual(evaluateVoucher({ voucher: voucher(), claim: claim({ used_at: '2026-10-20T00:00:00Z' }), todayKey, lines }), invalid);
  assert.deepEqual(evaluateVoucher({ voucher: voucher(), claim: claim(), todayKey: '2026-11-02', lines }), invalid);
});

test('poin BR-09: kelipatan 100, ≤ saldo, nilai ≤ yang harus dibayar, tidak negatif', () => {
  // saldo demo 1.250 poin → 12 unit; tagihan besar
  assert.deepEqual(getRedeemablePoints(1250, 1000000, settings), { points: 1200, value: 60000 });
  // dibatasi tagihan: Rp 12.000 → 2 unit (Rp 10.000)
  assert.deepEqual(getRedeemablePoints(1250, 12000, settings), { points: 200, value: 10000 });
  assert.deepEqual(getRedeemablePoints(99, 50000, settings), { points: 0, value: 0 });
  assert.deepEqual(getRedeemablePoints(500, -1000, settings), { points: 0, value: 0 });
});

test('total = subtotal + ongkir − voucher − poin, tidak negatif', () => {
  assert.equal(calculateOrderTotal({ subtotal: 100000, shippingFee: 10000, voucherDiscount: 15000, pointsDiscount: 5000 }), 90000);
  assert.equal(calculateOrderTotal({ subtotal: 1000, voucherDiscount: 5000 }), 0);
});

test('BR-03 tanggal gabungan & BR-05 Bayar di Toko', () => {
  assert.equal(getCombinedReadyDate(['2026-10-23', '2026-10-26', '2026-10-24']), '2026-10-26');
  assert.equal(getCombinedReadyDate([]), null);
  assert.equal(isPayAtStoreAllowed('pickup', ['ready', 'ready']), true);
  assert.equal(isPayAtStoreAllowed('pickup', ['ready', 'preorder']), false);
  assert.equal(isPayAtStoreAllowed('pickup', ['custom']), false);
  assert.equal(isPayAtStoreAllowed('delivery', ['ready']), false);
  assert.equal(isPayAtStoreAllowed('pickup', []), false);
});

test('buildCheckoutQuote: delivery + voucher + poin dihitung berurutan seperti client', () => {
  const quote = buildCheckoutQuote({
    lines,
    fulfillment: 'delivery',
    distance: 3.2,
    voucherInput: { voucher: voucher(), claim: claim() },
    todayKey: '2026-10-23',
    pointBalance: 1250,
    usePoints: true,
    settings,
  });
  assert.equal(quote.subtotal, 100000);
  assert.equal(quote.shippingFee, 10000);
  assert.equal(quote.voucherDiscount, 15000);
  // yang harus dibayar sebelum poin: 95.000 → 19 unit, dibatasi saldo 12 unit
  assert.deepEqual(quote.redeemable, { points: 1200, value: 60000 });
  assert.equal(quote.pointsUsed, 1200);
  assert.equal(quote.total, 35000);
  assert.equal(quote.readyDate, '2026-10-25');
  assert.equal(quote.payAtStoreAllowed, false);
});

test('buildCheckoutQuote: pickup tanpa voucher & tanpa poin; voucher tidak sah tidak mengurangi', () => {
  const readyOnly = [lines[0]];
  const quote = buildCheckoutQuote({
    lines: readyOnly,
    fulfillment: 'pickup',
    distance: null,
    voucherInput: { voucher: voucher({ product_id: '2' }), claim: claim() },
    todayKey: '2026-10-23',
    pointBalance: 1250,
    usePoints: false,
    settings,
  });
  assert.equal(quote.delivery, null);
  assert.equal(quote.shippingFee, 0);
  assert.equal(quote.voucher.valid, false);
  assert.equal(quote.voucherDiscount, 0);
  assert.equal(quote.pointsUsed, 0);
  assert.equal(quote.total, 56000);
  assert.equal(quote.payAtStoreAllowed, true);
});

test('resolvePaymentMethod: hanya metode aktif; pay_at_store mengikuti BR-05', () => {
  const methods = [
    { method_code: 'qris', method_group: 'qris', is_active: true },
    { method_code: 'ovo', method_group: 'ewallet', is_active: false },
    { method_code: 'pay_at_store', method_group: 'store', is_active: true },
  ];
  assert.equal(resolvePaymentMethod(methods, 'qris', { payAtStoreAllowed: false }).method.method_code, 'qris');
  assert.deepEqual(resolvePaymentMethod(methods, 'ovo', { payAtStoreAllowed: true }), {
    method: null,
    error: PAYMENT_METHOD_ERROR.METHOD_UNAVAILABLE,
  });
  assert.equal(resolvePaymentMethod(methods, 'tidak_ada', { payAtStoreAllowed: true }).error, PAYMENT_METHOD_ERROR.METHOD_UNAVAILABLE);
  assert.deepEqual(resolvePaymentMethod(methods, 'pay_at_store', { payAtStoreAllowed: false }), {
    method: null,
    error: PAYMENT_METHOD_ERROR.PAY_AT_STORE_NOT_ALLOWED,
  });
  assert.equal(resolvePaymentMethod(methods, 'pay_at_store', { payAtStoreAllowed: true }).error, null);
});
