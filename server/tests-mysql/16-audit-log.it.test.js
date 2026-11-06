// tests-mysql/16-audit-log.it.test.js
// Step 6.5 C5 · FR-37 — audit log aktivitas admin pada MySQL 8 sungguhan (InnoDB; Prisma palsu bukan bukti locking).
// Data uji (produk, varian, opsi, bahan, stok, pesanan) disiapkan lewat SQL/checkout asli; AKSI yang diuji lewat HTTP asli.
// A0  created_at DATETIME(0): recordAudit membulatkan ke bawah (MySQL sendiri membulatkan ke terdekat).
// A1  setiap titik audit (Staf & Owner) → isi baris benar; nilai sama / data baru / 400 / 409 → tanpa audit.
// A2  trigger menolak INSERT audit_logs → 500 & perubahan bisnis di-rollback (per jenis operasi).
// A3  dua admin bersamaan dengan nilai BERBEDA (harga, rencana stok, stok masuk) → 2 audit, pelaku masing-masing.
// A4  10× Selesai bersamaan (Staf & Owner) → 1 audit, pelaku = pemenang.
// A5  B3 deterministik: akun DINONAKTIFKAN (commit) SEBELUM FOR SHARE pelaku → 401 SESSION_INVALID, tanpa perubahan;
//     rollback penonaktifan → 200 + audit (master data, AD-04 status, tandai lunas).
// A6  B3 deterministik: FOR SHARE pelaku SUDAH diperoleh → PATCH nonaktif asli menunggu → transaksi admin commit + audit →
//     PATCH 200 → request berikutnya 401 (master data & AD-04).
// A7  R1: master data × ubah status akun (users X → store_settings X) → 0 deadlock (kontrol negatif: kunci pelaku sesudah
//     store_settings → deadlock nyata).
// A8  R2 tiga pihak: tandai lunas × ubah status akun × checkout pelanggan lain → 0 deadlock (kontrol negatif: tanpa kunci
//     pelaku di awal + UPDATE payments WHERE order_id → deadlock nyata).
// A9  akses ditolak (pelanggan, tanpa token, akun nonaktif) → tanpa audit.
// A10 beban × 15 campuran (audit + PATCH status akun + checkout + job + simulasi) → tanpa 5xx, 0 deadlock, audit = sukses.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  APP_URL, db, rows, holdTransaction, waitForAppLockWait, appLockWaits, appHeldLocks, innodbMetrics, latestDeadlockSection, sleep, record,
} = require('./helpers/context');
const { startServer, call } = require('./helpers/server');
const { createUser, unique, prepareOrder, tally } = require('./helpers/fixtures');
const { createAutoCancelFixtures } = require('./helpers/autoCancelFixtures');

process.env.DATABASE_URL = APP_URL;
const appPrisma = require('../src/lib/prisma');
const job = require('../src/jobs/autoCancelOrders');
const { recordAudit } = require('../src/services/auditLog.service');

const FILE = '16-audit-log';
const ROUNDS_A10 = Number(process.env.C4_ROUNDS_A10 || 15);
const INACTIVE = 'Akun tidak ditemukan atau tidak aktif.';
let server;
let owner;
let staff;
let ownerB;
const fx = createAutoCancelFixtures({ label: 'C5', getServer: () => server });
const ids = {};

