// tests-mysql/06-settings-smoke.it.test.js
// Integrasi MySQL 8 — Validasi AD-11 (C3), dengan smoke test C2 · FR-36 · A-11 — SMOKE TEST C2 (bukan validasi penuh C2):
// hanya jalur yang memakai kunci store_settings yang sama dengan C3c. S1 PUT profil menunggu kunci + nilai DECIMAL
// tersimpan; S2 PUT jam operasional + kolom TIME; S3 dua PATCH metode bayar online terakhir bersamaan (BR-05);
// S4 PUT profil + PATCH akun + checkout bersamaan tanpa deadlock. Nilai asli dipulihkan setelah setiap skenario.

const test = require('node:test');
const assert = require('node:assert/strict');
const { db, rows, holdTransaction, waitForAppLockWaits, innodbMetrics, record } = require('./helpers/context');
const { startServer, call, patchActive } = require('./helpers/server');
const { createUser, onlyTheseOwnersActive, checkout, tally } = require('./helpers/fixtures');

const FILE = '06-settings-smoke';
const ROUNDS = Number(process.env.C4_ROUNDS_SMOKE || 10);
const LOCK_SQL = 'SELECT setting_id FROM store_settings ORDER BY setting_id LIMIT 1 FOR UPDATE';
let server;
let owner;
let original;

const profileRow = async () => (await rows(`SELECT store_name, address, whatsapp_number, CAST(preorder_cutoff_time AS CHAR) AS cutoff,
  CAST(delivery_radius_km AS CHAR) AS radius, CAST(delivery_fee_per_km AS CHAR) AS fee FROM store_settings WHERE setting_id = 1`))[0];
const toBody = (p) => ({ store_name: p.store_name, address: p.address, whatsapp_number: p.whatsapp_number,
  preorder_cutoff_time: p.cutoff.slice(0, 5), delivery_radius_km: p.radius, delivery_fee_per_km: p.fee });
const putProfile = (actor, body) => call(server, 'PUT', '/api/admin/settings', { userId: actor, body });

test.before(async () => {
  server = await startServer(FILE);
  owner = await createUser('owner');
  await onlyTheseOwnersActive([owner]);
  original = await profileRow();
});
test.after(async () => {
  await putProfile(owner, toBody(original));
  await server?.stop();
  await db.$disconnect();
});

test('S1 PUT profil menunggu kunci store_settings; "1.150"/"2500.00" tersimpan tepat di DECIMAL', async () => {
  const holder = holdTransaction((tx) => tx.$queryRawUnsafe(LOCK_SQL));
  await holder.ready;
  const pending = putProfile(owner, { ...toBody(original), store_name: 'Oven & Co. C4', delivery_radius_km: '1.150', delivery_fee_per_km: '2500.00' });
  const [wait] = await waitForAppLockWaits(1);
  await holder.release();
  const res = await pending;
  const saved = await profileRow();
  const invalid = await putProfile(owner, { ...toBody(original), delivery_radius_km: '10.0000000000000001' });
  const afterInvalid = await profileRow();
  record(FILE, 'S1', { wait, status: res.status, saved, invalid: invalid.status, afterInvalid });
  assert.equal(wait.waiting_table, 'store_settings');
  assert.equal(res.status, 200);
  assert.equal(saved.radius, '1.15');
  assert.equal(saved.fee, '2500.00');
  assert.equal(saved.store_name, 'Oven & Co. C4');
  assert.equal(invalid.status, 400);
  assert.deepEqual(afterInvalid, saved, 'input tidak sah tidak menulis apa pun');
  assert.equal((await putProfile(owner, toBody(original))).status, 200);
});

