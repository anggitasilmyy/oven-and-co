// Regresi tingkat HTTP: GET /api/admin/orders/:orderNumber (FR-28 · UC-20 · UC-21 · AD-04). Bug: server mengirim dump
// Prisma { order: { orderNumber, … } } sehingga DetailPesananAdminPage (membaca data.order.order_number, data.items,
// data.status_log, data.actions, …) tertahan di skeleton. Kontrak = client mock/adminOrderViews.js toAdminOrderDetail.
// UC-21: kode pickup tidak pernah dikirim ke Staf maupun Owner. Prisma dipalsukan — tidak membuktikan query MySQL.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

const users = {
  1: { userId: 1n, role: 'customer', isActive: true },
  3: { userId: 3n, role: 'staf', isActive: true },
  4: { userId: 4n, role: 'owner', isActive: true },
  5: { userId: 5n, role: 'staf', isActive: false },
};

const PICKUP_CODE = 'PK4821';
const option = (optionGroup, name) => ({ option: { optionGroup, name } });

/** Baris pesanan seperti hasil include getOrderByNumber (user, items+produk/varian/desain/ulasan, pembayaran, riwayat) */
function orderRow(overrides = {}) {
  return {
    orderId: 11n, orderNumber: 'OVC-261029-002', userId: 114n, fulfillmentType: 'delivery', addressId: 5n,
    deliveryAddressSnapshot: 'Kantor · Angellica Ivana (+621111222234) · Jl. Sukabumi No.22', distanceKm: '9.93',
    readyDate: new Date('2026-11-02T00:00:00.000Z'), timeSlot: '11.00–13.00', subtotal: '610000.00', shippingFee: '25000.00',
    voucherId: null, voucherDiscount: '0.00', pointsUsed: 0, pointsDiscount: '0.00', total: '635000.00',
    paymentOption: 'online', paymentStatus: 'paid', orderStatus: 'dikonfirmasi', pickupCode: null, courierName: null,
    cancelReason: null, createdAt: new Date('2026-10-29T15:30:00.000Z'),
    user: { name: 'Angellica', email: 'angel@gmail.com', phone: '+621111222234' },
    items: [
      {
        orderItemId: 15n, productId: 9n, variantId: 91n, designId: null, quantity: 2, unitPrice: '65000.00', note: 'Iris tipis',
        product: {
          name: 'Sourdough Country Loaf', price: '99000.00', availabilityType: 'preorder', isActive: true,
          images: [{ imageUrl: '/images/products/sourdough.webp' }], dailyStocks: [],
        },
        variant: { name: 'Besar', isActive: true }, design: null, review: null,
      },
      {
        orderItemId: 16n, productId: 6n, variantId: null, designId: 60n, quantity: 1, unitPrice: '480000.00', note: null,
        product: {
          name: 'Custom Celebration Cake', price: '450000.00', availabilityType: 'custom', isActive: true,
          images: [{ imageUrl: '/images/products/custom.webp' }], dailyStocks: [],
        },
        variant: null,
        design: {
          writingText: 'Happy Birthday', writingColor: 'Cokelat', referencePhotoUrl: '/uploads/custom-cakes/ab.jpg',
          options: [option('ukuran', '20 cm'), option('bentuk', 'Bulat'), option('rasa', 'Cokelat'), option('krim_topping', 'Buttercream'), option('krim_topping', 'Stroberi')],
        },
        review: null,
      },
    ],
    payments: [{ paymentId: 11n, methodCode: 'gopay', amount: '635000.00', status: 'paid', paidAt: new Date('2026-10-29T15:38:31.000Z'), method: { name: 'GoPay' } }],
    // Sudah terurut terbaru dulu (sesuai orderBy yang diminta service)
    statusHistories: [
      { historyId: 34n, status: 'dikonfirmasi', note: null, changedAt: new Date('2026-10-29T15:38:31.000Z'), changer: null },
      { historyId: 33n, status: 'menunggu_pembayaran', note: null, changedAt: new Date('2026-10-29T15:30:00.000Z'), changer: { name: 'Angellica', role: 'customer' } },
    ],
    ...overrides,
  };
}

let orders;
let storeRow;
let failOn;
let lastInclude;

fakePrisma.user = { findUnique: async ({ where }) => users[String(where.userId)] ?? null };
fakePrisma.storeSetting = { findFirst: async () => storeRow };
fakePrisma.order = {
  findUnique: async ({ where, include }) => {
    if (failOn === 'order') throw Object.assign(new Error('Can\'t reach database server'), { code: 'P1001' });
    lastInclude = include;
    return orders.find((o) => o.orderNumber === where.orderNumber) ?? null;
  },
};

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/orders`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test.beforeEach(() => {
  orders = [orderRow()];
  storeRow = { storeName: 'Oven & Co. Bandung', address: 'Jl. Toko No. 1, Bandung', whatsappNumber: '+6281200000000' };
  failOn = null;
  lastInclude = null;
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const call = async (number = 'OVC-261029-002', token = tokenFor('3')) => {
  const res = await fetch(`${baseUrl}/${number}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const text = await res.text();
  return { status: res.status, json: JSON.parse(text), text };
};

