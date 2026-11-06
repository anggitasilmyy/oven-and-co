// Step 6.4.8 · FR-35 · AD-10 — aturan murni pelanggan & ulasan admin (port client utils/rules/adminCustomer.js) di
// services/adminCustomerRules.service.js, serta validator input AD-10.

const test = require('node:test');
const assert = require('node:assert/strict');
const { toCustomerRow, sortCustomerRows, filterAdminReviews, summarizeAdminReviews } = require('../src/services/adminCustomerRules.service');
const { validateReviewQuery, validateReviewId, validateReplyBody, validateHiddenBody } = require('../src/validators/adminCustomer.validator');

const settings = { gold_min_points: 500, platinum_min_points: 2000 };
const customer = (id, name, extra = {}) => ({ user_id: String(id), name, email: `${id}@x.id`, phone: `+62800${id}`, is_active: true, ...extra });

test('toCustomerRow: agregat → total pesanan, belanja (sen), level per ambang, pesanan terakhir ISO', () => {
  const row = toCustomerRow(customer(1, 'Anisa'), { totalOrders: 2, spendCents: 15000050, lastOrderAt: new Date('2026-10-31T12:00:00Z'), yearlyPoints: 500 }, settings);
  assert.deepEqual(row, {
    user_id: '1', name: 'Anisa', email: '1@x.id', phone: '+628001', is_active: true, total_orders: 2, total_spend: 150000.5,
    level: { key: 'gold', label: 'Gold Member', badge: 'gold' }, last_order_at: '2026-10-31T12:00:00.000Z',
  });
  assert.equal(toCustomerRow(customer(2, 'B'), { yearlyPoints: 499 }, settings).level.key, 'silver');
  assert.equal(toCustomerRow(customer(2, 'B'), { yearlyPoints: 2000 }, settings).level.key, 'platinum');
  // tanpa pesanan & poin
  const empty = toCustomerRow(customer(3, 'C', { is_active: false }), undefined, settings);
  assert.deepEqual([empty.total_orders, empty.total_spend, empty.level.key, empty.last_order_at, empty.is_active], [0, 0, 'silver', null, false]);
});

test('sortCustomerRows: pesanan terakhir terbaru dulu, tanpa pesanan di akhir, seri → nama lalu id', () => {
  const rows = [
    { user_id: '5', name: 'Budi', last_order_at: null },
    { user_id: '6', name: 'Citra', last_order_at: '2026-10-29T00:00:00.000Z' },
    { user_id: '1', name: 'Anisa', last_order_at: '2026-10-31T00:00:00.000Z' },
    { user_id: '7', name: 'Andi', last_order_at: '2026-10-29T00:00:00.000Z' },
    { user_id: '10', name: 'Andi', last_order_at: '2026-10-29T00:00:00.000Z' },
    { user_id: '9', name: 'Ayu', last_order_at: null },
  ];
  assert.deepEqual(sortCustomerRows(rows).map((r) => r.user_id), ['1', '7', '10', '6', '9', '5']);
});

test('filterAdminReviews & summarizeAdminReviews: bintang tepat, semua termasuk tersembunyi, terbaru lalu id', () => {
  const r = (id, rating, createdAt, extra = {}) => ({ review_id: String(id), rating, created_at: createdAt, is_hidden: false, admin_reply: null, ...extra });
  const reviews = [
    r(1, 5, '2026-10-30T00:00:00.000Z'),
    r(2, 4, '2026-10-31T00:00:00.000Z', { is_hidden: true, admin_reply: 'Terima kasih' }),
    r(10, 5, '2026-10-31T00:00:00.000Z'),
    r(9, 1, '2026-10-01T00:00:00.000Z'),
  ];
  assert.deepEqual(filterAdminReviews(reviews, 'semua').map((x) => x.review_id), ['10', '2', '1', '9']);
  assert.deepEqual(filterAdminReviews(reviews, '5').map((x) => x.review_id), ['10', '1']);
  assert.deepEqual(filterAdminReviews(reviews, '3'), []);
  assert.deepEqual(summarizeAdminReviews(reviews), { total: 4, hidden: 1, unreplied: 3 });
  assert.deepEqual(summarizeAdminReviews([]), { total: 0, hidden: 0, unreplied: 0 });
});

test('validator: rating, id, balasan (trim, wajib, maks. 500), is_hidden boolean', () => {
  assert.deepEqual(validateReviewQuery({}), { rating: 'semua' });
  assert.deepEqual(validateReviewQuery({ rating: '3', lain: 'x' }), { rating: '3' });
  for (const rating of ['0', '6', 'lima', ['1', '2']]) assert.throws(() => validateReviewQuery({ rating }), { statusCode: 400, message: 'Filter rating tidak valid.' });

  assert.equal(validateReviewId('12'), '12');
  for (const id of ['0', 'abc', '1.5', '-1', '9223372036854775808']) assert.throws(() => validateReviewId(id), { statusCode: 400, apiCode: 'INVALID_ID' });

  assert.deepEqual(validateReplyBody({ admin_reply: '  Terima kasih!  ' }), { admin_reply: 'Terima kasih!' });
  assert.equal(validateReplyBody({ admin_reply: 'x'.repeat(500) }).admin_reply.length, 500);
  for (const body of [{}, { admin_reply: '' }, { admin_reply: '   ' }, { admin_reply: 5 }, null, 'teks']) {
    assert.throws(() => validateReplyBody(body), { statusCode: 400, message: 'Tulis balasan terlebih dahulu' });
  }
  assert.throws(() => validateReplyBody({ admin_reply: 'x'.repeat(501) }), { statusCode: 400, message: 'Balasan maksimal 500 karakter' });

  assert.deepEqual(validateHiddenBody({ is_hidden: true }), { is_hidden: true });
  assert.deepEqual(validateHiddenBody({ is_hidden: false }), { is_hidden: false });
  for (const body of [{}, { is_hidden: 'true' }, { is_hidden: 1 }, null]) {
    assert.throws(() => validateHiddenBody(body), { statusCode: 400, message: 'Status tampil ulasan tidak valid.' });
  }
});