test.before(async () => {
  await fx.setup();
  server = await startServer(FILE);
  owner = await createUser('owner');
  ownerB = await createUser('owner');
  staff = await createUser('staf');
  // Data uji master: produk ready + varian, opsi custom cake, bahan baku, stok harian hari ini
  ids.product = fx.state.readyProduct;
  await db.$executeRawUnsafe("INSERT INTO product_variants (product_id, name, extra_price, is_active) VALUES (?, 'Ekstra C5', 2000, 1)", ids.product);
  ids.variant = (await rows('SELECT variant_id AS id FROM product_variants WHERE product_id = ? ORDER BY variant_id DESC LIMIT 1', ids.product))[0].id;
  await db.$executeRawUnsafe("INSERT INTO custom_options (option_group, name, description, extra_price, image_url, is_active) VALUES ('rasa', ?, NULL, 10000, NULL, 1)", unique('Rasa C5 '));
  ids.option = (await rows("SELECT option_id AS id FROM custom_options WHERE name LIKE 'Rasa C5 %' ORDER BY option_id DESC LIMIT 1"))[0].id;
  await db.$executeRawUnsafe('INSERT INTO raw_materials (name, unit, stock, min_stock) VALUES (?, \'kg\', 100, 10)', unique('Bahan C5 '));
  ids.material = (await rows("SELECT material_id AS id FROM raw_materials WHERE name LIKE 'Bahan C5 %' ORDER BY material_id DESC LIMIT 1"))[0].id;
  ids.stock = (await rows('SELECT stock_id AS id FROM daily_stocks WHERE product_id = ? AND stock_date = ?', ids.product, fx.today()))[0].id;
  ids.productName = (await rows('SELECT name FROM products WHERE product_id = ?', ids.product))[0].name;
  ids.optionName = (await rows('SELECT name FROM custom_options WHERE option_id = ?', ids.option))[0].name;
  ids.materialName = (await rows('SELECT name FROM raw_materials WHERE material_id = ?', ids.material))[0].name;
});
test.after(async () => {
  try { fx.mysqlCli('DROP TRIGGER IF EXISTS c5_fail_audit;'); } catch { /* abaikan */ }
  await server?.stop();
  await appPrisma.$disconnect();
  await db.$disconnect();
});

// ── Alat ─────────────────────────────────────────────────────────────────────────────────────────

const lastLogId = async () => Number((await rows('SELECT COALESCE(MAX(log_id), 0) AS n FROM audit_logs'))[0].n);
const auditsSince = async (base) => (await rows(`SELECT user_id, action, entity, entity_id, created_at FROM audit_logs
  WHERE log_id > ? ORDER BY log_id`, base)).map((a) => [String(a.user_id), a.action, a.entity, String(a.entity_id)]);
const price = async () => (await rows('SELECT price FROM products WHERE product_id = ?', ids.product))[0].price;
const planned = async () => Number((await rows('SELECT qty_planned AS n FROM daily_stocks WHERE stock_id = ?', ids.stock))[0].n);
const materialStock = async () => (await rows('SELECT stock FROM raw_materials WHERE material_id = ?', ids.material))[0].stock;

const productBody = (p, extra = 2000) => ({
  name: ids.productName, category_id: 3, description: 'Produk uji C5', ingredients: '', allergens: '', price: String(p),
  availability_type: 'ready', lead_time_days: 0, is_active: true,
  variants: [{ variant_id: String(ids.variant), name: 'Ekstra C5', extra_price: String(extra), is_active: true }],
});
const putPrice = (actor, p, extra) => call(server, 'PUT', `/api/admin/products/${ids.product}`, { userId: actor, body: productBody(p, extra) });
const putOption = (actor, extra) => call(server, 'PUT', `/api/admin/custom-options/${ids.option}`, {
  userId: actor, body: { option_group: 'rasa', name: ids.optionName, description: null, extra_price: String(extra), is_active: true },
});
const putPlan = (actor, qty) => call(server, 'PUT', '/api/admin/stocks/today', { userId: actor, body: { plans: [{ product_id: String(ids.product), qty_planned: qty }] } });
const putMaterial = (actor, stock, expected) => call(server, 'PUT', `/api/admin/raw-materials/${ids.material}`, {
  userId: actor, body: { name: ids.materialName, unit: 'kg', stock: String(stock), ...(expected != null ? { expected_stock: String(expected) } : {}), min_stock: '10' },
});
const stockIn = (actor, qty) => call(server, 'POST', `/api/admin/raw-materials/${ids.material}/stock-in`, { userId: actor, body: { qty: String(qty) } });
const changeStatus = (actor, number, body) => call(server, 'PATCH', `/api/admin/orders/${number}/status`, { userId: actor, body });
const markPaid = (actor, number) => call(server, 'PATCH', `/api/admin/orders/${number}/mark-paid`, { userId: actor });
const setActive = (actor, target, isActive) => call(server, 'PATCH', `/api/admin/staff/${target}/active`, { userId: actor, body: { is_active: isActive } });

