// Regresi tingkat HTTP: /api/me/notifications (FR-18 · UC-18 · C-24) — auth, peran, isolasi antar-pelanggan,
// urutan terbaru dulu, jumlah belum dibaca, tandai dibaca idempoten, validasi id, dan kontrak
// client services/notificationService.js (items, unread, today_key; id string; waktu ISO).
// Prisma dipalsukan (tabel notifications di memori); server Express dijalankan di port acak lalu ditutup.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { matchesWhere } = require('./helpers/whereMatch');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

const users = {
  1: { userId: 1n, role: 'customer', isActive: true },
  2: { userId: 2n, role: 'customer', isActive: true },
  3: { userId: 3n, role: 'staf', isActive: true },
  4: { userId: 4n, role: 'owner', isActive: true },
  5: { userId: 5n, role: 'customer', isActive: false },
};

const orders = { 10: 'OVC-261012-018' };

let notifications = [];

const row = (id, userId, overrides = {}) => ({
  notificationId: BigInt(id),
  userId: BigInt(userId),
  type: 'order_status',
  title: `Judul ${id}`,
  body: `Isi ${id}`,
  orderId: null,
  isRead: false,
  createdAt: new Date(Date.UTC(2026, 9, 1, 3, 0, id)),
  ...overrides,
});

// Sengaja tidak mencocokkan field `include` lain: hanya order.orderNumber yang diminta service
const withOrder = (n) => ({ ...n, order: n.orderId == null ? null : { orderNumber: orders[String(n.orderId)] } });

let updateManyCalls = 0;

