// Uji CR-04b CP5 · AC-NF "mode mock = API" · FR-45, FR-46 — skenario Work Order sama dijalankan lewat lapisan services/ client
// di mode mock (node + mock-env-loader) dan mode API (server sungguhan + database uji harness). Keluaran per langkah
// dinormalisasi (ID, nomor WO, waktu, nama unik) lalu dibandingkan: status, code, pesan, fieldErrors, dan isi data identik.
// Langkah yang ditolak diperiksa tanpa efek (`unchanged`: stok & jumlah mutasi bahan uji, detail WO uji sama).
// Kedua mode membuat bahan ber-TAG sendiri dan memasang komposisi produk uji → kondisi awal setara.
// Jalankan (dari client/; mode API: server + database uji harness, akun demo staf & pelanggan aktif):
//   node --import ./tests/unit/register.mjs tests/step-6.9/parity.diff.mjs mock > /tmp/mock.json
//   node --import ./tests/unit/register.mjs tests/step-6.9/parity.diff.mjs api > /tmp/api.json   (http://localhost:4000/api)
//   node tests/step-6.9/parity.diff.mjs compare /tmp/mock.json /tmp/api.json   → exit 0 bila semua langkah identik
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

const MODE = process.argv[2];
if (MODE === 'compare') {
  const [a, b] = [process.argv[3], process.argv[4]].map((f) => JSON.parse(readFileSync(f, 'utf8')));
  let diffs = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const [x, y] = [JSON.stringify(a[i]), JSON.stringify(b[i])];
    if (x !== y) { diffs += 1; console.log(`✗ ${a[i]?.step ?? b[i]?.step}\n  mock: ${x}\n  api : ${y}`); }
  }
  console.log(`\n${a.length - diffs}/${a.length} langkah identik (mock ${a.length}, api ${b.length})`);
  process.exit(diffs || a.length !== b.length ? 1 : 0);
}

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  clear: () => store.clear(), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; },
};
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
if (MODE === 'mock') register('../unit/mock-env-loader.mjs', import.meta.url);
if (MODE === 'mock') globalThis.fetch = async () => { throw new Error('mode mock tidak boleh memanggil fetch'); };

const W = await import('../../src/services/workOrderService.js');
const S = await import('../../src/services/stockService.js');
const R = await import('../../src/services/recipeService.js');
const { getAdminProducts } = await import('../../src/services/adminProductService.js');
const { login } = await import('../../src/services/authService.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');

const TAG = `W${Date.now().toString(36)}`;
const uuid = () => globalThis.crypto.randomUUID();
const as = async (email) => {
  useAuthStore.setState({ user: null, token: null });
  const r = await login(email, 'demo1234');
  useAuthStore.setState({ user: r.user, token: r.token });
};