/** Pesanan Bayar di Toko Siap Diambil belum lunas (tandai lunas sah) — checkout asli + penyiapan SQL */
async function payAtStoreReady() {
  const number = await fx.placeOrder(await fx.customerWithBenefits());
  await fx.makePayAtStore(number, { status: 'siap_diambil', readyDate: fx.today() });
  return number;
}
/** Pesanan pickup lunas berstatus tertentu (AD-04) */
async function paidOrder(status) {
  const number = await fx.placeOrder(await fx.customerWithBenefits());
  const prepared = await prepareOrder(number, status);
  return { number, pickupCode: prepared.pickup_code, orderId: prepared.order_id, userId: prepared.user_id };
}
const orderState = async (number) => (await rows(`SELECT o.order_status AS s, o.payment_status AS ps, p.status AS pay
  FROM orders o JOIN payments p ON p.order_id = o.order_id WHERE o.order_number = ?`, number))[0];

// ── A0 ───────────────────────────────────────────────────────────────────────────────────────────

test('A0 created_at DATETIME(0): recordAudit menyimpan detik penuh ke bawah; INSERT mentah dengan .987 dibulatkan MySQL ke atas', async () => {
  const now = new Date('2026-11-06T10:20:30.987Z');
  await appPrisma.$transaction(async (tx) => {
    await recordAudit(tx, { actorId: staff, action: 'update_product_price', entity: 'products', entityId: ids.product, now });
  });
  const [mine] = await rows("SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS t FROM audit_logs WHERE user_id = ? ORDER BY log_id DESC LIMIT 1", staff);
  // Kontrol: nilai yang sama tanpa pembulatan aplikasi → MySQL membulatkan ke detik terdekat (31)
  await appPrisma.auditLog.create({ data: { userId: BigInt(staff), action: 'a0_control', entity: 'products', entityId: BigInt(ids.product), createdAt: now } });
  const [raw] = await rows("SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS t FROM audit_logs WHERE action = 'a0_control' ORDER BY log_id DESC LIMIT 1");
  await db.$executeRawUnsafe("DELETE FROM audit_logs WHERE action = 'a0_control' OR (user_id = ? AND created_at = '2026-11-06 10:20:30')", staff);
  record(FILE, 'A0', { mine: mine.t, raw: raw.t });
  assert.equal(mine.t, '2026-11-06 10:20:30', 'dibulatkan ke bawah oleh aplikasi');
  assert.equal(raw.t, '2026-11-06 10:20:31', 'tanpa pembulatan aplikasi MySQL membulatkan ke atas — alasan toAuditTime');
});

// ── A1 ───────────────────────────────────────────────────────────────────────────────────────────

test('A1 setiap titik audit: pelaku, action, entity (tabel), entity_id (PK), created_at; nilai sama / data baru / 400 / 409 → tanpa audit', async () => {
  let base = await lastLogId();
  // Tanpa audit
  assert.equal((await putPrice(staff, await price(), 2000)).status, 200, 'harga & harga varian sama');
  assert.equal((await putOption(staff, 10000)).status, 200);
  assert.equal((await putPlan(staff, await planned())).status, 200);
  assert.equal((await putMaterial(staff, await materialStock())).status, 200, 'edit tanpa koreksi stok');
  assert.equal((await call(server, 'POST', '/api/admin/raw-materials', { userId: staff, body: { name: unique('Bahan baru '), unit: 'g', stock: '5', min_stock: '1' } })).status, 201);
  assert.equal((await putPrice(staff, 0, 2000)).status, 400);
  assert.equal((await putMaterial(staff, 50, 1)).status, 409, 'expected_stock basi');
  assert.equal((await stockIn(staff, -1)).status, 400);
  assert.deepEqual(await auditsSince(base), []);

  base = await lastLogId();
  const started = Math.floor(Date.now() / 1000);
  assert.equal((await putPrice(staff, 31000, 2000)).status, 200);
  assert.equal((await putPrice(owner, 31000, 2500)).status, 200);
  assert.equal((await putOption(owner, 12500)).status, 200);
  assert.equal((await putPlan(staff, 90077)).status, 200);
  const before = await materialStock();
  assert.equal((await putMaterial(owner, 90, before)).status, 200);
  assert.equal((await stockIn(staff, '2.50')).status, 200);
  const { number, pickupCode, orderId } = await paidOrder('siap_diambil');
  assert.equal((await changeStatus(owner, number, { from: 'siap_diambil', to: 'selesai', pickup_code: pickupCode })).status, 200);
  const store = await payAtStoreReady();
  assert.equal((await markPaid(staff, store)).status, 200);
  const storeId = await fx.orderIdOf(store);
  const ended = Math.floor(Date.now() / 1000);
  // Kembalikan harga varian (penyiapan, bukan aksi yang diuji) agar skenario berikutnya mengubah harga produk saja
  await db.$executeRawUnsafe('UPDATE product_variants SET extra_price = 2000 WHERE variant_id = ?', ids.variant);

  const got = await auditsSince(base);
  const times = (await rows('SELECT UNIX_TIMESTAMP(created_at) AS t FROM audit_logs WHERE log_id > ?', base)).map((r) => Number(r.t));
  record(FILE, 'A1', { got });
  assert.deepEqual(got, [
    [staff, 'update_product_price', 'products', String(ids.product)],
    [owner, 'update_variant_price', 'product_variants', String(ids.variant)],
    [owner, 'update_custom_option_price', 'custom_options', String(ids.option)],
    [staff, 'update_daily_stock_plan', 'daily_stocks', String(ids.stock)],
    [owner, 'correct_raw_material_stock', 'raw_materials', String(ids.material)],
    [staff, 'raw_material_stock_in', 'raw_materials', String(ids.material)],
    [owner, 'update_order_status', 'orders', String(orderId)],
    [staff, 'mark_order_paid', 'orders', String(storeId)],
  ]);
  assert.ok(times.every((t) => Number.isInteger(t) && t >= started && t <= ended), `created_at dalam rentang request: ${times}`);
});

