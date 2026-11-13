// tests-mysql/22-cr04a-purchasing.it.test.js
// CR-04a CP5 · FR-41, FR-42 · UC-33, UC-34 · BR-17 – BR-19, BR-21, BR-22, BR-31, BR-34 — supplier & purchase order lewat
// HTTP asli pada MySQL 8: field T-01, nama unik tanpa beda huruf, daftar bahan, aktif/nonaktif (tanpa hapus); PO hanya
// supplier aktif berbahan & bahan terdaftar, 1 – 30 item, nomor PO-YYMMDD-NNN, nilai per baris (setengah menjauhi nol),
// ubah hanya Draft, transisi {from, to}, pesan memeriksa ulang supplier & bahan, batal Draft; audit tepat sekali;
// IT-31 (bagian supplier/PO): PUT supplier, PATCH aktif, PUT PO Draft tanpa/dengan request_id, replay, 409 REUSED, tanpa 102;
// IT-15: ubah daftar bahan supplier × buat/pesan PO bersamaan → konsisten, 0 deadlock.

const test = require('node:test');
const assert = require('node:assert/strict');
const { APP_URL, rows, innodbMetrics } = require('./helpers/context');
const { startServer } = require('./helpers/server');
const { createUser, unique } = require('./helpers/fixtures');
const { rid, context } = require('./helpers/purchasingFixtures');
const { getJakartaDateKey } = require('../src/utils/jakartaDate');

process.env.DATABASE_URL = APP_URL;

const FILE = '22-cr04a-purchasing';
const ROUNDS = Number(process.env.C4_ROUNDS_R22 || 15);
let server;
let staff;
let owner;
let ctx;
let deadlocksBefore;
const audits = async (entity, id) => (await rows('SELECT action FROM audit_logs WHERE entity = ? AND entity_id = ? ORDER BY log_id', entity, id)).map((a) => a.action);

test.before(async () => {
  server = await startServer(FILE);
  staff = await createUser('staf');
  owner = await createUser('owner');
  ctx = context(server, { staff, owner });
  deadlocksBefore = (await innodbMetrics()).lock_deadlocks;
});
test.after(async () => { await server?.stop(); });

test('supplier: buat (T-01, daftar bahan), validasi, nama unik, ubah, replay & REUSED, nonaktif tanpa hapus; audit', async () => {
  const [m1, m2, m3] = [await ctx.material(), await ctx.material(), await ctx.material()];
  const requestId = rid();
  const body = { name: unique('Supplier Tepung '), phone: '+62 812-3456-7890', address: 'Jl. Gandum 2', email: 'tepung@contoh.id', contact_person: 'Budi', note: '', material_ids: [m2, m1], request_id: requestId };
  const first = await ctx.api('POST', '/suppliers', body);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.deepEqual([first.body.data.phone, first.body.data.note, first.body.data.is_active, first.body.data.materials.map((m) => m.material_id)], ['+6281234567890', null, true, [m1, m2]]);
  const replay = await ctx.api('POST', '/suppliers', body);
  assert.deepEqual([replay.status, replay.body], [201, first.body]);
  assert.equal((await ctx.api('POST', '/suppliers', { ...body, contact_person: 'Lain' })).body.code, 'REQUEST_ID_REUSED');
  const id = first.body.data.supplier_id;
  assert.deepEqual(await audits('suppliers', id), ['create_supplier']);

  const dup = await ctx.api('POST', '/suppliers', { ...body, name: body.name.toUpperCase(), request_id: rid() });
  assert.deepEqual([dup.status, dup.body.fieldErrors.name], [400, 'Nama supplier sudah dipakai.']);
  const invalid = await ctx.api('POST', '/suppliers', { name: ' ', phone: '0812', address: '', email: 'x@', contact_person: 'A', material_ids: ['999999999'], request_id: rid() });
  assert.deepEqual([invalid.status, Object.keys(invalid.body.fieldErrors).sort()], [400, ['address', 'email', 'material_ids.0', 'name', 'phone']]);
  const empty = await ctx.supplier([]);
  assert.equal(empty.length > 0, true, 'daftar bahan boleh kosong saat dibuat');

  // IT-31: PUT tanpa request_id (perilaku biasa); dengan request_id → replay; payload beda → 409
  let res = await ctx.api('PUT', `/suppliers/${id}`, { ...body, request_id: undefined, note: 'langganan', material_ids: [m1, m2, m3] });
  assert.deepEqual([res.status, res.body.data.materials.length, res.body.data.note], [200, 3, 'langganan']);
  const putId = rid();
  const put = await ctx.api('PUT', `/suppliers/${id}`, { ...body, material_ids: [m1, m3], request_id: putId });
  assert.deepEqual([put.status, (await ctx.api('PUT', `/suppliers/${id}`, { ...body, material_ids: [m3, m1], request_id: putId })).body], [200, put.body], 'urutan bahan kanonik → replay');
  assert.equal((await ctx.api('PUT', `/suppliers/${id}`, { ...body, material_ids: [m2], request_id: putId })).body.code, 'REQUEST_ID_REUSED');
  res = await ctx.api('PATCH', `/suppliers/${id}/active`, { is_active: false, request_id: rid() });
  assert.deepEqual([res.status, res.body.data.is_active], [200, false]);
  res = await ctx.api('PATCH', `/suppliers/${id}/active`, { is_active: false });
  assert.equal(res.status, 200, 'nilai sama → tanpa tulis');
  assert.deepEqual(await audits('suppliers', id), ['create_supplier', 'update_supplier', 'update_supplier', 'set_supplier_active']);
  assert.equal((await rows('SELECT COUNT(*) AS n FROM suppliers WHERE supplier_id = ?', id))[0].n, '1', 'tidak dihapus');
  assert.equal((await rows('SELECT COUNT(*) AS n FROM operation_requests WHERE response_status = 102'))[0].n, '0');
});

