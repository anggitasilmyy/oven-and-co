// tests-mysql/26-cr04b-production.it.test.js
// CR-04b · FR-45, FR-46 · UC-36, UC-37 · BR-23 – BR-31, BR-34, BR-36 — Work Order lewat HTTP asli pada MySQL 8:
// AC-45.1 plan-source hanya baca (AD-07/AD-05 tidak berubah) · AC-45.2 transisi {from, to} · AC-45.3/IT-20 snapshot resep
// saat mulai (resep diubah kemudian tidak memengaruhi standar) · AC-46.1/IT-18 pengeluaran tepat sekali, saldo ≥ 0,
// bersamaan → satu sukses · AC-46.2/IT-19 selesai satu dokumen normal, penyelesaian ganda → 409 · AC-46.3/IT-21 batal setelah
// pengeluaran, koreksi multi-bahan rujuk P/R · AC-46.4/IT-22 tiga kasus koreksi hasil + terminal · AC-46.5 standar/aktual/
// selisih eksak · AC-46.6/IT-25 stok jual, daily_stocks, pesanan, checkout & pembatalan tidak berubah · IT-24 pengeluaran ×
// penerimaan urutan berbeda tanpa deadlock · IT-26 FR-40 identik · IT-31 request_id (wajib/opsional, replay, REUSED) ·
// BR-34 audit · rollback (kegagalan disuntik) · 401/403. Invarian buku mutasi I-1 – I-11 (+ I-5) per bahan uji.

const test = require('node:test');
const assert = require('node:assert/strict');
const { APP_URL, rows, innodbMetrics } = require('./helpers/context');
const { startServer, call } = require('./helpers/server');
const { createUser, checkout } = require('./helpers/fixtures');
const { rid, context, stockOf, fingerprint, withFailingTrigger } = require('./helpers/purchasingFixtures');
const { getJakartaDateKey } = require('../src/utils/jakartaDate');

process.env.DATABASE_URL = APP_URL;

const FILE = '26-cr04b-production';
const ROUNDS = Number(process.env.C4_ROUNDS_R26 || 10);
const TODAY = getJakartaDateKey(new Date());
let server;
let staff;
let owner;
let customer;
let ctx;
let deadlocksBefore;

const wo = (method, path, body, userId) => ctx.api(method, `/work-orders${path}`, body, userId);
const audits = async (action, entity, id) => (await rows('SELECT action FROM audit_logs WHERE action = ? AND entity = ? AND entity_id = ?', action, entity, id)).length;
// Tabel penjualan & stok jual yang tidak boleh disentuh produksi (BR-29, AC-46.6)
const salesPrint = async () => (await rows(`SELECT (SELECT COUNT(*) FROM daily_stocks) AS ds, (SELECT COALESCE(SUM(qty_planned + qty_sold), 0) FROM daily_stocks) AS dsq,
  (SELECT COUNT(*) FROM orders) AS o, (SELECT COUNT(*) FROM order_items) AS oi, (SELECT COUNT(*) FROM products) AS p,
  (SELECT COALESCE(SUM(price), 0) FROM products) AS pp, (SELECT GROUP_CONCAT(CONCAT(order_id, ':', order_status) ORDER BY order_id) FROM orders) AS os`))[0];

async function newWorkOrder(productId, extra = {}) {
  const res = await wo('POST', '', { product_id: productId, production_date: TODAY, qty_planned: 10, request_id: rid(), ...extra });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}
async function start(w) {
  const res = await wo('PATCH', `/${w.wo_id}/status`, { from: 'draft', to: 'diproses', request_id: rid() });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data;
}
const issue = (w, lines, extra = {}) => wo('POST', `/${w.wo_id}/issues`, { lines, request_id: rid(), ...extra });
const setRecipe = (productId, items) => ctx.api('PUT', `/products/${productId}/materials`, { items });

test.before(async () => {
  server = await startServer(FILE);
  staff = await createUser('staf');
  owner = await createUser('owner');
  customer = await createUser('customer');
  ctx = context(server, { staff, owner });
  deadlocksBefore = (await innodbMetrics()).lock_deadlocks;
});
test.after(async () => { await server?.stop(); });

