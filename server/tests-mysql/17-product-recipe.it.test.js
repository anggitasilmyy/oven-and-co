// tests-mysql/17-product-recipe.it.test.js
// CR-03 CP4 · FR-39 · UC-31 · BR-13 — komposisi bahan (PUT/GET /api/admin/products/:id/materials) pada MySQL 8 sungguhan.
// R1  presisi & audit di DB nyata: DECIMAL(10,3) tersimpan eksak, respons number; isi identik / beda urutan → 0 audit;
//     "0.0015" & JSON number ditolak 400 sebelum MySQL sempat membulatkan diam-diam (0.0015 → 0.002).
// R2  CS-2/CS-3: store_settings dipegang transaksi lain → PUT menunggu di store_settings dan HANYA memegang kunci S pelaku
//     (tanpa kunci products/raw_materials/product_materials) → setelah dilepas 200.
// R3  CS-6(a): dua PUT bersamaan, isi berbeda, komposisi awal kosong & berisi → hasil = salah satu kiriman utuh, 2 audit,
//     kiriman pemenang = pelaku audit terakhir (last-write-wins menurut urutan commit).
// R4  CS-6(b)/CS-7: PUT komposisi × simpan produk AD-06 × ubah bahan AD-07 × stok masuk AD-07 × checkout, banyak putaran →
//     semua berhasil tanpa data parsial, stok masuk tepat, 0 deadlock (metrik lock_deadlocks).
// R5  CS-6(c): kegagalan disuntikkan (trigger) saat sisip komposisi / tulis audit → 500, komposisi lama utuh, 0 audit.

const test = require('node:test');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const {
  APP_URL, CONTAINER, DATABASE, db, rows, holdTransaction, waitForAppLockWait, appHeldLocks, innodbMetrics, record,
} = require('./helpers/context');
const { startServer, call } = require('./helpers/server');
const { createUser, unique, checkout } = require('./helpers/fixtures');

process.env.DATABASE_URL = APP_URL;

const FILE = '17-product-recipe';
const ROUNDS = Number(process.env.C4_ROUNDS_R17 || 10);
let server;
let staff;
let owner;
const ids = {};

test.before(async () => {
  server = await startServer(FILE);
  staff = await createUser('staf');
  owner = await createUser('owner');
  for (const key of ['p1', 'p2', 'p3']) {
    ids[`${key}Name`] = unique('Produk R17 ');
    await db.$executeRawUnsafe(`INSERT INTO products (category_id, name, description, price, availability_type, lead_time_days, is_active)
      VALUES (1, ?, 'uji CP4', 20000, 'preorder', 1, 1)`, ids[`${key}Name`]);
    ids[key] = String((await rows('SELECT product_id FROM products WHERE name = ?', ids[`${key}Name`]))[0].product_id);
  }
  for (const key of ['m1', 'm2', 'm3']) {
    ids[`${key}Name`] = unique('Bahan R17 ');
    await db.$executeRawUnsafe("INSERT INTO raw_materials (name, unit, stock, min_stock) VALUES (?, 'kg', 100, 10)", ids[`${key}Name`]);
    ids[key] = String((await rows('SELECT material_id FROM raw_materials WHERE name = ?', ids[`${key}Name`]))[0].material_id);
  }
});
test.after(async () => {
  for (const name of ['r17_fail_pm', 'r17_fail_audit']) { try { mysqlCli(`DROP TRIGGER IF EXISTS ${name};`); } catch { /* abaikan */ } }
  await server?.stop();
  await db.$disconnect();
});

// ── Alat ─────────────────────────────────────────────────────────────────────────────────────────

const put = (actor, productId, items) => call(server, 'PUT', `/api/admin/products/${productId}/materials`, { userId: actor, body: { items } });
const get = (actor, productId) => call(server, 'GET', `/api/admin/products/${productId}/materials`, { userId: actor });
const recipeOf = async (productId) => (await rows(`SELECT material_id, CAST(qty_per_unit AS CHAR) AS q FROM product_materials
  WHERE product_id = ? ORDER BY material_id`, productId)).map((r) => [String(r.material_id), r.q]).sort(); // urutan teks = asStored
const lastLogId = async () => Number((await rows('SELECT COALESCE(MAX(log_id), 0) AS n FROM audit_logs'))[0].n);
const recipeAudits = async (base, productId) => (await rows(`SELECT user_id FROM audit_logs WHERE log_id > ?
  AND action = 'update_product_recipe' AND entity = 'products' AND entity_id = ? ORDER BY log_id`, base, productId)).map((a) => String(a.user_id));