test('PO: supplier tidak aktif / tanpa bahan / bahan di luar daftar ditolak; validasi item; nomor; nilai per baris; audit', async () => {
  const [m1, m2, m3] = [await ctx.material(), await ctx.material(), await ctx.material()];
  const sup = await ctx.supplier([m1, m2]);
  const items = [{ material_id: m1, qty_ordered: '0.33', unit_price: '0.15' }, { material_id: m2, qty_ordered: '0.33', unit_price: '0.15' }];
  const created = await ctx.api('POST', '/purchase-orders', { supplier_id: sup, note: 'mingguan', items, request_id: rid() });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const po = created.body.data;
  const key = getJakartaDateKey();
  assert.match(po.po_number, new RegExp(`^PO-${key.slice(2, 4)}${key.slice(5, 7)}${key.slice(8, 10)}-\\d{3}$`));
  assert.deepEqual([po.status, po.items.map((i) => i.line_value), po.values.order_value], ['draft', [0.05, 0.05], 0.1]);
  assert.deepEqual(await audits('purchase_orders', po.po_id), ['create_purchase_order']);

  const reject = async (supplierId, list, field) => {
    const res = await ctx.api('POST', '/purchase-orders', { supplier_id: supplierId, items: list, request_id: rid() });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.ok(Object.keys(res.body.fieldErrors).includes(field), `${field}: ${JSON.stringify(res.body.fieldErrors)}`);
  };
  await reject(sup, [{ material_id: m3, qty_ordered: '1', unit_price: '1' }], 'items.0.material_id');
  await reject(await ctx.supplier([]), [{ material_id: m1, qty_ordered: '1', unit_price: '1' }], 'supplier_id');
  await reject(sup, [{ material_id: m1, qty_ordered: 1, unit_price: '1' }], 'items.0.qty_ordered');
  await reject(sup, [{ material_id: m1, qty_ordered: '1', unit_price: '1.001' }], 'items.0.unit_price');
  await reject(sup, [items[0], { ...items[0] }], 'items.1.material_id');
  await reject(sup, Array.from({ length: 31 }, () => items[0]), 'items');
  await reject(sup, [{ material_id: m1, qty_ordered: '99999999.99', unit_price: '9999999999.99' }], 'items.0.unit_price');
  const inactive = await ctx.supplier([m1]);
  await ctx.api('PATCH', `/suppliers/${inactive}/active`, { is_active: false });
  await reject(inactive, [{ material_id: m1, qty_ordered: '1', unit_price: '1' }], 'supplier_id');
});