test('WO: validasi, 401/403, request_id (wajib, replay, REUSED), nomor, ubah Draft, transisi {from, to}; plan-source hanya baca (AC-45.1); audit', async () => {
  const product = (await rows('SELECT product_id FROM products WHERE is_active = 1 ORDER BY product_id LIMIT 1'))[0].product_id;
  const inactive = (await rows('SELECT product_id FROM products WHERE is_active = 0 ORDER BY product_id LIMIT 1'))[0]?.product_id;
  assert.equal((await call(server, 'GET', '/api/admin/work-orders', {})).status, 401);
  assert.equal((await wo('GET', '', undefined, customer)).status, 403);
  assert.equal((await wo('POST', '', { product_id: product, production_date: TODAY, qty_planned: 5 })).status, 400, 'request_id wajib');
  assert.equal((await wo('POST', '', { product_id: product, production_date: TODAY, qty_planned: 5, request_id: rid(), x: 1 })).status, 400, 'field asing');
  for (const bad of [{ qty_planned: 0 }, { qty_planned: 10001 }, { qty_planned: 2.5 }, { production_date: '2000-01-01' }, ...(inactive ? [{ product_id: inactive }] : [])]) {
    const res = await wo('POST', '', { product_id: product, production_date: TODAY, qty_planned: 5, request_id: rid(), ...bad });
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
  const body = { product_id: product, production_date: TODAY, qty_planned: 12, note: 'pagi', request_id: rid() };
  const first = await wo('POST', '', body);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const replay = await wo('POST', '', { ...body, qty_planned: '12' });
  assert.deepEqual([replay.status, replay.body], [201, first.body], 'replay identik (12 = "12")');
  assert.deepEqual([(await wo('POST', '', { ...body, qty_planned: 13 })).body.code], ['REQUEST_ID_REUSED']);
  const w = first.body.data;
  assert.match(w.wo_number, new RegExp(`^WO-${TODAY.slice(2, 4)}${TODAY.slice(5, 7)}${TODAY.slice(8, 10)}-\\d{3}$`));
  assert.deepEqual([w.status, w.qty_planned, w.recipe_snapshot_at, w.recipe, w.net_output], ['draft', 12, null, [], 0]);
  const edited = await wo('PUT', `/${w.wo_id}`, { product_id: product, production_date: TODAY, qty_planned: 15 });
  assert.deepEqual([edited.status, edited.body.data.qty_planned], [200, 15]);
  // IT-31 (bagian CR-04b): PUT WO Draft — request_id opsional; bila dikirim kontrak penuh (replay identik, payload beda 409)
  const putBody = { product_id: product, production_date: TODAY, qty_planned: 14, request_id: rid() };
  const put1 = await wo('PUT', `/${w.wo_id}`, putBody);
  const put2 = await wo('PUT', `/${w.wo_id}`, putBody);
  assert.deepEqual([put1.status, put1.body.data.qty_planned, put2.status, put2.body], [200, 14, 200, put1.body], 'replay PUT identik');
  assert.deepEqual([(await wo('PUT', `/${w.wo_id}`, { ...putBody, qty_planned: 16 })).body.code], ['REQUEST_ID_REUSED']);
  assert.equal((await rows('SELECT COUNT(*) AS n FROM operation_requests WHERE response_status = 102'))[0].n, '0', 'tidak ada 102 tersisa');
  assert.equal((await wo('PATCH', `/${w.wo_id}/status`, { from: 'diproses', to: 'dibatalkan', request_id: rid() })).status, 409, 'from basi');
  assert.equal((await wo('PATCH', `/${w.wo_id}/status`, { from: 'draft', to: 'selesai', request_id: rid() })).status, 409, 'selesai hanya lewat complete');
  assert.equal((await wo('PATCH', `/${w.wo_id}/status`, { from: 'draft', to: 'x', request_id: rid() })).status, 400);
  assert.equal((await wo('POST', `/${w.wo_id}/issues`, { lines: [{ material_id: '1', qty: '1' }], request_id: rid() })).status, 409, 'Draft tanpa pengeluaran');
  const cancelled = await wo('PATCH', `/${w.wo_id}/status`, { from: 'draft', to: 'dibatalkan', request_id: rid() });
  assert.deepEqual([cancelled.status, cancelled.body.data.status, cancelled.body.data.started_at], [200, 'dibatalkan', null]);
  assert.equal((await wo('PATCH', `/${w.wo_id}/status`, { from: 'dibatalkan', to: 'diproses', request_id: rid() })).status, 409, 'final');
  assert.equal((await wo('PUT', `/${w.wo_id}`, { product_id: product, production_date: TODAY, qty_planned: 1 })).status, 409, 'ubah hanya Draft');
  assert.deepEqual([await audits('create_work_order', 'work_orders', w.wo_id), await audits('update_work_order', 'work_orders', w.wo_id),
    await audits('cancel_work_order', 'work_orders', w.wo_id)], [1, 2, 1], 'replay tidak menambah audit');
  assert.equal((await wo('GET', `?request_id=${rid()}`)).status, 400, 'GET menolak request_id');

  // AC-45.1: isian awal membaca AD-07 (hari ini) & AD-05 tanpa menulis
  const before = await salesPrint();
  const source = await wo('GET', `/plan-source?date=${TODAY}`);
  assert.equal(source.status, 200, JSON.stringify(source.body));
  const board = (await ctx.api('GET', '/stocks/today')).body.data.rows.filter((r) => r.qty_planned > 0);
  assert.deepEqual(source.body.data.ready_plan.map((r) => [r.product_id, r.qty_planned]), board.map((r) => [r.product_id, r.qty_planned]));
  const calendar = (await ctx.api('GET', `/calendar?date=${TODAY}`)).body.data.selected.groups;
  assert.deepEqual(source.body.data.calendar.map((g) => [g.product_id, g.quantity]), calendar.map((g) => [g.product_id, g.quantity]));
  assert.equal((await wo('GET', '/plan-source?date=2000-01-01')).status, 400);
  assert.deepEqual(await salesPrint(), before, 'plan-source tidak menulis');
});

test('AC-45.3 & IT-20: snapshot saat mulai (termasuk resep kosong); resep diubah kemudian → standar tetap snapshot; AC-46.5 eksak', async () => {
  const m1 = await ctx.material('50');
  const m2 = await ctx.material('50');
  const product = (await rows('SELECT product_id FROM products WHERE is_active = 1 ORDER BY product_id DESC LIMIT 1'))[0].product_id;
  const original = (await ctx.api('GET', `/products/${product}/materials`)).body.data.items.map((i) => ({ material_id: i.material_id, qty_per_unit: String(i.qty_per_unit) }));
  try {
    assert.equal((await setRecipe(product, [])).status, 200);
    const empty = await start(await newWorkOrder(product));
    assert.deepEqual([empty.status, Boolean(empty.recipe_snapshot_at), empty.recipe, empty.without_recipe], ['diproses', true, [], true], 'snapshot kosong tetap bertanggal');
    assert.equal((await setRecipe(product, [{ material_id: m1, qty_per_unit: '0.015' }, { material_id: m2, qty_per_unit: '1.250' }])).status, 200);
    const w = await start(await newWorkOrder(product));
    assert.deepEqual(w.recipe.map((r) => [r.material_id, r.qty_per_unit]), [[m1, 0.015], [m2, 1.25]].sort((a, b) => Number(a[0]) - Number(b[0])));
    assert.equal((await setRecipe(product, [{ material_id: m1, qty_per_unit: '9.000' }])).status, 200, 'resep berubah setelah mulai');
    assert.equal((await issue(w, [{ material_id: m1, qty: '0.10' }])).status, 201);
    const done = await wo('POST', `/${w.wo_id}/complete`, { qty_output: 7, request_id: rid() });
    assert.equal(done.status, 201, JSON.stringify(done.body));
    const usage = Object.fromEntries(done.body.data.work_order.usage.map((u) => [u.material_id, [u.standard, u.actual, u.variance]]));
    assert.deepEqual(usage[m1], [0.105, 0.1, -0.005], 'IT-23: 0,015 × 7 = 0,105; aktual 0,10 → −0,005 (snapshot, bukan resep baru 9)');
    assert.deepEqual(usage[m2], [8.75, 0, -8.75]);
    assert.equal(empty.wo_id !== w.wo_id, true);
  } finally {
    await setRecipe(product, original);
  }
  await ctx.assertLedger();
});

test('AC-46.1 & IT-31: pengeluaran mengurangi stok tepat sekali; replay & REUSED; validasi; saldo < 0 → 409 tanpa efek; IT-18 bersamaan', async () => {
  const m1 = await ctx.material('10');
  const m2 = await ctx.material('5');
  const product = (await rows('SELECT product_id FROM products WHERE is_active = 1 ORDER BY product_id LIMIT 1'))[0].product_id;
  const w = await start(await newWorkOrder(product));
  const body = { lines: [{ material_id: m2, qty: '1.5' }, { material_id: m1, qty: '2' }], request_id: rid() };
  const first = await wo('POST', `/${w.wo_id}/issues`, body);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.deepEqual(first.body.data.movements.map((m) => [m.type, m.qty_change]), [['pengeluaran_produksi', '-2.00'], ['pengeluaran_produksi', '-1.50']]);
  const replay = await wo('POST', `/${w.wo_id}/issues`, { ...body, lines: [{ material_id: m1, qty: '2.00' }, { material_id: m2, qty: '1.50' }] });
  assert.deepEqual([replay.status, replay.body], [201, first.body], 'replay identik');
  assert.equal((await wo('POST', `/${w.wo_id}/issues`, { ...body, lines: [{ material_id: m1, qty: '3' }] })).body.code, 'REQUEST_ID_REUSED');
  assert.deepEqual([await stockOf(m1), await stockOf(m2)], ['8.00', '3.50'], 'tepat sekali');
  assert.equal(await audits('issue_material', 'material_issues', first.body.data.issue_id), 1);
  const before = await fingerprint();
  for (const lines of [[], [{ material_id: m1, qty: '0' }], [{ material_id: m1, qty: 1 }], [{ material_id: m1, qty: '1.234' }], [{ material_id: '987654321', qty: '1' }],
    [{ material_id: m1, qty: '1' }, { material_id: m1, qty: '1' }], Array.from({ length: 31 }, () => ({ material_id: m1, qty: '1' }))]) {
    assert.equal((await issue(w, lines)).status, 400, JSON.stringify(lines).slice(0, 80));
  }
  const over = await issue(w, [{ material_id: m1, qty: '1' }, { material_id: m2, qty: '3.51' }]);
  assert.deepEqual([over.status, over.body.code], [409, 'STOCK_OUT_OF_RANGE'], 'satu bahan melanggar → seluruh operasi ditolak');
  assert.deepEqual(await fingerprint(), before, 'penolakan tanpa dokumen, mutasi, stok, audit');

  // IT-18: dua pengeluaran bersamaan menghabiskan stok → satu sukses, satu 409
  for (let round = 0; round < ROUNDS; round += 1) {
    const m = await ctx.material('5');
    const results = await Promise.all([issue(w, [{ material_id: m, qty: '4' }]), issue(w, [{ material_id: m, qty: '4' }])]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409], JSON.stringify(results.map((r) => r.body)));
    assert.equal(await stockOf(m), '1.00');
  }
  await ctx.assertLedger();
});