/** SQL lewat klien mysql (CREATE TRIGGER tidak didukung prepared statement Prisma, error 1295) — pola suite 16 */
function mysqlCli(sql) {
  const password = decodeURIComponent(new URL(process.env.ROOT_DATABASE_URL).password);
  const result = spawnSync('docker', ['exec', '-i', CONTAINER, 'mysql', '-uroot', `-p${password}`, DATABASE], { input: sql, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`mysql gagal: ${result.stderr}`);
}
const asStored = (items) => items.map((i) => [i.material_id, Number(i.qty_per_unit).toFixed(3)]).sort();

// ── R1 ───────────────────────────────────────────────────────────────────────────────────────────

test('R1 presisi & audit di MySQL: DECIMAL(10,3) eksak, respons number, identik → 0 audit, input > 3 desimal ditolak 400', async () => {
  const base = await lastLogId();
  const res = await put(staff, ids.p1, [{ material_id: ids.m2, qty_per_unit: '0.015' }, { material_id: ids.m1, qty_per_unit: '9999999.999' }]);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(await recipeOf(ids.p1), [[ids.m1, '9999999.999'], [ids.m2, '0.015']].sort());
  assert.deepEqual((await get(owner, ids.p1)).body.data.items.map((i) => i.qty_per_unit).sort(), [0.015, 9999999.999]);
  assert.equal((await put(owner, ids.p1, [{ material_id: ids.m1, qty_per_unit: '9999999.999' }, { material_id: ids.m2, qty_per_unit: '0.015' }])).status, 200);
  assert.deepEqual(await recipeAudits(base, ids.p1), [String(staff)], 'urutan/format berbeda, isi sama → tanpa audit');
  for (const qty of ['0.0015', 0.015]) {
    const bad = await put(staff, ids.p1, [{ material_id: ids.m2, qty_per_unit: qty }]);
    assert.equal(bad.status, 400);
  }
  assert.deepEqual(await recipeOf(ids.p1), [[ids.m1, '9999999.999'], [ids.m2, '0.015']].sort(), 'tidak ada pembulatan diam-diam MySQL');
  record(FILE, 'R1', { stored: await recipeOf(ids.p1) });
});

// ── R2 ───────────────────────────────────────────────────────────────────────────────────────────

test('R2 CS-2/CS-3: menunggu di store_settings sambil hanya memegang kunci S pelaku', async () => {
  const hold = holdTransaction(async (tx) => { await tx.$queryRaw`SELECT setting_id FROM store_settings ORDER BY setting_id LIMIT 1 FOR UPDATE`; });
  await hold.ready;
  const pending = put(staff, ids.p2, [{ material_id: ids.m1, qty_per_unit: '1.5' }]);
  const waits = await waitForAppLockWait((w) => w.waiting_table === 'store_settings');
  const held = (await appHeldLocks()).filter((l) => l.lock_type === 'RECORD' && l.lock_status === 'GRANTED');
  await hold.release();
  const res = await pending;
  record(FILE, 'R2', { waits, held });
  assert.equal(res.status, 200);
  assert.deepEqual([...new Set(held.map((l) => l.table_name))], ['users'], JSON.stringify(held));
  assert.ok(held.every((l) => l.lock_mode.startsWith('S')), 'kunci pelaku = S');
});

// ── R3 ───────────────────────────────────────────────────────────────────────────────────────────

test(`R3 CS-6(a): dua PUT bersamaan × ${ROUNDS} (awal kosong & berisi) → satu kiriman utuh, 2 audit, pemenang = commit terakhir`, async () => {
  const A = [{ material_id: ids.m1, qty_per_unit: '0.250' }, { material_id: ids.m2, qty_per_unit: '1.000' }];
  const B = [{ material_id: ids.m3, qty_per_unit: '0.333' }];
  const summary = { rounds: 0, winners: { staff: 0, owner: 0 } };
  for (let round = 0; round < ROUNDS; round += 1) {
    for (const initial of [[], [{ material_id: ids.m2, qty_per_unit: '9.999' }]]) {
      await db.$executeRawUnsafe('DELETE FROM product_materials WHERE product_id = ?', ids.p3);
      for (const r of initial) await db.$executeRawUnsafe('INSERT INTO product_materials VALUES (?, ?, ?)', ids.p3, r.material_id, r.qty_per_unit);
      const base = await lastLogId();
      const [ra, rb] = await Promise.all([put(staff, ids.p3, A), put(owner, ids.p3, B)]);
      assert.deepEqual([ra.status, rb.status], [200, 200]);
      const final = await recipeOf(ids.p3);
      const audits = await recipeAudits(base, ids.p3);
      assert.equal(audits.length, 2, 'kedua PUT mengubah isi');
      const winner = audits[audits.length - 1] === String(staff) ? A : B;
      assert.deepEqual(final, asStored(winner), 'hasil = kiriman yang commit terakhir, utuh');
      summary.rounds += 1;
      summary.winners[winner === A ? 'staff' : 'owner'] += 1;
    }
  }
  record(FILE, 'R3', summary);
});

// ── R4 ───────────────────────────────────────────────────────────────────────────────────────────

test(`R4 CS-6(b)/CS-7: PUT komposisi × AD-06 × AD-07 × stok masuk × checkout × ${ROUNDS} → semua 2xx, data utuh, 0 deadlock`, async () => {
  const customer = await createUser('customer');
  const before = await innodbMetrics();
  const stockBefore = Number((await rows('SELECT stock FROM raw_materials WHERE material_id = ?', ids.m1))[0].stock);
  const productBody = (price) => ({ name: ids.p2Name, category_id: 1, description: 'uji CP4', ingredients: '', allergens: '',
    price: String(price), availability_type: 'preorder', lead_time_days: 1, is_active: true, variants: [] });
  const payloads = [[{ material_id: ids.m1, qty_per_unit: '0.1' }], [{ material_id: ids.m1, qty_per_unit: '0.2' }, { material_id: ids.m3, qty_per_unit: '3' }]];
  const statuses = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    const results = await Promise.all([
      put(staff, ids.p2, payloads[round % 2]),
      put(owner, ids.p2, payloads[(round + 1) % 2]),
      call(server, 'PUT', `/api/admin/products/${ids.p2}`, { userId: owner, body: productBody(20000 + round) }),
      call(server, 'PUT', `/api/admin/raw-materials/${ids.m3}`, { userId: staff, body: { name: ids.m3Name, unit: 'kg', min_stock: String(10 + round) } }),
      call(server, 'POST', `/api/admin/raw-materials/${ids.m1}/stock-in`, { userId: staff, body: { qty: '1.25' } }),
      checkout(server, customer),
    ]);
    statuses.push(results.map((r) => r.status));
    results.forEach((r, i) => assert.ok(r.status === 200 || r.status === 201, `putaran ${round} langkah ${i}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`));
    const final = JSON.stringify(await recipeOf(ids.p2));
    assert.ok(payloads.some((p) => JSON.stringify(asStored(p)) === final), `putaran ${round}: komposisi campuran ${final}`);
  }
  const after = await innodbMetrics();
  const stockAfter = Number((await rows('SELECT stock FROM raw_materials WHERE material_id = ?', ids.m1))[0].stock);
  const summary = { rounds: ROUNDS, deadlocks: after.lock_deadlocks - before.lock_deadlocks, lock_timeouts: after.lock_timeouts - before.lock_timeouts, statuses };
  record(FILE, 'R4', summary);
  assert.equal(Math.round((stockAfter - stockBefore) * 100), Math.round(ROUNDS * 1.25 * 100), 'stok masuk tepat');
  assert.equal(summary.deadlocks, 0, 'CS-7: tanpa deadlock');
});

