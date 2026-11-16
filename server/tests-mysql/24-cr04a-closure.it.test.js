// tests-mysql/24-cr04a-closure.it.test.js
// CR-04a · penutupan celah uji (audit kesesuaian setelah CP7) lewat HTTP asli pada MySQL 8:
// - BR-34: setiap operasi tulis pembelian & dokumen stok AD-07 mencatat TEPAT SATU baris audit (aksi & entitas sesuai
//   SPEC §13) dalam transaksi yang sama; replay request_id tidak menambah audit; penolakan tidak menulis audit.
// - Draft 0.8.3 §7: perubahan daftar bahan/status supplier tidak memengaruhi PO yang sudah Dipesan — penerimaan,
//   koreksi, pembalik, dan pembatalan tetap berjalan setelah supplier dinonaktifkan & bahan dilepas.
// - BR-21: pengganti (koreksi) pada PO Dibatalkan hanya boleh mengurangi per item; menambah → ditolak tanpa efek.
// - AC-42.1 (bagian API): Draft → ubah → Dipesan → Dibatalkan tanpa penerimaan → seluruh sisa dibatalkan historis.
// Invarian buku mutasi I-1 – I-11 diperiksa untuk setiap bahan uji.

const test = require('node:test');
const assert = require('node:assert/strict');
const { APP_URL, rows } = require('./helpers/context');
const { startServer } = require('./helpers/server');
const { createUser } = require('./helpers/fixtures');
const { rid, context, stockOf, fingerprint } = require('./helpers/purchasingFixtures');

process.env.DATABASE_URL = APP_URL;

const FILE = '24-cr04a-closure';
let server;
let staff;
let owner;
let ctx;
const itemOf = (po, materialId) => po.items.find((i) => i.material_id === materialId);
const audits = async (action, entity, id) => (await rows(
  'SELECT user_id, action, entity FROM audit_logs WHERE action = ? AND entity = ? AND entity_id = ? ORDER BY log_id', action, entity, id,
));
const lastAdjustment = async (materialId) => (await rows(
  'SELECT adjustment_id FROM stock_adjustments WHERE material_id = ? ORDER BY adjustment_id DESC LIMIT 1', materialId,
))[0].adjustment_id;

test.before(async () => {
  server = await startServer(FILE);
  staff = await createUser('staf');
  owner = await createUser('owner');
  ctx = context(server, { staff, owner });
});
test.after(async () => { await server?.stop(); });

