// Step 6.5 C5 · FR-37 — services/auditLog.service.js dan titik audit master data (AD-06 harga produk & varian, opsi custom
// cake; AD-07 rencana stok harian, koreksi stok bahan, stok masuk) lewat HTTP. Isi baris (pelaku, action, entity = nama
// tabel, entity_id = primary key, created_at detik penuh), hanya saat nilai berubah, tanpa audit saat data baru / sama /
// 400 / 404 / 401 / rollback, pelaku nonaktif → 401 SESSION_INVALID, urutan kunci pelaku S → store_settings.
// Prisma dipalsukan (helpers/catalogDb.js) — urutan pernyataan saja, TIDAK membuktikan locking InnoDB (tests-mysql/16).

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { installCatalogDb } = require('./helpers/catalogDb');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');
const { decimalChanged, toAuditTime, lockAuditActor, recordAudit } = require('../src/services/auditLog.service');
const { AUDIT_ACTION, AUDIT_ENTITY } = require('../src/utils/businessConstants');

const NOW = new Date('2026-11-03T03:00:00.987Z'); // pecahan detik sengaja ≠ 0 (DATETIME(0))
const NOW_SECOND = new Date('2026-11-03T03:00:00.000Z');
const TODAY = new Date('2026-11-03T00:00:00.000Z');

// ── Service ──────────────────────────────────────────────────────────────────────────────────────

test('konstanta: semua action & entity ≤ 50 karakter; entity = nama tabel', () => {
  for (const v of [...Object.values(AUDIT_ACTION), ...Object.values(AUDIT_ENTITY)]) assert.ok(v.length <= 50, v);
  assert.deepEqual(Object.values(AUDIT_ENTITY).sort(), ['custom_options', 'daily_stocks', 'orders', 'product_variants', 'products', 'raw_materials']);
});

test('created_at = detik penuh ke bawah (DATETIME(0)); decimalChanged memakai DECIMAL', () => {
  assert.equal(toAuditTime(NOW).toISOString(), '2026-11-03T03:00:00.000Z');
  assert.equal(toAuditTime(new Date('2026-11-03T03:00:00.499Z')).toISOString(), '2026-11-03T03:00:00.000Z');
  assert.equal(decimalChanged('28000.00', 28000), false);
  assert.equal(decimalChanged('28000.00', '28000'), false);
  assert.equal(decimalChanged('28000.00', 28000.01), true);
  assert.equal(decimalChanged('0.00', 0), false);
});

test('lockAuditActor: FOR SHARE membaca is_active; nonaktif / tidak ada → 401 SESSION_INVALID; recordAudit data lengkap', async () => {
  const seen = [];
  const tx = (rows) => ({ $queryRaw: async (strings, ...values) => { seen.push([strings.join('?'), values]); return rows; } });
  await lockAuditActor(tx([{ user_id: 3n, is_active: 1 }]), '3');
  assert.deepEqual(seen[0], ['SELECT user_id, is_active FROM users WHERE user_id = ? FOR SHARE', [3n]]);
  await lockAuditActor(tx([{ user_id: 3n, is_active: true }]), 3n);
  for (const rows of [[{ user_id: 3n, is_active: 0 }], [{ user_id: 3n, is_active: false }], []]) {
    await assert.rejects(lockAuditActor(tx(rows), '3'), (e) => e.statusCode === 401 && e.apiCode === 'SESSION_INVALID'
      && e.message === 'Akun tidak ditemukan atau tidak aktif.');
  }
  const created = [];
  await recordAudit({ auditLog: { create: async (a) => created.push(a.data) } }, {
    actorId: '4', action: AUDIT_ACTION.MARK_ORDER_PAID, entity: AUDIT_ENTITY.ORDERS, entityId: 7, now: NOW,
  });
  assert.deepEqual(created, [{ userId: 4n, action: 'mark_order_paid', entity: 'orders', entityId: 7n, createdAt: NOW_SECOND }]);
});

// ── Titik audit master data lewat HTTP ───────────────────────────────────────────────────────────

let db;
let server;
let baseUrl;

