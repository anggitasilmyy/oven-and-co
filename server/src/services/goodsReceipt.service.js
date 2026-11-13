// services/goodsReceipt.service.js
// CR-04a CP5 · FR-43 · UC-35 · BR-20 – BR-24, BR-30, BR-31, BR-34 · K05 · AD-12 detail PO — penerimaan bahan dari PO
// (sebagian berulang, kelebihan ditolak), pembalik murni (R) dan koreksi (R + P berbagi operation_request_id), satu
// mutasi bersih per item merujuk P bila item ada di P, selain itu R (Draft 0.8.3 §4.3). Stok hanya berubah lewat
// stockLedger.service (buku mutasi CP4); status PO dihitung ulang dari jumlah bersih diterima (PO Dibatalkan tetap,
// qty_cancelled tidak berubah). request_id WAJIB. Urutan kunci (§10.1): users S → operation_requests →
// purchase_orders FOR UPDATE → dokumen asal O FOR UPDATE → raw_materials FOR UPDATE urut material_id.
// PO dari dokumen asal dibaca DI LUAR transaksi lalu dicocokkan setelah dikunci (tanpa SELECT biasa sebelum kunci).

const prisma = require('../lib/prisma');
const { AUDIT_ACTION, AUDIT_ENTITY } = require('../utils/businessConstants');
const { recordAudit } = require('./auditLog.service');
const { decimalToCents } = require('./decimalInputRules.service');
const { runOperation } = require('./operationRequest.service');
const { lockMaterials, writeMovements, movementView } = require('./stockLedger.service');
const {
  validateReceiptLines, validateReceiptCorrection, purchaseOrderStatusFromReceipts, reasonError,
} = require('./purchasingRules.service');
const { reversalTargetError, planReversalOrCorrection, correctionShapeError } = require('./stockLedgerRules.service');
const { loadPurchaseOrder, toPurchaseOrderView } = require('./purchaseOrderView.service');
const { lockPurchaseOrder } = require('./purchaseOrder.service');
const { receiptLines } = require('./purchasePayload.service');

const RECEIPT_NOT_FOUND = 'Dokumen penerimaan tidak ditemukan.';

function httpError(statusCode, message, extra = {}) {
  return Object.assign(new Error(message), { statusCode, ...extra });
}

const failFromRule = (result) => {
  if (result.status === 400) throw httpError(400, Object.values(result.errors)[0], { fieldErrors: result.errors });
  if (result.status !== 200) throw httpError(result.status, result.message);
  return result.value;
};
const noteOf = (note) => (typeof note === 'string' && note.trim() ? note.trim() : null);
const itemMap = (items) => new Map(items.map((i) => [i.po_item_id, i]));

/** Bahan item PO (FOR SHARE, setelah PO dikunci) → kunci baris bahan urut material_id */
async function lockPoMaterials(tx, poId) {
  const rows = await tx.$queryRaw`SELECT material_id FROM purchase_order_items WHERE po_id = ${BigInt(poId)} FOR SHARE`;
  return lockMaterials(tx, rows.map((r) => String(r.material_id)));
}

async function writeReceipt(tx, { poId, kind, lines, reason = null, note = null, reversesId = null, replacesId = null, requestId, actorId }) {
  const receipt = await tx.goodsReceipt.create({
    data: { poId: BigInt(poId), kind, reason, note, reversesId, replacesId, operationRequestId: requestId, createdBy: BigInt(actorId) },
    select: { receiptId: true },
  });
  await tx.goodsReceiptLine.createMany({ data: lines.map((l) => ({ receiptId: receipt.receiptId, poItemId: BigInt(l.po_item_id), qty: l.qty })) });
  return receipt.receiptId;
}

/** Status PO dari jumlah bersih diterima terbaru (setelah dokumen ditulis) */
async function refreshStatus(tx, poId) {
  const data = await loadPurchaseOrder(tx, poId);
  const next = purchaseOrderStatusFromReceipts(data.po.status, data.items);
  if (next !== data.po.status) await tx.purchaseOrder.update({ where: { poId: BigInt(poId) }, data: { status: next } });
  return toPurchaseOrderView(await loadPurchaseOrder(tx, poId));
}