const idSpaces = new Map();
const idOf = (space, v) => {
  if (!idSpaces.has(space)) idSpaces.set(space, new Map());
  const m = idSpaces.get(space);
  if (!m.has(String(v))) m.set(String(v), `${space}#${m.size + 1}`);
  return m.get(String(v));
};
const SPACE = { material_id: 'M', product_id: 'P', wo_id: 'WO', issue_id: 'I', output_id: 'O', movement_id: 'V' };
function norm(v, key = '') {
  if (Array.isArray(v)) return v.map((x) => norm(x, key));
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      if (/_at$/.test(k)) out[k] = v[k] == null ? null : 'T';
      else if (k === 'id' && v.source) out[k] = idOf(v.source === 'material_issue' ? 'I' : 'D', v[k]);
      else if ((k === 'reverses_id' || k === 'replaces_id') && v[k] != null) out[k] = idOf('issue_id' in v ? 'I' : 'O', v[k]);
      // reversal_id/replacement_id: respons pengeluaran membawa `movements`, respons hasil tidak — ruang ID beda
      else if ((k === 'reversal_id' || k === 'replacement_id') && v[k] != null) out[k] = idOf('movements' in v ? 'I' : 'O', v[k]);
      else if (k === 'materials' && typeof v[k] === 'string') out[k] = v[k].split(', ').map((x) => idOf('M', x)).join(', '); // STOCK_OUT_OF_RANGE
      else if (k === 'production_date') out[k] = 'DATE';
      else out[k] = norm(v[k], k);
    }
    return out;
  }
  if (v != null && SPACE[key]) return idOf(SPACE[key], v);
  if (typeof v === 'string') return v.replaceAll(TAG, 'TAG').replace(/WO-\d{6}-\d{3}/g, (n) => idOf('NO', n));
  return v;
}
const out = [];
process.on('exit', (code) => { if (code) console.log(JSON.stringify(out, null, 1)); });
const tracked = { materials: [], orders: [] };
async function snapshot() {
  const user = useAuthStore.getState();
  if (user.user?.role !== 'staf') await as('staf@demo.com');
  const rows = (await S.getRawMaterials()).rows;
  const state = {
    materials: await Promise.all(tracked.materials.map(async (id) => ({ stock: rows.find((m) => String(m.material_id) === String(id))?.stock, movements: (await S.getMaterialMovements(id)).movements.length }))),
    orders: await Promise.all(tracked.orders.map(async (id) => { const w = await W.getWorkOrder(id); return { status: w.status, qty: w.qty_planned, issues: w.issues.length, outputs: w.outputs.length, net: w.net_output }; })),
  };
  if (user.user?.role !== 'staf') useAuthStore.setState(user);
  return JSON.stringify(state);
}
async function step(name, fn) {
  const before = await snapshot();
  try {
    const data = await fn();
    out.push({ step: name, ok: true, data: norm(data) });
    return data;
  } catch (e) {
    const unchanged = before === await snapshot();
    // fieldErrors: kunci adalah nama field (nilai = pesan), bukan ID — hanya `materials` (daftar ID) yang dinormalisasi
    const fieldErrors = e.fieldErrors ? Object.fromEntries(Object.entries(e.fieldErrors).map(([k, m]) => [k, k === 'materials' ? norm({ materials: m }).materials : norm(m)])) : null;
    out.push({ step: name, ok: false, status: e.status ?? null, code: e.code ?? null, message: norm(e.message), fieldErrors, unchanged });
    return null;
  }
}

await as('staf@demo.com');
const m1 = await step('bahan M1 stok 10', () => S.saveMaterial(null, { name: `Tepung ${TAG}`, unit: 'kg', stock: '10', min_stock: '1' }, uuid()));
const m2 = await step('bahan M2 stok 3', () => S.saveMaterial(null, { name: `Gula ${TAG}`, unit: 'kg', stock: '3', min_stock: '1' }, uuid()));
const m3 = await step('bahan M3 stok 2 (di luar resep)', () => S.saveMaterial(null, { name: `Garam ${TAG}`, unit: 'kg', stock: '2', min_stock: '1' }, uuid()));
tracked.materials.push(m1.material_id, m2.material_id, m3.material_id);
const product = (await getAdminProducts()).rows.find((p) => p.name === 'Classic Butter Croissant');
const today = (await W.getPlanSource()).today_key;
await step('komposisi produk uji (M1 0,015 · M2 0,250)', () => R.saveProductRecipe(product.product_id, [{ material_id: String(m1.material_id), qty_per_unit: '0.015' }, { material_id: String(m2.material_id), qty_per_unit: '0.250' }]));
const woBody = (extra = {}) => ({ product_id: String(product.product_id), production_date: today, qty_planned: 7, ...extra });

