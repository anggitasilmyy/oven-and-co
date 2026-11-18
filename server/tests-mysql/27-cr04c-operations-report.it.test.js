// tests-mysql/27-cr04c-operations-report.it.test.js
// CR-04c · FR-47 · UC-38 · BR-22, BR-33 · AD-08 tab Operasional — GET /api/admin/reports/operations lewat HTTP asli, MySQL 8:
// AC-47.1 hanya Owner (Staf/pelanggan 403, tamu 401) · AC-47.2 agregat = dokumen sumber (rekonsiliasi SQL) dalam satu
// snapshot; laporan tidak menulis · IT-28 koreksi di periode Y atas dokumen periode X (penerimaan, stok masuk, pengeluaran,
// hasil): X tidak berubah, Y memuat koreksi · IT-23 standar & selisih per periode (0,015 × 7 = 0,105; aktual 0,10 → −0,005;
// Σ periode = detail WO) · IT-27 laporan × penulisan bersamaan → setiap respons konsisten (satu snapshot), penulisan tetap
// sukses, 0 deadlock · IT-29 / AC-47.3 omzet pembanding = /reports/sales untuk setiap periode · IT-32 bagian API: standar
// 9.999.999,999 × 10.000 eksak, Σ 10 WO = −999.999.999.900 selisih → 200 eksak; 11 WO → 422 REPORT_AGGREGATE_LIMIT tanpa data.
// Dokumen periode X dibuat hari ini lalu tanggalnya digeser −3 hari (fixture, akun root harness) — dasar tanggal §9.

const test = require('node:test');
const assert = require('node:assert/strict');
const { APP_URL, rows, innodbMetrics } = require('./helpers/context');
const { startServer, call } = require('./helpers/server');
const { createUser } = require('./helpers/fixtures');
const { rid, context, fingerprint } = require('./helpers/purchasingFixtures');
const { getJakartaDateKey, addDaysToDateKey } = require('../src/utils/jakartaDate');

process.env.DATABASE_URL = APP_URL;

const FILE = '27-cr04c-operations-report';
const TODAY = getJakartaDateKey(new Date());
const D3 = addDaysToDateKey(TODAY, -3);
let server;
let staff;
let owner;
let customer;
let ctx;
let product;
let deadlocksBefore;

const report = async (query, userId = owner) => {
  const res = await ctx.api('GET', `/reports/operations${query}`, undefined, userId);
  return res;
};
const ok = async (query) => {
  const res = await report(query);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data;
};
const day = (key) => `?period=rentang&from=${key}&to=${key}`;
const pick = (rows, key, id) => rows.filter((r) => String(r[key]) === String(id));
const post = async (path, body, status = 201) => {
  const res = await ctx.api('POST', path, { ...body, request_id: rid() });
  assert.equal(res.status, status, `${path} ${JSON.stringify(res.body)}`);
  return res.body.data;
};
async function startedWorkOrder(qty = 10) {
  const w = await post('/work-orders', { product_id: String(product), production_date: TODAY, qty_planned: qty });
  const s = await ctx.api('PATCH', `/work-orders/${w.wo_id}/status`, { from: 'draft', to: 'diproses', request_id: rid() });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  return w.wo_id;
}
const setRecipe = async (items) => assert.equal((await ctx.api('PUT', `/products/${product}/materials`, { items })).status, 200);
async function shiftDays(days, { materials = [], poId, woIds = [] }) {
  const ids = (list) => list.map(String).join(',') || '0';
  await rows(`UPDATE material_movements SET created_at = created_at - INTERVAL ${days} DAY WHERE material_id IN (${ids(materials)})`);
  await rows(`UPDATE stock_adjustments SET created_at = created_at - INTERVAL ${days} DAY WHERE material_id IN (${ids(materials)})`);
  if (poId) {
    await rows(`UPDATE goods_receipts SET created_at = created_at - INTERVAL ${days} DAY WHERE po_id = ?`, poId);
    await rows(`UPDATE purchase_orders SET ordered_at = ordered_at - INTERVAL ${days} DAY, created_at = created_at - INTERVAL ${days} DAY WHERE po_id = ?`, poId);
  }
  await rows(`UPDATE material_issues SET created_at = created_at - INTERVAL ${days} DAY WHERE wo_id IN (${ids(woIds)})`);
  await rows(`UPDATE production_outputs SET recorded_at = recorded_at - INTERVAL ${days} DAY WHERE wo_id IN (${ids(woIds)})`);
  await rows(`UPDATE work_orders SET production_date = production_date - INTERVAL ${days} DAY, started_at = started_at - INTERVAL ${days} DAY,
    completed_at = completed_at - INTERVAL ${days} DAY, created_at = created_at - INTERVAL ${days} DAY WHERE wo_id IN (${ids(woIds)})`);
}