test('S2 PUT jam operasional 7 hari → kolom TIME tersimpan, lalu dipulihkan', async () => {
  const before = await rows('SELECT hour_id, day_of_week, CAST(open_time AS CHAR) AS open_time, CAST(close_time AS CHAR) AS close_time, is_open FROM operating_hours ORDER BY day_of_week');
  const hours = before.map((h) => ({ day_of_week: h.day_of_week, is_open: h.is_open === 1, open_time: h.open_time?.slice(0, 5) ?? null, close_time: h.close_time?.slice(0, 5) ?? null }));
  const changed = hours.map((h) => (h.day_of_week === 1 ? { ...h, close_time: '21:30' } : h));
  const res = await call(server, 'PUT', '/api/admin/settings/operating-hours', { userId: owner, body: { hours: changed } });
  const saved = await rows('SELECT day_of_week, CAST(close_time AS CHAR) AS close_time FROM operating_hours WHERE day_of_week = 1');
  const restore = await call(server, 'PUT', '/api/admin/settings/operating-hours', { userId: owner, body: { hours } });
  const after = await rows('SELECT hour_id, day_of_week, CAST(open_time AS CHAR) AS open_time, CAST(close_time AS CHAR) AS close_time, is_open FROM operating_hours ORDER BY day_of_week');
  record(FILE, 'S2', { status: res.status, saved, restore: restore.status });
  assert.equal(res.status, 200);
  assert.equal(saved[0].close_time, '21:30:00');
  assert.equal(restore.status, 200);
  assert.deepEqual(after, before);
});

test(`S3 dua Owner menonaktifkan dua metode online terakhir bersamaan × ${ROUNDS} → [200, 409], selalu ≥ 1 online aktif`, async () => {
  const methods = await rows('SELECT method_code, is_active FROM payment_methods');
  const ownerB = await createUser('owner');
  await onlyTheseOwnersActive([owner, ownerB]);
  const summary = { statuses: {}, minOnlineActive: Infinity };
  try {
    for (let round = 0; round < ROUNDS; round += 1) {
      await db.$executeRawUnsafe("UPDATE payment_methods SET is_active = (method_code IN ('qris','gopay') OR method_group = 'store')");
      const results = await Promise.all([
        call(server, 'PATCH', '/api/admin/payment-methods/qris/active', { userId: owner, body: { is_active: false } }),
        call(server, 'PATCH', '/api/admin/payment-methods/gopay/active', { userId: ownerB, body: { is_active: false } }),
      ]);
      const key = results.map((r) => r.status).sort().join(',');
      summary.statuses[key] = (summary.statuses[key] ?? 0) + 1;
      const online = (await rows("SELECT COUNT(*) AS n FROM payment_methods WHERE is_active = 1 AND method_group <> 'store'"))[0].n;
      summary.minOnlineActive = Math.min(summary.minOnlineActive, Number(online));
    }
  } finally {
    for (const m of methods) await db.$executeRawUnsafe('UPDATE payment_methods SET is_active = ? WHERE method_code = ?', m.is_active, m.method_code);
  }
  record(FILE, 'S3', summary);
  assert.deepEqual(summary.statuses, { '200,409': ROUNDS });
  assert.equal(summary.minOnlineActive, 1);
});

test(`S4 PUT profil + PATCH akun + 4 checkout bersamaan × ${ROUNDS} → tanpa deadlock, tanpa 5xx`, async () => {
  const before = await innodbMetrics();
  const statuses = {};
  for (let round = 0; round < ROUNDS; round += 1) {
    const staff = await createUser('staf');
    const customers = [];
    for (let i = 0; i < 4; i += 1) customers.push(await createUser('customer'));
    const results = await Promise.all([
      putProfile(owner, toBody(original)),
      patchActive(server, owner, staff, false),
      ...customers.map((c) => checkout(server, c)),
    ]);
    Object.entries(tally(results)).forEach(([s, c]) => { statuses[s] = (statuses[s] ?? 0) + c; });
  }
  const after = await innodbMetrics();
  const summary = { statuses, deadlocks: after.lock_deadlocks - before.lock_deadlocks, rowLockWaits: after.lock_row_lock_waits - before.lock_row_lock_waits };
  record(FILE, 'S4', summary);
  assert.equal(summary.deadlocks, 0);
  assert.deepEqual(statuses, { 200: ROUNDS * 2, 201: ROUNDS * 4 });
});