// ── WO: validasi, request_id, ubah Draft, transisi
await step('WO tanpa request_id → 400', () => W.saveWorkOrder(null, woBody()));
await step('WO rencana 0 → 400', () => W.saveWorkOrder(null, woBody({ qty_planned: 0 }), uuid()));
await step('WO rencana 10.001 → 400', () => W.saveWorkOrder(null, woBody({ qty_planned: 10001 }), uuid()));
await step('WO rencana pecahan → 400', () => W.saveWorkOrder(null, woBody({ qty_planned: 2.5 }), uuid()));
await step('WO tanggal lampau → 400', () => W.saveWorkOrder(null, woBody({ production_date: '2000-01-01' }), uuid()));
await step('WO produk tidak ada → 400', () => W.saveWorkOrder(null, woBody({ product_id: '987654321' }), uuid()));
await step('WO field asing → 400', () => W.saveWorkOrder(null, woBody({ extra: 1 }), uuid()));
const ridWo = uuid();
const wo1 = await step('WO-1 dibuat (Draft)', () => W.saveWorkOrder(null, woBody({ note: `pagi ${TAG}` }), ridWo));
tracked.orders.push(wo1.wo_id);
await step('WO-1 replay identik ("7")', () => W.saveWorkOrder(null, woBody({ note: `pagi ${TAG}`, qty_planned: '7' }), ridWo));
await step('WO-1 request_id sama payload beda → 409', () => W.saveWorkOrder(null, woBody({ qty_planned: 8 }), ridWo));
const ridPut = uuid();
await step('ubah Draft (request_id opsional)', () => W.saveWorkOrder(wo1.wo_id, woBody({ qty_planned: 9 }), ridPut));
await step('ubah Draft replay', () => W.saveWorkOrder(wo1.wo_id, woBody({ qty_planned: 9 }), ridPut));
await step('ubah Draft request_id sama payload beda → 409', () => W.saveWorkOrder(wo1.wo_id, woBody({ qty_planned: 6 }), ridPut));
await step('ubah Draft tanpa request_id (kembali 7)', () => W.saveWorkOrder(wo1.wo_id, woBody()));
await step('pengeluaran saat Draft → 409', () => W.issueMaterials(wo1.wo_id, { lines: [{ material_id: String(m1.material_id), qty: '1' }] }, uuid()));
await step('selesai saat Draft → 409', () => W.completeWorkOrder(wo1.wo_id, { qty_output: 1 }, uuid()));
await step('transisi from basi → 409', () => W.changeWorkOrderStatus(wo1.wo_id, { from: 'diproses', to: 'dibatalkan' }, uuid()));
await step('transisi ke selesai manual → 409', () => W.changeWorkOrderStatus(wo1.wo_id, { from: 'draft', to: 'selesai' }, uuid()));
await step('transisi status asing → 400', () => W.changeWorkOrderStatus(wo1.wo_id, { from: 'draft', to: 'x' }, uuid()));
const ridStart = uuid();
await step('mulai WO-1 (snapshot resep)', () => W.changeWorkOrderStatus(wo1.wo_id, { from: 'draft', to: 'diproses' }, ridStart));
await step('mulai WO-1 replay', () => W.changeWorkOrderStatus(wo1.wo_id, { from: 'draft', to: 'diproses' }, ridStart));
await step('ubah setelah mulai → 409', () => W.saveWorkOrder(wo1.wo_id, woBody()));
await step('resep diubah setelah mulai (M1 0,020)', () => R.saveProductRecipe(product.product_id, [{ material_id: String(m1.material_id), qty_per_unit: '0.020' }]));

