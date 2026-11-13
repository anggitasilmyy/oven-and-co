// tests-mysql/21-cr04a-ad07-ledger.it.test.js
// CR-04a CP4 · FR-44 · BR-23, BR-24, BR-30, BR-31, BR-34, BR-35 — buku mutasi AD-07 lewat HTTP asli pada MySQL 8.
// IT-37  POST bahan: saldo awal + audit create_raw_material di transaksi yang sama (stok > 0 → mutasi; 0 → tanpa mutasi);
//        replay tidak menggandakan; kegagalan disuntik (trigger) pada INSERT dokumen / mutasi / audit → rollback penuh.
// IT-12  pembalik & koreksi stok masuk (R + P berbagi operation_request_id, mutasi bersih merujuk P); O tidak berlaku
//        lagi → 409 DOCUMENT_ALREADY_SUPERSEDED; pembalik opname/saldo awal → 400.
// IT-13  stock opname: fisik 0; selisih 0 tanpa mutasi; expected basi 409 STOCK_CHANGED; format salah 400; "5" = 5.00.
// IT-06/IT-31 (bagian AD-07)  replay identik + header; payload/aktor beda 409 REQUEST_ID_REUSED; asli masih berjalan
//        → 409 REQUEST_IN_PROGRESS; request_id di endpoint luar allowlist → 400 tanpa tulisan; tidak ada baris 102.
// IT-07/IT-08 (bagian AD-07)  stok masuk × opname × koreksi PUT bersamaan, banyak putaran → invarian lulus, 0 deadlock;
//        melewati batas atas / di bawah 0 → ditolak seluruhnya (rollback).

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { APP_URL, CONTAINER, DATABASE, db, rows, holdTransaction, innodbMetrics } = require('./helpers/context');
const { startServer, call } = require('./helpers/server');
const { createUser, unique } = require('./helpers/fixtures');
const { loadLedgerMaterials } = require('../src/services/ledgerData.service');
const { checkMaterialLedger } = require('../src/services/ledgerRules.service');

process.env.DATABASE_URL = APP_URL;

const FILE = '21-cr04a-ad07-ledger';
const ROUNDS = Number(process.env.C4_ROUNDS_R21 || 12);
let server;
let staff;
let owner;
let deadlocksBefore;
const created = [];
let seq = 0;
const rid = () => `5c0f1e2d-3b4a-4c5d-8e6f-${String(Date.now() % 1e6).padStart(6, '0')}${String((seq += 1)).padStart(6, '0')}`;

