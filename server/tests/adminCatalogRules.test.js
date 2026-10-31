// Aturan murni Step 6.4 · AD-06 (adminCatalogRules.service.js) — harus sama dengan client utils/rules/adminCatalog.js
// (validation rule Produk, BR-02 lead time, FR-31 opsi custom cake).

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  toNumber, normalizeProductInput, validateProduct, normalizeCustomOptionInput, validateCustomOption,
  checkOptionDeactivation, validationError,
} = require('../src/services/adminCatalogRules.service');

const categories = [{ category_id: 1, name: 'Roti' }, { category_id: 5, name: 'Custom Cake' }];
const products = [{ product_id: '6', is_active: true, availability_type: 'custom' }];
const product = (o = {}) => normalizeProductInput({
  name: 'Roti', category_id: '1', description: '', price: '1000', availability_type: 'ready', lead_time_days: '', is_active: true, ...o,
});

test('toNumber & normalisasi: kosong → NaN, ready → lead time 0, teks dirapikan, opsional kosong → null', () => {
  assert.ok(Number.isNaN(toNumber('')) && Number.isNaN(toNumber('  ')) && Number.isNaN(toNumber(null)));
  assert.equal(toNumber('12.5'), 12.5);
  const p = normalizeProductInput({ name: '  A ', category_id: '', ingredients: ' ', allergens: ' Susu ', price: '5', availability_type: 'ready', lead_time_days: 9, variants: [{ name: ' V ', extra_price: '1' }] });
  assert.deepEqual([p.name, p.category_id, p.ingredients, p.allergens, p.lead_time_days, p.is_active], ['A', null, null, 'Susu', 0, false]);
  assert.deepEqual(p.variants, [{ variant_id: null, name: 'V', extra_price: 1, is_active: false }]);
});

test('lead time per tipe: batas bawah/atas tepat (BR-02, maks. 12 hari)', () => {
  const lead = (type, days, cat = 1) => validateProduct(product({ availability_type: type, lead_time_days: days, category_id: cat, is_active: false }), { categories, products }).lead_time_days;
  assert.equal(lead('preorder', 1), undefined);
  assert.equal(lead('preorder', 12), undefined);
  assert.equal(lead('preorder', 0), 'Pre-order minimal 1 hari (H-1)');
  assert.equal(lead('preorder', 13), 'Lead time maksimal 12 hari');
  assert.equal(lead('custom', 3, 5), undefined);
  assert.equal(lead('custom', 2, 5), 'Custom cake minimal 3 hari (H-3)');
  assert.equal(lead('preorder', ''), 'Isi lead time dalam hari (bilangan bulat)');
});

test('harga & satu produk custom aktif: produk yang sedang diubah tidak dihitung bentrok dengan dirinya', () => {
  assert.equal(validateProduct(product({ price: '0.01' }), { categories, products }).price, undefined);
  assert.equal(validateProduct(product({ price: '9999999999.99' }), { categories, products }).price, undefined);
  const custom = product({ availability_type: 'custom', category_id: 5, lead_time_days: 3 });
  assert.ok(validateProduct(custom, { categories, products }).is_active);
  assert.equal(validateProduct(custom, { categories, products, productId: '6' }).is_active, undefined);
  assert.equal(validateProduct({ ...product(), photoCount: 6 }, { categories, products }).photos, 'Maksimal 5 foto');
  assert.equal(validateProduct({ ...product(), photoCount: 5 }, { categories, products }).photos, undefined);
});

test('opsi: is_active default true; nama unik per kelompok tanpa membandingkan dirinya; opsi aktif terakhir', () => {
  assert.equal(normalizeCustomOptionInput({ option_group: 'rasa', name: 'A', extra_price: 0 }).is_active, true);
  const options = [
    { option_id: 1, option_group: 'rasa', name: 'Cokelat', is_active: true },
    { option_id: 2, option_group: 'rasa', name: 'Vanila', is_active: false },
  ];
  assert.deepEqual(validateCustomOption(normalizeCustomOptionInput({ option_group: 'rasa', name: 'cokelat', extra_price: 0 }), options, 1), {});
  assert.equal(checkOptionDeactivation(options, 1), 'Kelompok Rasa harus punya minimal satu opsi aktif');
  assert.equal(checkOptionDeactivation(options, 2), null);
});

test('validationError: 400, pesan pertama (string lalu varian), fieldErrors utuh', () => {
  let e = validationError({ name: 'Isi nama produk', price: 'x' });
  assert.deepEqual([e.statusCode, e.message, e.fieldErrors.price], [400, 'Isi nama produk', 'x']);
  e = validationError({ variants: [null, { extra_price: 'Harga tambahan minimal Rp 0' }] });
  assert.equal(e.message, 'Harga tambahan minimal Rp 0');
});