// ── Pengeluaran
const L = (rows) => rows.map(([m, q]) => ({ material_id: String(m.material_id), qty: q }));
await step('pengeluaran tanpa baris → 400', () => W.issueMaterials(wo1.wo_id, { lines: [] }, uuid()));
await step('pengeluaran bahan ganda → 400', () => W.issueMaterials(wo1.wo_id, { lines: L([[m1, '1'], [m1, '2']]) }, uuid()));
await step('pengeluaran qty 3 desimal → 400', () => W.issueMaterials(wo1.wo_id, { lines: L([[m1, '1.234']]) }, uuid()));
await step('pengeluaran bahan tidak ada → 400', () => W.issueMaterials(wo1.wo_id, { lines: [{ material_id: '987654321', qty: '1' }] }, uuid()));
await step('pengeluaran melebihi stok M2 → 409', () => W.issueMaterials(wo1.wo_id, { lines: L([[m1, '1'], [m2, '5']]) }, uuid()));
const ridIssue = uuid();
const iss1 = await step('pengeluaran M1 0,1 + M2 1,5 + M3 0,5', () => W.issueMaterials(wo1.wo_id, { lines: L([[m2, '1.5'], [m1, '0.1'], [m3, '0.5']]) }, ridIssue));
await step('pengeluaran replay identik (urutan & format beda)', () => W.issueMaterials(wo1.wo_id, { lines: L([[m1, '0.10'], [m3, '0.5'], [m2, '1.50']]) }, ridIssue));
await step('pengeluaran request_id sama qty beda → 409', () => W.issueMaterials(wo1.wo_id, { lines: L([[m1, '0.2']]) }, ridIssue));
const issueId = iss1.issue_id;
await step('koreksi pengeluaran tanpa alasan → 400', () => W.reverseOrCorrectIssue(issueId, { lines: L([[m1, '0.1']]) }, uuid(), { correct: true }));
await step('koreksi pengeluaran (M2 1,5 → 1; M3 dihapus; M1 sama)', () => W.reverseOrCorrectIssue(issueId, { lines: L([[m1, '0.1'], [m2, '1']]), reason: 'salah timbang' }, uuid(), { correct: true }));
await step('koreksi kedua atas dokumen sama → 409', () => W.reverseOrCorrectIssue(issueId, { lines: L([[m1, '0.1']]), reason: 'lagi' }, uuid(), { correct: true }));
await step('balik dokumen yang sudah dikoreksi → 409', () => W.reverseOrCorrectIssue(issueId, { reason: 'x' }, uuid(), { correct: false }));
await step('pengeluaran kedua M3 0,25', () => W.issueMaterials(wo1.wo_id, { lines: L([[m3, '0.25']]) }, uuid()));
const iss2 = (await W.getWorkOrder(wo1.wo_id)).issues.at(-1).issue_id;
await step('balik pengeluaran kedua', () => W.reverseOrCorrectIssue(iss2, { reason: 'dikembalikan' }, uuid(), { correct: false }));

// ── Selesai & hasil
await step('selesai hasil 10.001 → 400', () => W.completeWorkOrder(wo1.wo_id, { qty_output: 10001 }, uuid()));
await step('selesai lines bukan array → 400', () => W.completeWorkOrder(wo1.wo_id, { qty_output: 7, lines: 'x' }, uuid()));
const ridDone = uuid();
const done = await step('selesai hasil 7 + pengeluaran terakhir M1 0,05', () => W.completeWorkOrder(wo1.wo_id, { qty_output: 7, lines: L([[m1, '0.05']]) }, ridDone));
await step('selesai replay identik', () => W.completeWorkOrder(wo1.wo_id, { qty_output: 7, lines: L([[m1, '0.05']]) }, ridDone));
await step('selesai kedua → 409', () => W.completeWorkOrder(wo1.wo_id, { qty_output: 7 }, uuid()));
await step('pengeluaran setelah Selesai → 409', () => W.issueMaterials(wo1.wo_id, { lines: L([[m1, '0.1']]) }, uuid()));
await step('batal setelah Selesai → 409', () => W.changeWorkOrderStatus(wo1.wo_id, { from: 'selesai', to: 'dibatalkan' }, uuid()));
const out1 = done?.output_id;
await step('koreksi hasil sama (7 → 7) → 400', () => W.reverseOrCorrectOutput(out1, { qty_output: 7, reason: 'x' }, uuid(), { correct: true }));
const c1 = await step('koreksi hasil 7 → 5 (R + P)', () => W.reverseOrCorrectOutput(out1, { qty_output: 5, reason: 'rusak' }, uuid(), { correct: true }));
const p1 = c1?.replacement_id;
await step('koreksi hasil 5 → 0 (R, terminal)', () => W.reverseOrCorrectOutput(p1, { qty_output: 0, reason: 'gagal' }, uuid(), { correct: true }));
await step('terminal: koreksi 0 → 3 → 409', () => W.reverseOrCorrectOutput(p1, { qty_output: 3, reason: 'x' }, uuid(), { correct: true }));
await step('terminal: balik dokumen asal → 409', () => W.reverseOrCorrectOutput(out1, { reason: 'x' }, uuid(), { correct: false }));
await step('pembalik pengeluaran pada WO Selesai (dokumen pengganti)', async () => {
  const eff = (await W.getWorkOrder(wo1.wo_id)).issues.find((d) => d.effective && d.kind === 'pengganti');
  return W.reverseOrCorrectIssue(eff.issue_id, { reason: 'retur' }, uuid(), { correct: false });
});

