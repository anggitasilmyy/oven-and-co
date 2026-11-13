// Uji CR-04a CP7 · IT-38 · AC-NF "mode mock = API" — skenario sama dijalankan lewat lapisan services/ client di mode mock
// (node + mock-env-loader) dan mode API (server sungguhan + database uji). Keluaran per langkah dinormalisasi (ID, nomor
// PO, waktu, nama unik) lalu dibandingkan: status, code, pesan, fieldErrors, dan isi data harus identik.
// Langkah yang ditolak juga diperiksa tanpa efek: stok, jumlah mutasi, status/penerimaan PO, dan supplier sama sebelum &
// sesudah (`unchanged`). Kedua mode membuat bahan/supplier/PO sendiri (nama ber-TAG unik) → kondisi awal setara.
// Jalankan (dari client/; mode API: server + database uji harness, akun demo staf & pelanggan aktif):
//   node --import ./tests/unit/register.mjs tests/step-6.8/parity.diff.mjs mock > /tmp/mock.json
//   node --import ./tests/unit/register.mjs tests/step-6.8/parity.diff.mjs api > /tmp/api.json   (http://localhost:4000/api)
//   node tests/step-6.8/parity.diff.mjs compare /tmp/mock.json /tmp/api.json   → exit 0 bila semua langkah identik
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

const P = await import('../../src/services/purchasingService.js');
const S = await import('../../src/services/stockService.js');
const { login } = await import('../../src/services/authService.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');

const TAG = `P${Date.now().toString(36)}`;
const uuid = () => globalThis.crypto.randomUUID();
const as = async (email) => {
  useAuthStore.setState({ user: null, token: null });
  const r = await login(email, 'demo1234');
  useAuthStore.setState({ user: r.user, token: r.token });
};

// Normalisasi: ID → urutan kemunculan per ruang kunci; waktu → T; nomor PO → PO#n; nama unik → tanpa TAG
const idSpaces = new Map();
const idOf = (space, v) => {
  if (!idSpaces.has(space)) idSpaces.set(space, new Map());
  const m = idSpaces.get(space);
  if (!m.has(String(v))) m.set(String(v), `${space}#${m.size + 1}`);
  return m.get(String(v));
};
const SPACE = { material_id: 'M', supplier_id: 'S', po_id: 'PO', po_item_id: 'I', receipt_id: 'R', reverses_id: 'R', replaces_id: 'R', reversal_id: 'D', replacement_id: 'D', adjustment_id: 'D', movement_id: 'V' };
function norm(v, key = '') {
  if (Array.isArray(v)) return v.map((x) => norm(x, key));
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      if (/_at$/.test(k)) out[k] = v[k] == null ? null : 'T';
      else if (k === 'id' && v.source) out[k] = idOf(v.source === 'goods_receipt' ? 'R' : 'D', v[k]);
      else if (k === 'material_ids') out[k] = v[k].map((x) => idOf('M', x));
      else if (k === 'materials' && typeof v[k] === 'string') out[k] = v[k].split(', ').map((x) => idOf('M', x)).join(', '); // fieldErrors STOCK_OUT_OF_RANGE
      else out[k] = norm(v[k], k);
    }
    return out;
  }
  if (v != null && SPACE[key]) return idOf(SPACE[key], v);
  if (typeof v === 'string') return v.replaceAll(TAG, 'TAG').replace(/PO-\d{6}-\d{3}/g, (n) => idOf('NO', n));
  return v;
}
const out = [];
process.on('exit', (code) => { if (code) console.log(JSON.stringify(out, null, 1)); });
const ids = {};
// Keadaan entitas skenario (stok, buku mutasi, status & penerimaan PO, supplier) — dibaca sebagai Staf
const tracked = { materials: [], orders: [] };
async function snapshot() {
  const user = useAuthStore.getState();
  if (user.user?.role !== 'staf') await as('staf@demo.com');
  const rows = (await S.getRawMaterials()).rows;
  const state = {
    materials: await Promise.all(tracked.materials.map(async (id) => ({ stock: rows.find((m) => String(m.material_id) === String(id))?.stock, movements: (await S.getMaterialMovements(id)).movements.length }))),
    orders: await Promise.all(tracked.orders.map(async (id) => { const po = await P.getPurchaseOrder(id); return { status: po.status, receipts: po.receipts.length, items: po.items }; })),
    suppliers: (await P.getSuppliers()).filter((s) => s.name.includes(TAG)).map((s) => ({ name: s.name, is_active: s.is_active, materials: s.materials.length })),
  };
  if (user.user?.role !== 'staf') useAuthStore.setState(user);
  return JSON.stringify(state);
}
// Langkah gagal: keadaan sebelum = sesudah (tanpa perubahan stok, mutasi, status dokumen) — wajib true di kedua mode
async function step(name, fn) {
  const before = await snapshot();
  try {
    const data = await fn();
    out.push({ step: name, ok: true, data: norm(data) });
    return data;
  } catch (e) {
    const unchanged = before === await snapshot();
    out.push({ step: name, ok: false, status: e.status ?? null, code: e.code ?? null, message: norm(e.message), fieldErrors: norm(e.fieldErrors ?? null), unchanged });
    return null;
  }
}
const lastDocId = async (materialId) => (await S.getMaterialMovements(materialId)).movements.at(-1).document.id;
const supplierBody = (name, materialIds) => ({ name, phone: '+6281234567890', address: 'Jl. Uji 1', email: 'uji@contoh.id', contact_person: 'Sari', material_ids: materialIds });

