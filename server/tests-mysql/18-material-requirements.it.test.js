// tests-mysql/18-material-requirements.it.test.js
// CR-03 CP5 · FR-40 · UC-32 · BR-14 – BR-16 — GET /api/admin/material-requirements pada MySQL 8 sungguhan.
// Data uji: produk & bahan baru (nama unik) sehingga baris bahan uji hanya dipengaruhi pesanan uji; bahan "satuan"
// (takaran 1,000 per produk) membuat kebutuhan = jumlah unit q(p, D) agar bisa dibandingkan langsung.
// R1  AC-40.1/40.3/40.4/40.5/40.6/40.10: filter status & tipe di DB nyata, ready_date DATE ≤ D, harian/tertunggak/
//     kumulatif, custom per desain → takaran produk dasar, sisa & status dari kumulatif, produk tanpa komposisi.
// R2  AC-40.2: rencana ready hari ini dihitung, rencana besok tidak; item ready dalam pesanan bukan tambahan;
//     pembatalan pesanan campuran hanya menghapus kontribusi pre-order-nya.
// R3  AC-40.9: rekonsiliasi dengan GET /api/admin/calendar?date=D (selected.groups[].orders[].quantity, status
//     dikonfirmasi/sedang_disiapkan, per product_id) untuk T-2 … T+5 — di tingkat API (bahan satuan) dan aturan murni
//     (seluruh basis data, termasuk data seed).
// R4  AC-40.8/AC-40.12: GET tidak mengubah tabel apa pun (CHECKSUM); setelah Stok Masuk AD-07 sisa/status mengikuti.
// R5  AC-40.11 + otorisasi: kosong = hari ini WIB, batas T & T+29, 400, 401, 403.
// R6  MILLI_PRECISION_LOST di DB nyata: qty_planned maks × takaran maks → 500 + kode + pesan aman, tanpa data.

const test = require('node:test');
const assert = require('node:assert/strict');
const { APP_URL, db, rows, record } = require('./helpers/context');
const { startServer, call } = require('./helpers/server');
const { createUser, unique } = require('./helpers/fixtures');
const { getJakartaDateKey, addDaysToDateKey } = require('../src/utils/jakartaDate');
const { collectProductQuantities } = require('../src/services/materialRequirementRules.service');

process.env.DATABASE_URL = APP_URL;

const FILE = '18-material-requirements';
const T = getJakartaDateKey(new Date());
const day = (n) => addDaysToDateKey(T, n);
let server;
let staff;
let owner;
let customer;
const ids = {};
const orders = {};

async function insertProduct(key, type) {
  const name = unique(`Produk R18 ${key} `);
  await db.$executeRawUnsafe(`INSERT INTO products (category_id, name, description, price, availability_type, lead_time_days, is_active)
    VALUES (1, ?, 'uji CP5', 20000, ?, ?, 1)`, name, type, type === 'ready' ? 0 : 1);
  ids[key] = String((await rows('SELECT product_id FROM products WHERE name = ?', name))[0].product_id);
  ids[`${key}Name`] = name;
}
async function insertMaterial(key, stock, minStock) {
  const name = unique(`Bahan R18 ${key} `);
  await db.$executeRawUnsafe("INSERT INTO raw_materials (name, unit, stock, min_stock) VALUES (?, 'kg', ?, ?)", name, stock, minStock);
  ids[key] = String((await rows('SELECT material_id FROM raw_materials WHERE name = ?', name))[0].material_id);
}
async function insertDesign(key, productId, readyDate) {
  await db.$executeRawUnsafe('INSERT INTO custom_cake_designs (product_id, ready_date, price) VALUES (?, ?, 450000)', productId, readyDate);
  ids[key] = String((await rows('SELECT LAST_INSERT_ID() AS id'))[0].id);
}
/** Pesanan uji langsung lewat SQL (penyiapan kondisi awal, bukan kode yang diuji) */
async function insertOrder(key, status, readyDate, items) {
  const number = unique('R18-').slice(0, 20);
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`INSERT INTO orders (order_number, user_id, fulfillment_type, ready_date, time_slot, subtotal,
      shipping_fee, voucher_discount, points_used, points_discount, total, payment_option, payment_status, order_status, created_at)
      VALUES (?, ?, 'pickup', ?, '09.00–11.00', 10000, 0, 0, 0, 0, 10000, 'online', 'paid', ?, NOW())`, number, customer, readyDate, status);
    const [{ id }] = await tx.$queryRawUnsafe('SELECT LAST_INSERT_ID() AS id');
    for (const [productId, quantity, designId = null] of items) {
      await tx.$executeRawUnsafe('INSERT INTO order_items (order_id, product_id, design_id, quantity, unit_price) VALUES (?, ?, ?, ?, 20000)',
        id, productId, designId, quantity);
    }
  });
  orders[key] = number;
}