test.before(async () => {
  test.mock.timers.enable({ apis: ['Date'], now: NOW });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => { db = installCatalogDb(fakePrisma, TODAY); });

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const STAFF = '3';
const OWNER = '4';
const call = async (method, p, body, sub = STAFF) => {
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(sub ? { Authorization: `Bearer ${tokenFor(sub)}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json() };
};
const audits = () => db.t.auditLogs.map((a) => [String(a.userId), a.action, a.entity, String(a.entityId), a.createdAt.toISOString()]);
const dump = () => JSON.stringify(db.t, (k, v) => (typeof v === 'bigint' ? String(v) : v));
const cinnamon = (overrides = {}) => ({
  name: 'Signature Cinnamon Roll', category_id: 1, description: '', ingredients: '', allergens: '', price: '32000',
  availability_type: 'ready', lead_time_days: 0, is_active: true,
  variants: [{ variant_id: '21', name: 'Extra Glaze', extra_price: '5000', is_active: true }], ...overrides,
});
const T = NOW_SECOND.toISOString();

test('produk: harga berubah → update_product_price (pelaku dari token); harga sama / produk baru → tanpa audit', async () => {
  assert.equal((await call('PUT', '/products/2', cinnamon())).status, 200);
  assert.equal((await call('PUT', '/products/2', cinnamon({ price: '32000.00', description: 'Baru' }))).status, 200);
  assert.equal((await call('POST', '/products', cinnamon({ name: 'Roti Baru', variants: [{ name: 'X', extra_price: '1000', is_active: true }] }))).status, 201);
  assert.deepEqual(audits(), [], 'nilai sama (DECIMAL) & data baru tidak dicatat');

  assert.equal((await call('PUT', '/products/2', cinnamon({ price: '33500' }), OWNER)).status, 200);
  assert.deepEqual(audits(), [['4', 'update_product_price', 'products', '2', T]]);
});

test('varian: harga tambahan varian lama berubah → update_variant_price; varian baru & nama saja → tanpa audit', async () => {
  const res = await call('PUT', '/products/2', cinnamon({
    variants: [
      { variant_id: '21', name: 'Extra Glaze Baru', extra_price: '5000', is_active: true },
      { variant_id: '22', name: 'Lama', extra_price: '1500', is_active: false },
      { name: 'Varian Baru', extra_price: '2500', is_active: true },
    ],
  }));
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(audits(), [['3', 'update_variant_price', 'product_variants', '22', T]]);
});

test('opsi custom cake: extra_price berubah → update_custom_option_price; sama / opsi baru → tanpa audit', async () => {
  assert.equal((await call('PUT', '/custom-options/2', { name: 'Diameter 24 cm', extra_price: '50000.00', is_active: true })).status, 200);
  assert.equal((await call('POST', '/custom-options', { option_group: 'rasa', name: 'Pandan', extra_price: '10000' })).status, 201);
  assert.deepEqual(audits(), []);
  assert.equal((await call('PUT', '/custom-options/2', { name: 'Diameter 24 cm', extra_price: '55000', is_active: true })).status, 200);
  assert.deepEqual(audits(), [['3', 'update_custom_option_price', 'custom_options', '2', T]]);
});

test('stok harian: satu audit per produk yang qty_planned berubah (nilai akhir bila dikirim dua kali), entity_id = stock_id', async () => {
  const res = await call('PUT', '/stocks/today', {
    plans: [{ product_id: 1, qty_planned: 20 }, { product_id: 2, qty_planned: 7 }, { product_id: 2, qty_planned: 9 }],
  });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(audits(), [['3', 'update_daily_stock_plan', 'daily_stocks', '2', T]], 'produk 1 tetap 20 → tanpa audit');
  // Kembali ke nilai awal dalam satu permintaan (2 → 0 → … akhir 9 sama dengan tersimpan) → tanpa audit baru
  await call('PUT', '/stocks/today', { plans: [{ product_id: 2, qty_planned: 3 }, { product_id: 2, qty_planned: 9 }] });
  assert.equal(audits().length, 1);
});

test('bahan baku: koreksi stok → correct_raw_material_stock; bahan baru → create_raw_material (CR-04a E1 B.4); edit nama/minimum → tanpa audit; stok masuk selalu', async () => {
  assert.equal((await call('PUT', '/raw-materials/1', { name: 'Tepung Terigu Protein', unit: 'kg', stock: 25, min_stock: 12 })).status, 200);
  assert.deepEqual(audits(), [], 'edit informasi tidak dicatat');
  const ragi = await call('POST', '/raw-materials', { name: 'Ragi', unit: 'g', stock: 500, min_stock: 100 });
  assert.equal(ragi.status, 201);
  assert.deepEqual(audits(), [['3', 'create_raw_material', 'raw_materials', ragi.json.data.material_id, T]], 'bahan baru: tepat satu audit');
  const corr = await call('PUT', '/raw-materials/1', { name: 'Tepung Terigu Protein', unit: 'kg', stock: 23, expected_stock: 25, min_stock: 12 });
  assert.equal(corr.status, 200, JSON.stringify(corr.json));
  assert.equal((await call('POST', '/raw-materials/1/stock-in', { qty: '2.5' }, OWNER)).status, 200);
  assert.deepEqual(audits().slice(1), [
    ['3', 'correct_raw_material_stock', 'raw_materials', '1', T],
    ['4', 'raw_material_stock_in', 'raw_materials', '1', T],
  ]);
});

test('tanpa audit saat 400 / 404 / 409 / akses ditolak; database gagal di audit → seluruh perubahan di-rollback', async () => {
  const before = dump();
  assert.equal((await call('PUT', '/products/2', cinnamon({ price: '0' }))).status, 400);
  assert.equal((await call('PUT', '/products/999', cinnamon({ price: '40000' }))).status, 404);
  assert.equal((await call('PUT', '/raw-materials/1', { name: 'Tepung Terigu', unit: 'kg', stock: 20, expected_stock: 24, min_stock: 10 })).status, 409);
  assert.equal((await call('POST', '/raw-materials/1/stock-in', { qty: -1 })).status, 400);
  assert.equal((await call('PUT', '/products/2', cinnamon({ price: '40000' }), '1')).status, 403, 'pelanggan');
  assert.equal((await call('PUT', '/products/2', cinnamon({ price: '40000' }), null)).status, 401, 'tanpa token');
  assert.equal(dump(), before);

  db.failOn = 'auditLog.create';
  for (const [m, p, body] of [
    ['PUT', '/products/2', cinnamon({ price: '40000' })],
    ['PUT', '/custom-options/2', { name: 'Diameter 24 cm', extra_price: '60000', is_active: true }],
    ['PUT', '/stocks/today', { plans: [{ product_id: 2, qty_planned: 11 }] }],
    ['PUT', '/raw-materials/1', { name: 'Tepung Terigu', unit: 'kg', stock: 20, expected_stock: 25, min_stock: 10 }],
    ['POST', '/raw-materials/1/stock-in', { qty: 3 }],
  ]) {
    assert.equal((await call(m, p, body)).status, 500, p);
  }
  db.failOn = null;
  assert.equal(dump(), before, 'harga, stok, & audit tidak berubah');
});

test('pelaku dinonaktifkan sebelum kunci pelaku → 401 SESSION_INVALID tanpa perubahan; urutan kunci pelaku S → store_settings', async () => {
  // Middleware auth membaca akun aktif; tepat sebelum locking read pelaku, Owner menonaktifkan akun itu (commit)
  db.hooks.whileWaitingActorLock = () => { db.t.users[STAFF].isActive = false; db.hooks.whileWaitingActorLock = null; };
  const before = dump();
  const res = await call('PUT', '/products/2', cinnamon({ price: '41000' }));
  assert.deepEqual([res.status, res.json.code, res.json.message], [401, 'SESSION_INVALID', 'Akun tidak ditemukan atau tidak aktif.']);
  db.t.users[STAFF].isActive = true;
  assert.equal(dump().replace(/"isActive":true/g, ''), before.replace(/"isActive":true/g, ''));
  assert.deepEqual(db.t.auditLogs, []);
  const tail = db.ops.slice(db.ops.lastIndexOf('tx:begin'));
  assert.deepEqual(tail.slice(0, 2), ['tx:begin', 'lock:users:S'], 'tidak ada kunci lain sebelum pelaku ditolak');
  assert.ok(!tail.includes('lock:store_settings'));

  for (const [m, p, body] of [['PUT', '/stocks/today', { plans: [{ product_id: 2, qty_planned: 4 }] }], ['POST', '/raw-materials/1/stock-in', { qty: 1 }]]) {
    db.hooks.whileWaitingActorLock = () => { db.t.users[STAFF].isActive = false; db.hooks.whileWaitingActorLock = null; };
    assert.deepEqual([(await call(m, p, body)).status], [401], p);
    db.t.users[STAFF].isActive = true;
  }
  assert.deepEqual(db.t.auditLogs, []);
});