await as('staf@demo.com');
const m1 = await step('bahan baru M1 stok 10', () => S.saveMaterial(null, { name: `Tepung ${TAG}`, unit: 'kg', stock: '10', min_stock: '1' }, uuid()));
const m2 = await step('bahan baru M2 stok 0', () => S.saveMaterial(null, { name: `Gula ${TAG}`, unit: 'kg', stock: '0', min_stock: '1' }, uuid()));
const m3 = await step('bahan baru M3 (di luar daftar supplier)', () => S.saveMaterial(null, { name: `Garam ${TAG}`, unit: 'kg', stock: '5', min_stock: '1' }));
[ids.m1, ids.m2, ids.m3] = [m1.material_id, m2.material_id, m3.material_id];
tracked.materials.push(ids.m1, ids.m2, ids.m3);

// ── Supplier
await step('supplier kosong → 400', () => P.saveSupplier(null, {}, uuid()));
await step('supplier tanpa request_id → 400', () => P.saveSupplier(null, supplierBody(`Sup A ${TAG}`, [ids.m1, ids.m2])));
await step('supplier telepon salah → 400', () => P.saveSupplier(null, { ...supplierBody(`Sup A ${TAG}`, [ids.m1]), phone: '0812' }, uuid()));
await step('supplier bahan tidak ada → 400', () => P.saveSupplier(null, supplierBody(`Sup A ${TAG}`, ['987654321']), uuid()));
const ridSup = uuid();
const supA = await step('supplier A dibuat', () => P.saveSupplier(null, supplierBody(`Sup A ${TAG}`, [ids.m2, ids.m1]), ridSup));
await step('supplier A replay identik', () => P.saveSupplier(null, supplierBody(`Sup A ${TAG}`, [ids.m1, ids.m2]), ridSup));
await step('supplier A request_id sama payload beda → 409', () => P.saveSupplier(null, supplierBody(`Sup B ${TAG}`, [ids.m1]), ridSup));
await step('supplier A request_id sama body tidak valid', () => P.saveSupplier(null, {}, ridSup));
await step('nama supplier ganda (beda huruf) → 400', () => P.saveSupplier(null, supplierBody(`sup a ${TAG}`, []), uuid()));
const supB = await step('supplier B tanpa bahan', () => P.saveSupplier(null, supplierBody(`Sup B ${TAG}`, []), uuid()));
await step('ubah supplier B (tanpa request_id)', () => P.saveSupplier(supB.supplier_id, { ...supplierBody(`Sup B ${TAG}`, [ids.m3]), note: 'catatan' }));

