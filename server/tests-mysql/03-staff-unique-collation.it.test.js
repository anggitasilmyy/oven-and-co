// tests-mysql/03-staff-unique-collation.it.test.js
// Integrasi MySQL 8 — Validasi AD-11 (C3), dengan smoke test C2 · FR-36 · UC-30 · C3b POST /api/admin/staff
// (E) bentuk asli error P2002 Prisma 6.19.3 + MySQL 8 (dicatat apa adanya) dan jalur P2002 → 400 secara deterministik
//     (baris pesaing belum di-commit → cek awal tidak melihatnya → INSERT menunggu kunci duplikat → P2002);
// (F) collation kolom users.email dibuktikan dengan query nyata (tanpa asumsi kesetaraan Unicode), lalu efeknya pada POST.

const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const {
  db, rows, holdTransaction, waitForAppLockWaits, innodbMetrics, startGeneralLog, stopGeneralLog, record,
} = require('./helpers/context');
const { startServer, call } = require('./helpers/server');
const { createUser, onlyTheseOwnersActive, unique, tally } = require('./helpers/fixtures');

const FILE = '03-staff-unique-collation';
const ROUNDS = Number(process.env.C4_ROUNDS_UNIQUE || 20);
let server;
let owner;

test.before(async () => {
  server = await startServer(FILE);
  owner = await createUser('owner');
  await onlyTheseOwnersActive([owner]);
});
test.after(async () => { await server?.stop(); await db.$disconnect(); });

let phoneSeq = 0;
const freshPhone = () => `+62899${String(Date.now() % 1e5).padStart(5, '0')}${String((phoneSeq += 1) % 1000).padStart(3, '0')}`;
const staffBody = (email, phone) => ({ name: 'Staf C4', email, phone, password: 'rahasia123', role: 'staf' });
const postStaff = (body) => call(server, 'POST', '/api/admin/staff', { userId: owner, body });

/** Tangkap error Prisma apa adanya */
async function capture(promise) {
  try { await promise; return null; } catch (error) {
    return {
      name: error.constructor.name,
      isKnownRequestError: error instanceof Prisma.PrismaClientKnownRequestError,
      code: error.code,
      meta: error.meta,
      clientVersion: error.clientVersion,
      firstLine: String(error.message).trim().split('\n').at(-1),
    };
  }
}

test('E1 bentuk P2002 asli: email, phone, google_id (create & createMany)', async () => {
  const email = `${unique('e1')}@c4.test`;
  const phone = freshPhone();
  const googleId = unique('g');
  await db.user.create({ data: { name: 'E1', email, phone, passwordHash: 'x', role: 'staf', googleId } });
  const errors = {
    email: await capture(db.user.create({ data: { name: 'E1', email, phone: freshPhone(), passwordHash: 'x', role: 'staf' } })),
    emailUpperCase: await capture(db.user.create({ data: { name: 'E1', email: email.toUpperCase(), phone: freshPhone(), passwordHash: 'x', role: 'staf' } })),
    phone: await capture(db.user.create({ data: { name: 'E1', email: `${unique('e1')}@c4.test`, phone, passwordHash: 'x', role: 'staf' } })),
    googleId: await capture(db.user.create({ data: { name: 'E1', email: `${unique('e1')}@c4.test`, phone: freshPhone(), passwordHash: 'x', role: 'staf', googleId } })),
    emailAndPhone: await capture(db.user.create({ data: { name: 'E1', email, phone, passwordHash: 'x', role: 'staf' } })),
    createManyEmail: await capture(db.user.createMany({ data: [{ name: 'E1', email, phone: freshPhone(), passwordHash: 'x', role: 'staf' }] })),
  };
  record(FILE, 'E1', errors);
  for (const e of Object.values(errors)) {
    assert.ok(e, 'harus gagal');
    assert.equal(e.code, 'P2002');
  }
  assert.deepEqual(errors.email.meta, { modelName: 'User', target: 'users_email_key' });
  assert.deepEqual(errors.emailUpperCase.meta, { modelName: 'User', target: 'users_email_key' });
  assert.deepEqual(errors.phone.meta, { modelName: 'User', target: 'users_phone_key' });
  assert.deepEqual(errors.googleId.meta, { modelName: 'User', target: 'users_google_id_key' });
});