test('AC-46.3 & IT-21: koreksi multi-bahan (+2 rujuk P, +5 rujuk R, sama tanpa mutasi); WO batal setelah pengeluaran; pembalik; audit', async () => {
  const [m1, m2, m3] = [await ctx.material('20'), await ctx.material('20'), await ctx.material('20')];
  const product = (await rows('SELECT product_id FROM products WHERE is_active = 1 ORDER BY product_id LIMIT 1'))[0].product_id;
  const w = await start(await newWorkOrder(product));
  const O = (await issue(w, [{ material_id: m1, qty: '10' }, { material_id: m2, qty: '5' }, { material_id: m3, qty: '4' }])).body.data.issue_id;
  assert.equal((await ctx.api('POST', `/material-issues/${O}/correct`, { lines: [{ material_id: m1, qty: '8' }], request_id: rid() })).status, 400, 'alasan wajib');
  const op = rid();
  const corr = await ctx.api('POST', `/material-issues/${O}/correct`, { lines: [{ material_id: m1, qty: '8' }, { material_id: m3, qty: '4' }], reason: 'salah timbang', request_id: op });
  assert.equal(corr.status, 201, JSON.stringify(corr.body));
  const { reversal_id: R, replacement_id: P } = corr.body.data;
  const moves = await rows(`SELECT material_id, type, CAST(qty_change AS CHAR) AS q, issue_id FROM material_movements WHERE issue_id IN (?, ?) ORDER BY material_id`, R, P);
  assert.deepEqual(moves.map((m) => [m.material_id, m.type, m.q, m.issue_id]), [[m1, 'koreksi_pengeluaran', '2.00', P], [m2, 'koreksi_pengeluaran', '5.00', R]]);
  assert.equal((await rows('SELECT COUNT(DISTINCT operation_request_id) AS n FROM material_issues WHERE issue_id IN (?, ?)', R, P))[0].n, '1');
  assert.deepEqual([await stockOf(m1), await stockOf(m2), await stockOf(m3)], ['12.00', '20.00', '16.00']);
  assert.equal((await ctx.api('POST', `/material-issues/${O}/reverse`, { reason: 'x', request_id: rid() })).body.code, 'DOCUMENT_ALREADY_SUPERSEDED');
  assert.equal((await ctx.api('POST', `/material-issues/${R}/reverse`, { reason: 'x', request_id: rid() })).body.code, 'DOCUMENT_ALREADY_SUPERSEDED');
  assert.equal(await audits('correct_material_issue', 'material_issues', O), 1);

  // WO batal setelah pengeluaran: pengeluaran tetap, tanpa dokumen hasil, aktual positif; koreksi/pembalik tetap boleh (bukan Draft)
  const cancel = await wo('PATCH', `/${w.wo_id}/status`, { from: 'diproses', to: 'dibatalkan', request_id: rid() });
  assert.deepEqual([cancel.status, cancel.body.data.status, cancel.body.data.outputs.length], [200, 'dibatalkan', 0]);
  const usage = Object.fromEntries(cancel.body.data.usage.map((u) => [u.material_id, u.actual]));
  assert.deepEqual([usage[m1], usage[m2], usage[m3]], [8, 0, 4]);
  assert.equal((await wo('POST', `/${w.wo_id}/complete`, { qty_output: 1, request_id: rid() })).status, 409, 'WO batal tidak diselesaikan');
  assert.equal((await issue(w, [{ material_id: m1, qty: '1' }])).status, 409, 'WO batal tanpa pengeluaran baru');
  const rev = await ctx.api('POST', `/material-issues/${P}/reverse`, { reason: 'kembali ke gudang', request_id: rid() });
  assert.equal(rev.status, 201, JSON.stringify(rev.body));
  assert.deepEqual([await stockOf(m1), await stockOf(m3)], ['20.00', '20.00']);
  assert.equal(await audits('reverse_material_issue', 'material_issues', P), 1);
  // Movement history AD-07 menampilkan dokumen pengeluaran
  const history = (await ctx.api('GET', `/raw-materials/${m1}/movements`)).body.data.movements;
  assert.deepEqual(history.map((h) => [h.type, h.document.source]).slice(1),
    [['pengeluaran_produksi', 'material_issue'], ['koreksi_pengeluaran', 'material_issue'], ['pembalik_pengeluaran', 'material_issue']]);
  await ctx.assertLedger();
});