// ── PO
const items = (rows) => rows.map(([m, q, p]) => ({ material_id: m, qty_ordered: q, unit_price: p }));
await step('PO supplier tanpa bahan di daftar → ditolak', () => P.savePurchaseOrder(null, { supplier_id: supA.supplier_id, items: items([[ids.m3, '1', '100']]) }, uuid()));
await step('PO tanpa item → 400', () => P.savePurchaseOrder(null, { supplier_id: supA.supplier_id, items: [] }, uuid()));
await step('PO harga 0 & qty 3 desimal → 400', () => P.savePurchaseOrder(null, { supplier_id: supA.supplier_id, items: items([[ids.m1, '1.234', '0']]) }, uuid()));
await step('PO bahan ganda → 400', () => P.savePurchaseOrder(null, { supplier_id: supA.supplier_id, items: items([[ids.m1, '1', '1'], [ids.m1, '2', '1']]) }, uuid()));
const ridPo = uuid();
const po = await step('PO Draft dibuat (nilai dibulatkan per baris)', () => P.savePurchaseOrder(null, { supplier_id: supA.supplier_id, note: 'uji', items: items([[ids.m1, '10', '1500.55'], [ids.m2, '2.5', '1000.01']]) }, ridPo));
tracked.orders.push(po.po_id);
await step('PO replay identik (urutan item beda)', () => P.savePurchaseOrder(null, { supplier_id: supA.supplier_id, note: 'uji', items: items([[ids.m2, '2.50', '1000.01'], [ids.m1, '10.0', '1500.55']]) }, ridPo));
await step('ubah Draft', () => P.savePurchaseOrder(po.po_id, { supplier_id: supA.supplier_id, items: items([[ids.m1, '10', '1500'], [ids.m2, '2.5', '1000']]) }));
await step('transisi from salah → 409', () => P.changePurchaseOrderStatus(po.po_id, { from: 'dipesan', to: 'dibatalkan' }, uuid()));
await step('transisi ke diterima manual → ditolak', () => P.changePurchaseOrderStatus(po.po_id, { from: 'draft', to: 'diterima' }, uuid()));
await step('terima saat Draft → 409', () => P.receivePurchaseOrder(po.po_id, { lines: [{ po_item_id: '1', qty: '1' }] }, uuid()));
const ridOrder = uuid();
await step('pesan', () => P.changePurchaseOrderStatus(po.po_id, { from: 'draft', to: 'dipesan' }, ridOrder));
await step('pesan replay', () => P.changePurchaseOrderStatus(po.po_id, { from: 'draft', to: 'dipesan' }, ridOrder));
await step('ubah setelah dipesan → 409', () => P.savePurchaseOrder(po.po_id, { supplier_id: supA.supplier_id, items: items([[ids.m1, '1', '1']]) }));
const detail = await step('detail PO', () => P.getPurchaseOrder(po.po_id));
const [i1, i2] = detail.items.map((i) => i.po_item_id);
const ridRec = uuid();
await step('terima sebagian M1 4', () => P.receivePurchaseOrder(po.po_id, { lines: [{ po_item_id: i1, qty: '4' }] }, ridRec));
await step('terima replay ("4.00")', () => P.receivePurchaseOrder(po.po_id, { lines: [{ po_item_id: i1, qty: '4.00' }] }, ridRec));
await step('terima request_id sama qty beda → 409', () => P.receivePurchaseOrder(po.po_id, { lines: [{ po_item_id: i1, qty: '5' }] }, ridRec));
await step('terima berlebih M1 7 → 409', () => P.receivePurchaseOrder(po.po_id, { lines: [{ po_item_id: i1, qty: '7' }] }, uuid()));
await step('terima qty 3 desimal → 400', () => P.receivePurchaseOrder(po.po_id, { lines: [{ po_item_id: i1, qty: '1.234' }] }, uuid()));
await step('terima tanpa baris → 400', () => P.receivePurchaseOrder(po.po_id, { lines: [] }, uuid()));
await step('terima item asing → ditolak', () => P.receivePurchaseOrder(po.po_id, { lines: [{ po_item_id: '987654321', qty: '1' }] }, uuid()));
await step('terima sisa M1 6 + M2 2.5', () => P.receivePurchaseOrder(po.po_id, { lines: [{ po_item_id: i1, qty: '6' }, { po_item_id: i2, qty: '2.5' }] }, uuid()));
await step('terima lagi setelah Diterima → 409', () => P.receivePurchaseOrder(po.po_id, { lines: [{ po_item_id: i1, qty: '1' }] }, uuid()));
await step('batal setelah Diterima → 409', () => P.changePurchaseOrderStatus(po.po_id, { from: 'diterima', to: 'dibatalkan' }, uuid()));
const rec = (await P.getPurchaseOrder(po.po_id)).receipts.map((r) => r.receipt_id);
await step('koreksi tanpa alasan → 400', () => P.reverseOrCorrectReceipt(rec[0], { lines: [{ po_item_id: i1, qty: '3' }] }, uuid(), { correct: true }));
await step('koreksi tanpa baris > 0 → 400', () => P.reverseOrCorrectReceipt(rec[0], { lines: [], reason: 'x' }, uuid(), { correct: true }));
await step('koreksi penerimaan 1 (4 → 3)', () => P.reverseOrCorrectReceipt(rec[0], { lines: [{ po_item_id: i1, qty: '3' }], reason: 'salah hitung' }, uuid(), { correct: true }));
await step('koreksi kedua atas dokumen sama → 409', () => P.reverseOrCorrectReceipt(rec[0], { lines: [{ po_item_id: i1, qty: '2' }], reason: 'lagi' }, uuid(), { correct: true }));
await step('balik dokumen yang sudah dikoreksi → 409', () => P.reverseOrCorrectReceipt(rec[0], { reason: 'x' }, uuid(), { correct: false }));
await step('detail PO setelah koreksi', () => P.getPurchaseOrder(po.po_id));