test('E2 deterministik: pesaing belum commit → cek awal lolos → INSERT menunggu → P2002 → 400 fieldErrors', async () => {
  const outcomes = {};
  for (const field of ['email', 'phone']) {
    const email = `${unique('e2')}@c4.test`;
    const phone = freshPhone();
    const holder = holdTransaction((tx) => tx.user.create({ data: { name: 'Pesaing', email, phone, passwordHash: 'x', role: 'customer' } }));
    await holder.ready;
    const body = field === 'email' ? staffBody(email, freshPhone()) : staffBody(`${unique('e2')}@c4.test`, phone);
    const pending = postStaff(body);
    const [wait] = await waitForAppLockWaits(1, { timeoutMs: 15000 });
    await holder.release();
    const res = await pending;
    outcomes[field] = { wait, status: res.status, body: res.body };
    assert.equal(wait.waiting_table, 'users');
    assert.equal(wait.waiting_index, field === 'email' ? 'users_email_key' : 'users_phone_key');
    assert.equal(res.status, 400);
    assert.deepEqual(Object.keys(res.body.fieldErrors), [field]);
  }
  // Pesaing di-ROLLBACK → INSERT yang menunggu justru berhasil (bukan 400)
  const email = `${unique('e2r')}@c4.test`;
  const holder = holdTransaction((tx) => tx.user.create({ data: { name: 'Pesaing', email, phone: freshPhone(), passwordHash: 'x', role: 'customer' } }));
  await holder.ready;
  const pending = postStaff(staffBody(email, freshPhone()));
  await waitForAppLockWaits(1, { timeoutMs: 15000 });
  await holder.release(() => { throw new Error('rollback pesaing'); }).catch(() => {});
  const res = await pending;
  outcomes.rolledBackCompetitor = { status: res.status };
  record(FILE, 'E2', outcomes);
  assert.equal(res.status, 201);
});

test(`E3 POST bersamaan (2/5/10) email atau HP sama × ${ROUNDS} → tepat satu 201, sisanya 400, 0 deadlock`, async () => {
  const before = await innodbMetrics();
  const summary = {};
  for (const n of [2, 5, 10]) {
    for (const field of ['email', 'phone']) {
      const key = `${n}-${field}`;
      summary[key] = { statuses: {}, wrongField: 0, created: {} };
      for (let round = 0; round < ROUNDS; round += 1) {
        const email = `${unique('e3')}@c4.test`;
        const phone = freshPhone();
        const bodies = Array.from({ length: n }, () => (field === 'email' ? staffBody(email, freshPhone()) : staffBody(`${unique('e3')}@c4.test`, phone)));
        const results = await Promise.all(bodies.map(postStaff));
        Object.entries(tally(results)).forEach(([s, c]) => { summary[key].statuses[s] = (summary[key].statuses[s] ?? 0) + c; });
        summary[key].wrongField += results.filter((r) => r.status === 400 && Object.keys(r.body.fieldErrors ?? {}).join() !== field).length;
        const where = field === 'email' ? 'email = ?' : 'phone = ?';
        const count = (await rows(`SELECT COUNT(*) AS n FROM users WHERE ${where}`, field === 'email' ? email : phone))[0].n;
        summary[key].created[count] = (summary[key].created[count] ?? 0) + 1;
      }
    }
  }
  const after = await innodbMetrics();
  summary.deadlocks = after.lock_deadlocks - before.lock_deadlocks;
  summary.rowLockWaits = after.lock_row_lock_waits - before.lock_row_lock_waits;
  record(FILE, 'E3', summary);
  for (const n of [2, 5, 10]) {
    for (const field of ['email', 'phone']) {
      const s = summary[`${n}-${field}`];
      assert.deepEqual(s.statuses, { 201: ROUNDS, 400: ROUNDS * (n - 1) }, `${n}-${field}`);
      assert.equal(s.wrongField, 0);
      assert.deepEqual(s.created, { 1: ROUNDS });
    }
  }
  assert.equal(summary.deadlocks, 0);
});

