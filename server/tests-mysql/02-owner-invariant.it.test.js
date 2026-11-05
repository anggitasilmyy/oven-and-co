// tests-mysql/02-owner-invariant.it.test.js
// Integrasi MySQL 8 — Validasi AD-11 (C3), dengan smoke test C2 · FR-36 · UC-30 · C3c — invariant "minimal satu Owner
// aktif" di bawah konkurensi HTTP sungguhan (server asli, kunci InnoDB asli). Setiap putaran memakai akun baru dan
// hanya Owner putaran itu yang aktif (setup SQL), lalu semua request dilepas bersamaan.

const test = require('node:test');
const assert = require('node:assert/strict');
const { db, innodbMetrics, record } = require('./helpers/context');
const { startServer, patchActive } = require('./helpers/server');
const { createUser, onlyTheseOwnersActive, activeOwnerIds, isActive, tally } = require('./helpers/fixtures');

const FILE = '02-owner-invariant';
const ROUNDS = Number(process.env.C4_ROUNDS || 30);
let server;

test.before(async () => { server = await startServer(FILE); });
test.after(async () => { await server?.stop(); await db.$disconnect(); });

/** n Owner saling menonaktifkan (graf lengkap: n × (n−1) request bersamaan) */
async function mutualDeactivation(n) {
  const summary = { rounds: ROUNDS, statuses: {}, finalActive: {}, violations: [] };
  const before = await innodbMetrics();
  for (let round = 0; round < ROUNDS; round += 1) {
    const owners = [];
    for (let i = 0; i < n; i += 1) owners.push(await createUser('owner'));
    await onlyTheseOwnersActive(owners);
    const pairs = owners.flatMap((actor) => owners.filter((t) => t !== actor).map((target) => [actor, target]));
    const results = await Promise.all(pairs.map(([actor, target]) => patchActive(server, actor, target, false)));
    const active = await activeOwnerIds();

    Object.entries(tally(results)).forEach(([s, c]) => { summary.statuses[s] = (summary.statuses[s] ?? 0) + c; });
    summary.finalActive[active.length] = (summary.finalActive[active.length] ?? 0) + 1;
    const deactivatedBy200 = new Set(pairs.filter((_, i) => results[i].status === 200).map(([, t]) => t));
    const inactive = owners.filter((o) => !active.includes(o));
    if (active.length < 1) summary.violations.push({ round, reason: 'tidak ada Owner aktif' });
    if ([...deactivatedBy200].sort().join() !== inactive.sort().join()) summary.violations.push({ round, reason: 'respons 200 ≠ data', deactivatedBy200: [...deactivatedBy200], inactive });
    if (results.some((r) => ![200, 401].includes(r.status))) summary.violations.push({ round, results: results.map((r) => [r.status, r.body.message]) });
    results.filter((r) => r.status === 401).forEach((r) => assert.equal(r.body.code, 'SESSION_INVALID'));
  }
  const after = await innodbMetrics();
  summary.deadlocks = after.lock_deadlocks - before.lock_deadlocks;
  summary.lockTimeouts = after.lock_timeouts - before.lock_timeouts;
  summary.rowLockWaits = after.lock_row_lock_waits - before.lock_row_lock_waits;
  return summary;
}

test(`C1 dua Owner saling menonaktifkan × ${ROUNDS} → selalu [200, 401], tepat satu Owner aktif`, async () => {
  const summary = await mutualDeactivation(2);
  record(FILE, 'C1', summary);
  assert.deepEqual(summary.violations, []);
  assert.deepEqual(summary.statuses, { 200: ROUNDS, 401: ROUNDS });
  assert.deepEqual(summary.finalActive, { 1: ROUNDS });
  assert.equal(summary.deadlocks, 0);
  assert.ok(summary.rowLockWaits > 0, 'request benar-benar antre di kunci InnoDB');
});

test(`C2 tiga & empat Owner saling menonaktifkan (6 / 12 request) × ${ROUNDS} → Owner aktif ≥ 1, tanpa 5xx`, async () => {
  for (const n of [3, 4]) {
    const summary = await mutualDeactivation(n);
    record(FILE, `C2-${n}-owners`, summary);
    assert.deepEqual(summary.violations, []);
    assert.deepEqual(summary.finalActive, { 1: ROUNDS }, 'graf lengkap → tepat satu Owner tersisa');
    assert.equal(summary.deadlocks, 0);
    assert.equal(summary.statuses[409], undefined, 'cabang 409 "Owner aktif terakhir" tidak tercapai lewat urutan normal');
  }
});

test(`C3 dua Owner mengaktifkan & menonaktifkan Staf yang sama bersamaan × ${ROUNDS} → semua 200, respons = tujuan`, async () => {
  const summary = { statuses: {}, final: {}, mismatches: 0 };
  for (let round = 0; round < ROUNDS; round += 1) {
    const ownerA = await createUser('owner');
    const ownerB = await createUser('owner');
    const staff = await createUser('staf');
    await onlyTheseOwnersActive([ownerA, ownerB]);
    const plan = [[ownerA, false], [ownerB, true], [ownerA, false], [ownerB, true], [ownerB, false], [ownerA, true]];
    const results = await Promise.all(plan.map(([actor, value]) => patchActive(server, actor, staff, value)));
    Object.entries(tally(results)).forEach(([s, c]) => { summary.statuses[s] = (summary.statuses[s] ?? 0) + c; });
    summary.mismatches += results.filter((r, i) => r.status === 200 && r.body.data.is_active !== plan[i][1]).length;
    const final = await isActive(staff);
    summary.final[final] = (summary.final[final] ?? 0) + 1;
  }
  record(FILE, 'C3', summary);
  assert.deepEqual(summary.statuses, { 200: ROUNDS * 6 });
  assert.equal(summary.mismatches, 0);
});