test('akses: tamu 401, token palsu/akun nonaktif 401 SESSION_INVALID, pelanggan 403, Staf & Owner 200', async () => {
  assert.equal((await call(undefined, null)).status, 401);
  for (const token of ['token-palsu', tokenFor('5')]) assert.equal((await call(undefined, token)).json.code, 'SESSION_INVALID');
  assert.equal((await call(undefined, tokenFor('1'))).status, 403);
  assert.equal((await call(undefined, tokenFor('3'))).status, 200);
  assert.equal((await call(undefined, tokenFor('4'))).status, 200);
});

test('bentuk respons AD-04: data = { order, customer, items, payment, status_log, store, actions } (bukan data.order mentah)', async () => {
  const { status, json } = await call();

  assert.equal(status, 200);
  assert.deepEqual(Object.keys(json.data).sort(), ['actions', 'customer', 'items', 'order', 'payment', 'status_log', 'store']);
  const { order } = json.data;
  assert.equal(order.order_number, 'OVC-261029-002'); // yang dicocokkan DetailPesananAdminPage baris 37
  assert.equal(order.orderNumber, undefined);
  assert.deepEqual(
    [order.order_id, order.user_id, order.fulfillment_type, order.ready_date, order.time_slot, order.distance_km, order.total, order.order_status, order.payment_status],
    ['11', '114', 'delivery', '2026-11-02', '11.00–13.00', 9.93, 635000, 'dikonfirmasi', 'paid']
  );
  assert.equal(order.delivery_address_snapshot, 'Kantor · Angellica Ivana (+621111222234) · Jl. Sukabumi No.22');
  assert.equal(order.created_at, '2026-10-29T15:30:00.000Z');
  assert.ok(lastInclude.user && lastInclude.items && lastInclude.payments && lastInclude.statusHistories);
});

test('pelanggan, item (gambar, varian, harga salinan, catatan), design_spec custom cake, pembayaran, toko', async () => {
  const { json } = await call();

  assert.deepEqual(json.data.customer, { name: 'Angellica', email: 'angel@gmail.com', phone: '+621111222234' });
  const [bread, cake] = json.data.items;
  assert.deepEqual(
    [bread.order_item_id, bread.name, bread.variant_name, bread.image_url, bread.quantity, bread.unit_price, bread.line_total, bread.note, bread.design_spec],
    ['15', 'Sourdough Country Loaf', 'Besar', '/images/products/sourdough.webp', 2, 65000, 130000, 'Iris tipis', null]
  );
  assert.equal(cake.image_url, '/images/products/custom.webp');
  assert.deepEqual(cake.design_spec, {
    options: [
      { label: 'Ukuran', value: '20 cm' }, { label: 'Bentuk', value: 'Bulat' }, { label: 'Rasa', value: 'Cokelat' },
      { label: 'Krim & Topping', value: 'Buttercream, Stroberi' },
    ],
    writing_text: 'Happy Birthday', writing_color: 'Cokelat', reference_photo_url: '/uploads/custom-cakes/ab.jpg',
  });
  assert.deepEqual(json.data.payment, { method_name: 'GoPay', status: 'paid', paid_at: '2026-10-29T15:38:31.000Z', amount: 635000 });
  assert.deepEqual(json.data.store, { name: 'Oven & Co. Bandung', address: 'Jl. Toko No. 1, Bandung', whatsapp: '+6281200000000' });
});

test('riwayat status: terbaru di atas, label, nama pengubah (sistem bila kosong) dan perannya', async () => {
  const { json } = await call();

  assert.deepEqual(json.data.status_log, [
    { history_id: '34', status: 'dikonfirmasi', label: 'Dikonfirmasi', note: null, changed_at: '2026-10-29T15:38:31.000Z', changed_by_name: 'Sistem', changed_by_role: null },
    { history_id: '33', status: 'menunggu_pembayaran', label: 'Menunggu Pembayaran', note: null, changed_at: '2026-10-29T15:30:00.000Z', changed_by_name: 'Angellica', changed_by_role: 'customer' },
  ]);
  assert.deepEqual(lastInclude.statusHistories.orderBy, [{ changedAt: 'desc' }, { historyId: 'desc' }]);
});

test('UC-21: kode pickup tidak pernah dikirim ke Staf maupun Owner — hanya has_pickup_code', async () => {
  orders = [orderRow({ fulfillmentType: 'pickup', pickupCode: PICKUP_CODE, orderStatus: 'siap_diambil' })];

  for (const sub of ['3', '4']) {
    const { json, text } = await call(undefined, tokenFor(sub));
    assert.equal(json.data.order.has_pickup_code, true);
    assert.equal('pickup_code' in json.data.order, false);
    // Kunci "pickup_code" (bukan "has_pickup_code") maupun nilainya tidak boleh ada di mana pun dalam respons
    assert.doesNotMatch(text, new RegExp(`${PICKUP_CODE}|pickupCode|"pickup_code"`));
  }

  orders = [orderRow({ pickupCode: null })];
  assert.equal((await call()).json.data.order.has_pickup_code, false);
});

