// tests-mysql/23-cr04a-receipts.it.test.js
// CR-04a CP5 · FR-43 · UC-35 · BR-20 – BR-24, BR-30, BR-31, BR-34 — penerimaan PO lewat HTTP asli pada MySQL 8.
// Sebagian berulang & penuh (status dari jumlah bersih), kelebihan ditolak; IT-14 batal setelah sebagian (qty_cancelled &
// nilai sisa historis, penerimaan tetap) lalu pembalik; IT-09 pembalik setelah bahan terpakai → 409 STOCK_OUT_OF_RANGE;
// IT-10/IT-30 koreksi multi-item (rujuk P / R, dampak 0 tanpa mutasi, R & P berbagi operation_request_id); dokumen tidak
// berlaku 409; IT-06 replay & REUSED; IT-05 dua penerimaan bersamaan > sisa → satu sukses; IT-08 batas atas; IT-11 & rollback:
// kegagalan disuntik pada baris dokumen / mutasi / audit → tidak ada perubahan, kirim ulang → satu dokumen; IT-07
// penerimaan × stok masuk × opname bersamaan → invarian I-1 – I-11, 0 deadlock.

const test = require('node:test');
const assert = require('node:assert/strict');
const { APP_URL, rows, innodbMetrics } = require('./helpers/context');
const { startServer } = require('./helpers/server');
const { createUser } = require('./helpers/fixtures');
const { rid, context, stockOf, fingerprint, withFailingTrigger } = require('./helpers/purchasingFixtures');

process.env.DATABASE_URL = APP_URL;

const FILE = '23-cr04a-receipts';
const ROUNDS = Number(process.env.C4_ROUNDS_R23 || 15);
let server;
let staff;
let owner;
let ctx;
let deadlocksBefore;
const itemOf = (po, materialId) => po.items.find((i) => i.material_id === materialId);
const receive = (po, lines, extra = {}) => ctx.api('POST', `/purchase-orders/${po.po_id}/receipts`, { lines, request_id: rid(), ...extra });

test.before(async () => {
  server = await startServer(FILE);
  staff = await createUser('staf');
  owner = await createUser('owner');
  ctx = context(server, { staff, owner });
  deadlocksBefore = (await innodbMetrics()).lock_deadlocks;
});
test.after(async () => { await server?.stop(); });

test('penerimaan sebagian → penuh; kelebihan ditolak; stok & mutasi; nilai penerimaan; replay & REUSED (IT-06)', async () => {
  const m1 = await ctx.material('10');
  const po = await ctx.purchaseOrder(await ctx.supplier([m1]), [{ material_id: m1, qty_ordered: '5', unit_price: '2500.50' }]);
  const item = itemOf(po, m1).po_item_id;
  const requestId = rid();
  const first = await receive(po, [{ po_item_id: item, qty: '3' }], { request_id: requestId });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.deepEqual([first.body.data.purchase_order.status, await stockOf(m1), first.body.data.movements[0].qty_change], ['diterima_sebagian', '13.00', '3.00']);
  assert.equal(first.body.data.purchase_order.values.received_value, 7501.5);
  const replay = await receive(po, [{ po_item_id: item, qty: '3.00' }], { request_id: requestId });
  assert.deepEqual([replay.status, replay.body, await stockOf(m1)], [201, first.body, '13.00']);
  assert.equal((await receive(po, [{ po_item_id: item, qty: '2' }], { request_id: requestId })).body.code, 'REQUEST_ID_REUSED');
  const before = await fingerprint();
  const over = await receive(po, [{ po_item_id: item, qty: '2.01' }]);
  assert.equal(over.status, 409);
  assert.deepEqual(await fingerprint(), before);
  const full = await receive(po, [{ po_item_id: item, qty: '2' }]);
  assert.deepEqual([full.status, full.body.data.purchase_order.status, itemOf(full.body.data.purchase_order, m1).remaining, await stockOf(m1)], [201, 'diterima', 0, '15.00']);
  assert.equal((await receive(po, [{ po_item_id: item, qty: '0.01' }])).status, 409, 'PO Diterima tidak dapat diterima lagi');
  const movements = await rows("SELECT type, CAST(qty_change AS CHAR) AS q FROM material_movements WHERE material_id = ? AND type = 'penerimaan' ORDER BY movement_id", m1);
  assert.deepEqual(movements.map((m) => m.q), ['3.00', '2.00']);
  await ctx.assertLedger();
});