test('BR-34: audit tepat satu per operasi (penerimaan, pembalik, koreksi, batal, opname, pembalik/koreksi stok masuk); replay & penolakan tanpa audit', async () => {
  const m1 = await ctx.material('0');
  const po = await ctx.purchaseOrder(await ctx.supplier([m1]), [{ material_id: m1, qty_ordered: '10', unit_price: '100' }]);
  const item = itemOf(po, m1).po_item_id;

  // Penerimaan + replay
  const body = { lines: [{ po_item_id: item, qty: '4' }], request_id: rid() };
  const r1 = await ctx.api('POST', `/purchase-orders/${po.po_id}/receipts`, body);
  assert.equal(r1.status, 201, JSON.stringify(r1.body));
  assert.equal((await ctx.api('POST', `/purchase-orders/${po.po_id}/receipts`, body)).status, 201);
  const receiptA = r1.body.data.receipt_id;
  assert.deepEqual(await audits('receive_purchase_order', 'goods_receipts', receiptA), [{ user_id: staff, action: 'receive_purchase_order', entity: 'goods_receipts' }]);
  const receiptB = (await ctx.api('POST', `/purchase-orders/${po.po_id}/receipts`, { lines: [{ po_item_id: item, qty: '3' }], request_id: rid() })).body.data.receipt_id;

  // Koreksi A (owner) + replay → satu audit correct_goods_receipt pada dokumen asal
  const corr = { lines: [{ po_item_id: item, qty: '2' }], reason: 'salah hitung', request_id: rid() };
  assert.equal((await ctx.api('POST', `/goods-receipts/${receiptA}/correct`, corr, owner)).status, 201);
  assert.equal((await ctx.api('POST', `/goods-receipts/${receiptA}/correct`, corr, owner)).status, 201);
  assert.deepEqual(await audits('correct_goods_receipt', 'goods_receipts', receiptA), [{ user_id: owner, action: 'correct_goods_receipt', entity: 'goods_receipts' }]);
  // Penolakan (koreksi kedua → 409) tidak menulis audit apa pun
  const before = await fingerprint();
  assert.equal((await ctx.api('POST', `/goods-receipts/${receiptA}/correct`, { ...corr, request_id: rid() })).status, 409);
  assert.deepEqual(await fingerprint(), before);

  // Pembalik B → satu audit reverse_goods_receipt
  assert.equal((await ctx.api('POST', `/goods-receipts/${receiptB}/reverse`, { reason: 'retur', request_id: rid() })).status, 201);
  assert.deepEqual((await audits('reverse_goods_receipt', 'goods_receipts', receiptB)).length, 1);

  // Batal PO → satu audit cancel_purchase_order
  const cancel = { from: 'diterima_sebagian', to: 'dibatalkan', cancel_reason: 'cukup', request_id: rid() };
  assert.equal((await ctx.api('PATCH', `/purchase-orders/${po.po_id}/status`, cancel)).status, 200);
  assert.equal((await ctx.api('PATCH', `/purchase-orders/${po.po_id}/status`, cancel)).status, 200, 'replay');
  assert.equal((await audits('cancel_purchase_order', 'purchase_orders', po.po_id)).length, 1);

  // Dokumen stok AD-07: opname, pembalik & koreksi stok masuk (entitas raw_materials = bahan)
  const m2 = await ctx.material('5');
  const count = { counted_stock: '6', expected_stock: '5', request_id: rid() };
  assert.equal((await ctx.api('POST', `/raw-materials/${m2}/stock-counts`, count)).status, 201);
  assert.equal((await ctx.api('POST', `/raw-materials/${m2}/stock-counts`, count)).status, 201, 'replay');
  assert.equal((await audits('count_stock', 'raw_materials', m2)).length, 1);
  assert.equal((await ctx.api('POST', `/raw-materials/${m2}/stock-in`, { qty: '2' })).status, 200);
  const sin1 = await lastAdjustment(m2);
  assert.equal((await ctx.api('POST', `/stock-adjustments/${sin1}/reverse`, { reason: 'dobel', request_id: rid() })).status, 201);
  assert.equal((await ctx.api('POST', `/raw-materials/${m2}/stock-in`, { qty: '3' })).status, 200);
  const sin2 = await lastAdjustment(m2);
  assert.equal((await ctx.api('POST', `/stock-adjustments/${sin2}/correct`, { qty: '1', reason: 'salah ketik', request_id: rid() })).status, 201);
  assert.equal((await audits('reverse_stock_in', 'raw_materials', m2)).length, 1);
  assert.equal((await audits('correct_stock_in', 'raw_materials', m2)).length, 1);
  assert.equal(await stockOf(m2), '7.00'); // 5 → opname 6 → +2 −2 → +3 → koreksi 3 → 1
  await ctx.assertLedger();
});

test('Draft §7: supplier dinonaktifkan & bahan dilepas setelah PO Dipesan → penerimaan, koreksi, pembalik, batal tetap berjalan', async () => {
  const m1 = await ctx.material('0');
  const m2 = await ctx.material('0');
  const supplierId = await ctx.supplier([m1, m2]);
  const po = await ctx.purchaseOrder(supplierId, [{ material_id: m1, qty_ordered: '10', unit_price: '100' }, { material_id: m2, qty_ordered: '5', unit_price: '50' }]);
  const [i1, i2] = [itemOf(po, m1).po_item_id, itemOf(po, m2).po_item_id];

  // Bahan m1 dilepas dari daftar supplier, lalu supplier dinonaktifkan
  const sup = (await ctx.api('GET', '/suppliers')).body.data.find((s) => s.supplier_id === supplierId);
  const update = { name: sup.name, phone: sup.phone, address: sup.address, email: sup.email, contact_person: sup.contact_person, material_ids: [m2] };
  assert.equal((await ctx.api('PUT', `/suppliers/${supplierId}`, update)).status, 200);
  assert.equal((await ctx.api('PATCH', `/suppliers/${supplierId}/active`, { is_active: false })).status, 200);

  // PO baru tetap ditolak (BR-18), PO yang sudah Dipesan tetap dapat diterima — termasuk bahan yang dilepas
  assert.equal((await ctx.api('POST', '/purchase-orders', { supplier_id: supplierId, items: [{ material_id: m2, qty_ordered: '1', unit_price: '1' }], request_id: rid() })).status, 400);
  const rec = await ctx.api('POST', `/purchase-orders/${po.po_id}/receipts`, { lines: [{ po_item_id: i1, qty: '4' }, { po_item_id: i2, qty: '5' }], request_id: rid() });
  assert.equal(rec.status, 201, JSON.stringify(rec.body));
  assert.deepEqual([rec.body.data.purchase_order.status, await stockOf(m1), await stockOf(m2)], ['diterima_sebagian', '4.00', '5.00']);
  const corr = await ctx.api('POST', `/goods-receipts/${rec.body.data.receipt_id}/correct`, { lines: [{ po_item_id: i1, qty: '3' }, { po_item_id: i2, qty: '5' }], reason: 'salah hitung', request_id: rid() });
  assert.equal(corr.status, 201, JSON.stringify(corr.body));
  assert.equal(await stockOf(m1), '3.00');
  const cancel = await ctx.api('PATCH', `/purchase-orders/${po.po_id}/status`, { from: 'diterima_sebagian', to: 'dibatalkan', request_id: rid() });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
  assert.deepEqual([itemOf(cancel.body.data, m1).qty_cancelled, itemOf(cancel.body.data, m2).qty_cancelled], [7, 0]);
  const rev = await ctx.api('POST', `/goods-receipts/${corr.body.data.replacement_id}/reverse`, { reason: 'retur', request_id: rid() });
  assert.equal(rev.status, 201, JSON.stringify(rev.body));
  assert.deepEqual([rev.body.data.purchase_order.status, await stockOf(m1), await stockOf(m2)], ['dibatalkan', '0.00', '0.00']);
  await ctx.assertLedger();
});