function mysqlCli(sql) {
  const password = decodeURIComponent(new URL(process.env.ROOT_DATABASE_URL).password);
  const result = spawnSync('docker', ['exec', '-i', CONTAINER, 'mysql', '-uroot', `-p${password}`, DATABASE], { input: sql, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`mysql gagal: ${result.stderr}`);
}
const api = (method, path, body, userId = staff) => call(server, method, `/api/admin${path}`, { userId, body });
const stockOf = async (id) => (await rows('SELECT CAST(stock AS CHAR) AS stock FROM raw_materials WHERE material_id = ?', id))[0].stock;
const counts = async () => (await rows(`SELECT (SELECT COUNT(*) FROM raw_materials) AS m, (SELECT COUNT(*) FROM stock_adjustments) AS d,
  (SELECT COUNT(*) FROM material_movements) AS v, (SELECT COUNT(*) FROM operation_requests) AS o, (SELECT COUNT(*) FROM audit_logs) AS a`))[0];
async function newMaterial(stock = '10') {
  const res = await api('POST', '/raw-materials', { name: unique('Bahan R21 '), unit: 'kg', stock, min_stock: '1' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  created.push(res.body.data.material_id);
  return res.body.data.material_id;
}
const lastAdjustment = async (id) => (await rows('SELECT adjustment_id FROM stock_adjustments WHERE material_id = ? ORDER BY adjustment_id DESC LIMIT 1', id))[0].adjustment_id;

test.before(async () => {
  server = await startServer(FILE);
  staff = await createUser('staf');
  owner = await createUser('owner');
  deadlocksBefore = (await innodbMetrics()).lock_deadlocks;
});
test.after(async () => {
  for (const name of ['r21_fail_sa', 'r21_fail_mm', 'r21_fail_audit']) { try { mysqlCli(`DROP TRIGGER IF EXISTS ${name};`); } catch { /* abaikan */ } }
  await server?.stop();
});

test('IT-37: POST bahan + saldo awal dalam satu transaksi; stok 0 tanpa mutasi; replay; kegagalan disuntik → rollback penuh', async () => {
  const id = await newMaterial('12.34');
  assert.deepEqual(await rows(`SELECT kind, CAST(qty AS CHAR) AS qty, opening_material_id, created_by FROM stock_adjustments WHERE material_id = ?`, id),
    [{ kind: 'saldo_awal', qty: '12.34', opening_material_id: id, created_by: staff }]);
  assert.deepEqual(await rows(`SELECT type, CAST(qty_change AS CHAR) AS q, CAST(stock_before AS CHAR) AS b FROM material_movements WHERE material_id = ?`, id),
    [{ type: 'saldo_awal', q: '12.34', b: '0.00' }]);
  const auditsOf = async (m) => rows("SELECT user_id, action, entity FROM audit_logs WHERE entity = 'raw_materials' AND entity_id = ? ORDER BY log_id", m);
  assert.deepEqual(await auditsOf(id), [{ user_id: staff, action: 'create_raw_material', entity: 'raw_materials' }]);
  const zero = await newMaterial('0');
  assert.equal((await rows('SELECT COUNT(*) AS n FROM material_movements WHERE material_id = ?', zero))[0].n, '0');
  assert.deepEqual(await rows("SELECT kind, CAST(qty AS CHAR) AS qty FROM stock_adjustments WHERE material_id = ?", zero), [{ kind: 'saldo_awal', qty: '0.00' }]);
  assert.equal((await auditsOf(zero)).length, 1);

  const requestId = rid();
  const body = { name: unique('Bahan R21 '), unit: 'g', stock: '5', min_stock: '1', request_id: requestId };
  const first = await api('POST', '/raw-materials', body);
  const again = await api('POST', '/raw-materials', body);
  assert.deepEqual([first.status, again.status, again.body], [201, 201, first.body]);
  assert.equal((await rows('SELECT COUNT(*) AS n FROM raw_materials WHERE name = ?', body.name))[0].n, '1');
  assert.equal((await rows('SELECT operation_request_id AS r FROM stock_adjustments WHERE material_id = ?', first.body.data.material_id))[0].r, requestId);
  assert.equal((await auditsOf(first.body.data.material_id)).length, 1, 'replay tidak menambah audit');
  assert.equal((await rows('SELECT COUNT(*) AS n FROM material_movements WHERE material_id = ?', first.body.data.material_id))[0].n, '1');
  created.push(first.body.data.material_id);

  for (const [name, table] of [['r21_fail_sa', 'stock_adjustments'], ['r21_fail_mm', 'material_movements'], ['r21_fail_audit', 'audit_logs']]) {
    mysqlCli(`CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'r21 gagal';`);
    try {
      const before = await counts();
      const failName = unique('Bahan R21 gagal ');
      const res = await api('POST', '/raw-materials', { name: failName, unit: 'kg', stock: '3', min_stock: '1', request_id: rid() });
      assert.equal(res.status, 500, table);
      assert.deepEqual(await counts(), before, `${table}: tidak ada bahan, dokumen, mutasi, audit, operation_requests`);
      assert.equal((await rows('SELECT COUNT(*) AS n FROM raw_materials WHERE name = ?', failName))[0].n, '0');
    } finally {
      mysqlCli(`DROP TRIGGER IF EXISTS ${name};`);
    }
  }
});

test('IT-13: stock opname — fisik 0, selisih 0 tanpa mutasi, expected basi 409, format 400, "5" = 5.00', async () => {
  const id = await newMaterial('5');
  let res = await api('POST', `/raw-materials/${id}/stock-counts`, { counted_stock: '5', expected_stock: '5', request_id: rid() });
  assert.deepEqual([res.status, res.body.data.movement], [201, null]);
  res = await api('POST', `/raw-materials/${id}/stock-counts`, { counted_stock: '0', expected_stock: '5.00', reason: 'rusak', request_id: rid() });
  assert.deepEqual([res.status, res.body.data.movement.qty_change, await stockOf(id)], [201, '-5.00', '0.00']);
  const before = await counts();
  res = await api('POST', `/raw-materials/${id}/stock-counts`, { counted_stock: '1', expected_stock: '5', request_id: rid() });
  assert.deepEqual([res.status, res.body.code], [409, 'STOCK_CHANGED']);
  for (const expected of [5, '1.234', '-1', '100000000', '']) {
    res = await api('POST', `/raw-materials/${id}/stock-counts`, { counted_stock: '1', expected_stock: expected, request_id: rid() });
    assert.equal(res.status, 400, String(expected));
  }
  assert.deepEqual(await counts(), before);
});

test('IT-12: pembalik & koreksi stok masuk; dokumen tidak berlaku 409; opname & saldo awal tidak dapat dibalik', async () => {
  const id = await newMaterial('1');
  assert.equal((await api('POST', `/raw-materials/${id}/stock-in`, { qty: '10' })).status, 200);
  const O = await lastAdjustment(id);
  const op = rid();
  let res = await api('POST', `/stock-adjustments/${O}/correct`, { qty: '8', reason: 'salah ketik', request_id: op });
  assert.deepEqual([res.status, res.body.data.movement.qty_change, await stockOf(id)], [201, '-2.00', '9.00']);
  const docs = await rows(`SELECT adjustment_id, kind, CAST(qty AS CHAR) AS qty, operation_request_id AS op FROM stock_adjustments
    WHERE material_id = ? AND adjustment_id > ? ORDER BY adjustment_id`, id, O);
  assert.deepEqual(docs.map((d) => [d.kind, d.qty, d.op]), [['pembalik_stok_masuk', '10.00', op], ['pengganti_stok_masuk', '8.00', op]]);
  assert.equal((await rows('SELECT adjustment_id FROM material_movements WHERE material_id = ? ORDER BY movement_id DESC LIMIT 1', id))[0].adjustment_id, docs[1].adjustment_id);
  for (const target of [O, docs[0].adjustment_id]) {
    res = await api('POST', `/stock-adjustments/${target}/reverse`, { reason: 'ulang', request_id: rid() });
    assert.deepEqual([res.status, res.body.code], [409, 'DOCUMENT_ALREADY_SUPERSEDED'], target);
  }
  res = await api('POST', `/stock-adjustments/${docs[1].adjustment_id}/reverse`, { reason: 'batal', request_id: rid() });
  assert.deepEqual([res.status, await stockOf(id)], [201, '1.00']);
  const opening = (await rows("SELECT adjustment_id FROM stock_adjustments WHERE material_id = ? AND kind = 'saldo_awal'", id))[0].adjustment_id;
  await api('POST', `/raw-materials/${id}/stock-counts`, { counted_stock: '1', expected_stock: '1', request_id: rid() });
  for (const target of [opening, await lastAdjustment(id)]) {
    assert.equal((await api('POST', `/stock-adjustments/${target}/reverse`, { reason: 'x', request_id: rid() })).status, 400);
  }
});

test('stok tidak negatif & batas atas (IT-08 bagian AD-07): ditolak seluruhnya, tanpa sisa tulisan', async () => {
  const id = await newMaterial('0');
  await api('POST', `/raw-materials/${id}/stock-in`, { qty: '4' });
  const O = await lastAdjustment(id);
  await api('POST', `/raw-materials/${id}/stock-counts`, { counted_stock: '1', expected_stock: '4', request_id: rid() });
  const before = await counts();
  let res = await api('POST', `/stock-adjustments/${O}/reverse`, { reason: 'retur', request_id: rid() });
  assert.deepEqual([res.status, res.body.code, await stockOf(id)], [409, 'STOCK_OUT_OF_RANGE', '1.00']);
  res = await api('POST', `/raw-materials/${id}/stock-in`, { qty: '99999999.99' });
  assert.equal(res.status, 400, 'validasi lama: stok baru melebihi batas');
  assert.deepEqual(await counts(), before);
  // Batas atas lewat koreksi: 99.999.990 + 5 (O) → koreksi ke 10 → 100.000.000,00 > batas → 409, tanpa R/P
  const big = await newMaterial('99999990');
  await api('POST', `/raw-materials/${big}/stock-in`, { qty: '5' });
  const bigO = await lastAdjustment(big);
  const beforeBig = await counts();
  res = await api('POST', `/stock-adjustments/${bigO}/correct`, { qty: '10', reason: 'x', request_id: rid() });
  assert.deepEqual([res.status, res.body.code, await stockOf(big)], [409, 'STOCK_OUT_OF_RANGE', '99999995.00']);
  assert.deepEqual(await counts(), beforeBig);
});

test('IT-06/IT-31 (AD-07): replay identik + header, 409 REUSED, 409 IN_PROGRESS, request_id di luar allowlist 400, tanpa 102', async () => {
  const id = await newMaterial('2');
  const requestId = rid();
  const first = await api('POST', `/raw-materials/${id}/stock-in`, { qty: '1.5', request_id: requestId });
  const replay = await fetch(`${server.baseUrl}/api/admin/raw-materials/${id}/stock-in`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${require('./helpers/server').tokenFor(staff)}` },
    body: JSON.stringify({ qty: '1.50', request_id: requestId }),
  });
  assert.deepEqual([replay.status, replay.headers.get('idempotent-replay'), await replay.json()], [200, 'true', first.body]);
  assert.equal(await stockOf(id), '3.50');
  assert.equal((await api('POST', `/raw-materials/${id}/stock-in`, { qty: '2', request_id: requestId })).body.code, 'REQUEST_ID_REUSED');
  assert.equal((await api('POST', `/raw-materials/${id}/stock-in`, { qty: '1.5', request_id: requestId }, owner)).body.code, 'REQUEST_ID_REUSED');

  // Asli masih berjalan: baris operation_requests ditahan transaksi lain → 409 REQUEST_IN_PROGRESS, lalu boleh diulang
  const held = rid();
  const hold = holdTransaction((tx) => tx.$executeRawUnsafe(`INSERT INTO operation_requests VALUES (?, 'raw_material_stock_in', ?, 'raw_material', ?,
    REPEAT('0', 64), 102, '{"status":"in_progress"}', NOW(3))`, held, staff, id));
  await hold.ready;
  const busy = await api('POST', `/raw-materials/${id}/stock-in`, { qty: '1', request_id: held });
  assert.deepEqual([busy.status, busy.body.code], [409, 'REQUEST_IN_PROGRESS']);
  await hold.release(() => { throw new Error('rollback uji'); }).catch(() => {});
  assert.equal((await api('POST', `/raw-materials/${id}/stock-in`, { qty: '1', request_id: held })).status, 200);

  const before = await counts();
  for (const [method, path, body] of [['GET', `/raw-materials?request_id=${rid()}`], ['GET', `/raw-materials/${id}/movements?request_id=${rid()}`],
    ['PUT', '/stocks/today', { plans: [], request_id: rid() }]]) {
    assert.equal((await api(method, path, body)).status, 400, path);
  }
  assert.equal((await call(server, 'POST', '/api/checkout', { userId: staff, body: { request_id: rid() } })).status, 400);
  assert.deepEqual(await counts(), before);
  assert.equal((await rows('SELECT COUNT(*) AS n FROM operation_requests WHERE response_status = 102'))[0].n, '0');
  const history = await api('GET', `/raw-materials/${id}/movements`);
  assert.deepEqual(history.body.data.movements.map((m) => [m.type, m.stock_after]), [['saldo_awal', 2], ['stok_masuk', 3.5], ['stok_masuk', 4.5]]);
});

test('IT-07 (AD-07): stok masuk × opname × koreksi PUT × request_id kembar bersamaan — invarian lulus, 0 deadlock', async () => {
  const ids = [await newMaterial('50'), await newMaterial('50')];
  for (let round = 0; round < ROUNDS; round += 1) {
    const twin = rid();
    const stock = await stockOf(ids[0]);
    const jobs = [
      api('POST', `/raw-materials/${ids[0]}/stock-in`, { qty: '1.25', request_id: twin }),
      api('POST', `/raw-materials/${ids[0]}/stock-in`, { qty: '1.25', request_id: twin }),
      api('POST', `/raw-materials/${ids[0]}/stock-counts`, { counted_stock: '40', expected_stock: stock, request_id: rid() }, owner),
      api('PUT', `/raw-materials/${ids[1]}`, { name: `Bahan R21 tetap ${ids[1]}`, unit: 'kg', stock: '45', expected_stock: await stockOf(ids[1]), min_stock: '1' }),
      api('POST', `/raw-materials/${ids[1]}/stock-in`, { qty: '0.5' }, owner),
    ];
    const results = await Promise.all(jobs);
    for (const r of results) assert.ok([200, 201, 409].includes(r.status), JSON.stringify(r.body));
    const twinDocs = await rows('SELECT COUNT(*) AS n FROM stock_adjustments WHERE operation_request_id = ?', twin);
    assert.equal(twinDocs[0].n, '1', 'request_id kembar → tepat satu dokumen');
  }
  for (const material of await loadLedgerMaterials(db, created)) assert.deepEqual(checkMaterialLedger(material), [], material.materialId);
  assert.equal((await innodbMetrics()).lock_deadlocks - deadlocksBefore, 0);
});

test('rollback: kegagalan audit disuntik pada stok masuk → stok, dokumen, mutasi, operation_requests tidak berubah', async () => {
  const id = await newMaterial('7');
  mysqlCli("CREATE TRIGGER r21_fail_audit BEFORE INSERT ON audit_logs FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'r21 audit';");
  try {
    const before = await counts();
    const res = await api('POST', `/raw-materials/${id}/stock-in`, { qty: '3', request_id: rid() });
    assert.equal(res.status, 500);
    assert.deepEqual([await counts(), await stockOf(id)], [before, '7.00']);
  } finally {
    mysqlCli('DROP TRIGGER IF EXISTS r21_fail_audit;');
  }
  for (const material of await loadLedgerMaterials(db, created)) assert.deepEqual(checkMaterialLedger(material), [], material.materialId);
});