test.before(async () => {
  server = await startServer(FILE);
  staff = await createUser('staf');
  owner = await createUser('owner');
  customer = await createUser('customer');
  ctx = context(server, { staff, owner });
  product = (await rows('SELECT product_id FROM products WHERE is_active = 1 ORDER BY product_id LIMIT 1'))[0].product_id;
  deadlocksBefore = (await innodbMetrics()).lock_deadlocks;
});
test.after(async () => { await server?.stop(); });

test('AC-47.1: hanya Owner — tamu 401, pelanggan & Staf 403; periode AD-08 (400); GET menolak request_id', async () => {
  assert.equal((await call(server, 'GET', '/api/admin/reports/operations', {})).status, 401);
  assert.equal((await report('?period=harian', customer)).status, 403);
  assert.equal((await report('?period=harian', staff)).status, 403);
  assert.equal((await report('?period=tahunan')).status, 400);
  assert.equal((await report(`?period=rentang&from=${TODAY}&to=${addDaysToDateKey(TODAY, 1)}`)).status, 400);
  assert.equal((await report(`?period=harian&request_id=${rid()}`)).status, 400);
  const r = await ok('?period=harian');
  assert.deepEqual(Object.keys(r).sort(), ['analysis', 'from', 'movements', 'period', 'plan_vs_output', 'production', 'purchases', 'revenue', 'store_name', 'to', 'todayKey', 'usage']);
  assert.deepEqual([r.from, r.to, r.todayKey], [TODAY, TODAY, TODAY]);
});