test('BR-21: koreksi penerimaan pada PO Dibatalkan hanya boleh mengurangi per item; menambah ditolak tanpa efek', async () => {
  const m1 = await ctx.material('0');
  const po = await ctx.purchaseOrder(await ctx.supplier([m1]), [{ material_id: m1, qty_ordered: '10', unit_price: '100' }]);
  const item = itemOf(po, m1).po_item_id;
  const rec = await ctx.api('POST', `/purchase-orders/${po.po_id}/receipts`, { lines: [{ po_item_id: item, qty: '4' }], request_id: rid() });
  assert.equal((await ctx.api('PATCH', `/purchase-orders/${po.po_id}/status`, { from: 'diterima_sebagian', to: 'dibatalkan', request_id: rid() })).status, 200);

  const before = await fingerprint();
  const up = await ctx.api('POST', `/goods-receipts/${rec.body.data.receipt_id}/correct`, { lines: [{ po_item_id: item, qty: '5' }], reason: 'kurang hitung', request_id: rid() });
  assert.deepEqual([up.status, up.body.message], [409, 'Jumlah melebihi sisa yang belum diterima.'], 'sama dengan penerimaan berlebih');
  assert.deepEqual(await fingerprint(), before, 'penolakan tanpa dokumen, mutasi, stok, audit');

  const down = await ctx.api('POST', `/goods-receipts/${rec.body.data.receipt_id}/correct`, { lines: [{ po_item_id: item, qty: '3' }], reason: 'lebih hitung', request_id: rid() });
  assert.equal(down.status, 201, JSON.stringify(down.body));
  const view = down.body.data.purchase_order;
  assert.deepEqual([view.status, itemOf(view, m1).net_received, itemOf(view, m1).qty_cancelled, view.values.cancelled_value, await stockOf(m1)],
    ['dibatalkan', 3, 6, 600, '3.00'], 'qty_cancelled & nilai sisa dibatalkan tetap historis');
  await ctx.assertLedger();
});

test('AC-42.1 (API): Draft → ubah → Dipesan → Dibatalkan tanpa penerimaan → seluruh sisa dibatalkan, stok tidak berubah', async () => {
  const m1 = await ctx.material('2');
  const supplierId = await ctx.supplier([m1]);
  const draft = await ctx.purchaseOrder(supplierId, [{ material_id: m1, qty_ordered: '1', unit_price: '1' }], { order: false });
  const edited = await ctx.api('PUT', `/purchase-orders/${draft.po_id}`, { supplier_id: supplierId, items: [{ material_id: m1, qty_ordered: '2.5', unit_price: '1000.01' }] });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.data.values.order_value, 2500.03, 'round(2,5 × 1.000,01) setengah menjauhi nol');
  assert.equal((await ctx.api('PATCH', `/purchase-orders/${draft.po_id}/status`, { from: 'draft', to: 'dipesan', request_id: rid() })).status, 200);
  const cancel = await ctx.api('PATCH', `/purchase-orders/${draft.po_id}/status`, { from: 'dipesan', to: 'dibatalkan', cancel_reason: 'batal', request_id: rid() });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
  const view = cancel.body.data;
  assert.deepEqual([view.status, itemOf(view, m1).qty_cancelled, view.values.cancelled_value, view.values.received_value, view.cancel_reason, await stockOf(m1)],
    ['dibatalkan', 2.5, 2500.03, 0, 'batal', '2.00']);
  assert.equal((await ctx.api('PATCH', `/purchase-orders/${draft.po_id}/status`, { from: 'dibatalkan', to: 'dipesan', request_id: rid() })).status, 409, 'Dibatalkan final');
  await ctx.assertLedger();
});