const getReq = (query = '', userId = staff) => call(server, 'GET', `/api/admin/material-requirements${query}`, { userId });
const rowOf = (data, materialId) => data.rows.find((r) => r.material_id === materialId);
const needs = (r) => [r.daily_need, r.backlog_need, r.cumulative_need, r.remaining, r.shortage, r.status];
const checksums = async () => Object.fromEntries((await rows(
  'CHECKSUM TABLE raw_materials, daily_stocks, orders, order_items, product_materials, products, audit_logs, order_status_histories',
)).map((r) => [String(r.Table).split('.').pop(), String(r.Checksum)]));

test.before(async () => {
  server = await startServer(FILE);
  staff = await createUser('staf');
  owner = await createUser('owner');
  customer = await createUser('customer');
  await insertProduct('pa', 'preorder'); // komposisi: MA 1,000 + MX 0,015
  await insertProduct('pb', 'preorder'); // TANPA komposisi (AC-40.10)
  await insertProduct('pc', 'custom'); // komposisi produk dasar: MC 1,000 + MX 0,300 (BR-16)
  await insertProduct('pr', 'ready'); // komposisi: MR 1,000 + MX 0,015
  await insertMaterial('ma', '100.00', '10.00');
  await insertMaterial('mc', '100.00', '10.00');
  await insertMaterial('mr', '100.00', '10.00');
  await insertMaterial('mx', '1.15', '0.02');
  for (const [p, m, q] of [['pa', 'ma', '1'], ['pa', 'mx', '0.015'], ['pc', 'mc', '1'], ['pc', 'mx', '0.3'], ['pr', 'mr', '1'], ['pr', 'mx', '0.015']]) {
    await db.$executeRawUnsafe('INSERT INTO product_materials (product_id, material_id, qty_per_unit) VALUES (?, ?, ?)', ids[p], ids[m], q);
  }
  await db.$executeRawUnsafe('INSERT INTO daily_stocks (product_id, stock_date, qty_planned, qty_sold) VALUES (?, ?, 10, 0), (?, ?, 50, 0), (?, ?, 70, 0)',
    ids.pr, T, ids.pr, day(1), ids.pr, day(-1));
  await insertDesign('d1', ids.pc, day(3));
  await insertDesign('d2', ids.pc, day(3));
  await insertOrder('o1', 'dikonfirmasi', day(1), [[ids.pa, 2]]);
  await insertOrder('o2', 'sedang_disiapkan', T, [[ids.pa, 1]]);
  await insertOrder('o3', 'menunggu_pembayaran', day(1), [[ids.pa, 3]]);
  await insertOrder('o4', 'siap_diambil', T, [[ids.pa, 1]]);
  await insertOrder('o5', 'dikonfirmasi', day(-2), [[ids.pa, 4]]); // terlambat → tertunggak
  await insertOrder('o6', 'dikonfirmasi', day(3), [[ids.pc, 1, ids.d1]]);
  await insertOrder('o7', 'sedang_disiapkan', day(3), [[ids.pc, 2, ids.d2]]);
  await insertOrder('o8', 'dikonfirmasi', day(1), [[ids.pr, 5], [ids.pa, 1]]); // campuran
  await insertOrder('o9', 'dikonfirmasi', day(1), [[ids.pb, 6]]);
  await insertOrder('o10', 'dibatalkan', day(1), [[ids.pa, 1]]);
  await insertOrder('o11', 'selesai', day(-1), [[ids.pa, 2]]);
  await insertOrder('o12', 'dalam_pengiriman', day(1), [[ids.pa, 9]]);
  await insertOrder('o13', 'dikonfirmasi', day(2), [[ids.pr, 7]]); // pesanan ready saja, tanggal mendatang
});
test.after(async () => {
  await server?.stop();
  await db.$disconnect();
});