test('IT-28 & IT-23 & AC-47.2: koreksi periode Y atas dokumen periode X — X tidak berubah, Y memuat koreksi; Σ periode = WO; rekonsiliasi SQL', async () => {
  const m1 = await ctx.material('10');
  const m2 = await ctx.material('10');
  const sup = await ctx.supplier([m1, m2]);
  const po = await ctx.purchaseOrder(sup, [{ material_id: m1, qty_ordered: '10', unit_price: '1500.55' }, { material_id: m2, qty_ordered: '2.5', unit_price: '1000.01' }]);
  const [i1] = po.items.map((i) => i.po_item_id);
  await post(`/purchase-orders/${po.po_id}/receipts`, { lines: [{ po_item_id: i1, qty: '4' }] });
  const receipt = (await rows('SELECT receipt_id FROM goods_receipts WHERE po_id = ? ORDER BY receipt_id DESC LIMIT 1', po.po_id))[0].receipt_id;
  assert.equal((await ctx.api('POST', `/raw-materials/${m1}/stock-in`, { qty: '2', request_id: rid() })).status, 200);
  const stockIn = (await rows("SELECT adjustment_id FROM stock_adjustments WHERE material_id = ? AND kind = 'stok_masuk' ORDER BY adjustment_id DESC LIMIT 1", m1))[0].adjustment_id;
  await setRecipe([{ material_id: String(m1), qty_per_unit: '0.015' }]);
  const wo = await startedWorkOrder(9);
  const issue = await post(`/work-orders/${wo}/issues`, { lines: [{ material_id: String(m1), qty: '0.10' }, { material_id: String(m2), qty: '1.00' }] });
  const done = await post(`/work-orders/${wo}/complete`, { qty_output: 5 });
  await shiftDays(3, { materials: [m1, m2], poId: po.po_id, woIds: [wo] });

  const x0 = await ok(day(D3));
  // Rekonsiliasi X dengan SQL (dasar tanggal §9, WIB)
  const sqlX = await rows(`SELECT material_id, type, CAST(SUM(qty_change) AS CHAR) AS q, COUNT(*) AS n FROM material_movements
    WHERE material_id IN (?, ?) AND DATE(CONVERT_TZ(created_at, '+00:00', '+07:00')) = ? GROUP BY material_id, type ORDER BY material_id, type`, m1, m2, D3);
  const mineX = x0.movements.filter((r) => [String(m1), String(m2)].includes(r.material_id));
  assert.deepEqual(mineX.map((r) => `${r.material_id}:${r.type}:${r.qty_change}:${r.count}`).sort(),
    sqlX.map((r) => `${r.material_id}:${r.type}:${Number(r.q)}:${Number(r.n)}`).sort(), 'AC-47.2: mutasi = buku mutasi');
  assert.deepEqual(pick(x0.purchases.ordered.rows, 'material_id', m1).map((r) => [r.qty, r.value]), [[10, 15005.5]]);
  assert.deepEqual(pick(x0.purchases.received.rows, 'material_id', m1).map((r) => [r.qty, r.value]), [[4, 6002.2]]);
  // AC-42.1 (bagian laporan): nilai PO & penerimaan di laporan = nilai detail PO AD-12 (satu fungsi BR-22)
  const poValues = (await ctx.api('GET', `/purchase-orders/${po.po_id}`)).body.data.values;
  const sumValue = (rows) => Math.round(rows.filter((r) => [String(m1), String(m2)].includes(r.material_id)).reduce((t, r) => t + r.value * 100, 0)) / 100;
  assert.deepEqual([sumValue(x0.purchases.ordered.rows), sumValue(x0.purchases.received.rows)], [Number(poValues.order_value), Number(poValues.received_value)]);
  assert.deepEqual(pick(x0.usage, 'material_id', m1).map((r) => [r.standard, r.actual, r.variance]), [[0.075, 0.1, 0.025]]);
  assert.deepEqual(pick(x0.production, 'wo_id', wo).map((r) => [r.net_output, r.corrected]), [[5, false]]);
  // Rencana = Σ qty_planned seluruh WO (termasuk Dibatalkan) dengan production_date di periode (harness memakai ulang database → SQL)
  const planSql = (await rows('SELECT COALESCE(SUM(qty_planned), 0) AS q FROM work_orders WHERE product_id = ? AND production_date = ?', product, D3))[0].q;
  assert.deepEqual(pick(x0.plan_vs_output, 'product_id', product).map((r) => r.qty_planned), [Number(planSql)]);
  assert.ok(Number(planSql) >= 9);

  // Periode Y (hari ini): koreksi semua jenis dokumen periode X
  await post(`/goods-receipts/${receipt}/correct`, { lines: [{ po_item_id: i1, qty: '3' }], reason: 'salah hitung' });
  await post(`/stock-adjustments/${stockIn}/correct`, { qty: '1.5', reason: 'salah input' });
  await post(`/material-issues/${issue.issue_id}/correct`, { lines: [{ material_id: String(m1), qty: '0.10' }, { material_id: String(m2), qty: '0.50' }], reason: 'sisa kembali' });
  await post(`/production-outputs/${done.output_id}/correct`, { qty_output: 7, reason: 'hitung ulang' });

  // Analisis = estimasi FR-40 per hari ini (K19), bukan agregat periode — sengaja dikecualikan dari perbandingan
  const periodOnly = ({ analysis, ...rest }) => rest;
  assert.deepEqual(periodOnly(await ok(day(D3))), periodOnly(x0), 'IT-28: periode X tidak berubah');
  const y = await ok('?period=harian');
  assert.deepEqual(pick(y.purchases.received.rows, 'material_id', m1).map((r) => [r.qty, r.value]), [[-1, -1500.55]]);
  assert.deepEqual(pick(y.movements, 'material_id', m1).map((r) => [r.type, r.qty_change]), [['koreksi_stok_masuk', -0.5], ['koreksi_penerimaan', -1]]);
  assert.deepEqual(pick(y.movements, 'material_id', m2).map((r) => [r.type, r.qty_change]), [['koreksi_pengeluaran', 0.5]]);
  assert.deepEqual(pick(y.usage, 'material_id', m2).map((r) => [r.standard, r.actual, r.variance]), [[0, -0.5, -0.5]], 'pengembalian tampil negatif di periodenya');
  assert.deepEqual(pick(y.usage, 'material_id', m1).map((r) => [r.standard, r.actual, r.variance]), [[0.03, 0, -0.03]]);
  assert.deepEqual(pick(y.production, 'wo_id', wo).map((r) => [r.net_output, r.corrected]), [[2, true]]);

  // IT-23: Σ kontribusi periode = WO (detail WO memakai dokumen yang sama)
  const both = await ok(`?period=rentang&from=${D3}&to=${TODAY}`);
  const sum = pick(both.usage, 'material_id', m1)[0];
  assert.deepEqual([sum.standard, sum.actual, sum.variance], [0.105, 0.1, -0.005], '0,015 × 7 = 0,105; aktual 0,10 → −0,005');
  const detail = (await ctx.api('GET', `/work-orders/${wo}`)).body.data.usage.find((u) => u.material_id === String(m1));
  assert.deepEqual([detail.standard, detail.actual, detail.variance], [sum.standard, sum.actual, sum.variance]);
});