fakePrisma.user = { findUnique: async ({ where }) => users[String(where.userId)] ?? null };
fakePrisma.notification = {
  findMany: async ({ where, orderBy, include }) => {
    assert.deepEqual(orderBy, [{ createdAt: 'desc' }, { notificationId: 'desc' }]);
    assert.deepEqual(include, { order: { select: { orderNumber: true } } });
    return notifications
      .filter((n) => matchesWhere(n, where))
      .sort((a, b) => b.createdAt - a.createdAt || (a.notificationId < b.notificationId ? 1 : -1))
      .map(withOrder);
  },
  count: async ({ where }) => notifications.filter((n) => matchesWhere(n, where)).length,
  findFirst: async ({ where }) => notifications.find((n) => matchesWhere(n, where)) ?? null,
  updateMany: async ({ where, data }) => {
    updateManyCalls += 1;
    let count = 0;
    notifications = notifications.map((n) => {
      if (!matchesWhere(n, where)) return n;
      count += 1;
      return { ...n, ...data };
    });
    return { count };
  },
};

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/me/notifications`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test.beforeEach(() => {
  updateManyCalls = 0;
  notifications = [
    row(1, 1, { isRead: true }),
    row(2, 1, { orderId: 10n, createdAt: new Date(Date.UTC(2026, 9, 2, 3, 0, 0)) }),
    row(3, 1, { type: 'points', createdAt: new Date(Date.UTC(2026, 9, 2, 3, 0, 0)) }),
    row(4, 2, { type: 'promo' }),
  ];
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });

const call = async (method, path = '', token) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, json: await res.json() };
};

const ENDPOINTS = [['GET', ''], ['GET', '/unread-count'], ['PATCH', '/2/read']];

test('tamu (tanpa token) → 401 di ketiga endpoint, bukan 404', async () => {
  for (const [method, path] of ENDPOINTS) {
    const { status, json } = await call(method, path);
    assert.equal(status, 401, `${method} ${path}`);
    assert.equal(json.message, 'Autentikasi diperlukan.');
  }
});

test('token rusak, kedaluwarsa, dan akun nonaktif → 401 SESSION_INVALID', async () => {
  const expired = jwt.sign({ sub: '1', exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
  });

  for (const token of ['token-palsu', expired, tokenFor('5')]) {
    const { status, json } = await call('GET', '', token);
    assert.equal(status, 401);
    assert.equal(json.code, 'SESSION_INVALID');
  }
});

test('staf dan owner → 403 di ketiga endpoint, data tidak berubah', async () => {
  for (const sub of ['3', '4']) {
    for (const [method, path] of ENDPOINTS) {
      const { status, json } = await call(method, path, tokenFor(sub));
      assert.equal(status, 403, `${sub} ${method} ${path}`);
      assert.equal(json.code, undefined);
    }
  }
  assert.equal(updateManyCalls, 0);
});

test('GET daftar: hanya milik pelanggan, terbaru dulu (seri waktu → id terbesar), kontrak client', async () => {
  const { status, json } = await call('GET', '', tokenFor('1'));
  assert.equal(status, 200);
  assert.equal(json.status, 'success');

  const { items, unread, today_key: todayKey } = json.data;
  assert.deepEqual(items.map((n) => n.notification_id), ['3', '2', '1']);
  assert.equal(unread, 2);
  assert.match(todayKey, /^\d{4}-\d{2}-\d{2}$/);

  assert.deepEqual(items[1], {
    notification_id: '2',
    user_id: '1',
    type: 'order_status',
    title: 'Judul 2',
    body: 'Isi 2',
    order_id: '10',
    order_number: 'OVC-261012-018',
    is_read: false,
    created_at: '2026-10-02T03:00:00.000Z',
  });
  assert.equal(items[0].order_id, null);
  assert.equal(items[0].order_number, null);
  assert.equal(items[2].is_read, true);
});

test('GET daftar kosong → items [] dan unread 0', async () => {
  notifications = [];
  const { status, json } = await call('GET', '', tokenFor('2'));
  assert.equal(status, 200);
  assert.deepEqual(json.data.items, []);
  assert.equal(json.data.unread, 0);
});

test('GET unread-count → angka milik pelanggan sendiri', async () => {
  assert.deepEqual((await call('GET', '/unread-count', tokenFor('1'))).json, { status: 'success', data: 2 });
  assert.deepEqual((await call('GET', '/unread-count', tokenFor('2'))).json, { status: 'success', data: 1 });
});

test('PATCH read menandai dibaca; jumlah belum dibaca berkurang', async () => {
  const { status, json } = await call('PATCH', '/2/read', tokenFor('1'));
  assert.equal(status, 200);
  assert.deepEqual(json, { status: 'success', data: { notification_id: '2', is_read: true } });

  assert.equal(notifications.find((n) => n.notificationId === 2n).isRead, true);
  assert.equal((await call('GET', '/unread-count', tokenFor('1'))).json.data, 1);
});

test('PATCH read idempoten: notifikasi yang sudah dibaca tetap 200 tanpa perubahan', async () => {
  const before = notifications.find((n) => n.notificationId === 1n);
  const { status, json } = await call('PATCH', '/1/read', tokenFor('1'));
  assert.equal(status, 200);
  assert.deepEqual(json.data, { notification_id: '1', is_read: true });
  assert.deepEqual(notifications.find((n) => n.notificationId === 1n), before);
});

test('PATCH notifikasi pelanggan lain atau tidak ada → 404, tidak ada yang berubah', async () => {
  for (const id of ['4', '999']) {
    const { status, json } = await call('PATCH', `/${id}/read`, tokenFor('1'));
    assert.equal(status, 404, id);
    assert.equal(json.message, 'Notifikasi tidak ditemukan.');
  }
  assert.equal(notifications.find((n) => n.notificationId === 4n).isRead, false);
  assert.equal(updateManyCalls, 0);
});

test('id tidak valid → 400 INVALID_ID', async () => {
  for (const id of ['abc', '0', '-1', '1.5', '01', '9223372036854775808', '%20']) {
    const { status, json } = await call('PATCH', `/${id}/read`, tokenFor('1'));
    assert.equal(status, 400, id);
    assert.equal(json.code, 'INVALID_ID');
  }
  assert.equal(updateManyCalls, 0);
});