// ── R5 ───────────────────────────────────────────────────────────────────────────────────────────

test('R5 CS-6(c): kegagalan disuntikkan saat sisip komposisi / tulis audit → 500, komposisi lama utuh, 0 audit', async () => {
  await db.$executeRawUnsafe('DELETE FROM product_materials WHERE product_id = ?', ids.p3);
  await db.$executeRawUnsafe('INSERT INTO product_materials VALUES (?, ?, ?)', ids.p3, ids.m1, '4.321');
  const original = await recipeOf(ids.p3);
  for (const [name, table] of [['r17_fail_pm', 'product_materials'], ['r17_fail_audit', 'audit_logs']]) {
    mysqlCli(`CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'r17 gagal';`);
    try {
      const base = await lastLogId();
      const res = await put(staff, ids.p3, [{ material_id: ids.m2, qty_per_unit: '1.111' }]);
      assert.equal(res.status, 500, name);
      assert.deepEqual(await recipeOf(ids.p3), original, `${name}: hapus di-rollback`);
      assert.deepEqual(await recipeAudits(base, ids.p3), [], `${name}: tanpa audit`);
    } finally {
      mysqlCli(`DROP TRIGGER IF EXISTS ${name};`);
    }
  }
  assert.equal((await put(staff, ids.p3, [{ material_id: ids.m2, qty_per_unit: '1.111' }])).status, 200, 'pulih setelah trigger dihapus');
});
