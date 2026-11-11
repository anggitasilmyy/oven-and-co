// Uji CR-03 CP7 mode API · FR-40 · AD-07 — getMaterialRequirements memanggil GET /api/admin/material-requirements
// (tanggal kosong → tanpa query = hari ini WIB di server), mengembalikan data apa adanya, dan meneruskan error 400 /
// 500 MILLI_PRECISION_LOST ke UI. fetch ditangkap; tanpa server sungguhan.

import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  clear: () => store.clear(), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; },
};
const calls = [];
let reply;
globalThis.fetch = async (url, init) => {
  calls.push({ url, init });
  return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
};

const { USE_MOCK } = await import('../../src/services/apiClient.js');
const { getMaterialRequirements } = await import('../../src/services/stockService.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');

const DATA = {
  date: '2026-11-14', today_key: '2026-11-11', window: { from: '2026-11-11', to: '2026-12-10' },
  cumulative_range: { from: '2026-11-11', to: '2026-11-14' }, includes_ready_plan: true,
  rows: [{ material_id: '2', name: 'Butter Prancis', unit: 'kg', stock: 6.5, min_stock: 8, daily_need: 0.3, backlog_need: 0.25, cumulative_need: 2.15, remaining: 4.35, shortage: 0, status: 'menipis' }],
  summary: { kurang: 0, menipis: 1, cukup: 0 },
  products_without_recipe: [{ product_id: '4', name: 'Assorted Cookies Box', daily_quantity: 0, cumulative_quantity: 12 }],
};

test.beforeEach(() => {
  calls.length = 0;
  reply = { status: 200, body: { status: 'success', data: DATA } };
  useAuthStore.setState({ user: { userId: '4', role: 'owner' }, token: 'jwt-owner' });
});

test('mode API aktif', () => assert.equal(USE_MOCK, false));

test('tanggal kosong → tanpa query; tanggal → ?date=YYYY-MM-DD; data apa adanya (contoh §B7.3)', async () => {
  assert.deepEqual(await getMaterialRequirements(), DATA);
  assert.match(calls[0].url, /\/admin\/material-requirements$/);
  await getMaterialRequirements('2026-11-14');
  assert.match(calls[1].url, /\/admin\/material-requirements\?date=2026-11-14$/);
  assert.match(calls[1].init.headers.Authorization, /^Bearer jwt-owner$/);
});

test('400 tanggal & 500 MILLI_PRECISION_LOST diteruskan dengan pesan & kode server', async () => {
  reply = { status: 400, body: { status: 'error', message: 'Tanggal di luar rentang.' } };
  const bad = await getMaterialRequirements('2026-12-11').catch((e) => e);
  assert.deepEqual([bad.status, bad.message], [400, 'Tanggal di luar rentang.']);
  reply = { status: 500, body: { status: 'error', code: 'MILLI_PRECISION_LOST', message: 'Hasil perhitungan tidak dapat direpresentasikan secara aman.' } };
  const lost = await getMaterialRequirements().catch((e) => e);
  assert.deepEqual([lost.status, lost.code, lost.message], [500, 'MILLI_PRECISION_LOST', 'Hasil perhitungan tidak dapat direpresentasikan secara aman.']);
});
