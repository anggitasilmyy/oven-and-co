// Unit test aturan murni keranjang akun (services/savedCartRules.service.js) — harus sama dengan
// client/src/utils/rules/cart.js (cartItemKey, mergeCartItems).

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SKIP_REASON, cartItemKey, mergeSavedCartItems, getSkipReason,
} = require('../src/services/savedCartRules.service');

const item = (overrides) => ({
  cart_item_id: 1, product_id: '1', variant_id: null, design_id: null, design_token: null,
  quantity: 1, preferred_date: null, note: null, ...overrides,
});

test('identitas: produk + varian + tanggal + catatan (dipangkas, null = kosong)', () => {
  assert.equal(cartItemKey(item({ note: '  tanpa gula ' })), cartItemKey(item({ note: 'tanpa gula' })));
  assert.equal(cartItemKey(item({ note: null })), cartItemKey(item({ note: '' })));
  assert.notEqual(cartItemKey(item({ note: 'a' })), cartItemKey(item({ note: 'b' })));
  assert.notEqual(cartItemKey(item({ variant_id: '21' })), cartItemKey(item()));
  assert.notEqual(cartItemKey(item({ preferred_date: '2026-10-20' })), cartItemKey(item({ preferred_date: '2026-10-21' })));
});

test('identitas custom cake = design_id saja (catatan/tanggal berbeda tetap satu baris)', () => {
  assert.equal(
    cartItemKey(item({ product_id: '6', design_id: '9', note: 'a' })),
    cartItemKey(item({ product_id: '6', design_id: '9', note: 'b', preferred_date: '2026-10-25' }))
  );
});

test('gabung: jumlah dijumlahkan tanpa dipotong (> 99 tetap), urutan base dipertahankan, input tidak diubah', () => {
  const base = [item({ cart_item_id: 1, product_id: '1', quantity: 60 }), item({ cart_item_id: 2, product_id: '2' })];
  const incoming = [item({ cart_item_id: 7, product_id: '1', quantity: 50 }), item({ cart_item_id: 8, product_id: '3' })];
  const merged = mergeSavedCartItems(base, incoming);

  assert.deepEqual(merged.map((i) => [i.product_id, i.quantity]), [['1', 110], ['2', 1], ['3', 1]]);
  assert.equal(base[0].quantity, 60);
  assert.equal(incoming[0].quantity, 50);
});

test('gabung: design_token dibawa dari item tamu bila item akun belum punya', () => {
  const merged = mergeSavedCartItems(
    [item({ product_id: '6', design_id: '9', design_token: null })],
    [item({ product_id: '6', design_id: '9', design_token: 'tok', quantity: 2 })]
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].quantity, 3);
  assert.equal(merged[0].design_token, 'tok');
});

test('skip: produk tidak ada, varian bukan milik produk, desain bukan milik pelanggan', () => {
  const context = {
    products: new Map([['2', { variants: [{ variantId: 21n }] }], ['6', { variants: [] }]]),
    ownedDesignIds: new Set(['9']),
  };
  assert.equal(getSkipReason(item({ product_id: '999' }), context), SKIP_REASON.PRODUCT_NOT_FOUND);
  assert.equal(getSkipReason(item({ product_id: '2', variant_id: '99' }), context), SKIP_REASON.VARIANT_NOT_FOUND);
  assert.equal(getSkipReason(item({ product_id: '6', design_id: '10' }), context), SKIP_REASON.DESIGN_NOT_FOUND);
  assert.equal(getSkipReason(item({ product_id: '2', variant_id: '21' }), context), null);
  assert.equal(getSkipReason(item({ product_id: '6', design_id: '9' }), context), null);
});