test('Rencana vs hasil (keputusan Pemilik Project): WO Dibatalkan masuk total rencana, tidak masuk hasil; per produk; = SQL', async () => {
  const planOf = (r) => pick(r.plan_vs_output, 'product_id', product)[0] ?? { qty_planned: 0, net_output: 0 };
  const before = planOf(await ok('?period=harian'));
  const m = await ctx.material('5');
  await setRecipe([{ material_id: String(m), qty_per_unit: '0.010' }]);
  const draftCancelled = await post('/work-orders', { product_id: String(product), production_date: TODAY, qty_planned: 6 });
  assert.equal((await ctx.api('PATCH', `/work-orders/${draftCancelled.wo_id}/status`, { from: 'draft', to: 'dibatalkan', request_id: rid() })).status, 200);
  const startedCancelled = await startedWorkOrder(2);
  await post(`/work-orders/${startedCancelled}/issues`, { lines: [{ material_id: String(m), qty: '0.02' }] });
  assert.equal((await ctx.api('PATCH', `/work-orders/${startedCancelled}/status`, { from: 'diproses', to: 'dibatalkan', request_id: rid() })).status, 200);
  const finished = await startedWorkOrder(5);
  await post(`/work-orders/${finished}/complete`, { qty_output: 3 });
  const r = await ok('?period=harian');
  const after = planOf(r);
  assert.deepEqual([after.qty_planned - before.qty_planned, after.net_output - before.net_output], [6 + 2 + 5, 3], 'rencana +13 (termasuk 2 WO Dibatalkan), hasil +3');
  assert.deepEqual(r.production.filter((x) => [draftCancelled.wo_id, startedCancelled].map(String).includes(x.wo_id)), [], 'WO Dibatalkan tidak punya hasil');
  // Standar hanya dari WO selesai (0,010 × 3 = 0,03); pengeluaran WO yang dibatalkan tetap aktual (0,02) tanpa standar (BR-28)
  assert.deepEqual(pick(r.usage, 'material_id', m).map((u) => [u.standard, u.actual]), [[0.03, 0.02]]);
  const sql = await rows(`SELECT CAST(COALESCE(SUM(qty_planned), 0) AS CHAR) AS planned,
    CAST(COALESCE(SUM(CASE WHEN status = 'dibatalkan' THEN qty_planned ELSE 0 END), 0) AS CHAR) AS cancelled FROM work_orders WHERE product_id = ? AND production_date = ?`, product, TODAY);
  assert.equal(after.qty_planned, Number(sql[0].planned), 'rencana = Σ qty_planned seluruh WO tanggal produksi di periode');
  assert.ok(Number(sql[0].cancelled) >= 8);
  await setRecipe([]);
});

test('AC-47.2: laporan hanya membaca — jumlah dokumen, mutasi, audit, idempotensi, dan stok tidak berubah', async () => {
  const before = await fingerprint();
  const outputsBefore = (await rows('SELECT COUNT(*) AS n FROM production_outputs'))[0].n;
  for (const q of ['?period=harian', '?period=mingguan', '?period=bulanan', day(D3)]) await ok(q);
  assert.deepEqual(await fingerprint(), before);
  assert.equal((await rows('SELECT COUNT(*) AS n FROM production_outputs'))[0].n, outputsBefore);
});

