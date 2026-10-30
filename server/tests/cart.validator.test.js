// Regresi: validasi ketat body POST /api/cart (audit Step 6.3 · C-6, C-7)

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCartBody } = require('../src/validators/cart.validator');

const item = (overrides = {}) => ({ product_id: '1', quantity: 1, ...overrides });

function assertRejected(body, pattern) {
  assert.throws(() => validateCartBody(body), (error) => {
    assert.equal(error.statusCode, 400);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

test('menormalisasi item valid (id angka → string, tanggal kosong → null)', () => {
  const [result] = validateCartBody({
    items: [{
      cart_item_id: 'c-1', product_id: 6, design_id: '12', design_token: 'abc', quantity: '2', preferred_date: '',
      note: 'Tanpa kacang',
    }],
  });

  assert.deepEqual(
    { ...result },
    {
      cart_item_id: 'c-1',
      product_id: '6',
      variant_id: null,
      design_id: '12',
      design_token: 'abc',
      quantity: 2,
      preferred_date: null,
      note: 'Tanpa kacang',
      name: null,
      image_url: null,
      price: 0,
    }
  );
});

test('menolak body bukan objek / items bukan array', () => {
  assertRejected(null);
  assertRejected({ items: 'x' });
  assertRejected([]);
});

test('batas keras request 100 item (2 × 50 baris); 51–100 diterima untuk keranjang hasil gabung', () => {
  assertRejected({ items: Array.from({ length: 101 }, () => item()) }, /maksimal berisi 100/);
  assert.equal(validateCartBody({ items: Array.from({ length: 100 }, () => item()) }).length, 100);
  assert.equal(validateCartBody({ items: Array.from({ length: 51 }, () => item()) }).length, 51);
});

test('quantity harus bilangan bulat positif', () => {
  for (const quantity of [0, -1, 1.5, '1.5', 'abc', '1e2', null, true, 2 ** 53]) {
    assertRejected({ items: [item({ quantity })] }, /jumlah/);
  }
});

test('regresi: quantity > 99 (hasil gabung keranjang) TIDAK membuat request gagal', () => {
  const [result] = validateCartBody({ items: [item({ quantity: 110 })] });
  assert.equal(result.quantity, 110);
});

test('design_token harus teks ≤ 128 karakter', () => {
  assertRejected({ items: [item({ design_token: 123 })] }, /design_token/);
  assertRejected({ items: [item({ design_token: 'a'.repeat(129) })] }, /design_token/);
});

test('preferred_date harus tanggal kalender YYYY-MM-DD yang ada', () => {
  for (const preferred_date of ['2026-99-99', '2026-02-30', '2026/10/22', '2026-10-22T00:00:00Z', 20261022]) {
    assertRejected({ items: [item({ preferred_date })] }, /tanggal/);
  }
});

test('id harus bilangan bulat positif', () => {
  for (const product_id of ['abc', '0', '-1', '1.5', 1.5, null, '99999999999999999999']) {
    assertRejected({ items: [item({ product_id })] });
  }
  assertRejected({ items: [item({ design_id: 'x' })] }, /design_id/);
  assertRejected({ items: [item({ variant_id: {} })] }, /variant_id/);
});

test('catatan maksimal 255 karakter', () => {
  assertRejected({ items: [item({ note: 'a'.repeat(256) })] }, /catatan/);
});
