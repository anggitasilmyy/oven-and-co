// Regresi tingkat HTTP Step 6.4.2: PATCH /api/admin/orders/:no/status, POST /:no/verify-pickup, PATCH /:no/mark-paid
// (FR-28 · BR-09 · UC-20 · UC-21 · AD-04). Auth & peran, urutan status, status basi, kurir, kode pickup, Bayar di Toko,
// poin sekali, request bersamaan (hook saat menunggu kunci), rollback saat database gagal, dan kode pickup tidak pernah
// dikirim. Prisma dipalsukan — locking & transaksi MySQL dibuktikan terpisah (integrasi MySQL 8).

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

const NOW = new Date('2026-11-03T03:00:00.500Z');
const users = {
  1: { userId: 1n, role: 'customer', isActive: true },
  3: { userId: 3n, role: 'staf', isActive: true },
  4: { userId: 4n, role: 'owner', isActive: true },
  5: { userId: 5n, role: 'staf', isActive: false },
};

let t;
let hooks;
let failOn;
let locks;
let nextId;
let committedElsewhere = [];

const orderRow = (overrides) => ({
  userId: 1n, fulfillmentType: 'pickup', addressId: null, deliveryAddressSnapshot: null, distanceKm: null,
  readyDate: new Date('2026-11-03T00:00:00.000Z'), timeSlot: '09.00–11.00', subtotal: '56000.00', shippingFee: '0.00',
  voucherId: null, voucherDiscount: '0.00', pointsUsed: 0, pointsDiscount: '0.00', total: '56500.00',
  paymentOption: 'online', paymentStatus: 'paid', orderStatus: 'dikonfirmasi', pickupCode: 'PK4821', courierName: null,
  cancelReason: null, createdAt: new Date('2026-11-02T03:00:00.000Z'), ...overrides,
});

function seed() {
  return {
    orders: [
      orderRow({ orderId: 1n, orderNumber: 'OVC-261102-001' }),
      orderRow({ orderId: 2n, orderNumber: 'OVC-261102-002', fulfillmentType: 'delivery', pickupCode: null, total: '81000.00' }),
      orderRow({ orderId: 3n, orderNumber: 'OVC-261102-003', paymentOption: 'pay_at_store', paymentStatus: 'unpaid', orderStatus: 'siap_diambil' }),
      orderRow({ orderId: 4n, orderNumber: 'OVC-261102-004', paymentStatus: 'unpaid', orderStatus: 'menunggu_pembayaran' }),
      orderRow({ orderId: 5n, orderNumber: 'OVC-261102-005', orderStatus: 'dibatalkan', paymentStatus: 'refunded' }),
    ],
    payments: [
      { paymentId: 11n, orderId: 1n, methodCode: 'qris', amount: '56500.00', status: 'paid', paidAt: new Date('2026-11-02T03:05:00Z') },
      { paymentId: 13n, orderId: 3n, methodCode: 'pay_at_store', amount: '56500.00', status: 'pending', paidAt: null },
      { paymentId: 14n, orderId: 4n, methodCode: 'qris', amount: '56500.00', status: 'pending', paidAt: null },
    ],
    histories: [],
    points: [],
    storeSetting: { settingId: 1, earnAmountPerPoint: '1000.00' },
  };
}

const clone = (value) => structuredClone(value);
const fail = (op) => {
  if (failOn === op) throw Object.assign(new Error('Can\'t reach database server'), { code: 'P1001' });
};