test('actions sesuai aturan admin client (getAdminNextStatus, completion_blocked, kurir, kode pickup, tandai lunas)', async () => {
  const cases = [
    [{ orderStatus: 'menunggu_pembayaran', paymentStatus: 'unpaid' }, { next_status: null, completion_blocked: null, requires_pickup_code: false, requires_courier: false, can_mark_paid: false }],
    [{ orderStatus: 'dikonfirmasi' }, { next_status: 'sedang_disiapkan', completion_blocked: null, requires_pickup_code: false, requires_courier: false, can_mark_paid: false }],
    [{ orderStatus: 'sedang_disiapkan' }, { next_status: 'dalam_pengiriman', completion_blocked: null, requires_pickup_code: false, requires_courier: true, can_mark_paid: false }],
    [{ orderStatus: 'sedang_disiapkan', fulfillmentType: 'pickup' }, { next_status: 'siap_diambil', completion_blocked: null, requires_pickup_code: false, requires_courier: false, can_mark_paid: false }],
    [{ orderStatus: 'siap_diambil', fulfillmentType: 'pickup', paymentOption: 'pay_at_store', paymentStatus: 'unpaid', pickupCode: PICKUP_CODE },
      { next_status: 'selesai', completion_blocked: 'Tandai pembayaran Bayar di Toko lunas sebelum menyelesaikan pesanan', requires_pickup_code: true, requires_courier: false, can_mark_paid: true }],
    // Bayar di Toko belum lunas tetapi belum Siap Diambil → belum boleh ditandai lunas
    [{ orderStatus: 'dikonfirmasi', fulfillmentType: 'pickup', paymentOption: 'pay_at_store', paymentStatus: 'unpaid' },
      { next_status: 'sedang_disiapkan', completion_blocked: null, requires_pickup_code: false, requires_courier: false, can_mark_paid: false }],
    [{ orderStatus: 'dalam_pengiriman', paymentStatus: 'unpaid' }, { next_status: 'selesai', completion_blocked: 'Pesanan belum lunas sehingga belum bisa diselesaikan', requires_pickup_code: false, requires_courier: false, can_mark_paid: false }],
    [{ orderStatus: 'dalam_pengiriman' }, { next_status: 'selesai', completion_blocked: null, requires_pickup_code: false, requires_courier: false, can_mark_paid: false }],
    [{ orderStatus: 'selesai' }, { next_status: null, completion_blocked: null, requires_pickup_code: false, requires_courier: false, can_mark_paid: false }],
    [{ orderStatus: 'dibatalkan', paymentStatus: 'refunded' }, { next_status: null, completion_blocked: null, requires_pickup_code: false, requires_courier: false, can_mark_paid: false }],
  ];
  for (const [overrides, expected] of cases) {
    orders = [orderRow(overrides)];
    assert.deepEqual((await call()).json.data.actions, expected, JSON.stringify(overrides));
  }
});

test('design_spec: kelompok opsi tanpa pilihan ditampilkan "-"; tanpa tulisan/foto → null', async () => {
  const row = orderRow();
  row.items[1].design = { writingText: null, writingColor: null, referencePhotoUrl: null, options: [option('ukuran', '15 cm')] };
  orders = [row];

  assert.deepEqual((await call()).json.data.items[1].design_spec, {
    options: [
      { label: 'Ukuran', value: '15 cm' }, { label: 'Bentuk', value: '-' }, { label: 'Rasa', value: '-' }, { label: 'Krim & Topping', value: '-' },
    ],
    writing_text: null, writing_color: null, reference_photo_url: null,
  });
});

test('pesanan tanpa pembayaran → payment default (metode "-", amount = total)', async () => {
  orders = [orderRow({ payments: [] })];
  assert.deepEqual((await call()).json.data.payment, { method_name: '-', status: null, paid_at: null, amount: 635000 });
});

test('error: tidak ditemukan 404, nomor tidak berformat 400 INVALID_ID, store_settings kosong 500, error DB 500', async (t) => {
  const missing = await call('OVC-261029-999');
  assert.deepEqual([missing.status, missing.json.message], [404, 'Pesanan tidak ditemukan.']);

  const bad = await call('bukan-nomor');
  assert.deepEqual([bad.status, bad.json.code], [400, 'INVALID_ID']);

  t.mock.method(console, 'error', () => {});
  storeRow = null;
  assert.equal((await call()).status, 500);
  storeRow = { storeName: 'Oven & Co.', address: null, whatsappNumber: null };
  failOn = 'order';
  assert.deepEqual((await call()).json, { status: 'error', message: 'Terjadi kesalahan pada server.' });
});