test('AC-46.2 & IT-19: selesai = satu dokumen normal (+ pengeluaran terakhir opsional); penyelesaian ganda bersamaan → satu 201, satu 409', async () => {
  const m1 = await ctx.material('10');
  const product = (await rows('SELECT product_id FROM products WHERE is_active = 1 ORDER BY product_id LIMIT 1'))[0].product_id;
  const w = await start(await newWorkOrder(product));
  assert.equal((await wo('POST', `/${w.wo_id}/complete`, { qty_output: 10001, request_id: rid() })).status, 400);
  assert.equal((await wo('POST', `/${w.wo_id}/complete`, { qty_output: 5, lines: [{ material_id: m1, qty: '11' }], request_id: rid() })).status, 409, 'pengeluaran terakhir melanggar saldo → tidak selesai');
  assert.equal((await rows('SELECT status FROM work_orders WHERE wo_id = ?', w.wo_id))[0].status, 'diproses');
  const results = await Promise.all([
    wo('POST', `/${w.wo_id}/complete`, { qty_output: 6, lines: [{ material_id: m1, qty: '2' }], request_id: rid() }),
    wo('POST', `/${w.wo_id}/complete`, { qty_output: 6, request_id: rid() }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409], JSON.stringify(results.map((r) => r.body)));
  assert.equal((await rows("SELECT COUNT(*) AS n FROM production_outputs WHERE wo_id = ? AND kind = 'normal'", w.wo_id))[0].n, '1');
  const view = (await wo('GET', `/${w.wo_id}`)).body.data;
  assert.deepEqual([view.status, view.net_output, Boolean(view.completed_at)], ['selesai', 6, true]);
  assert.equal(await audits('complete_work_order', 'work_orders', w.wo_id), 1);
  assert.equal((await issue(w, [{ material_id: m1, qty: '1' }])).status, 409, 'WO Selesai tanpa pengeluaran baru');
  await ctx.assertLedger();
});

test('AC-46.4 & IT-22: hasil 0 → pembalik 400 → 0→5 → 5→8 → 8→8 400 → 8→0 → terminal 409; WO-2 hasil 3; WO-3 0→0 400; status tetap Selesai', async () => {
  const product = (await rows('SELECT product_id FROM products WHERE is_active = 1 ORDER BY product_id LIMIT 1'))[0].product_id;
  const complete = async (q) => {
    const w = await start(await newWorkOrder(product));
    const res = await wo('POST', `/${w.wo_id}/complete`, { qty_output: q, request_id: rid() });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return [w, res.body.data.output_id];
  };
  const out = (id, action, body) => ctx.api('POST', `/production-outputs/${id}/${action}`, { request_id: rid(), ...body });
  const net = async (w) => (await wo('GET', `/${w.wo_id}`)).body.data;
  const [w1, o0] = await complete(0);
  assert.equal((await out(o0, 'reverse', { reason: 'x' })).status, 400, 'pembalik hasil 0');
  const c1 = await out(o0, 'correct', { qty_output: 5, reason: 'hitung ulang' });
  assert.deepEqual([c1.status, c1.body.data.reversal_id, (await net(w1)).net_output], [201, null, 5], '0 → 5: P langsung');
  const p5 = c1.body.data.replacement_id;
  const c2 = await out(p5, 'correct', { qty_output: 8, reason: 'hitung ulang' });
  assert.deepEqual([c2.status, Boolean(c2.body.data.reversal_id), (await net(w1)).net_output], [201, true, 8], '5 → 8: R + P');
  const p8 = c2.body.data.replacement_id;
  assert.equal((await out(p8, 'correct', { qty_output: 8, reason: 'sama' })).status, 400, '8 → 8');
  const c3 = await out(p8, 'correct', { qty_output: 0, reason: 'gagal produksi' });
  assert.deepEqual([c3.status, c3.body.data.replacement_id, (await net(w1)).net_output], [201, null, 0], '8 → 0: R saja');
  for (const id of [o0, p5, p8, c2.body.data.reversal_id, c3.body.data.reversal_id]) {
    assert.equal((await out(id, 'correct', { qty_output: 3, reason: 'x' })).body.code, 'DOCUMENT_ALREADY_SUPERSEDED', `koreksi ${id}`);
    assert.equal((await out(id, 'reverse', { reason: 'x' })).body.code, 'DOCUMENT_ALREADY_SUPERSEDED', `pembalik ${id}`);
  }
  assert.equal((await wo('POST', `/${w1.wo_id}/complete`, { qty_output: 3, request_id: rid() })).status, 409, 'penyelesaian ulang');
  const final = await net(w1);
  assert.deepEqual([final.status, final.net_output, final.outputs.filter((o) => o.effective).length], ['selesai', 0, 0]);
  const [w2] = await complete(3);
  assert.equal((await net(w2)).net_output, 3);
  const [, o3] = await complete(0);
  assert.equal((await out(o3, 'correct', { qty_output: 0, reason: 'x' })).status, 400, 'WO-3: 0 → 0');
  assert.equal(await audits('correct_production_output', 'production_outputs', o0), 1);
  assert.equal(await audits('reverse_production_output', 'production_outputs', o3), 0);
});

test('AC-46.6 & IT-25: produksi × checkout × pembatalan bersamaan — penjualan berperilaku sama; daily_stocks/pesanan/produk tidak disentuh produksi', async () => {
  const m1 = await ctx.material('100');
  const product = (await rows('SELECT product_id FROM products WHERE is_active = 1 ORDER BY product_id LIMIT 1'))[0].product_id;
  const w = await start(await newWorkOrder(product));
  const before = await salesPrint();
  await issue(w, [{ material_id: m1, qty: '1' }]);
  await wo('POST', `/${w.wo_id}/complete`, { qty_output: 50, request_id: rid() });
  assert.deepEqual(await salesPrint(), before, 'hasil 50 tidak menambah stok jual / pesanan');
  for (let round = 0; round < Math.max(3, ROUNDS / 2); round += 1) {
    const w2 = await start(await newWorkOrder(product));
    const placed = await checkout(server, customer);
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    const number = placed.body.data.order_number;
    const results = await Promise.all([
      issue(w2, [{ material_id: m1, qty: '0.5' }]),
      checkout(server, customer),
      call(server, 'PATCH', `/api/orders/${number}/cancel`, { userId: customer, body: { reason: 'Uji IT-25' } }),
      wo('POST', `/${w2.wo_id}/complete`, { qty_output: 2, request_id: rid() }),
    ]);
    assert.ok(results.every((r) => r.status < 500), JSON.stringify(results.map((r) => r.status)));
    assert.equal(results[1].status, 201, 'checkout tetap berhasil');
    assert.equal(results[2].status, 200, 'pembatalan tetap berhasil');
  }
  await ctx.assertLedger();
  assert.equal((await innodbMetrics()).lock_deadlocks - deadlocksBefore, 0);
});

test('IT-24: pengeluaran multi-bahan × penerimaan multi-bahan urutan berbeda → 0 deadlock; IT-26: FR-40 identik setelah pengeluaran; rollback', async () => {
  const [a, b] = [await ctx.material('500'), await ctx.material('500')];
  const product = (await rows('SELECT product_id FROM products WHERE is_active = 1 ORDER BY product_id LIMIT 1'))[0].product_id;
  const w = await start(await newWorkOrder(product));
  const po = await ctx.purchaseOrder(await ctx.supplier([a, b]), [{ material_id: b, qty_ordered: '1000', unit_price: '1' }, { material_id: a, qty_ordered: '1000', unit_price: '1' }]);
  const items = Object.fromEntries(po.items.map((i) => [i.material_id, i.po_item_id]));
  for (let round = 0; round < ROUNDS; round += 1) {
    const results = await Promise.all([
      issue(w, [{ material_id: b, qty: '1' }, { material_id: a, qty: '1' }]),
      ctx.api('POST', `/purchase-orders/${po.po_id}/receipts`, { lines: [{ po_item_id: items[a], qty: '1' }, { po_item_id: items[b], qty: '1' }], request_id: rid() }),
      issue(w, [{ material_id: a, qty: '1' }, { material_id: b, qty: '1' }]),
    ]);
    assert.deepEqual(results.map((r) => r.status), [201, 201, 201], JSON.stringify(results.map((r) => r.body)));
  }
  assert.deepEqual([await stockOf(a), await stockOf(b)], [String(500 - ROUNDS).concat('.00'), String(500 - ROUNDS).concat('.00')]);

  // IT-26: kebutuhan FR-40 tidak berubah oleh pengeluaran (hanya stok & turunannya)
  const need = async () => (await ctx.api('GET', '/material-requirements')).body.data.rows
    .map((r) => [r.material_id, r.daily_need, r.backlog_need, r.cumulative_need]).sort((x, y) => Number(x[0]) - Number(y[0]));
  const beforeNeed = await need();
  assert.equal((await issue(w, [{ material_id: a, qty: '3' }])).status, 201);
  assert.deepEqual(await need(), beforeNeed);

  // Rollback: kegagalan disuntik pada baris dokumen / mutasi / audit → tanpa perubahan; kirim ulang → satu dokumen
  for (const [name, table] of [['p26_fail_mil', 'material_issue_lines'], ['p26_fail_mm', 'material_movements'], ['p26_fail_audit', 'audit_logs']]) {
    const before = await fingerprint();
    const id = rid();
    const failed = await withFailingTrigger(name, table, () => issue(w, [{ material_id: a, qty: '1' }], { request_id: id }));
    assert.equal(failed.status, 500, table);
    assert.deepEqual(await fingerprint(), before, `${table}: tanpa perubahan`);
    assert.equal((await rows('SELECT COUNT(*) AS n FROM operation_requests WHERE request_id = ?', id))[0].n, '0');
    assert.equal((await issue(w, [{ material_id: a, qty: '1' }], { request_id: id })).status, 201, 'kirim ulang');
  }
  await ctx.assertLedger();
  assert.equal((await innodbMetrics()).lock_deadlocks - deadlocksBefore, 0);
});