fakePrisma.user = { findUnique: async ({ where }) => users[String(where.userId)] ?? null };
fakePrisma.order = {
  findUnique: async ({ where, select }) => {
    fail('order.findUnique');
    const row = t.orders.find((o) => (where.orderNumber ? o.orderNumber === where.orderNumber : o.orderId === where.orderId));
    if (!row) return null;
    return select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : { ...row };
  },
  update: async ({ where, data }) => {
    fail('order.update');
    const row = t.orders.find((o) => o.orderId === where.orderId);
    Object.assign(row, data);
    return { ...row };
  },
};
fakePrisma.payment = {
  updateMany: async ({ where, data }) => {
    fail('payment.updateMany');
    const rows = t.payments.filter((p) => p.orderId === where.orderId);
    rows.forEach((p) => Object.assign(p, data));
    return { count: rows.length };
  },
};
fakePrisma.orderStatusHistory = {
  create: async ({ data }) => {
    fail('orderStatusHistory.create');
    const row = { historyId: (nextId += 1n), ...data };
    t.histories.push(row);
    return row;
  },
};
fakePrisma.storeSetting = { findFirst: async () => t.storeSetting };
fakePrisma.pointTransaction = {
  findFirst: async ({ where }) => t.points.find((p) => p.orderId === where.orderId && p.type === where.type) ?? null,
  create: async ({ data }) => {
    fail('pointTransaction.create');
    const row = { pointTxId: (nextId += 1n), ...data };
    t.points.push(row);
    return row;
  },
};
fakePrisma.$queryRaw = async (strings, ...values) => {
  const sql = strings.join('?');
  locks.push({ sql, values });
  if (!/^SELECT order_id FROM orders WHERE order_number = \? FOR UPDATE$/.test(sql)) throw new Error(`SQL tidak dikenal: ${sql}`);
  fail('lock');
  // Request lain yang memegang kunci selesai (commit) lebih dulu: perubahannya tetap ada walau transaksi ini rollback
  if (hooks.otherCommit) {
    const commit = hooks.otherCommit;
    hooks.otherCommit = null;
    commit();
    committedElsewhere.push(commit);
  }
  const row = t.orders.find((o) => o.orderNumber === values[0]);
  return row ? [{ order_id: row.orderId }] : [];
};
fakePrisma.$transaction = async (callback) => {
  const snapshot = clone(t);
  try {
    return await callback(fakePrisma);
  } catch (error) {
    t = snapshot; // meniru rollback
    committedElsewhere.splice(0).forEach((commit) => commit());
    throw error;
  }
};

let server;
let baseUrl;

