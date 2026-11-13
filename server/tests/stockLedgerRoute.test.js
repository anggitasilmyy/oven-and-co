// CR-04a CP4 · FR-44 · BR-23, BR-30, BR-31, BR-35 — route test (Prisma palsu, helpers/catalogDb.js): middleware allowlist
// request_id, idempotensi endpoint AD-07 lama (opsional) & baru (wajib), replay + header, 409 REQUEST_ID_REUSED, dokumen
// stok + mutasi (stok masuk, stock opname, koreksi lewat PUT lama, pembalik/koreksi stok masuk), 409 STOCK_CHANGED /
// STOCK_OUT_OF_RANGE / DOCUMENT_ALREADY_SUPERSEDED, dan rollback penuh. Perilaku MySQL nyata: tests-mysql/21-*.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { installCatalogDb } = require('./helpers/catalogDb');

process.env.JWT_SECRET = 'test-secret-only';
const app = require('../src/app');

const TODAY = new Date('2026-11-03T00:00:00.000Z');
const RID = (n) => `3b1f6c2e-8a4d-4f1b-9c2d-${String(n).padStart(12, '0')}`;
let db;
let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => { db = installCatalogDb(fakePrisma, TODAY); });

const token = (sub = '3') => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const call = async (method, p, body, { auth = token() } = {}) => {
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, replay: res.headers.get('idempotent-replay'), json: await res.json() };
};
const material = (id) => db.t.materials.find((m) => m.materialId === BigInt(id));
const dump = () => JSON.stringify(db.t, (k, v) => (typeof v === 'bigint' ? String(v) : v));

test('allowlist request_id: endpoint di luar daftar (GET, lama) → 400 tanpa efek; format salah → 400; wajib tanpa request_id → 400 setelah auth', async () => {
  const before = dump();
  for (const [m, p, b] of [['GET', `/admin/raw-materials?request_id=${RID(1)}`], ['PUT', '/admin/stocks/today', { plans: [], request_id: RID(1) }],
    ['GET', `/admin/raw-materials/1/movements?request_id=${RID(1)}`], ['POST', '/checkout', { request_id: RID(1) }]]) {
    const res = await call(m, p, b);
    assert.deepEqual([res.status, res.json.message], [400, 'request_id tidak diterima pada endpoint ini.'], p);
  }
  for (const bad of [RID(1).toUpperCase(), '3b1f6c2e-8a4d-1f1b-9c2d-000000000001', 7]) {
    assert.equal((await call('POST', '/admin/raw-materials/1/stock-in', { qty: '1', request_id: bad })).status, 400);
  }
  assert.equal((await call('POST', `/admin/raw-materials/1/stock-in?request_id=${RID(2)}`, { qty: '1', request_id: RID(2) })).status, 400);
  assert.equal(dump(), before);
  assert.equal((await call('POST', '/admin/raw-materials/1/stock-counts', { counted_stock: '1', expected_stock: '25' }, { auth: null })).status, 401);
  const missing = await call('POST', '/admin/raw-materials/1/stock-counts', { counted_stock: '1', expected_stock: '25' });
  assert.deepEqual([missing.status, missing.json.message], [400, 'request_id wajib diisi.']);
  assert.equal(dump(), before);
});

test('stok masuk lama: dokumen stok_masuk + mutasi; request_id opsional → replay identik + header; payload beda 409', async () => {
  let res = await call('POST', '/admin/raw-materials/2/stock-in', { qty: '0.6' });
  assert.deepEqual([res.status, res.json.data.stock, material(2).stock, db.t.operationRequests.length], [200, 5.1, '5.10', 0]);
  assert.deepEqual(db.t.stockAdjustments.map((d) => [d.kind, String(d.qty), d.operationRequestId]), [['stok_masuk', '0.60', null]]);
  assert.deepEqual(db.t.materialMovements.map((m) => [m.type, m.qtyChange, m.stockBefore, m.stockAfter]), [['stok_masuk', '0.60', '4.50', '5.10']]);
  res = await call('POST', '/admin/raw-materials/2/stock-in', { qty: 1, request_id: RID(3) });
  const first = res.json;
  assert.deepEqual([res.status, res.replay, material(2).stock], [200, null, '6.10']);
  assert.deepEqual(db.t.operationRequests.map((r) => [r.operation, r.responseStatus]), [['raw_material_stock_in', 200]]);
  res = await call('POST', '/admin/raw-materials/2/stock-in', { qty: '1.00', request_id: RID(3) }); // payload kanonik sama
  assert.deepEqual([res.status, res.replay, res.json, material(2).stock], [200, 'true', first, '6.10']);
  res = await call('POST', '/admin/raw-materials/2/stock-in', { qty: '2', request_id: RID(3) });
  assert.deepEqual([res.status, res.json.code], [409, 'REQUEST_ID_REUSED']);
  res = await call('POST', '/admin/raw-materials/1/stock-in', { qty: '1', request_id: RID(3) }); // target beda
  assert.equal(res.json.code, 'REQUEST_ID_REUSED');
  assert.equal(material(2).stock, '6.10');
});