test('IT-14: batal setelah sebagian → qty_cancelled & nilai sisa historis, penerimaan tetap; pembalik lalu tetap Dibatalkan', async () => {
  const m1 = await ctx.material('0');
  const po = await ctx.purchaseOrder(await ctx.supplier([m1]), [{ material_id: m1, qty_ordered: '10', unit_price: '100' }]);
  const item = itemOf(po, m1).po_item_id;
  const r = await receive(po, [{ po_item_id: item, qty: '4' }]);
  const cancelled = await ctx.api('PATCH', `/purchase-orders/${po.po_id}/status`, { from: 'diterima_sebagian', to: 'dibatalkan', request_id: rid() });
  const view = cancelled.body.data;
  assert.deepEqual([view.status, itemOf(view, m1).qty_cancelled, itemOf(view, m1).net_received, view.values.cancelled_value, view.values.received_value],
    ['dibatalkan', 6, 4, 600, 400]);
  assert.equal((await receive(po, [{ po_item_id: item, qty: '1' }])).status, 409, 'PO Dibatalkan tidak menerima');
  const rev = await ctx.api('POST', `/goods-receipts/${r.body.data.receipt_id}/reverse`, { reason: 'retur', request_id: rid() });
  assert.equal(rev.status, 201, JSON.stringify(rev.body));
  const after = rev.body.data.purchase_order;
  assert.deepEqual([after.status, itemOf(after, m1).qty_cancelled, after.values.cancelled_value, after.values.received_value, await stockOf(m1)],
    ['dibatalkan', 6, 600, 0, '0.00']);
  await ctx.assertLedger();
});

test('IT-09 & IT-10/IT-30: pembalik setelah bahan terpakai → 409; koreksi multi-item rujuk P/R; dokumen tidak berlaku 409', async () => {
  const [m1, m2, m3] = [await ctx.material('0'), await ctx.material('0'), await ctx.material('0')];
  const po = await ctx.purchaseOrder(await ctx.supplier([m1, m2, m3]), [
    { material_id: m1, qty_ordered: '10', unit_price: '10' }, { material_id: m2, qty_ordered: '10', unit_price: '10' }, { material_id: m3, qty_ordered: '10', unit_price: '10' },
  ]);
  const [a, b, c] = [m1, m2, m3].map((m) => itemOf(po, m).po_item_id);
  const O = (await receive(po, [{ po_item_id: a, qty: '4' }, { po_item_id: b, qty: '2' }, { po_item_id: c, qty: '1' }])).body.data.receipt_id;
  // Bahan m3 terpakai (opname 1 → 0,5): pembalik O akan membuat m3 negatif → seluruh operasi ditolak
  await ctx.api('POST', `/raw-materials/${m3}/stock-counts`, { counted_stock: '0.5', expected_stock: '1', request_id: rid() });
  const before = await fingerprint();
  const blocked = await ctx.api('POST', `/goods-receipts/${O}/reverse`, { reason: 'retur', request_id: rid() });
  assert.deepEqual([blocked.status, blocked.body.code], [409, 'STOCK_OUT_OF_RANGE']);
  assert.deepEqual(await fingerprint(), before);
  // Koreksi: a 4 → 3 (−1 rujuk P), b 2 → hilang (−2 rujuk R), c 1 → 1 (tanpa mutasi) — sah walau m3 terpakai
  const op = rid();
  const corr = await ctx.api('POST', `/goods-receipts/${O}/correct`, { lines: [{ po_item_id: a, qty: '3' }, { po_item_id: c, qty: '1' }], reason: 'salah hitung', request_id: op });
  assert.equal(corr.status, 201, JSON.stringify(corr.body));
  const { reversal_id: R, replacement_id: P } = corr.body.data;
  const mm = await rows(`SELECT material_id, CAST(qty_change AS CHAR) AS q, receipt_id, type FROM material_movements WHERE receipt_id IN (?, ?) ORDER BY material_id`, R, P);
  assert.deepEqual(mm.map((x) => [x.material_id, x.q, x.receipt_id, x.type]), [[m1, '-1.00', P, 'koreksi_penerimaan'], [m2, '-2.00', R, 'koreksi_penerimaan']]);
  assert.deepEqual((await rows('SELECT kind, operation_request_id AS op FROM goods_receipts WHERE receipt_id IN (?, ?) ORDER BY receipt_id', R, P)).map((x) => [x.kind, x.op]),
    [['pembalik', op], ['pengganti', op]]);
  assert.deepEqual([await stockOf(m1), await stockOf(m2), await stockOf(m3)], ['3.00', '0.00', '0.50']);
  for (const target of [O, R]) {
    const res = await ctx.api('POST', `/goods-receipts/${target}/reverse`, { reason: 'ulang', request_id: rid() });
    assert.deepEqual([res.status, res.body.code], [409, 'DOCUMENT_ALREADY_SUPERSEDED'], target);
  }
  const allZero = await ctx.api('POST', `/goods-receipts/${P}/correct`, { lines: [], reason: 'x', request_id: rid() });
  assert.equal(allZero.status, 400, 'koreksi tanpa baris → gunakan pembalik');
  const view = (await ctx.api('GET', `/purchase-orders/${po.po_id}`)).body.data;
  assert.deepEqual([view.status, view.items.map((i) => i.net_received), view.values.received_value], ['diterima_sebagian', [3, 0, 1], 40]);
  await ctx.assertLedger();
});