/** POST /api/admin/purchase-orders/:id/receipts { lines[{po_item_id, qty}], note? } → 201 */
async function receivePurchaseOrder(actorId, poId, input, { requestId, now = new Date() }) {
  return runOperation({
    actorId, requestId, operation: 'receive_purchase_order', targetType: 'purchase_order', targetId: String(poId),
    payload: { lines: receiptLines(input.lines), note: input.note ?? null }, successStatus: 201,
  }, async (tx) => {
    await lockPurchaseOrder(tx, poId);
    const locked = await lockPoMaterials(tx, poId);
    const data = await loadPurchaseOrder(tx, poId);
    const lines = failFromRule(validateReceiptLines(data.po.status, itemMap(data.items), input.lines));
    const noteError = reasonError(input.note, { required: false });
    if (noteError) throw httpError(400, noteError, { fieldErrors: { note: noteError } });
    const receiptId = await writeReceipt(tx, { poId, kind: 'normal', lines, note: noteOf(input.note), requestId, actorId });
    const plan = lines.map((l) => ({ material_id: l.material_id, po_item_id: l.po_item_id, delta: decimalToCents(l.qty), type: 'penerimaan' }))
      .sort((a, b) => (BigInt(a.material_id) < BigInt(b.material_id) ? -1 : 1));
    const movements = await writeMovements(tx, locked, plan, (row) => ({ receiptId, poItemId: BigInt(row.po_item_id) }), actorId);
    await recordAudit(tx, { actorId, action: AUDIT_ACTION.RECEIVE_PURCHASE_ORDER, entity: AUDIT_ENTITY.GOODS_RECEIPTS, entityId: receiptId, now });
    return { purchase_order: await refreshStatus(tx, poId), receipt_id: String(receiptId), movements: movements.map(movementView) };
  });
}

/**
 * POST /api/admin/goods-receipts/:id/reverse { reason } dan /correct { lines, reason, note? } → 201.
 * O tidak berlaku lagi → 409 DOCUMENT_ALREADY_SUPERSEDED; saldo akhir di luar batas → 409 STOCK_OUT_OF_RANGE (rollback).
 */
async function reverseOrCorrectReceipt(actorId, receiptId, input, { requestId, correct, now = new Date() }) {
  const head = await prisma.goodsReceipt.findUnique({ where: { receiptId: BigInt(receiptId) }, select: { poId: true } });
  if (!head) throw httpError(404, RECEIPT_NOT_FOUND);
  const poId = String(head.poId);
  return runOperation({
    actorId, requestId, operation: correct ? 'correct_goods_receipt' : 'reverse_goods_receipt', targetType: 'goods_receipt',
    targetId: String(receiptId), payload: correct ? { lines: receiptLines(input.lines), reason: input.reason, note: input.note ?? null } : { reason: input.reason },
    successStatus: 201,
  }, async (tx) => {
    await lockPurchaseOrder(tx, poId);
    const [original] = await tx.$queryRaw`SELECT receipt_id, po_id, kind FROM goods_receipts WHERE receipt_id = ${BigInt(receiptId)} FOR UPDATE`;
    if (!original || String(original.po_id) !== poId) throw httpError(409, 'Data penerimaan sudah berubah. Muat ulang data.');
    const locked = await lockPoMaterials(tx, poId);
    const data = await loadPurchaseOrder(tx, poId);
    const doc = data.receipts.find((r) => r.receipt_id === String(receiptId));
    const error = reversalTargetError('goods_receipt', { kind: doc.kind, reversed: Number(doc.reversed_count) > 0, replaced: Number(doc.replaced_count) > 0 });
    if (error) throw httpError(error.status, error.message, error.code ? { apiCode: error.code } : {});
    const items = itemMap(data.items);
    const O = doc.lines.map((l) => ({ ...l, material_id: items.get(l.po_item_id).material_id }));
    const P = correct ? failFromRule(validateReceiptCorrection(data.po.status, items, O, input.lines)) : null;
    const shape = correct ? correctionShapeError('goods_receipt', O, P) : null;
    if (shape) throw httpError(shape.status, shape.message);
    const reason = input.reason.trim();
    const common = { poId, reason, requestId, actorId };
    const reversalId = await writeReceipt(tx, { ...common, kind: 'pembalik', lines: O, reversesId: BigInt(receiptId) });
    const replacementId = correct
      ? await writeReceipt(tx, { ...common, kind: 'pengganti', lines: P, note: noteOf(input.note), replacesId: BigInt(receiptId) })
      : null;
    const plan = planReversalOrCorrection('goods_receipt', O, P);
    const movements = await writeMovements(tx, locked, plan,
      (row) => ({ receiptId: row.reference === 'P' ? replacementId : reversalId, poItemId: BigInt(row.po_item_id) }), actorId);
    await recordAudit(tx, {
      actorId, action: correct ? AUDIT_ACTION.CORRECT_GOODS_RECEIPT : AUDIT_ACTION.REVERSE_GOODS_RECEIPT, entity: AUDIT_ENTITY.GOODS_RECEIPTS, entityId: receiptId, now,
    });
    return {
      purchase_order: await refreshStatus(tx, poId), reversal_id: String(reversalId),
      replacement_id: replacementId ? String(replacementId) : null, movements: movements.map(movementView),
    };
  });
}

module.exports = { RECEIPT_NOT_FOUND, receivePurchaseOrder, reverseOrCorrectReceipt };