// ── A2 ───────────────────────────────────────────────────────────────────────────────────────────

test('A2 INSERT audit_logs ditolak (trigger) → 500 dan seluruh perubahan bisnis di-rollback, untuk setiap jenis operasi', async () => {
  const base = await lastLogId();
  const { number, pickupCode } = await paidOrder('siap_diambil');
  const store = await payAtStoreReady();
  const before = {
    price: await price(), plan: await planned(), stock: await materialStock(),
    option: (await rows('SELECT extra_price FROM custom_options WHERE option_id = ?', ids.option))[0].extra_price,
    order: await orderState(number), store: await orderState(store),
    histories: Number((await rows('SELECT COUNT(*) AS n FROM order_status_histories WHERE order_id = (SELECT order_id FROM orders WHERE order_number = ?)', number))[0].n),
  };
  fx.mysqlCli(`DELIMITER //
    CREATE TRIGGER c5_fail_audit BEFORE INSERT ON audit_logs FOR EACH ROW
    BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'uji rollback C5'; END//
    DELIMITER ;`);
  const statuses = [];
  try {
    statuses.push((await putPrice(staff, 39000, 2000)).status);
    statuses.push((await putOption(staff, 19000)).status);
    statuses.push((await putPlan(staff, 90055)).status);
    statuses.push((await putMaterial(staff, 60, before.stock)).status);
    statuses.push((await stockIn(staff, 3)).status);
    statuses.push((await changeStatus(staff, number, { from: 'siap_diambil', to: 'selesai', pickup_code: pickupCode })).status);
    statuses.push((await markPaid(staff, store)).status);
  } finally {
    fx.mysqlCli('DROP TRIGGER IF EXISTS c5_fail_audit;');
  }
  const after = {
    price: await price(), plan: await planned(), stock: await materialStock(),
    option: (await rows('SELECT extra_price FROM custom_options WHERE option_id = ?', ids.option))[0].extra_price,
    order: await orderState(number), store: await orderState(store),
    histories: Number((await rows('SELECT COUNT(*) AS n FROM order_status_histories WHERE order_id = (SELECT order_id FROM orders WHERE order_number = ?)', number))[0].n),
  };
  record(FILE, 'A2', { statuses, before, after });
  assert.deepEqual(statuses, [500, 500, 500, 500, 500, 500, 500]);
  assert.deepEqual(after, before, 'tanpa data parsial');
  assert.deepEqual(await auditsSince(base), []);
});

// ── A3 / A4 ──────────────────────────────────────────────────────────────────────────────────────

