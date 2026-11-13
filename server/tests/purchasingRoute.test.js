// CR-04a CP5 · FR-41 – FR-43 · BR-31 · SPEC §6 — route test (Prisma palsu helpers/catalogDb.js) untuk lapisan HTTP endpoint
// pembelian: tamu 401, pelanggan 403, request_id WAJIB (setelah auth) pada POST supplier/PO, PATCH status, penerimaan,
// pembalik/koreksi; skema ketat (field tak dikenal 400); ID tidak sah 400; alasan wajib. Perilaku transaksi, kunci,
// buku mutasi, idempotensi, dan rollback di MySQL nyata: tests-mysql/22-cr04a-purchasing.it.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { installCatalogDb } = require('./helpers/catalogDb');

process.env.JWT_SECRET = 'test-secret-only';
const app = require('../src/app');

const RID = '3b1f6c2e-8a4d-4f1b-9c2d-000000000099';
let server;
let baseUrl;
let db;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => { db = installCatalogDb(fakePrisma, new Date('2026-11-13T00:00:00.000Z')); });

const token = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const call = async (method, p, body, sub = '3') => {
  const res = await fetch(`${baseUrl}${p}`, {
    method, headers: { 'Content-Type': 'application/json', ...(sub ? { Authorization: `Bearer ${token(sub)}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json() };
};

const ENDPOINTS = [
  ['GET', '/suppliers'], ['POST', '/suppliers', {}], ['PUT', '/suppliers/1', {}], ['PATCH', '/suppliers/1/active', { is_active: false }],
  ['GET', '/purchase-orders'], ['GET', '/purchase-orders/1'], ['POST', '/purchase-orders', {}], ['PUT', '/purchase-orders/1', {}],
  ['PATCH', '/purchase-orders/1/status', { from: 'draft', to: 'dipesan' }], ['POST', '/purchase-orders/1/receipts', { lines: [] }],
  ['POST', '/goods-receipts/1/reverse', { reason: 'x' }], ['POST', '/goods-receipts/1/correct', { lines: [], reason: 'x' }],
];

test('auth: tamu 401 dan pelanggan 403 untuk seluruh endpoint pembelian', async () => {
  const customer = Object.keys(db.t.users).find((k) => db.t.users[k].role === 'customer');
  for (const [m, p, b] of ENDPOINTS) {
    assert.equal((await call(m, p, b, null)).status, 401, `${m} ${p}`);
    if (customer) assert.equal((await call(m, p, b, customer)).status, 403, `${m} ${p}`);
  }
});

test('request_id wajib (POST supplier/PO, PATCH status, penerimaan, pembalik, koreksi) → 400 sebelum service; format salah → 400', async () => {
  for (const [m, p, b] of ENDPOINTS.filter(([m, p]) => m !== 'GET' && !/^\/(suppliers|purchase-orders)\/1$/.test(p) && !/active$/.test(p))) {
    const res = await call(m, p, b);
    assert.deepEqual([res.status, res.json.message], [400, 'request_id wajib diisi.'], `${m} ${p}`);
  }
  assert.equal((await call('POST', '/suppliers', { name: 'A', request_id: RID.toUpperCase() })).status, 400);
  assert.equal((await call('GET', `/suppliers?request_id=${RID}`)).status, 400, 'GET di luar allowlist');
});

test('skema ketat & validasi bentuk: field tak dikenal, tipe salah, ID tidak sah, alasan wajib → 400', async () => {
  for (const [m, p, b] of [
    ['POST', '/suppliers', { name: 'A', extra: 1, request_id: RID }],
    ['PATCH', '/suppliers/1/active', { is_active: 'ya' }],
    ['POST', '/purchase-orders', { supplier_id: '1', items: 'x', request_id: RID }],
    ['POST', '/purchase-orders', { supplier_id: '1', items: [{ material_id: '1', qty_ordered: '1', unit_price: '1', diskon: 5 }], request_id: RID }],
    ['PATCH', '/purchase-orders/1/status', { from: 'draft', to: 'diterima_penuh', request_id: RID }],
    ['PATCH', '/purchase-orders/1/status', { from: 'dipesan', to: 'dibatalkan', cancel_reason: 'x'.repeat(256), request_id: RID }],
    ['POST', '/purchase-orders/1/receipts', { lines: [{ po_item_id: '1', qty: '1', harga: 1 }], request_id: RID }],
    ['POST', '/goods-receipts/1/reverse', { reason: '  ', request_id: RID }],
    ['POST', '/goods-receipts/1/correct', { lines: [], request_id: RID }],
    ['GET', '/purchase-orders/abc'], ['PUT', '/suppliers/0', {}],
  ]) {
    assert.equal((await call(m, p, b)).status, 400, `${m} ${p} ${JSON.stringify(b)}`);
  }
});
