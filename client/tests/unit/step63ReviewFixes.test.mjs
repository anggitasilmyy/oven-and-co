// Uji fungsi murni perbaikan review 49a1214 — aturan desain satu baris (B), kartu keranjang stok habis (L1),
// id produk tidak valid (L7), klasifikasi sesi (M1), dan konversi foto untuk unggahan (H1).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeCartItems, cartItemKey, findDuplicateDesignLines, getCartLineQuantityControl,
} from '../../src/utils/rules/cart.js';
import { isSessionInvalidResponse, isMissingResourceError } from '../../src/utils/apiErrors.js';
import { dataUrlToBlob } from '../../src/utils/image.js';
import { CART_UNAVAILABLE_REASON } from '../../src/constants/cart.js';

const cake = (overrides = {}) => ({
  product_id: 6, design_id: 1000001, quantity: 1, note: '', preferred_date: '2026-10-25', ...overrides,
});

test('B: desain sama dengan catatan berbeda digabung ke SATU baris (jumlah dijumlahkan)', () => {
  const merged = mergeCartItems([cake({ cart_item_id: 1, note: 'Lilin 7' })], [cake({ quantity: 2, note: 'Tanpa lilin' })]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].quantity, 3);
  assert.equal(merged[0].note, 'Lilin 7'); // catatan baris pertama dipertahankan
  assert.equal(cartItemKey(cake({ note: 'a' })), cartItemKey(cake({ note: 'b', preferred_date: null })));
  // Desain berbeda tetap baris terpisah
  assert.equal(mergeCartItems(merged, [cake({ design_id: 1000002 })]).length, 2);
});

test('B: gabung keranjang tamu & akun dengan desain yang sama → satu baris', () => {
  const merged = mergeCartItems([cake({ cart_item_id: 1 })], [cake({ cart_item_id: 1, note: 'tamu' })]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].quantity, 2);
});

test('B: findDuplicateDesignLines menandai baris kedua dst. (data lama di localStorage)', () => {
  const lines = [cake(), { product_id: 1, design_id: null }, cake({ note: 'x' }), cake({ design_id: '1000001' })];
  assert.deepEqual([...findDuplicateDesignLines(lines)], [2, 3]);
});

test('L1: baris > 99 dengan stok habis → stepper nonaktif, tanpa tombol ubah, ditandai soldOut', () => {
  const over = { available: false, quantity: 110, unavailable_reason: CART_UNAVAILABLE_REASON.QUANTITY_EXCEEDS_LIMIT };

  assert.deepEqual(getCartLineQuantityControl(over, 0), { stepperMax: 0, adjustTo: null, soldOut: true });
  assert.deepEqual(getCartLineQuantityControl(over, 30), { stepperMax: 30, adjustTo: 30, soldOut: false });
  assert.deepEqual(getCartLineQuantityControl(over, 500), { stepperMax: 99, adjustTo: 99, soldOut: false });
  // Baris normal tidak berubah
  assert.deepEqual(
    getCartLineQuantityControl({ available: true, quantity: 3, unavailable_reason: null }, 2),
    { stepperMax: 3, adjustTo: null, soldOut: false }
  );
});

test('L7: hanya 404 dan 400 ber-kode INVALID_ID yang dianggap "tidak ditemukan" (seperti mock)', () => {
  assert.equal(isMissingResourceError({ status: 404 }), true);
  assert.equal(isMissingResourceError({ status: 400, code: 'INVALID_ID' }), true);
  // Re-review C: 400 validasi lain tidak boleh tersamar sebagai "produk tidak ditemukan"
  assert.equal(isMissingResourceError({ status: 400 }), false);
  assert.equal(isMissingResourceError({ status: 400, code: 'LAIN' }), false);
  assert.equal(isMissingResourceError({ status: 500 }), false);
  assert.equal(isMissingResourceError(new Error('jaringan')), false);
});