test('A3 dua admin bersamaan dengan nilai berbeda → 2 audit (pelaku masing-masing), nilai akhir = yang commit terakhir', async () => {
  const metricsBefore = await innodbMetrics();
  const results = {};
  // Harga produk: 41000 (Staf) vs 42000 (Owner)
  let base = await lastLogId();
  const [p1, p2] = await Promise.all([putPrice(staff, 41000, 2000), putPrice(owner, 42000, 2000)]);
  let logs = await auditsSince(base);
  results.price = { statuses: [p1.status, p2.status], logs, final: await price() };
  assert.deepEqual([p1.status, p2.status], [200, 200]);
  assert.equal(logs.length, 2);
  assert.deepEqual(logs.map((l) => l[0]).sort(), [owner, staff].sort());
  assert.equal(Number(results.price.final), logs[1][0] === owner ? 42000 : 41000, 'nilai akhir milik audit terakhir');
  // Rencana stok: 90061 (Staf) vs 90062 (Owner) — tetap di atas qty_sold checkout uji
  base = await lastLogId();
  const [s1, s2] = await Promise.all([putPlan(staff, 90061), putPlan(owner, 90062)]);
  logs = await auditsSince(base);
  results.plan = { statuses: [s1.status, s2.status], logs, final: await planned() };
  assert.deepEqual([s1.status, s2.status], [200, 200]);
  assert.equal(logs.length, 2);
  assert.equal(results.plan.final, logs[1][0] === owner ? 90062 : 90061);
  // Stok masuk: 1.25 (Staf) & 2.75 (Owner) → keduanya tercatat, stok = jumlah
  base = await lastLogId();
  const stockBefore = Number(await materialStock());
  const [i1, i2] = await Promise.all([stockIn(staff, '1.25'), stockIn(owner, '2.75')]);
  logs = await auditsSince(base);
  results.stockIn = { statuses: [i1.status, i2.status], logs, final: await materialStock() };
  assert.deepEqual([i1.status, i2.status], [200, 200]);
  assert.deepEqual(logs.map((l) => l[0]).sort(), [owner, staff].sort());
  assert.equal(Number(results.stockIn.final), stockBefore + 4);
  const deadlocks = (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks;
  record(FILE, 'A3', { ...results, deadlocks });
  assert.equal(deadlocks, 0);
});

test('A4 10× Selesai bersamaan (Staf & Owner) → 1 sukses, tepat 1 audit dengan pelaku pemenang', async () => {
  const { number, pickupCode, orderId } = await paidOrder('siap_diambil');
  const base = await lastLogId();
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => changeStatus(i % 2 ? owner : staff, number, {
    from: 'siap_diambil', to: 'selesai', pickup_code: pickupCode,
  })));
  const logs = await auditsSince(base);
  const [winner] = await rows("SELECT changed_by FROM order_status_histories WHERE order_id = ? AND status = 'selesai'", orderId);
  record(FILE, 'A4', { statuses: tally(results), logs });
  assert.deepEqual(tally(results), { 200: 1, 409: 9 });
  assert.deepEqual(logs, [[String(winner.changed_by), 'update_order_status', 'orders', String(orderId)]]);
});

// ── A5 / A6: B3 deterministik ────────────────────────────────────────────────────────────────────

/** Transaksi peniru AD-11 ubah status akun: kunci X baris target lalu UPDATE is_active = 0 (belum commit) */
const holdDeactivation = (target) => holdTransaction(async (tx) => {
  await tx.$queryRawUnsafe('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', target);
  await tx.$executeRawUnsafe('UPDATE users SET is_active = 0 WHERE user_id = ?', target);
});

for (const [label, outcome] of [['commit', 401], ['rollback', 200]]) {
  test(`A5 penonaktifan pelaku ${label} SEBELUM FOR SHARE pelaku → ${outcome === 401 ? '401 SESSION_INVALID tanpa perubahan' : '200 + audit'} (master data, AD-04, tandai lunas)`, async () => {
    const results = [];
    for (const name of ['harga', 'status', 'tandai lunas']) {
      const actor = await createUser('staf');
      let run;
      let snapshot;
      if (name === 'harga') {
        run = () => putPrice(actor, 44000 + results.length * 10, 2000);
        snapshot = async () => String(await price());
      } else if (name === 'status') {
        const { number } = await paidOrder('dikonfirmasi');
        run = () => changeStatus(actor, number, { from: 'dikonfirmasi', to: 'sedang_disiapkan' });
        snapshot = async () => JSON.stringify(await orderState(number));
      } else {
        const store = await payAtStoreReady();
        run = () => markPaid(actor, store);
        snapshot = async () => JSON.stringify(await orderState(store));
      }
      const before = await snapshot();
      const base = await lastLogId();
      const hold = holdDeactivation(actor);
      await hold.ready;
      const pending = run(); // middleware auth (pembacaan biasa) masih melihat akun aktif
      const waits = await waitForAppLockWait((w) => w.waiting_table === 'users' && w.waiting_data === String(actor));
      const mode = waits.find((w) => w.waiting_table === 'users').waiting_mode;
      if (outcome === 401) await hold.release();
      else await hold.release(() => { throw new Error('rollback penonaktifan'); }).catch(() => {});
      const res = await pending;
      const logs = await auditsSince(base);
      results.push({ name, status: res.status, code: res.body.code, mode, logs: logs.length });
      if (outcome === 401) {
        assert.deepEqual([res.status, res.body.code, res.body.message], [401, 'SESSION_INVALID', INACTIVE], name);
        assert.equal(await snapshot(), before, `${name}: tanpa perubahan`);
        assert.deepEqual(logs, [], `${name}: tanpa audit`);
      } else {
        assert.equal(res.status, 200, `${name}: ${JSON.stringify(res.body)}`);
        assert.equal(logs.length, 1, `${name}: 1 audit`);
        assert.equal(logs[0][0], actor);
      }
      assert.match(mode, /^S/, 'transaksi admin menunggu kunci S (FOR SHARE) baris pelaku');
    }
    record(FILE, `A5-${label}`, { results });
  });
}