test('F1 collation nyata kolom users.email (query, bukan asumsi)', async () => {
  const [column] = await rows(`SELECT CHARACTER_SET_NAME AS charset, COLLATION_NAME AS collation FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email'`);
  const [coll] = await rows("SELECT PAD_ATTRIBUTE AS pad FROM information_schema.COLLATIONS WHERE COLLATION_NAME = 'utf8mb4_unicode_ci'");
  const pairs = [['Owner@Mail.com', 'owner@mail.com'], ['straße@c4.test', 'strasse@c4.test'], ['café@c4.test', 'cafe@c4.test'],
    ['ÄBC@c4.test', 'abc@c4.test'], ['a@c4.test ', 'a@c4.test'], ['ı@c4.test', 'i@c4.test'], ['ﬁ@c4.test', 'fi@c4.test']];
  const compare = {};
  for (const [a, b] of pairs) {
    const [r] = await rows(`SELECT (CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci) AS unicode_ci,
      (CONVERT(? USING utf8mb4) COLLATE utf8mb4_0900_ai_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_0900_ai_ci) AS ai_ci_0900,
      (CONVERT(? USING utf8mb4) COLLATE utf8mb4_bin = CONVERT(? USING utf8mb4) COLLATE utf8mb4_bin) AS bin`, a, b, a, b, a, b);
    compare[`${a} | ${b}`] = { unicode_ci: Number(r.unicode_ci), ai_ci_0900: Number(r.ai_ci_0900), bin: Number(r.bin), js_lower: Number(a.toLowerCase() === b.toLowerCase()) };
  }
  record(FILE, 'F1', { column, pad: coll.pad, compare });
  assert.deepEqual(column, { charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' });
  assert.equal(compare['Owner@Mail.com | owner@mail.com'].unicode_ci, 1);
});

test('F2 POST dengan email yang hanya berbeda huruf/aksen/ß dari baris lama (disisipkan SQL)', async () => {
  const base = unique('f2');
  const cases = [
    { stored: `MixedCase.${base}@Example.Test`, input: `mixedcase.${base}@example.test` },
    { stored: `strasse.${base}@c4.test`, input: `straße.${base}@c4.test` },
    { stored: `cafe.${base}@c4.test`, input: `café.${base}@c4.test` },
  ];
  const outcomes = [];
  for (const c of cases) {
    await db.$executeRawUnsafe("INSERT INTO users (name, email, phone, role, is_active, created_at) VALUES ('Lama', ?, ?, 'customer', 1, NOW())", c.stored, freshPhone());
    const [{ found }] = await rows('SELECT COUNT(*) AS found FROM users WHERE email = ?', c.input);
    await startGeneralLog();
    const res = await postStaff(staffBody(c.input, freshPhone()));
    const log = await stopGeneralLog();
    const insertAttempted = log.some((l) => /^\s*INSERT INTO `[^`]+`\.`users`/i.test(l.sql_text));
    outcomes.push({ ...c, sqlEqualMatches: Number(found), status: res.status, fieldErrors: res.body.fieldErrors, insertAttempted,
      path: res.status === 400 ? (insertAttempted ? 'UNIQUE/P2002' : 'cek awal') : 'tersimpan' });
  }
  record(FILE, 'F2', { outcomes });
  outcomes.forEach((o) => {
    if (o.sqlEqualMatches > 0) {
      assert.equal(o.status, 400, `${o.input}: MySQL menganggap sama → harus ditolak, bukan 500`);
      assert.equal(o.fieldErrors.email, 'Email sudah terdaftar');
    }
  });
  assert.equal(outcomes[0].path, 'cek awal');
});