// ── AD-07 dokumen stok
await step('stok masuk M2 5', () => S.recordStockIn(ids.m2, '5', uuid()));
const sin = await lastDocId(ids.m2);
await step('balik stok masuk tanpa alasan → 400', () => S.reverseOrCorrectStockInDocument(sin, {}, uuid(), { correct: false }));
await step('koreksi stok masuk qty 0 → 400', () => S.reverseOrCorrectStockInDocument(sin, { qty: '0', reason: 'x' }, uuid(), { correct: true }));
await step('koreksi stok masuk tanpa request_id → 400', () => S.reverseOrCorrectStockInDocument(sin, { qty: '4', reason: 'x' }, undefined, { correct: true }));
const ridRev = uuid();
await step('balik stok masuk', () => S.reverseOrCorrectStockInDocument(sin, { reason: 'salah input' }, ridRev, { correct: false }));
await step('balik stok masuk replay', () => S.reverseOrCorrectStockInDocument(sin, { reason: 'salah input' }, ridRev, { correct: false }));
await step('balik stok masuk kedua → 409', () => S.reverseOrCorrectStockInDocument(sin, { reason: 'lagi' }, uuid(), { correct: false }));
const m1Stock = (await S.getRawMaterials()).rows.find((m) => String(m.material_id) === String(ids.m1)).stock;
await step('opname expected basi → 409', () => S.countStock(ids.m1, { counted_stock: '1', expected_stock: '1.00' }, uuid()));
await step('opname number → 400', () => S.countStock(ids.m1, { counted_stock: 1, expected_stock: String(m1Stock) }, uuid()));
await step('opname tanpa request_id → 400', () => S.countStock(ids.m1, { counted_stock: '1', expected_stock: String(m1Stock) }));
await step('opname selisih 0 (tanpa mutasi)', () => S.countStock(ids.m1, { counted_stock: String(m1Stock), expected_stock: String(m1Stock) }, uuid()));
const opn = await step('opname fisik 0', () => S.countStock(ids.m1, { counted_stock: '0', expected_stock: String(m1Stock), reason: 'rusak' }, uuid()));
await step('balik opname → ditolak', () => S.reverseOrCorrectStockInDocument(opn.adjustment_id, { reason: 'x' }, uuid(), { correct: false }));
const opening = (await S.getMaterialMovements(ids.m1)).movements[0].document.id;
await step('balik saldo awal → ditolak', () => S.reverseOrCorrectStockInDocument(opening, { reason: 'x' }, uuid(), { correct: false }));
await step('balik penerimaan 2 saat stok M1 0 → 409', () => P.reverseOrCorrectReceipt(rec[1], { reason: 'retur' }, uuid(), { correct: false }));
await step('stok masuk batas atas → ditolak', () => S.recordStockIn(ids.m3, '99999999.99', uuid()));
await step('ubah bahan: koreksi stok tanpa expected → 400', () => S.saveMaterial(ids.m3, { name: `Garam ${TAG}`, unit: 'kg', stock: '7', min_stock: '1' }));
await step('ubah bahan: koreksi stok (opname)', () => S.saveMaterial(ids.m3, { name: `Garam ${TAG}`, unit: 'kg', stock: '7', expected_stock: '5', min_stock: '1' }));
await step('riwayat M1', () => S.getMaterialMovements(ids.m1));
await step('riwayat M2', () => S.getMaterialMovements(ids.m2));
await step('riwayat M3', () => S.getMaterialMovements(ids.m3));

