// Uji CR-04c · FR-47 · AC-47.1 · K16, K18 — GET /api/admin/reports/operations di tingkat HTTP: hanya Owner (tamu 401,
// pelanggan & Staf 403), periode = aturan AD-08 (400 pesan sama, sebelum transaksi dibuka), request_id ditolak (GET),
// tidak ada transaksi tulis. Isi & angka laporan dibuktikan di MySQL tests-mysql/27-cr04c-operations-report (IT-27 – IT-29).

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

const users = {
  1: { userId: 1n, role: 'customer', isActive: true },
  3: { userId: 3n, role: 'staf', isActive: true },
  4: { userId: 4n, role: 'owner', isActive: true },
};
let txCalls = [];
fakePrisma.user = { findUnique: async ({ where }) => users[String(where.userId)] ?? null };
fakePrisma.$transaction = async (callback, options) => {
  txCalls.push(options);
  throw new Error('transaksi tidak boleh dibuka pada uji ini');
};

let server;
let baseUrl;
test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/reports/operations`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => { txCalls = []; });

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const get = async (query = '?period=mingguan', token = tokenFor('4')) => {
  const res = await fetch(`${baseUrl}${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, json: await res.json() };
};

test('AC-47.1 / K18: hanya Owner — tamu 401, token tidak valid SESSION_INVALID, pelanggan & Staf 403; tanpa transaksi', async () => {
  assert.equal((await get(undefined, null)).status, 401);
  assert.equal((await get(undefined, 'token-palsu')).json.code, 'SESSION_INVALID');
  assert.equal((await get(undefined, tokenFor('1'))).status, 403);
  const staf = await get(undefined, tokenFor('3'));
  assert.deepEqual([staf.status, staf.json.message], [403, 'Anda tidak memiliki izin untuk mengakses resource ini.']);
  assert.deepEqual(txCalls, []);
});

test('K16: periode & rentang = aturan AD-08 (400, pesan sama) sebelum snapshot dibuka; request_id ditolak', async () => {
  const cases = [
    ['?period=tahunan', 'Periode laporan tidak valid.'],
    ['?period=rentang', 'Pilih tanggal mulai dan tanggal selesai'],
    ['?period=rentang&from=2026-11-10&to=2026-11-01', 'Tanggal mulai harus sebelum atau sama dengan tanggal selesai'],
    ['?period=rentang&from=2026-01-01&to=2099-01-01', 'Tanggal selesai tidak boleh melewati hari ini'],
    ['?period=rentang&from=2026-31-01&to=2026-11-01', 'Pilih tanggal mulai dan tanggal selesai'],
  ];
  for (const [query, message] of cases) {
    const res = await get(query);
    assert.deepEqual([res.status, res.json.message], [400, message], query);
  }
  const rid = await get('?period=harian&request_id=0b6f7f0e-3c1a-4c55-9d6e-2f7a5f0a1b2c');
  assert.equal(rid.status, 400, 'GET menolak request_id');
  assert.deepEqual(txCalls, []);
});