test('PUT lama: koreksi stok → stock_opname (sistem = terkunci, fisik = baru) + mutasi; POST bahan → saldo awal', async () => {
  let res = await call('PUT', '/admin/raw-materials/2', { name: 'Butter', unit: 'kg', stock: '3', min_stock: '5', expected_stock: '4.5' });
  assert.equal(res.status, 200);
  assert.deepEqual(db.t.stockAdjustments.map((d) => [d.kind, d.countedStock, d.systemStock]), [['stock_opname', '3.00', '4.50']]);
  assert.deepEqual(db.t.materialMovements.map((m) => [m.type, m.qtyChange, m.stockAfter]), [['stock_opname', '-1.50', '3.00']]);
  res = await call('POST', '/admin/raw-materials', { name: 'Ragi', unit: 'g', stock: 500, min_stock: 100, request_id: RID(4) });
  assert.deepEqual([res.status, res.json.data.stock], [201, 500]);
  const opening = db.t.stockAdjustments.find((d) => d.kind === 'saldo_awal');
  assert.deepEqual([String(opening.qty), opening.openingMaterialId, opening.operationRequestId], ['500.00', 61n, RID(4)]);
  assert.equal(db.t.materialMovements.at(-1).type, 'saldo_awal');
  res = await call('POST', '/admin/raw-materials', { name: 'Kosong', unit: 'g', stock: 0, min_stock: 0 });
  assert.equal(res.status, 201);
  assert.equal(db.t.materialMovements.filter((m) => m.type === 'saldo_awal').length, 1, 'saldo awal 0 tanpa mutasi');
});

test('POST bahan (E1 B.4): bahan + saldo awal + mutasi (stok > 0) + audit create_raw_material tepat sekali; replay tanpa duplikat; audit gagal → rollback penuh', async () => {
  const body = { name: 'Gula Aren', unit: 'kg', stock: '7.25', min_stock: '1', request_id: RID(20) };
  const first = await call('POST', '/admin/raw-materials', body);
  const again = await call('POST', '/admin/raw-materials', body);
  assert.deepEqual([first.status, again.status, again.replay, again.json], [201, 201, 'true', first.json]);
  const id = BigInt(first.json.data.material_id);
  assert.equal(db.t.materials.filter((m) => m.name === 'Gula Aren').length, 1);
  assert.deepEqual(db.t.stockAdjustments.filter((d) => d.materialId === id).map((d) => [d.kind, String(d.qty), d.openingMaterialId]), [['saldo_awal', '7.25', id]]);
  assert.deepEqual(db.t.materialMovements.filter((m) => m.materialId === id).map((m) => [m.type, String(m.qtyChange), String(m.stockBefore)]), [['saldo_awal', '7.25', '0']]);
  assert.deepEqual(db.t.auditLogs.map((a) => [a.action, String(a.entityId)]), [['create_raw_material', String(id)]]);
  const zero = await call('POST', '/admin/raw-materials', { name: 'Kayu Manis', unit: 'g', stock: '0', min_stock: '0' });
  const zeroId = BigInt(zero.json.data.material_id);
  assert.deepEqual([zero.status, db.t.materialMovements.filter((m) => m.materialId === zeroId).length, db.t.auditLogs.length], [201, 0, 2]);
  const before = dump();
  db.failOn = 'auditLog.create';
  assert.equal((await call('POST', '/admin/raw-materials', { name: 'Cengkeh', unit: 'g', stock: '3', min_stock: '1', request_id: RID(21) })).status, 500);
  assert.equal(dump(), before, 'rollback: bahan, saldo awal, mutasi, audit, operation_requests');
});