// ── WO-2: hasil 0 → koreksi langsung; WO-3: batal setelah pengeluaran
const wo2 = await step('WO-2 dibuat', () => W.saveWorkOrder(null, woBody({ qty_planned: 3 }), uuid()));
tracked.orders.push(wo2.wo_id);
await step('WO-2 mulai (resep M1 0,020)', () => W.changeWorkOrderStatus(wo2.wo_id, { from: 'draft', to: 'diproses' }, uuid()));
const d2 = await step('WO-2 selesai hasil 0', () => W.completeWorkOrder(wo2.wo_id, { qty_output: 0 }, uuid()));
const o2 = d2?.output_id;
await step('WO-2 balik hasil 0 → 400', () => W.reverseOrCorrectOutput(o2, { reason: 'x' }, uuid(), { correct: false }));
await step('WO-2 koreksi 0 → 0 → 400', () => W.reverseOrCorrectOutput(o2, { qty_output: 0, reason: 'x' }, uuid(), { correct: true }));
await step('WO-2 koreksi 0 → 3 (P langsung)', () => W.reverseOrCorrectOutput(o2, { qty_output: 3, reason: 'tercatat' }, uuid(), { correct: true }));
const wo3 = await step('WO-3 dibuat', () => W.saveWorkOrder(null, woBody({ qty_planned: 2 }), uuid()));
tracked.orders.push(wo3.wo_id);
await step('WO-3 mulai', () => W.changeWorkOrderStatus(wo3.wo_id, { from: 'draft', to: 'diproses' }, uuid()));
await step('WO-3 pengeluaran M2 0,5', () => W.issueMaterials(wo3.wo_id, { lines: L([[m2, '0.5']]) }, uuid()));
await step('WO-3 batal setelah pengeluaran', () => W.changeWorkOrderStatus(wo3.wo_id, { from: 'diproses', to: 'dibatalkan' }, uuid()));
await step('WO-3 final → 409', () => W.changeWorkOrderStatus(wo3.wo_id, { from: 'dibatalkan', to: 'diproses' }, uuid()));
await step('WO-3 selesai setelah batal → 409', () => W.completeWorkOrder(wo3.wo_id, { qty_output: 1 }, uuid()));
await step('detail WO-1 akhir', () => W.getWorkOrder(wo1.wo_id));
await step('detail WO-2 akhir', () => W.getWorkOrder(wo2.wo_id));
await step('detail WO-3 akhir', () => W.getWorkOrder(wo3.wo_id));
await step('daftar WO (uji ini)', async () => (await W.getWorkOrders()).filter((w) => tracked.orders.map(String).includes(String(w.wo_id))));
await step('riwayat M1', () => S.getMaterialMovements(m1.material_id));
await step('riwayat M2', () => S.getMaterialMovements(m2.material_id));
await step('riwayat M3', () => S.getMaterialMovements(m3.material_id));

// ── Kontrak rute & hak akses
await step('plan-source tanggal di luar jendela → 400', () => W.getPlanSource('2000-01-01'));
await step('ID WO tidak valid → 400 INVALID_ID', () => W.getWorkOrder('abc'));
await step('WO tidak ada → 404', () => W.getWorkOrder('987654321'));
await step('ID pengeluaran tidak valid → 400', () => W.reverseOrCorrectIssue('0', { reason: 'x' }, uuid(), { correct: false }));
await step('ID hasil tidak valid → 400', () => W.reverseOrCorrectOutput('x1', { reason: 'x' }, uuid(), { correct: false }));
await step('pengeluaran tidak ada → 404', () => W.reverseOrCorrectIssue('987654321', { reason: 'x' }, uuid(), { correct: false }));
await step('request_id bukan UUID v4 → 400', () => W.changeWorkOrderStatus(wo3.wo_id, { from: 'dibatalkan', to: 'diproses' }, 'ABC'));
await as('pelanggan@demo.com');
await step('pelanggan: daftar WO ditolak', () => W.getWorkOrders());
await step('pelanggan: pengeluaran ditolak', () => W.issueMaterials(wo1.wo_id, { lines: L([[m1, '1']]) }, uuid()));
useAuthStore.setState({ user: null, token: null });
await step('tanpa sesi: daftar WO ditolak', () => W.getWorkOrders());

console.log(JSON.stringify(out, null, 1));