// ── PO kedua: batal setelah sebagian, lalu pembalik
const po2 = await step('PO 2 dibuat', () => P.savePurchaseOrder(null, { supplier_id: supA.supplier_id, items: items([[ids.m2, '10', '2500.5']]) }, uuid()));
tracked.orders.push(po2.po_id);
await step('PO 2 pesan', () => P.changePurchaseOrderStatus(po2.po_id, { from: 'draft', to: 'dipesan' }, uuid()));
const j1 = (await P.getPurchaseOrder(po2.po_id)).items[0].po_item_id;
await step('PO 2 terima 3', () => P.receivePurchaseOrder(po2.po_id, { lines: [{ po_item_id: j1, qty: '3' }] }, uuid()));
await step('PO 2 batal (alasan)', () => P.changePurchaseOrderStatus(po2.po_id, { from: 'diterima_sebagian', to: 'dibatalkan', cancel_reason: 'stok cukup' }, uuid()));
const r2 = (await P.getPurchaseOrder(po2.po_id)).receipts[0].receipt_id;
await step('PO 2 pembalik setelah batal', () => P.reverseOrCorrectReceipt(r2, { reason: 'retur' }, uuid(), { correct: false }));
await step('PO 2 detail (qty_cancelled & nilai historis)', () => P.getPurchaseOrder(po2.po_id));
const po3 = await step('PO 3 Draft lalu batal', () => P.savePurchaseOrder(null, { supplier_id: supA.supplier_id, items: items([[ids.m1, '1', '1']]) }, uuid()));
await step('PO 3 batal dari Draft', () => P.changePurchaseOrderStatus(po3.po_id, { from: 'draft', to: 'dibatalkan' }, uuid()));
await step('nonaktifkan supplier A', () => P.setSupplierActive(supA.supplier_id, false));
await step('PO untuk supplier nonaktif → ditolak', () => P.savePurchaseOrder(null, { supplier_id: supA.supplier_id, items: items([[ids.m1, '1', '1']]) }, uuid()));
await step('daftar supplier (uji ini)', async () => (await P.getSuppliers()).filter((s) => s.name.includes(TAG)));
await step('daftar PO (uji ini)', async () => (await P.getPurchaseOrders()).filter((p) => [po.po_id, po2.po_id, po3.po_id].map(String).includes(String(p.po_id))));

// ── Kontrak rute: ID tidak valid, field tak dikenal, tipe salah, request_id tidak valid
await step('ID PO tidak valid → 400 INVALID_ID', () => P.getPurchaseOrder('abc'));
await step('ID penerimaan tidak valid → 400', () => P.reverseOrCorrectReceipt('0', { reason: 'x' }, uuid(), { correct: false }));
await step('ID dokumen stok tidak valid → 400', () => S.reverseOrCorrectStockInDocument('x1', { reason: 'x' }, uuid(), { correct: false }));
await step('PO tidak ada → 404', () => P.getPurchaseOrder('987654321'));
await step('field tak dikenal (supplier) → 400', () => P.saveSupplier(null, { ...supplierBody(`Sup X ${TAG}`, []), extra: 1 }, uuid()));
await step('lines bukan array → 400', () => P.receivePurchaseOrder(po2.po_id, { lines: 'x' }, uuid()));
await step('is_active bukan boolean → 400', () => P.setSupplierActive(supB.supplier_id, 'ya'));
await step('transisi status asing → 400', () => P.changePurchaseOrderStatus(po2.po_id, { from: 'x', to: 'dipesan' }, uuid()));
await step('request_id bukan UUID v4 → 400', () => P.changePurchaseOrderStatus(po2.po_id, { from: 'dibatalkan', to: 'dipesan' }, 'ABC'));
await step('stok masuk bahan tidak ada → 404', () => S.recordStockIn('987654321', '1', uuid()));
await step('ubah bahan nama kosong → 400', () => S.saveMaterial(ids.m3, { name: '', unit: 'kg', min_stock: '1' }));
await step('ubah bahan: expected_stock bukan angka → 400', () => S.saveMaterial(ids.m3, { name: `Garam ${TAG}`, unit: 'kg', stock: '9', expected_stock: 'abc', min_stock: '1' }));
await step('ubah bahan: expected_stock 3 desimal → 400', () => S.saveMaterial(ids.m3, { name: `Garam ${TAG}`, unit: 'kg', stock: '9', expected_stock: '7.001', min_stock: '1' }));
await step('ubah bahan: expected_stock basi → 409', () => S.saveMaterial(ids.m3, { name: `Garam ${TAG}`, unit: 'kg', stock: '9', expected_stock: '5', min_stock: '1' }));
await step('ubah bahan tanpa stok (info saja)', () => S.saveMaterial(ids.m3, { name: `Garam ${TAG}`, unit: 'g', min_stock: '2' }));
await step('stok masuk qty boolean → 400', () => S.recordStockIn(ids.m3, true, uuid()));

// ── Hak akses
await as('pelanggan@demo.com');
await step('pelanggan: daftar supplier ditolak', () => P.getSuppliers());
await step('pelanggan: opname ditolak', () => S.countStock(ids.m1, { counted_stock: '1', expected_stock: '0' }, uuid()));
useAuthStore.setState({ user: null, token: null });
await step('tanpa sesi: daftar PO ditolak', () => P.getPurchaseOrders());

console.log(JSON.stringify(out, null, 1));