test('stock opname: selisih 0 tanpa mutasi, expected basi 409 STOCK_CHANGED tanpa dokumen, validasi teks, field tak dikenal 400', async () => {
  let res = await call('POST', '/admin/raw-materials/2/stock-counts', { counted_stock: '4.5', expected_stock: '4.50', request_id: RID(5) });
  assert.deepEqual([res.status, res.json.data.movement, db.t.stockAdjustments.length], [201, null, 1]);
  res = await call('POST', '/admin/raw-materials/2/stock-counts', { counted_stock: '0', expected_stock: '4.50', reason: 'hitung fisik', request_id: RID(6) });
  assert.deepEqual([res.status, res.json.data.movement.qty_change, material(2).stock], [201, '-4.50', '0.00']);
  const before = dump();
  res = await call('POST', '/admin/raw-materials/2/stock-counts', { counted_stock: '1', expected_stock: '4.50', request_id: RID(7) });
  assert.deepEqual([res.status, res.json.code], [409, 'STOCK_CHANGED']);
  for (const body of [{ counted_stock: 1, expected_stock: '0' }, { counted_stock: '1.234', expected_stock: '0' }, { counted_stock: '1', expected_stock: '0', extra: 1 }]) {
    assert.equal((await call('POST', '/admin/raw-materials/2/stock-counts', { ...body, request_id: RID(8) })).status, 400, JSON.stringify(body));
  }
  assert.equal(dump(), before);
});

test('pembalik & koreksi stok masuk: R/P, mutasi bersih, dokumen tidak berlaku 409, saldo < 0 → 409 STOCK_OUT_OF_RANGE + rollback', async () => {
  await call('POST', '/admin/raw-materials/2/stock-in', { qty: '10' }); // 4.50 → 14.50, dokumen 1001
  const O = String(db.t.stockAdjustments[0].adjustmentId);
  let res = await call('POST', `/admin/stock-adjustments/${O}/correct`, { qty: '8', reason: 'salah ketik', request_id: RID(9) });
  assert.deepEqual([res.status, res.json.data.movement.qty_change, material(2).stock], [201, '-2.00', '12.50']);
  assert.deepEqual(db.t.stockAdjustments.slice(1).map((d) => [d.kind, String(d.qty), d.operationRequestId]), [['pembalik_stok_masuk', '10.00', RID(9)], ['pengganti_stok_masuk', '8.00', RID(9)]]);
  assert.equal(db.t.materialMovements.at(-1).adjustmentId, db.t.stockAdjustments[2].adjustmentId, 'rujuk P');
  res = await call('POST', `/admin/stock-adjustments/${O}/reverse`, { reason: 'x', request_id: RID(10) });
  assert.deepEqual([res.status, res.json.code], [409, 'DOCUMENT_ALREADY_SUPERSEDED']);
  const P = String(db.t.stockAdjustments[2].adjustmentId);
  await call('POST', '/admin/raw-materials/2/stock-counts', { counted_stock: '1', expected_stock: '12.50', request_id: RID(11) });
  const before = dump();
  res = await call('POST', `/admin/stock-adjustments/${P}/reverse`, { reason: 'batal', request_id: RID(12) });
  assert.deepEqual([res.status, res.json.code], [409, 'STOCK_OUT_OF_RANGE']);
  assert.equal(dump(), before, 'rollback penuh: tanpa R, mutasi, audit, operation_requests');
  const opname = String(db.t.stockAdjustments.at(-1).adjustmentId);
  assert.equal((await call('POST', `/admin/stock-adjustments/${opname}/reverse`, { reason: 'x', request_id: RID(13) })).status, 400);
  assert.equal((await call('POST', `/admin/stock-adjustments/${P}/reverse`, { reason: ' ', request_id: RID(14) })).status, 400);
  assert.equal((await call('POST', '/admin/stock-adjustments/99999/reverse', { reason: 'x', request_id: RID(15) })).status, 404);
});