test('R1 AC-40.1/40.3 – 40.6/40.10: harian, tertunggak, kumulatif, custom per desain, sisa & status, tanpa komposisi', async () => {
  const expected = {
    // [MA (unit pre-order PA), MC (unit custom), MR (unit ready), MX gabungan]
    [T]: { ma: [1, 4, 5], mc: [0, 0, 0], mr: [10, 0, 10], mx: [0.165, 0.06, 0.225, 0.925, 0, 'cukup'], pb: null },
    [day(1)]: { ma: [3, 4, 8], mc: [0, 0, 0], mr: [0, 0, 10], mx: [0.045, 0.06, 0.27, 0.88, 0, 'cukup'], pb: [6, 6] },
    [day(2)]: { ma: [0, 4, 8], mc: [0, 0, 0], mr: [0, 0, 10], mx: [0, 0.06, 0.27, 0.88, 0, 'cukup'], pb: [0, 6] },
    [day(3)]: { ma: [0, 4, 8], mc: [3, 0, 3], mr: [0, 0, 10], mx: [0.9, 0.06, 1.17, -0.02, 0.02, 'kurang'], pb: [0, 6] },
    [day(29)]: { ma: [0, 4, 8], mc: [0, 0, 3], mr: [0, 0, 10], mx: [0, 0.06, 1.17, -0.02, 0.02, 'kurang'], pb: [0, 6] },
  };
  const results = {};
  for (const [date, exp] of Object.entries(expected)) {
    const res = await getReq(`?date=${date}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const data = res.body.data;
    assert.deepEqual([data.date, data.today_key, data.cumulative_range], [date, T, { from: T, to: date }]);
    for (const m of ['ma', 'mc', 'mr']) {
      const r = rowOf(data, ids[m]);
      assert.deepEqual([r.daily_need, r.backlog_need, r.cumulative_need], exp[m], `${m} ${date}`);
    }
    assert.deepEqual(needs(rowOf(data, ids.mx)), exp.mx, `mx ${date}`);
    const pb = data.products_without_recipe.find((p) => p.product_id === ids.pb);
    assert.deepEqual(pb ? [pb.daily_quantity, pb.cumulative_quantity] : null, exp.pb, `pb ${date}`);
    if (pb) assert.equal(pb.name, ids.pbName);
    assert.ok(!data.products_without_recipe.some((p) => [ids.pa, ids.pc, ids.pr].includes(p.product_id)));
    results[date] = needs(rowOf(data, ids.mx));
  }
  record(FILE, 'R1', results);
});

test('R2 AC-40.2: item ready bukan tambahan; batal pesanan campuran hanya menghapus kontribusi pre-order', async () => {
  const before = rowOf((await getReq(`?date=${day(1)}`)).body.data, ids.mx);
  // checkout pesanan ready baru (hari ini) tidak mengubah estimasi
  await insertOrder('o14', 'dikonfirmasi', T, [[ids.pr, 3]]);
  const afterReady = rowOf((await getReq(`?date=${day(1)}`)).body.data, ids.mx);
  assert.deepEqual(needs(afterReady), needs(before));
  await db.$executeRawUnsafe("UPDATE orders SET order_status = 'dibatalkan' WHERE order_number = ?", orders.o8);
  const data = (await getReq(`?date=${day(1)}`)).body.data;
  assert.equal(rowOf(data, ids.mx).cumulative_need, 0.255, '0,27 − 1 × 0,015 (PA dari pesanan campuran)');
  assert.deepEqual([rowOf(data, ids.ma).daily_need, rowOf(data, ids.mr).cumulative_need], [2, 10]);
  await db.$executeRawUnsafe("UPDATE orders SET order_status = 'dikonfirmasi' WHERE order_number = ?", orders.o8);
  record(FILE, 'R2', { before: needs(before), afterCancel: needs(rowOf(data, ids.mx)) });
});

test('R3 AC-40.9: rekonsiliasi dengan Kalender AD-05 per product_id (API & aturan murni seluruh basis data)', async () => {
  const report = [];
  const allItems = (await rows(`SELECT oi.product_id, oi.quantity, o.order_status, DATE_FORMAT(o.ready_date, '%Y-%m-%d') AS ready_date,
    p.availability_type FROM order_items oi JOIN orders o ON o.order_id = oi.order_id JOIN products p ON p.product_id = oi.product_id`))
    .map((r) => ({ ...r, product_id: String(r.product_id), quantity: Number(r.quantity) }));
  for (let n = -2; n <= 5; n += 1) {
    const date = day(n);
    const cal = await call(server, 'GET', `/api/admin/calendar?month=${date.slice(0, 7)}&date=${date}`, { userId: owner });
    assert.equal(cal.status, 200);
    assert.equal(cal.body.data.selected.date, date);
    const groups = cal.body.data.selected.groups;
    assert.ok(!groups.some((g) => g.availability_type === 'ready'), 'kalender tanpa grup ready');
    const calendarQty = {};
    for (const g of groups) {
      for (const o of g.orders) {
        if (['dikonfirmasi', 'sedang_disiapkan'].includes(o.order_status)) calendarQty[g.product_id] = (calendarQty[g.product_id] ?? 0) + o.quantity;
      }
    }
    // (a) aturan murni atas seluruh isi basis data (termasuk data seed & suite lain): q(p, D) pre-order/custom
    const pureQty = {};
    if (n >= 0) {
      const { daily } = collectProductQuantities({ todayKey: T, date, orderItems: allItems, readyPlans: [] });
      for (const [productId, qty] of daily) pureQty[productId] = Number(qty);
      assert.deepEqual(pureQty, Object.fromEntries(Object.entries(calendarQty).filter(([, q]) => q > 0)), `aturan murni ${date}`);
      // (b) API FR-40: bahan satuan (takaran 1) → daily_need = unit produk uji
      const data = (await getReq(`?date=${date}`)).body.data;
      assert.equal(rowOf(data, ids.ma).daily_need, calendarQty[ids.pa] ?? 0, `PA ${date}`);
      assert.equal(rowOf(data, ids.mc).daily_need, calendarQty[ids.pc] ?? 0, `PC ${date}`);
      const pb = data.products_without_recipe.find((p) => p.product_id === ids.pb);
      assert.equal(pb?.daily_quantity ?? 0, calendarQty[ids.pb] ?? 0, `PB ${date}`);
    }
    // kalender per desain: PC tersusun dari dua grup (d1, d2) yang dijumlahkan
    if (n === 3) assert.deepEqual(groups.filter((g) => g.product_id === ids.pc).map((g) => g.design_id).sort(), [ids.d1, ids.d2].sort());
    // tanggal lampau: kalender tetap menampilkan, FR-40 memasukkannya sebagai tertunggak (bukan harian)
    if (n === -2) assert.equal(calendarQty[ids.pa], 4);
    report.push({ date, products: Object.keys(calendarQty).length, test: { pa: calendarQty[ids.pa] ?? 0, pc: calendarQty[ids.pc] ?? 0 } });
  }
  record(FILE, 'R3', { dates: report });
});

test('R4 AC-40.8/AC-40.12: GET tidak mengubah data (CHECKSUM); Stok Masuk AD-07 langsung tercermin', async () => {
  const before = await checksums();
  for (const date of [T, day(1), day(3)]) assert.equal((await getReq(`?date=${date}`)).status, 200);
  assert.equal((await getReq(`?date=${day(30)}`)).status, 400);
  assert.deepEqual(await checksums(), before);
  const stockIn = await call(server, 'POST', `/api/admin/raw-materials/${ids.mx}/stock-in`, { userId: staff, body: { qty: '0.05' } });
  assert.equal(stockIn.status, 200, JSON.stringify(stockIn.body));
  const row = rowOf((await getReq(`?date=${day(3)}`)).body.data, ids.mx);
  assert.deepEqual([row.stock, row.remaining, row.shortage, row.status], [1.2, 0.03, 0, 'cukup']);
  await db.$executeRawUnsafe("UPDATE raw_materials SET min_stock = '0.03' WHERE material_id = ?", ids.mx);
  assert.equal(rowOf((await getReq(`?date=${day(3)}`)).body.data, ids.mx).status, 'menipis', 'sisa = minimum → menipis');
  record(FILE, 'R4', { checksumsUnchanged: true, afterStockIn: row });
});

test('R5 AC-40.11 + otorisasi: hari ini WIB, batas jendela, 400, 401, 403', async () => {
  const res = await getReq('');
  assert.deepEqual([res.status, res.body.data.date, res.body.data.window], [200, T, { from: T, to: day(29) }]);
  assert.equal((await getReq(`?date=${day(29)}`)).status, 200);
  for (const [q, msg] of [[`?date=${day(-1)}`, 'Tanggal di luar rentang.'], [`?date=${day(30)}`, 'Tanggal di luar rentang.'],
    ['?date=2026-02-30', 'Tanggal tidak valid.'], ['?date=x', 'Tanggal tidak valid.']]) {
    const r = await getReq(q);
    assert.deepEqual([r.status, r.body.message], [400, msg], q);
  }
  assert.equal((await call(server, 'GET', '/api/admin/material-requirements')).status, 401);
  assert.equal((await getReq('', customer)).status, 403);
  assert.equal((await getReq('', owner)).status, 200);
});

test('R6 MILLI_PRECISION_LOST di MySQL: 500 + kode + pesan aman, tanpa data; detail di log server', async () => {
  await insertProduct('px', 'ready');
  await db.$executeRawUnsafe("INSERT INTO product_materials (product_id, material_id, qty_per_unit) VALUES (?, ?, '9999999.999')", ids.px, ids.mr);
  await db.$executeRawUnsafe('INSERT INTO daily_stocks (product_id, stock_date, qty_planned, qty_sold) VALUES (?, ?, 2147483647, 0)', ids.px, T);
  try {
    const res = await getReq(`?date=${T}`);
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { status: 'error', code: 'MILLI_PRECISION_LOST', message: 'Hasil perhitungan tidak dapat direpresentasikan secara aman.' });
    assert.match(server.readLog(), /MILLI_PRECISION_LOST/);
    record(FILE, 'R6', { status: res.status, body: res.body });
  } finally {
    // bersihkan agar suite lain / putaran berikut tidak terkena nilai ekstrem
    await db.$executeRawUnsafe('DELETE FROM daily_stocks WHERE product_id = ?', ids.px);
    await db.$executeRawUnsafe('DELETE FROM product_materials WHERE product_id = ?', ids.px);
  }
  assert.equal((await getReq(`?date=${T}`)).status, 200);
});
