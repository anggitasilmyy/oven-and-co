// Validasi struktur body POST /api/orders (validators/order.validator.js) — Phase 2 · Tahap 2
// Payload mengikuti createOrder di client/src/pages/customer/PembayaranPage.jsx.

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateOrderBody } = require('../src/validators/order.validator');

// Item keranjang seperti yang disimpan useCartStore (termasuk snapshot tampilan name/price/image_url)
const item = (overrides = {}) => ({
  cart_item_id: 1,
  product_id: '1',
  variant_id: null,
  design_id: null,
  design_token: null,
  quantity: 2,
  preferred_date: null,
  note: '',
  name: 'Croissant',
  price: 28000,
  image_url: null,
  ...overrides,
});

const body = (overrides = {}) => ({
  items: [item()],
  fulfillment: 'pickup',
  address_id: null,
  ready_date: '2026-10-23',
  time_slot: '09.00–11.00',
  voucher_code: null,
  use_points: false,
  method_code: 'qris',
  ...overrides,
});

function assertRejected(input, pattern) {
  assert.throws(() => validateOrderBody(input), (error) => {
    assert.equal(error.statusCode, 400);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

test('payload pickup valid dinormalisasi; snapshot tampilan item tidak diteruskan', () => {
  const result = validateOrderBody(body({ items: [item({ product_id: 6, variant_id: 3, preferred_date: '' })] }));

  assert.deepEqual(result, {
    items: [{
      cart_item_id: 1,
      product_id: '6',
      variant_id: '3',
      design_id: null,
      design_token: null,
      quantity: 2,
      preferred_date: null,
      note: null,
    }],
    fulfillment: 'pickup',
    address_id: null,
    ready_date: '2026-10-23',
    time_slot: '09.00–11.00',
    voucher_code: null,
    use_points: false,
    method_code: 'qris',
  });
});

test('payload delivery valid: address_id → string, voucher dinormalisasi, use_points true', () => {
  const result = validateOrderBody(body({
    fulfillment: 'delivery', address_id: 12, voucher_code: '  weekend15 ', use_points: true, method_code: 'bca_va',
  }));

  assert.equal(result.address_id, '12');
  assert.equal(result.voucher_code, 'WEEKEND15');
  assert.equal(result.use_points, true);
  // voucher kosong = tanpa voucher
  assert.equal(validateOrderBody(body({ voucher_code: '   ' })).voucher_code, null);
  assert.equal(validateOrderBody(body({ voucher_code: undefined })).voucher_code, null);
});

test('nilai finansial dari klien diabaikan (server menghitung ulang)', () => {
  const result = validateOrderBody(body({ subtotal: 1, shipping_fee: 0, voucher_discount: 999999, total: 0 }));

  for (const key of ['subtotal', 'shipping_fee', 'voucher_discount', 'total']) {
    assert.equal(key in result, false, key);
  }
  assert.equal('price' in result.items[0], false);
});

test('body bukan objek ditolak', () => {
  for (const input of [null, undefined, 'x', [], 5]) assertRejected(input, /Format data pesanan/);
});

test('field wajib yang hilang ditolak dengan pesan per field', () => {
  const cases = [
    ['items', /Format data pesanan/],
    ['fulfillment', /pickup atau delivery/],
    ['ready_date', /Tanggal ambil\/antar/],
    ['time_slot', /slot waktu/],
    ['use_points', /tukar poin/],
    ['method_code', /metode pembayaran/],
  ];
  for (const [field, pattern] of cases) {
    const input = body();
    delete input[field];
    assertRejected(input, pattern);
  }
});

test('tipe salah ditolak', () => {
  assertRejected(body({ items: 'x' }), /Format data pesanan/);
  assertRejected(body({ ready_date: 20261023 }), /Tanggal ambil\/antar/);
  assertRejected(body({ ready_date: '2026-02-30' }), /Tanggal ambil\/antar/);
  assertRejected(body({ ready_date: '23-10-2026' }), /Tanggal ambil\/antar/);
  assertRejected(body({ time_slot: 9 }), /slot waktu/);
  assertRejected(body({ use_points: 'true' }), /tukar poin/);
  assertRejected(body({ use_points: 1 }), /tukar poin/);
  assertRejected(body({ voucher_code: 15 }), /Kode voucher/);
  assertRejected(body({ voucher_code: 'X'.repeat(21) }), /Kode voucher/);
  assertRejected(body({ method_code: '' }), /metode pembayaran/);
  assertRejected(body({ method_code: 'x'.repeat(21) }), /metode pembayaran/);
  assertRejected(body({ fulfillment: 'delivery', address_id: 'abc' }), /Alamat pengiriman tidak valid/);
  assertRejected(body({ items: [item({ product_id: 'abc' })] }), /^Item 1: product_id tidak valid/);
});

test('quantity tidak valid ditolak (pesan menyebut posisi item)', () => {
  for (const quantity of [0, -1, 1.5, 'abc', null, true]) {
    assertRejected(body({ items: [item(), item({ cart_item_id: 2, quantity })] }), /^Item 2: jumlah/);
  }
});

test('items kosong atau melebihi 50 baris ditolak', () => {
  assertRejected(body({ items: [] }), /Keranjang masih kosong/);
  const items = Array.from({ length: 51 }, (_, i) => item({ cart_item_id: i + 1 }));
  assertRejected(body({ items }), /maksimal berisi 50 item berbeda/);
  assert.equal(validateOrderBody(body({ items: items.slice(0, 50) })).items.length, 50);
});

test('cart_item_id wajib dan unik', () => {
  assertRejected(body({ items: [item({ cart_item_id: null })] }), /^Item 1: cart_item_id wajib/);
  assertRejected(body({ items: [item(), item({ product_id: '2' })] }), /^Item 2: cart_item_id duplikat/);
  // angka dan string yang sama dianggap duplikat
  assertRejected(body({ items: [item({ cart_item_id: 7 }), item({ cart_item_id: '7' })] }), /duplikat/);
});

test('pilihan fulfillment atau slot yang tidak dikenal ditolak', () => {
  for (const fulfillment of ['ambil', 'PICKUP', '', null]) {
    assertRejected(body({ fulfillment }), /pickup atau delivery/);
  }
  for (const time_slot of ['09:00-11:00', '08.00–10.00', '']) {
    assertRejected(body({ time_slot }), /slot waktu/);
  }
});

test('alamat: delivery wajib, pickup tidak boleh membawa alamat', () => {
  assertRejected(body({ fulfillment: 'delivery', address_id: null }), /Pilih alamat pengiriman/);
  assertRejected(body({ fulfillment: 'pickup', address_id: '3' }), /hanya untuk pesanan delivery/);
});
