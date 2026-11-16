// CR-04b · FR-45, FR-46 · BR-31 · SPEC §6 — route test (Prisma palsu helpers/catalogDb.js) untuk lapisan HTTP endpoint
// produksi: tamu 401, pelanggan 403 (K09: Staf & Owner), request_id WAJIB (setelah auth) pada POST WO, PATCH status,
// pengeluaran, selesai, pembalik/koreksi pengeluaran & hasil; skema ketat (field tak dikenal 400); ID tidak sah 400;
// alasan wajib; GET menolak request_id. Transaksi, kunci, buku mutasi, idempotensi, rollback: tests-mysql/26.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { installCatalogDb } = require('./helpers/catalogDb');

process.env.JWT_SECRET = 'test-secret-only';
const app = require('../src/app');

const RID = '3b1f6c2e-8a4d-4f1b-9c2d-000000000098';
let server;
let baseUrl;
let db;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => { db = installCatalogDb(fakePrisma, new Date('2026-11-16T00:00:00.000Z')); });

const token = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const call = async (method, p, body, sub = '3') => {
  const res = await fetch(`${baseUrl}${p}`, {
    method, headers: { 'Content-Type': 'application/json', ...(sub ? { Authorization: `Bearer ${token(sub)}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json() };
};

const ENDPOINTS = [
  ['GET', '/work-orders'], ['GET', '/work-orders/plan-source'], ['GET', '/work-orders/1'], ['POST', '/work-orders', {}],
  ['PUT', '/work-orders/1', {}], ['PATCH', '/work-orders/1/status', { from: 'draft', to: 'diproses' }],
  ['POST', '/work-orders/1/issues', { lines: [] }], ['POST', '/work-orders/1/complete', { qty_output: 1 }],
  ['POST', '/material-issues/1/reverse', { reason: 'x' }], ['POST', '/material-issues/1/correct', { lines: [], reason: 'x' }],
  ['POST', '/production-outputs/1/reverse', { reason: 'x' }], ['POST', '/production-outputs/1/correct', { qty_output: 1, reason: 'x' }],
];

test('auth (K09): tamu 401 dan pelanggan 403 untuk seluruh endpoint produksi', async () => {
  const customer = Object.keys(db.t.users).find((k) => db.t.users[k].role === 'customer');
  assert.ok(customer, 'fixture memiliki pelanggan');
  for (const [m, p, b] of ENDPOINTS) {
    assert.equal((await call(m, p, b, null)).status, 401, `${m} ${p}`);
    assert.equal((await call(m, p, b, customer)).status, 403, `${m} ${p}`);
  }
});

test('request_id wajib (POST WO, PATCH status, pengeluaran, selesai, pembalik, koreksi) → 400 setelah auth; GET menolak request_id', async () => {
  for (const [m, p, b] of ENDPOINTS.filter(([m, p]) => m !== 'GET' && p !== '/work-orders/1')) {
    const res = await call(m, p, b);
    assert.deepEqual([res.status, res.json.message], [400, 'request_id wajib diisi.'], `${m} ${p}`);
  }
  assert.equal((await call('POST', '/work-orders', { product_id: '1', request_id: RID.toUpperCase() })).status, 400, 'format');
  for (const p of ['/work-orders', '/work-orders/plan-source', '/work-orders/1']) assert.equal((await call('GET', `${p}?request_id=${RID}`)).status, 400, `GET ${p}`);
});

test('skema ketat & validasi bentuk: field tak dikenal, tipe salah, ID tidak sah, alasan wajib → 400', async () => {
  for (const [m, p, b] of [
    ['POST', '/work-orders', { product_id: '1', production_date: '2026-11-16', qty_planned: 1, extra: 1, request_id: RID }],
    ['PATCH', '/work-orders/1/status', { from: 'draft', to: 'selesai_sebagian', request_id: RID }],
    ['POST', '/work-orders/1/issues', { lines: 'x', request_id: RID }],
    ['POST', '/work-orders/1/issues', { lines: [{ material_id: '1', qty: '1', harga: 1 }], request_id: RID }],
    ['POST', '/work-orders/1/complete', { qty_output: 1, lines: 'x', request_id: RID }],
    ['POST', '/material-issues/1/reverse', { reason: '  ', request_id: RID }],
    ['POST', '/material-issues/1/correct', { lines: [], request_id: RID }],
    ['POST', '/production-outputs/1/reverse', { request_id: RID }],
    ['POST', '/production-outputs/1/correct', { qty_output: 2, reason: 5, request_id: RID }],
    ['GET', '/work-orders/abc'], ['PUT', '/work-orders/0', {}], ['POST', '/material-issues/x/reverse', { reason: 'x', request_id: RID }],
  ]) {
    assert.equal((await call(m, p, b)).status, 400, `${m} ${p} ${JSON.stringify(b)}`);
  }
});