test.before(async () => {
  test.mock.timers.enable({ apis: ['Date'], now: NOW });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/orders`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test.beforeEach(() => {
  t = seed();
  hooks = {};
  failOn = null;
  locks = [];
  nextId = 100n;
  committedElsewhere = [];
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const call = async (method, path, token, body) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json() };
};
const staff = tokenFor('3');
const owner = tokenFor('4');
const setStatus = (number, body, token = staff) => call('PATCH', `/${number}/status`, token, body);
const verify = (number, code, token = staff) => call('POST', `/${number}/verify-pickup`, token, { pickup_code: code });
const markPaid = (number, token = staff) => call('PATCH', `/${number}/mark-paid`, token);
const find = (number) => t.orders.find((o) => o.orderNumber === number);
const dump = () => JSON.stringify(t, (key, value) => (typeof value === 'bigint' ? String(value) : value));

test('tamu 401, token tidak valid/akun nonaktif SESSION_INVALID, pelanggan 403 — tanpa perubahan data', async () => {
  const before = dump();
  const cases = [
    ['PATCH', '/OVC-261102-001/status', { from: 'dikonfirmasi', to: 'sedang_disiapkan' }],
    ['POST', '/OVC-261102-003/verify-pickup', { pickup_code: 'PK4821' }],
    ['PATCH', '/OVC-261102-003/mark-paid', undefined],
  ];
  for (const [method, path, body] of cases) {
    assert.equal((await call(method, path, null, body)).status, 401, path);
    for (const token of ['token-palsu', tokenFor('5'), tokenFor('9')]) {
      const res = await call(method, path, token, body);
      assert.deepEqual([res.status, res.json.code], [401, 'SESSION_INVALID'], path);
    }
    assert.equal((await call(method, path, tokenFor('1'), body)).status, 403, path);
  }
  assert.equal(dump(), before);
});

test('alur pickup lengkap oleh Staf & Owner: riwayat ber-pengubah, catatan kode terverifikasi, poin sekali', async () => {
  const number = 'OVC-261102-001';
  let res = await setStatus(number, { from: 'dikonfirmasi', to: 'sedang_disiapkan' });
  assert.deepEqual([res.status, res.json], [200, { status: 'success', data: { order_number: number, order_status: 'sedang_disiapkan', points_awarded: 0 } }]);
  res = await setStatus(number, { from: 'sedang_disiapkan', to: 'siap_diambil' }, owner);
  assert.equal(res.status, 200);

  res = await setStatus(number, { from: 'siap_diambil', to: 'selesai', pickup_code: ' pk 4821 ' });
  assert.deepEqual(res.json.data, { order_number: number, order_status: 'selesai', points_awarded: 56 });
  assert.equal(find(number).orderStatus, 'selesai');
  assert.deepEqual(
    t.histories.map((h) => [h.status, String(h.changedBy), h.note, h.changedAt.toISOString()]),
    [
      ['sedang_disiapkan', '3', null, NOW.toISOString()],
      ['siap_diambil', '4', null, NOW.toISOString()],
      ['selesai', '3', 'Kode pickup terverifikasi', NOW.toISOString()],
    ]
  );
  assert.deepEqual(t.points.map((p) => [String(p.userId), p.type, p.points, String(p.orderId)]), [['1', 'earn', 56, '1']]);
  // Kunci baris pesanan diambil di setiap perubahan; kode pickup tidak ada di respons
  assert.deepEqual(locks.map((l) => l.values[0]), [number, number, number]);
  assert.ok(!JSON.stringify(res.json).includes('4821'));

  // Ulang Selesai → ditolak (final), poin tetap sekali
  res = await setStatus(number, { from: 'siap_diambil', to: 'selesai', pickup_code: 'PK4821' });
  assert.deepEqual([res.status, res.json.message], [409, 'Pesanan sudah Selesai sehingga statusnya tidak bisa diubah lagi']);
  assert.equal(t.points.length, 1);
});

test('delivery: Dalam Pengiriman wajib nama kurir (disimpan & dicatat), Selesai tanpa kode pickup', async () => {
  const number = 'OVC-261102-002';
  find(number).orderStatus = 'sedang_disiapkan';
  let res = await setStatus(number, { from: 'sedang_disiapkan', to: 'dalam_pengiriman' });
  assert.deepEqual([res.status, res.json.message], [400, 'Isi nama kurir']);
  res = await setStatus(number, { from: 'sedang_disiapkan', to: 'dalam_pengiriman', courier_name: 'x'.repeat(101) });
  assert.deepEqual([res.status, res.json.message], [400, 'Nama kurir maksimal 100 karakter']);
  assert.equal(t.histories.length, 0);

  res = await setStatus(number, { from: 'sedang_disiapkan', to: 'dalam_pengiriman', courier_name: '  Pak Joko  ' });
  assert.equal(res.status, 200);
  assert.equal(find(number).courierName, 'Pak Joko');
  assert.equal(t.histories[0].note, 'Kurir: Pak Joko');

  res = await setStatus(number, { from: 'dalam_pengiriman', to: 'selesai' });
  assert.deepEqual(res.json.data, { order_number: number, order_status: 'selesai', points_awarded: 81 });
  assert.equal(t.histories[1].note, null);
});

test('transisi tidak sah: loncat, mundur, cabang salah, Menunggu Pembayaran, Dibatalkan, status tak dikenal → 409', async () => {
  const before = dump();
  const cases = [
    ['OVC-261102-001', { from: 'dikonfirmasi', to: 'selesai' }, 'Status harus berurutan. Status berikutnya: Sedang Disiapkan.'],
    ['OVC-261102-001', { from: 'dikonfirmasi', to: 'dibatalkan' }, 'Status harus berurutan. Status berikutnya: Sedang Disiapkan.'],
    ['OVC-261102-001', { to: 'bukan_status' }, 'Status harus berurutan. Status berikutnya: Sedang Disiapkan.'],
    ['OVC-261102-003', { from: 'siap_diambil', to: 'dalam_pengiriman' }, 'Status harus berurutan. Status berikutnya: Selesai.'],
    ['OVC-261102-004', { from: 'menunggu_pembayaran', to: 'dikonfirmasi' }, 'Pesanan masih menunggu pembayaran pelanggan. Status berubah otomatis setelah lunas.'],
    ['OVC-261102-005', { from: 'dibatalkan', to: 'sedang_disiapkan' }, 'Pesanan sudah Dibatalkan sehingga statusnya tidak bisa diubah lagi'],
  ];
  for (const [number, body, message] of cases) {
    const res = await setStatus(number, body);
    assert.deepEqual([res.status, res.json.status, res.json.message], [409, 'error', message], JSON.stringify(body));
  }
  // Mundur dari Sedang Disiapkan
  find('OVC-261102-002').orderStatus = 'sedang_disiapkan';
  const back = await setStatus('OVC-261102-002', { from: 'sedang_disiapkan', to: 'dikonfirmasi' });
  assert.deepEqual([back.status, back.json.message], [409, 'Status harus berurutan. Status berikutnya: Dalam Pengiriman.']);
  find('OVC-261102-002').orderStatus = 'dikonfirmasi';
  assert.equal(dump(), before);
});

test('status basi: from berbeda dengan status terbaru → 409 STALE tanpa menulis apa pun', async () => {
  find('OVC-261102-001').orderStatus = 'sedang_disiapkan';
  const before = dump();
  const res = await setStatus('OVC-261102-001', { from: 'dikonfirmasi', to: 'sedang_disiapkan' });
  assert.deepEqual([res.status, res.json.message], [409, 'Status pesanan sudah berubah menjadi Sedang Disiapkan. Data dimuat ulang.']);
  assert.equal(dump(), before);
});

test('request bersamaan: request kedua melihat status terbaru setelah kunci (tidak ada transisi/riwayat/poin ganda)', async () => {
  const number = 'OVC-261102-001';
  find(number).orderStatus = 'siap_diambil';
  // Request lain menyelesaikan pesanan (dan memberi poin) saat request ini menunggu kunci
  hooks.otherCommit = () => {
    find(number).orderStatus = 'selesai';
    t.points.push({ pointTxId: 1n, userId: 1n, type: 'earn', points: 56, orderId: 1n });
  };
  const res = await setStatus(number, { from: 'siap_diambil', to: 'selesai', pickup_code: 'PK4821' });
  assert.deepEqual([res.status, res.json.message], [409, 'Pesanan sudah Selesai sehingga statusnya tidak bisa diubah lagi']);
  assert.equal(t.points.length, 1);
  assert.equal(t.histories.length, 0);

  // Pelanggan membatalkan saat admin menunggu kunci
  hooks.otherCommit = () => {
    find('OVC-261102-002').orderStatus = 'dibatalkan';
  };
  const cancelled = await setStatus('OVC-261102-002', { from: 'dikonfirmasi', to: 'sedang_disiapkan' });
  assert.equal(cancelled.status, 409);
  assert.equal(find('OVC-261102-002').orderStatus, 'dibatalkan');

  // Poin earn yang sudah ada untuk pesanan ini (mis. data lama) tidak diberikan lagi
  find(number).orderStatus = 'siap_diambil';
  const again = await setStatus(number, { from: 'siap_diambil', to: 'selesai', pickup_code: 'PK4821' });
  assert.deepEqual([again.status, again.json.data.points_awarded], [200, 0]);
  assert.equal(t.points.length, 1);
});

test('Selesai: Bayar di Toko wajib ditandai lunas; kode pickup wajib & harus cocok', async () => {
  const number = 'OVC-261102-003';
  let res = await setStatus(number, { from: 'siap_diambil', to: 'selesai', pickup_code: 'PK4821' });
  assert.deepEqual([res.status, res.json.message], [409, 'Tandai pembayaran Bayar di Toko lunas sebelum menyelesaikan pesanan']);

  t.orders.find((o) => o.orderNumber === 'OVC-261102-001').orderStatus = 'siap_diambil';
  res = await setStatus('OVC-261102-001', { from: 'siap_diambil', to: 'selesai' });
  assert.deepEqual([res.status, res.json.message], [400, 'Masukkan kode pickup dari pelanggan']);
  res = await setStatus('OVC-261102-001', { from: 'siap_diambil', to: 'selesai', pickup_code: 'PK0000' });
  assert.deepEqual([res.status, res.json.message], [400, 'Kode pickup tidak cocok. Periksa kembali kode yang ditunjukkan pelanggan.']);
  assert.equal(t.histories.length, 0);
  assert.equal(t.points.length, 0);
});

test('verify-pickup: cocok → { valid: true } tanpa menulis; salah/kosong 400; bukan Siap Diambil/bukan pickup 409', async () => {
  const before = dump();
  let res = await verify('OVC-261102-003', 'pk4821');
  assert.deepEqual([res.status, res.json], [200, { status: 'success', data: { valid: true } }]);
  res = await verify('OVC-261102-003', 'PK1111');
  assert.deepEqual([res.status, res.json.message], [400, 'Kode pickup tidak cocok. Periksa kembali kode yang ditunjukkan pelanggan.']);
  for (const code of ['', '   ', null]) {
    res = await verify('OVC-261102-003', code);
    assert.deepEqual([res.status, res.json.message], [400, 'Masukkan kode pickup dari pelanggan']);
  }
  res = await call('POST', '/OVC-261102-003/verify-pickup', staff, {});
  assert.deepEqual([res.status, res.json.message], [400, 'Masukkan kode pickup dari pelanggan']);
  res = await verify('OVC-261102-001', 'PK4821');
  assert.deepEqual([res.status, res.json.message], [409, 'Kode pickup diverifikasi saat pesanan berstatus Siap Diambil']);
  res = await verify('OVC-261102-002', 'PK4821');
  assert.deepEqual([res.status, res.json.message], [409, 'Pesanan ini bukan pickup']);
  res = await verify('OVC-261102-003', 4821);
  assert.deepEqual([res.status, res.json.message], [400, 'Kode pickup tidak valid.']);
  assert.ok(!JSON.stringify(res.json).includes('PK4821'));
  assert.equal(dump(), before);
});

test('mark-paid: Bayar di Toko Siap Diambil → lunas (pesanan + pembayaran), tanpa riwayat status; online & ulang ditolak', async () => {
  const number = 'OVC-261102-003';
  let res = await markPaid(number);
  assert.deepEqual(
    [res.status, res.json.data],
    [200, { order_number: number, payment_status: 'paid', paid_at: '2026-11-03T03:00:00.000Z' }]
  );
  assert.equal(find(number).paymentStatus, 'paid');
  assert.equal(find(number).orderStatus, 'siap_diambil');
  const payment = t.payments.find((p) => p.orderId === 3n);
  assert.deepEqual([payment.status, payment.paidAt.toISOString(), payment.amount], ['paid', '2026-11-03T03:00:00.000Z', '56500.00']);
  assert.equal(t.histories.length, 0);

  res = await markPaid(number);
  assert.deepEqual([res.status, res.json.message], [409, 'Pembayaran pesanan ini sudah lunas']);
  res = await markPaid('OVC-261102-001');
  assert.deepEqual([res.status, res.json.message], [409, 'Hanya pesanan Bayar di Toko yang ditandai lunas oleh admin']);
  t.orders.push(orderRow({ orderId: 6n, orderNumber: 'OVC-261102-006', paymentOption: 'pay_at_store', paymentStatus: 'unpaid' }));
  res = await markPaid('OVC-261102-006');
  assert.deepEqual([res.status, res.json.message], [409, 'Pembayaran di toko diterima saat pesanan berstatus Siap Diambil']);

  // Setelah lunas, Selesai dengan kode pickup berhasil dan poin diberikan
  res = await setStatus(number, { from: 'siap_diambil', to: 'selesai', pickup_code: 'PK4821' });
  assert.deepEqual([res.status, res.json.data.points_awarded], [200, 56]);
});

test('pesanan tidak ditemukan 404; nomor tidak valid 400 INVALID_ID; body tidak valid 400', async () => {
  for (const [method, path, body] of [
    ['PATCH', '/OVC-990101-999/status', { to: 'selesai' }], ['POST', '/OVC-990101-999/verify-pickup', { pickup_code: 'PK1' }],
    ['PATCH', '/OVC-990101-999/mark-paid', undefined],
  ]) {
    const res = await call(method, path, staff, body);
    assert.deepEqual([res.status, res.json.message], [404, 'Pesanan tidak ditemukan.'], path);
    const bad = await call(method, path.replace('OVC-990101-999', 'bukan nomor'), staff, body);
    assert.deepEqual([bad.status, bad.json.code], [400, 'INVALID_ID'], path);
  }
  for (const body of [{}, { to: '' }, { to: 5 }, [], { to: 'selesai', courier_name: 7 }, { to: 'selesai', from: 1 }]) {
    const res = await setStatus('OVC-261102-001', body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  const malformed = await setStatus('OVC-261102-001', '{"to":');
  assert.deepEqual([malformed.status, malformed.json.message], [400, 'Format data JSON tidak valid.']);
});

test('database gagal di tengah transaksi → 500 tanpa detail, semua perubahan dibatalkan (rollback)', async () => {
  const before = dump();
  find('OVC-261102-001').orderStatus = 'siap_diambil';
  const ready = dump();
  failOn = 'pointTransaction.create';
  let res = await setStatus('OVC-261102-001', { from: 'siap_diambil', to: 'selesai', pickup_code: 'PK4821' });
  assert.deepEqual([res.status, res.json], [500, { status: 'error', message: 'Terjadi kesalahan pada server.' }]);
  assert.equal(dump(), ready); // status, riwayat, dan poin tidak tersimpan

  find('OVC-261102-001').orderStatus = 'dikonfirmasi';
  failOn = 'orderStatusHistory.create';
  res = await setStatus('OVC-261102-001', { from: 'dikonfirmasi', to: 'sedang_disiapkan' });
  assert.equal(res.status, 500);
  assert.equal(dump(), before);

  failOn = 'payment.updateMany';
  res = await markPaid('OVC-261102-003');
  assert.equal(res.status, 500);
  assert.equal(find('OVC-261102-003').paymentStatus, 'unpaid');

  failOn = 'order.findUnique';
  res = await verify('OVC-261102-003', 'PK4821');
  assert.equal(res.status, 500);
});