test('IT-27: laporan × penulisan bersamaan — setiap respons konsisten dalam satu snapshot; penulisan sukses; 0 deadlock', async () => {
  const m = await ctx.material('100');
  const sup = await ctx.supplier([m]);
  const po = await ctx.purchaseOrder(sup, [{ material_id: m, qty_ordered: '1000', unit_price: '1000' }]);
  const item = po.items[0].po_item_id;
  const wo = await startedWorkOrder(10);
  const writes = [];
  const reads = [];
  for (let i = 0; i < 15; i += 1) {
    writes.push(ctx.api('POST', `/purchase-orders/${po.po_id}/receipts`, { lines: [{ po_item_id: item, qty: '1' }], request_id: rid() }));
    writes.push(ctx.api('POST', `/work-orders/${wo}/issues`, { lines: [{ material_id: String(m), qty: '0.5' }], request_id: rid() }));
    reads.push(report('?period=harian'));
  }
  const [w, r] = await Promise.all([Promise.all(writes), Promise.all(reads)]);
  assert.deepEqual(w.filter((x) => x.status !== 201).map((x) => x.body), [], 'penulisan tidak terhambat laporan');
  for (const res of r) {
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const d = res.body.data;
    const moved = (types) => pick(d.movements, 'material_id', m).filter((x) => types.includes(x.type)).reduce((s, x) => s + Math.round(x.qty_change * 100), 0);
    const received = pick(d.purchases.received.rows, 'material_id', m).reduce((s, x) => s + Math.round(x.qty * 100), 0);
    assert.equal(received, moved(['penerimaan']), 'penerimaan (pembelian) = mutasi penerimaan pada snapshot yang sama');
    const actual = pick(d.usage, 'material_id', m).reduce((s, x) => s + Math.round(x.actual * 100), 0);
    assert.equal(actual, 0 - moved(['pengeluaran_produksi']) + 0, 'pemakaian aktual = −mutasi pengeluaran pada snapshot yang sama');
    assert.equal(pick(d.purchases.received.rows, 'material_id', m).reduce((s, x) => s + Math.round(x.value * 100), 0), received * 1000, 'nilai = qty × harga');
  }
  const final = await ok('?period=harian');
  assert.deepEqual(pick(final.purchases.received.rows, 'material_id', m).map((x) => x.qty), [15]);
  assert.deepEqual(pick(final.usage, 'material_id', m).map((x) => x.actual), [7.5]);
  assert.equal((await innodbMetrics()).lock_deadlocks - deadlocksBefore, 0);
});

test('IT-29 & AC-47.3: omzet pembanding identik dengan /reports/sales untuk setiap periode', async () => {
  // Rentang 30 hari: tidak memuat hari uji batas IT-32 (−45 … −90) yang memang ditolak 422
  for (const q of ['?period=harian', '?period=mingguan', '?period=bulanan', `?period=rentang&from=${addDaysToDateKey(TODAY, -30)}&to=${TODAY}`]) {
    const ops = await ok(q);
    const sales = await ctx.api('GET', `/reports/sales${q}`, undefined, owner);
    assert.equal(sales.status, 200);
    assert.deepEqual(ops.revenue, { revenue: sales.body.data.kpi.revenue, transactions: sales.body.data.kpi.transactions }, q);
    assert.deepEqual([ops.from, ops.to], [sales.body.data.from, sales.body.data.to]);
  }
});

test('IT-32 (API): standar maks. eksak; Σ 10 WO di batas kebijakan → 200 eksak; 11 WO → 422 REPORT_AGGREGATE_LIMIT tanpa data', async () => {
  const m = await ctx.material('1');
  await setRecipe([{ material_id: String(m), qty_per_unit: '9999999.999' }]);
  const wos = [];
  for (let i = 0; i < 11; i += 1) wos.push(await startedWorkOrder(10000));
  for (const w of wos.slice(0, 10)) await post(`/work-orders/${w}/complete`, { qty_output: 10000 });
  // Hari kosong −45 … −90 (harness memakai ulang database; setiap eksekusi memakai hari sendiri)
  const used = new Set((await rows("SELECT DISTINCT DATE_FORMAT(CONVERT_TZ(recorded_at, '+00:00', '+07:00'), '%Y-%m-%d') AS d FROM production_outputs")).map((r) => r.d));
  const offset = [...Array(46).keys()].map((i) => 45 + i).find((n) => !used.has(addDaysToDateKey(TODAY, -n)));
  assert.ok(offset, 'tersedia hari kosong untuk uji batas');
  const D40 = addDaysToDateKey(TODAY, -offset);
  await shiftDays(offset, { woIds: wos });
  const ten = await ok(day(D40));
  assert.deepEqual(pick(ten.usage, 'material_id', m).map((r) => [r.standard, r.actual, r.variance]), [[999999999900, 0, -999999999900]]);
  const detail = (await ctx.api('GET', `/work-orders/${wos[0]}`)).body.data.usage.find((u) => u.material_id === String(m));
  assert.equal(detail.standard, 99999999990, '9.999.999,999 × 10.000 = 99.999.999.990,000');
  await post(`/work-orders/${wos[10]}/complete`, { qty_output: 10000 });
  await shiftDays(offset, { woIds: [wos[10]] }); // dokumen hasil WO ke-11 (dicatat hari ini) ikut ke periode yang sama
  const over = await report(day(D40));
  assert.deepEqual([over.status, over.body.code, over.body.message, over.body.data], [422, 'REPORT_AGGREGATE_LIMIT', 'Total laporan melebihi batas sistem. Persempit periode laporan.', undefined]);
  await setRecipe([]);
});