test('A6 FOR SHARE pelaku SUDAH diperoleh → PATCH nonaktif asli menunggu → transaksi admin commit + audit → PATCH 200 → request berikutnya 401', async () => {
  const results = [];
  for (const kind of ['master data', 'AD-04']) {
    const actor = await createUser('staf');
    const base = await lastLogId();
    let blocker;
    let pending;
    if (kind === 'master data') {
      // Tahan transaksi admin SETELAH kunci pelaku: store_settings dipegang harness
      blocker = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT setting_id FROM store_settings WHERE setting_id = 1 FOR UPDATE'));
      await blocker.ready;
      pending = putPrice(actor, 45500 + results.length, 2000);
      await waitForAppLockWait((w) => w.waiting_table === 'store_settings');
    } else {
      // AD-04: tahan setelah kunci pelaku di kunci S baris PELANGGAN (FK notifikasi) yang dipegang X oleh harness
      const { number, userId } = await paidOrder('dikonfirmasi');
      blocker = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', userId));
      await blocker.ready;
      pending = changeStatus(actor, number, { from: 'dikonfirmasi', to: 'sedang_disiapkan' });
      await waitForAppLockWait((w) => w.waiting_table === 'users' && w.waiting_data === String(userId));
    }
    const actorConn = (await appHeldLocks()).filter((l) => l.table_name === 'users' && String(l.lock_data) === String(actor) && /^S/.test(l.lock_mode));
    const patch = setActive(owner, actor, false);
    const patchWait = await waitForAppLockWait((w) => w.waiting_table === 'users' && w.waiting_data === String(actor) && /^X/.test(w.waiting_mode));
    await blocker.release();
    const [res, patchRes] = await Promise.all([pending, patch]);
    const logs = await auditsSince(base);
    const next = await putPrice(actor, 46000, 2000);
    results.push({ kind, actorHeldS: actorConn.length > 0, patchWaitedX: patchWait.length > 0, res: res.status, patch: patchRes.status, logs, next: [next.status, next.body.code] });
    assert.ok(actorConn.length > 0, `${kind}: transaksi admin memegang S baris pelaku`);
    assert.equal(res.status, 200, `${kind}: transaksi admin selesai lebih dulu`);
    assert.equal(patchRes.status, 200, `${kind}: penonaktifan lanjut setelahnya`);
    assert.equal(patchRes.body.data.is_active, false);
    assert.equal(logs.length, 1);
    assert.equal(logs[0][0], actor);
    assert.deepEqual([next.status, next.body.code], [401, 'SESSION_INVALID'], `${kind}: request berikutnya ditolak`);
  }
  record(FILE, 'A6', { results });
});

// ── A7 / A8: urutan kunci (kontrol negatif dijalankan dengan kode yang diubah sementara) ──────────