test('re-review B: baris berdesain tidak sah tidak "memiliki" desain di findDuplicateDesignLines', () => {
  const lines = [cake({ design_token: 'rusak' }), cake({ design_token: 'ok' }), cake({ design_token: 'ok', note: 'x' })];
  const isValid = (item) => item.design_token === 'ok';
  assert.deepEqual([...findDuplicateDesignLines(lines, isValid)], [2]);
  assert.deepEqual([...findDuplicateDesignLines(lines)], [1, 2]); // tanpa predikat: perilaku lama
});

test('M1: hanya 401 SESSION_INVALID untuk request bertoken yang menghapus sesi', () => {
  assert.equal(isSessionInvalidResponse(401, { code: 'SESSION_INVALID' }, 'jwt'), true);
  assert.equal(isSessionInvalidResponse(401, { code: 'SESSION_INVALID' }, null), false);
  assert.equal(isSessionInvalidResponse(401, { message: 'Email atau kata sandi salah.' }, 'jwt'), false);
  assert.equal(isSessionInvalidResponse(403, { code: 'SESSION_INVALID' }, 'jwt'), false);
});

test('H1: data URL hasil kompresi → Blob untuk multipart; data URL rusak → null', async () => {
  const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const blob = dataUrlToBlob(`data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`);

  assert.equal(blob.type, 'image/jpeg');
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
  assert.equal(dataUrlToBlob('https://contoh.id/a.jpg'), null);
  assert.equal(dataUrlToBlob('data:image/jpeg;base64,***'), null);
  assert.equal(dataUrlToBlob(null), null);
});

test('re-review #4: checkCartDesign (mock) mengikuti urutan pemeriksaan server', async () => {
  const { checkCartDesign } = await import('../../src/utils/rules/cart.js');
  const product = { product_id: 6, availability_type: 'custom', is_active: true };
  const design = { design_id: 50, product_id: 6, user_id: 1, ready_date: '2026-10-26' };
  const item = { design_id: 50 };
  const usage = { userId: 1, orderedDesignIds: new Set(), earliestCustomDate: '2026-10-25' };

  assert.deepEqual(checkCartDesign(item, product, design, usage), { reason: null, designValid: true });
  // Kepemilikan: desain pelanggan lain → tidak ditemukan; desain tamu (user_id kosong) boleh
  assert.equal(checkCartDesign(item, product, design, { ...usage, userId: 2 }).reason, 'design_not_found');
  assert.equal(checkCartDesign(item, product, { ...design, user_id: null }, { ...usage, userId: null }).designValid, true);
  // Sekali pakai & kedaluwarsa
  assert.equal(checkCartDesign(item, product, design, { ...usage, orderedDesignIds: new Set([50]) }).reason, 'design_already_ordered');
  assert.equal(checkCartDesign(item, product, design, { ...usage, earliestCustomDate: '2026-10-27' }).reason, 'design_expired');
  // Struktur
  assert.equal(checkCartDesign({ design_id: null }, product, null, usage).reason, 'design_required');
  assert.equal(checkCartDesign(item, product, null, usage).reason, 'design_not_found');
  assert.equal(checkCartDesign(item, product, { ...design, product_id: 7 }, usage).reason, 'design_mismatch');
  assert.equal(checkCartDesign(item, { ...product, availability_type: 'ready' }, design, usage).reason, 'design_mismatch');
  assert.deepEqual(checkCartDesign({ design_id: null }, { ...product, availability_type: 'ready' }, null, usage), { reason: null, designValid: false });
  // Tanpa konteks pemakaian (tampilan pesanan lama): desain yang sudah dipesan tetap terbaca
  assert.equal(checkCartDesign(item, product, design, {}).designValid, true);
});

test('#1–#3: classifySessionState membedakan token aktif, sesi sudah dihapus, dan token pengganti', async () => {
  const { classifySessionState } = await import('../../src/utils/apiErrors.js');
  assert.equal(classifySessionState('jwt-lama', 'jwt-lama'), 'active');
  assert.equal(classifySessionState('jwt-lama', null), 'cleared');
  assert.equal(classifySessionState('jwt-lama', ''), 'cleared'); // token kosong tidak pernah dianggap aktif
  assert.equal(classifySessionState('jwt-lama', 'jwt-baru'), 'replaced');
});
