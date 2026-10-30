// Uji fungsi murni keranjang — Step 6.3 · FR-04 · FR-11 (regresi gabung keranjang tamu & akun)
// Jalankan: cd client && npm run test:unit

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeCartItems, wouldExceedLineLimit, exceedsLineLimit, applyLineQuantity, normalizeCartItem,
} from '../../src/utils/rules/cart.js';
import { CART_LINE_MAX_QUANTITY, CART_MAX_LINES, CART_UNAVAILABLE_REASON } from '../../src/constants/cart.js';

const item = (overrides = {}) => ({ cart_item_id: 1, product_id: 3, quantity: 1, note: '', preferred_date: '2026-10-24', ...overrides });

test('batas prototype sama dengan server (99 unit, 50 baris)', () => {
  assert.equal(CART_LINE_MAX_QUANTITY, 99);
  assert.equal(CART_MAX_LINES, 50);
});

test('regresi: keranjang tamu 60 + keranjang akun 50 → 110, TIDAK dipotong diam-diam', () => {
  const account = [item({ cart_item_id: 1, quantity: 50 })];
  const guest = [item({ cart_item_id: 7, quantity: 60 })];

  const merged = mergeCartItems(account, guest);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].quantity, 110);
});

test('baris > 99 ditandai quantity_exceeds_limit dan dilepas setelah disesuaikan', () => {
  const line = { cart_item_id: 1, unit_price: 55000, available: true, unavailable_reason: null };

  const over = applyLineQuantity(line, 110);
  assert.equal(over.available, false);
  assert.equal(over.unavailable_reason, CART_UNAVAILABLE_REASON.QUANTITY_EXCEEDS_LIMIT);
  assert.equal(over.quantity, 110);
  assert.equal(over.line_total, 55000 * 110);

  // Server masih menandai baris (data lama saat memuat ulang), tetapi store sudah 99 → tersedia lagi
  const fixed = applyLineQuantity({ ...line, available: false, unavailable_reason: over.unavailable_reason }, 99);
  assert.equal(fixed.available, true);
  assert.equal(fixed.unavailable_reason, null);

  // Alasan lain tidak ikut dilepas
  const gone = applyLineQuantity({ ...line, available: false, unavailable_reason: 'product_unavailable' }, 1);
  assert.equal(gone.available, false);
});

test('design_token ikut tersimpan dan tidak memengaruhi identitas item', () => {
  assert.equal(normalizeCartItem(item()).design_token, null);

  const custom = { product_id: 6, design_id: 1000001, design_token: 'tok', quantity: 1, preferred_date: '2026-10-25' };
  const merged = mergeCartItems([], [custom]);
  assert.equal(merged[0].design_token, 'tok');

  const again = mergeCartItems(merged, [{ ...custom, design_token: null }]);
  assert.equal(again.length, 1);
  assert.equal(again[0].quantity, 2);
  assert.equal(again[0].design_token, 'tok');
});

test('batas 50 baris: baris ke-51 ditolak, menambah jumlah baris lama tetap boleh', () => {
  const full = Array.from({ length: CART_MAX_LINES }, (_, i) => item({ cart_item_id: i + 1, note: `n${i}` }));

  assert.equal(wouldExceedLineLimit(full, item({ note: 'baru' })), true);
  assert.equal(wouldExceedLineLimit(full, item({ note: 'n0' })), false);
  assert.equal(wouldExceedLineLimit(full.slice(1), item({ note: 'baru' })), false);
});

test('gabung keranjang tamu 30 + akun 30 baris → 60, ditandai melebihi batas (tidak dibuang)', () => {
  const account = Array.from({ length: 30 }, (_, i) => item({ cart_item_id: i + 1, note: `a${i}` }));
  const guest = Array.from({ length: 30 }, (_, i) => item({ cart_item_id: i + 1, note: `g${i}` }));

  const merged = mergeCartItems(account, guest);

  assert.equal(merged.length, 60);
  assert.equal(new Set(merged.map((i) => i.cart_item_id)).size, 60);
  assert.equal(exceedsLineLimit(merged), true);
  assert.equal(exceedsLineLimit(merged.slice(0, 50)), false);
});