test('A7 R1 master data × ubah status akun pelaku (users X → store_settings X) → keduanya commit, 0 deadlock', async () => {
  const results = [];
  for (let round = 0; round < 3; round += 1) {
    const actor = await createUser('staf');
    const metricsBefore = await innodbMetrics();
    const toggle = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', actor));
    await toggle.ready;
    const pending = putPrice(actor, 47000 + round, 2000);
    await waitForAppLockWait((w) => w.waiting_table === 'users' && w.waiting_data === String(actor));
    const toggleDone = await toggle.release((tx) => tx.$queryRawUnsafe('SELECT setting_id FROM store_settings WHERE setting_id = 1 FOR UPDATE'))
      .then(() => 'commit', (e) => `ERR ${String(e.meta?.message ?? e.message).slice(-90)}`);
    const res = await pending;
    await sleep(100);
    const deadlocks = (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks;
    const result = { round, toggle: toggleDone, save: [res.status, res.body.message], deadlocks };
    if (deadlocks) result.latestDeadlock = await latestDeadlockSection();
    results.push(result);
    assert.equal(toggleDone, 'commit');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(deadlocks, 0);
  }
  record(FILE, 'A7', { results });
});

test('A8 R2 tiga pihak: tandai lunas × ubah status akun pelaku × checkout pelanggan LAIN → semua commit, 0 deadlock', async () => {
  const results = [];
  for (let round = 0; round < 3; round += 1) {
    const actor = await createUser('staf');
    const other = await createUser('customer');
    const store = await payAtStoreReady(); // pesanan terbaru → entri terakhir indeks payments_order_id_fkey
    const metricsBefore = await innodbMetrics();
    const toggle = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', actor));
    const checkout = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT setting_id FROM store_settings WHERE setting_id = 1 FOR UPDATE'));
    await toggle.ready;
    await checkout.ready;
    const pending = markPaid(actor, store);
    await waitForAppLockWait((w) => w.waiting_table === 'users' && w.waiting_data === String(actor));
    const conn = (await appLockWaits()).find((w) => w.waiting_table === 'users' && w.waiting_data === String(actor)).waiting_conn;
    const held = (await appHeldLocks()).filter((l) => String(l.conn) === String(conn)).map((l) => `${l.table_name}:${l.index_name ?? ''}:${l.lock_mode}`);
    // Ubah status akun lanjut ke store_settings (menunggu checkout); checkout lanjut INSERT pesanan + pembayaran baru
    const toggleDone = toggle.release((tx) => tx.$queryRawUnsafe('SELECT setting_id FROM store_settings WHERE setting_id = 1 FOR UPDATE'))
      .then(() => 'commit', (e) => `ERR ${String(e.meta?.message ?? e.message).slice(-90)}`);
    await sleep(200);
    const checkoutDone = await checkout.release(async (tx) => {
      await tx.$executeRawUnsafe(`INSERT INTO orders (order_number, user_id, fulfillment_type, ready_date, time_slot, subtotal,
        shipping_fee, voucher_discount, points_used, points_discount, total, payment_option, payment_status, order_status, created_at)
        VALUES (?, ?, 'pickup', CURDATE(), '09.00–11.00', 10000, 0, 0, 0, 0, 10000, 'online', 'unpaid', 'menunggu_pembayaran', NOW())`,
      unique('A8-').slice(0, 20), other);
      const [{ id }] = await tx.$queryRawUnsafe('SELECT LAST_INSERT_ID() AS id');
      await tx.$executeRawUnsafe("INSERT INTO payments (order_id, method_code, amount, status, expired_at) VALUES (?, 'qris', 10000, 'pending', NOW() + INTERVAL 30 MINUTE)", id);
    }).then(() => 'commit', (e) => `ERR ${String(e.meta?.message ?? e.message).slice(-90)}`);
    const [res, tDone] = await Promise.all([pending, toggleDone]);
    await sleep(100);
    const deadlocks = (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks;
    const result = { round, held, toggle: tDone, checkout: checkoutDone, markPaid: [res.status, res.body.message], deadlocks };
    if (deadlocks) result.latestDeadlock = await latestDeadlockSection();
    results.push(result);
    assert.ok(!held.some((l) => l.startsWith('payments:')), `tandai lunas belum menyentuh payments saat menunggu pelaku: ${held}`);
    assert.deepEqual([tDone, checkoutDone, res.status], ['commit', 'commit', 200]);
    assert.equal(deadlocks, 0);
  }
  record(FILE, 'A8', { results });
});

// ── A9 / A10 ─────────────────────────────────────────────────────────────────────────────────────

test('A9 akses ditolak: pelanggan 403, tanpa token 401, akun admin nonaktif 401 SESSION_INVALID → tanpa audit & tanpa perubahan', async () => {
  const base = await lastLogId();
  const before = String(await price());
  const customer = await createUser('customer');
  const inactive = await createUser('staf', { active: false });
  assert.equal((await putPrice(customer, 48000, 2000)).status, 403);
  assert.equal((await call(server, 'PUT', `/api/admin/products/${ids.product}`, { body: productBody(48000) })).status, 401);
  const res = await putPrice(inactive, 48000, 2000);
  assert.deepEqual([res.status, res.body.code], [401, 'SESSION_INVALID']);
  assert.equal(String(await price()), before);
  assert.deepEqual(await auditsSince(base), []);
});

test(`A10 beban × ${ROUNDS_A10}: audit + ubah status akun + checkout + job + simulasi bersamaan → tanpa 5xx, 0 deadlock, audit = perubahan berhasil`, async () => {
  const metricsBefore = await innodbMetrics();
  const statuses = {};
  const violations = [];
  const bump = (k) => { statuses[k] = (statuses[k] ?? 0) + 1; };
  const toggled = await createUser('staf'); // dinonaktifkan/diaktifkan bolak-balik oleh Owner B selagi ikut mengubah data
  for (let round = 0; round < ROUNDS_A10; round += 1) {
    const base = await lastLogId();
    const customer = await fx.customerWithBenefits();
    const { number, pickupCode } = await paidOrder('siap_diambil');
    const store = await payAtStoreReady();
    const online = await fx.placeOrder(customer);
    const body = await fx.orderBody(customer);
    const expected = {};
    const ops = [
      ['price', staff, () => putPrice(staff, 50000 + round * 2, 2000)],
      ['price2', owner, () => putPrice(owner, 50001 + round * 2, 2000)],
      ['plan', toggled, () => putPlan(toggled, 90100 + round)],
      ['stockIn', owner, () => stockIn(owner, '1.00')],
      ['status', staff, () => changeStatus(staff, number, { from: 'siap_diambil', to: 'selesai', pickup_code: pickupCode })],
      ['markPaid', toggled, () => markPaid(toggled, store)],
    ];
    const results = await Promise.all([
      ...ops.map(([, , run]) => run()),
      setActive(ownerB, toggled, round % 2 === 1),
      call(server, 'POST', '/api/orders', { userId: customer, body }),
      call(server, 'POST', `/api/payments/${online}/simulate-paid`, { userId: customer }),
      job.runAutoCancel({ now: new Date() }),
    ]);
    ops.forEach(([name], i) => { bump(`${name} ${results[i].status}`); expected[name] = results[i].status === 200; });
    bump(`toggle ${results[6].status}`);
    bump(`checkout ${results[7].status}`);
    bump(`simulate ${results[8].status}`);
    if (results[9].failed.length) violations.push({ round, jobFailed: results[9].failed });
    const logs = await auditsSince(base);
    const count = (action, actor) => logs.filter((l) => l[1] === action && (!actor || l[0] === actor)).length;
    const want = {
      price: (expected.price ? 1 : 0) + (expected.price2 ? 1 : 0),
      plan: expected.plan ? 1 : 0, stockIn: expected.stockIn ? 1 : 0, status: expected.status ? 1 : 0, markPaid: expected.markPaid ? 1 : 0,
    };
    const have = {
      price: count('update_product_price'), plan: count('update_daily_stock_plan', toggled), stockIn: count('raw_material_stock_in', owner),
      status: count('update_order_status', staff), markPaid: count('mark_order_paid', toggled),
    };
    if (JSON.stringify(want) !== JSON.stringify(have)) violations.push({ round, want, have, logs });
    // 401 hanya untuk pelaku yang sedang dinonaktifkan; transaksinya tanpa perubahan
    if (!expected.markPaid && (await orderState(store)).ps !== 'unpaid') violations.push({ round, partialMarkPaid: true });
  }
  await setActive(ownerB, toggled, true);
  await sleep(200);
  const summary = { statuses, violations, deadlocks: (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks, leftover: await appHeldLocks() };
  if (summary.deadlocks) summary.latestDeadlock = await latestDeadlockSection();
  record(FILE, 'A10', summary);
  const allowed = (k) => / (200|201|409)$/.test(k) || (/^(plan|markPaid) 401$/.test(k));
  assert.ok(Object.keys(statuses).every(allowed), JSON.stringify(statuses));
  assert.deepEqual(violations, []);
  assert.equal(summary.deadlocks, 0);
  assert.deepEqual(summary.leftover, []);
});