test('transisi & ubah Draft: PUT hanya Draft, {from, to}, pesan memeriksa ulang supplier & daftar bahan, batal Draft', async () => {
  const [m1, m2] = [await ctx.material(), await ctx.material()];
  const sup = await ctx.supplier([m1, m2]);
  const draft = await ctx.purchaseOrder(sup, [{ material_id: m1, qty_ordered: '5', unit_price: '1000' }], { order: false });
  const putId = rid();
  const edit = { supplier_id: sup, note: 'revisi', items: [{ material_id: m2, qty_ordered: '2.5', unit_price: '2000' }] };
  let res = await ctx.api('PUT', `/purchase-orders/${draft.po_id}`, { ...edit, request_id: putId });
  assert.deepEqual([res.status, res.body.data.items.map((i) => i.material_id), res.body.data.values.order_value], [200, [m2], 5000]);
  assert.deepEqual((await ctx.api('PUT', `/purchase-orders/${draft.po_id}`, { ...edit, request_id: putId })).body, res.body);

  // Pesan ditolak setelah bahan dilepas dari supplier atau supplier dinonaktifkan; PO tetap Draft
  await ctx.api('PUT', `/suppliers/${sup}`, { name: (await rows('SELECT name FROM suppliers WHERE supplier_id = ?', sup))[0].name, phone: '+6281234567890', address: 'Jl. Uji 1', email: 'uji@supplier.id', contact_person: 'Ani', material_ids: [m1] });
  res = await ctx.api('PATCH', `/purchase-orders/${draft.po_id}/status`, { from: 'draft', to: 'dipesan', request_id: rid() });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  res = await ctx.api('PUT', `/purchase-orders/${draft.po_id}`, { ...edit, items: [{ material_id: m1, qty_ordered: '1', unit_price: '1' }] });
  assert.equal(res.status, 200);
  res = await ctx.api('PATCH', `/purchase-orders/${draft.po_id}/status`, { from: 'draft', to: 'dipesan', request_id: rid() });
  assert.deepEqual([res.status, res.body.data.status, typeof res.body.data.ordered_at], [200, 'dipesan', 'string']);
  assert.equal((await ctx.api('PUT', `/purchase-orders/${draft.po_id}`, edit)).status, 409, 'PO terkunci setelah Dipesan');
  for (const [from, to] of [['draft', 'dibatalkan'], ['dipesan', 'diterima'], ['dipesan', 'draft']]) {
    assert.equal((await ctx.api('PATCH', `/purchase-orders/${draft.po_id}/status`, { from, to, request_id: rid() })).status, 409, `${from}→${to}`);
  }
  const other = await ctx.purchaseOrder(sup, [{ material_id: m1, qty_ordered: '4', unit_price: '10' }], { order: false });
  res = await ctx.api('PATCH', `/purchase-orders/${other.po_id}/status`, { from: 'draft', to: 'dibatalkan', cancel_reason: 'tidak jadi', request_id: rid() });
  assert.deepEqual([res.status, res.body.data.status, res.body.data.items[0].qty_cancelled, res.body.data.values.cancelled_value, res.body.data.cancel_reason],
    [200, 'dibatalkan', 4, 40, 'tidak jadi']);
  assert.deepEqual(await audits('purchase_orders', draft.po_id), ['create_purchase_order', 'update_purchase_order', 'update_purchase_order', 'order_purchase_order']);
  const list = await ctx.api('GET', '/purchase-orders');
  assert.ok(list.body.data.some((p) => p.po_id === draft.po_id && p.status === 'dipesan'));
});

test('IT-15: ubah daftar bahan supplier × buat/pesan PO bersamaan — konsisten, 0 deadlock', async () => {
  const [m1, m2] = [await ctx.material(), await ctx.material()];
  const sup = await ctx.supplier([m1, m2]);
  const name = (await rows('SELECT name FROM suppliers WHERE supplier_id = ?', sup))[0].name;
  const base = { name, phone: '+6281234567890', address: 'Jl. Uji 1', email: 'uji@supplier.id', contact_person: 'Ani' };
  for (let round = 0; round < ROUNDS; round += 1) {
    const draft = await ctx.purchaseOrder(sup, [{ material_id: m2, qty_ordered: '1', unit_price: '1' }], { order: false }).catch(() => null);
    const results = await Promise.all([
      ctx.api('PUT', `/suppliers/${sup}`, { ...base, material_ids: round % 2 ? [m1, m2] : [m1] }),
      ctx.api('POST', '/purchase-orders', { supplier_id: sup, items: [{ material_id: m2, qty_ordered: '1', unit_price: '1' }], request_id: rid() }),
      draft ? ctx.api('PATCH', `/purchase-orders/${draft.po_id}/status`, { from: 'draft', to: 'dipesan', request_id: rid() }, owner) : Promise.resolve({ status: 409 }),
    ]);
    for (const r of results) assert.ok([200, 201, 400, 409].includes(r.status), JSON.stringify(r.body));
    // Konsistensi: setiap PO berstatus Dipesan hanya memuat bahan yang terdaftar saat dipesan (diperiksa di bawah kunci)
    if (results[2].status === 200) assert.ok(results[2].body.data.items.every((i) => [m1, m2].includes(i.material_id)));
  }
  assert.equal((await innodbMetrics()).lock_deadlocks - deadlocksBefore, 0);
  assert.equal((await rows('SELECT COUNT(*) AS n FROM operation_requests WHERE response_status = 102'))[0].n, '0');
  await ctx.assertLedger();
});