test('IT-08 & rollback (IT-11): batas atas → 409; kegagalan disuntik pada baris dokumen / mutasi / audit → tanpa perubahan, kirim ulang → satu dokumen', async () => {
  const big = await ctx.material('99999998');
  const m1 = await ctx.material('1');
  const po = await ctx.purchaseOrder(await ctx.supplier([big, m1]), [{ material_id: big, qty_ordered: '5', unit_price: '1' }, { material_id: m1, qty_ordered: '5', unit_price: '1' }]);
  let before = await fingerprint();
  const over = await receive(po, [{ po_item_id: itemOf(po, big).po_item_id, qty: '2' }, { po_item_id: itemOf(po, m1).po_item_id, qty: '1' }]);
  assert.deepEqual([over.status, over.body.code], [409, 'STOCK_OUT_OF_RANGE']);
  assert.deepEqual(await fingerprint(), before, 'satu bahan melewati batas → seluruh penerimaan ditolak');
  const item = itemOf(po, m1).po_item_id;
  for (const [name, table] of [['p5_fail_grl', 'goods_receipt_lines'], ['p5_fail_mm', 'material_movements'], ['p5_fail_audit', 'audit_logs']]) {
    const requestId = rid();
    before = await fingerprint();
    const failed = await withFailingTrigger(name, table, () => receive(po, [{ po_item_id: item, qty: '1' }], { request_id: requestId }));
    assert.equal(failed.status, 500, table);
    assert.deepEqual(await fingerprint(), before, `${table}: penerimaan, baris, mutasi, stok, audit, operation_requests tidak berubah`);
    const resent = await receive(po, [{ po_item_id: item, qty: '1' }], { request_id: requestId });
    assert.equal(resent.status, 201, `${table}: kirim ulang setelah gagal dievaluasi ulang`);
    assert.equal((await rows('SELECT COUNT(*) AS n FROM goods_receipts WHERE operation_request_id = ?', requestId))[0].n, '1');
  }
  // Koreksi gagal di tengah (audit) → R & P tidak tersisa
  const O = (await rows('SELECT receipt_id FROM goods_receipts WHERE po_id = ? ORDER BY receipt_id LIMIT 1', po.po_id))[0].receipt_id;
  before = await fingerprint();
  const corrFail = await withFailingTrigger('p5_fail_audit2', 'audit_logs', () => ctx.api('POST', `/goods-receipts/${O}/correct`, { lines: [{ po_item_id: item, qty: '0.5' }], reason: 'x', request_id: rid() }));
  assert.equal(corrFail.status, 500);
  assert.deepEqual(await fingerprint(), before);
  await ctx.assertLedger();
});

test('IT-05 & IT-07: dua penerimaan bersamaan > sisa → satu sukses; penerimaan × stok masuk × opname bersamaan → invarian, 0 deadlock', async () => {
  const [m1, m2] = [await ctx.material('5'), await ctx.material('5')];
  const sup = await ctx.supplier([m1, m2]);
  for (let round = 0; round < ROUNDS; round += 1) {
    const po = await ctx.purchaseOrder(sup, [{ material_id: m1, qty_ordered: '5', unit_price: '1' }, { material_id: m2, qty_ordered: '5', unit_price: '1' }]);
    const lines = [{ po_item_id: itemOf(po, m1).po_item_id, qty: '3' }, { po_item_id: itemOf(po, m2).po_item_id, qty: '3' }];
    const stock = await stockOf(m2);
    const results = await Promise.all([
      receive(po, lines), receive(po, [...lines].reverse(), {}),
      ctx.api('POST', `/raw-materials/${m1}/stock-in`, { qty: '0.25' }, owner),
      ctx.api('POST', `/raw-materials/${m2}/stock-counts`, { counted_stock: stock, expected_stock: stock, request_id: rid() }, owner),
    ]);
    const statuses = results.slice(0, 2).map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, 409], JSON.stringify(results.map((r) => r.body)));
    for (const r of results.slice(2)) assert.ok([200, 201, 409].includes(r.status), JSON.stringify(r.body));
    const net = (await ctx.api('GET', `/purchase-orders/${po.po_id}`)).body.data.items.map((i) => i.net_received);
    assert.deepEqual(net, [3, 3]);
  }
  // AC-43.2: penerimaan paralel dengan request_id yang SAMA → tepat satu dokumen; yang lain replay atau 409 IN_PROGRESS
  const po = await ctx.purchaseOrder(sup, [{ material_id: m1, qty_ordered: '50', unit_price: '1' }]);
  for (let round = 0; round < 5; round += 1) {
    const requestId = rid();
    const twins = await Promise.all([1, 2, 3].map(() => receive(po, [{ po_item_id: itemOf(po, m1).po_item_id, qty: '1' }], { request_id: requestId })));
    for (const r of twins) assert.ok([201, 409].includes(r.status) && (r.status === 201 || r.body.code === 'REQUEST_IN_PROGRESS'), JSON.stringify(r.body));
    assert.equal((await rows('SELECT COUNT(*) AS n FROM goods_receipts WHERE operation_request_id = ?', requestId))[0].n, '1');
  }
  await ctx.assertLedger();
  assert.equal((await innodbMetrics()).lock_deadlocks - deadlocksBefore, 0);
  assert.equal((await rows('SELECT COUNT(*) AS n FROM operation_requests WHERE response_status = 102'))[0].n, '0');
});
