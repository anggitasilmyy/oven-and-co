// services/mock/goodsReceiptAdmin.js
// CR-04a CP6 · FR-43 · UC-35 · BR-20 – BR-24, BR-30, BR-31 · AD-12 detail PO — pengganti goodsReceipt.service server (CP5)
// di mode mock: penerimaan sebagian berulang (kelebihan 409), pembalik (R) & koreksi (R + P berbagi request_id; satu
// mutasi bersih per item merujuk P bila item ada di P, selain itu R), stok hanya lewat buku mutasi (ledgerMock), status
// PO dihitung ulang dari jumlah bersih diterima. Aturan murni sama dengan server.

import { getTables } from './db';
import { runMockOperation, nextId, nowIso, loadLedgerTables, applyMovements, movementView } from './ledgerMock';
import { loadPurchaseOrderRows, purchaseOrderView } from './purchaseOrderData';
import {
  validateReceiptLines, validateReceiptCorrection, purchaseOrderStatusFromReceipts, reasonError,
} from '../../utils/rules/purchasing';
import { reversalTargetError, planReversalOrCorrection, correctionShapeError } from '../../utils/rules/stockLedger';
import { decimalToCents } from '../../utils/rules/decimalInput';
import { receiptLines } from '../../utils/rules/purchasePayload';
import { createApiError } from '../../utils/apiErrors';

const same = (a, b) => String(a) === String(b);
const noteOf = (note) => (typeof note === 'string' && note.trim() ? note.trim() : null);

function workTables() {
  const ledger = loadLedgerTables();
  const t = getTables('suppliers', 'purchase_orders', 'purchase_order_items', 'goods_receipts', 'goods_receipt_lines');
  return { ...t, raw_materials: ledger.raw_materials, material_movements: ledger.material_movements };
}

function fromRule(result) {
  if (result.status === 400) throw createApiError(Object.values(result.errors)[0], 400, undefined, { fieldErrors: result.errors });
  if (result.status !== 200) throw createApiError(result.message, result.status);
  return result.value;
}

function writeReceipt(t, { poId, kind, lines, reason = null, note = null, reversesId = null, replacesId = null, requestId, actorId }) {
  const receiptId = nextId(t.goods_receipts, 'receipt_id');
  t.goods_receipts = [...t.goods_receipts, {
    receipt_id: receiptId, po_id: Number(poId), kind, reverses_id: reversesId, replaces_id: replacesId, reason, note,
    operation_request_id: requestId, created_by: actorId, created_at: nowIso(),
  }];
  const first = nextId(t.goods_receipt_lines, 'line_id');
  t.goods_receipt_lines = [...t.goods_receipt_lines, ...lines.map((l, k) => ({ line_id: first + k, receipt_id: receiptId, po_item_id: Number(l.po_item_id), qty: l.qty }))];
  return receiptId;
}

function refreshStatus(t, poId) {
  const rows = loadPurchaseOrderRows(t, poId);
  const status = purchaseOrderStatusFromReceipts(rows.po.status, rows.items);
  if (status !== rows.po.status) t.purchase_orders = t.purchase_orders.map((p) => (same(p.po_id, poId) ? { ...p, status, updated_at: nowIso() } : p));
  return purchaseOrderView(t, poId);
}

const changed = (t) => ({
  raw_materials: t.raw_materials, material_movements: t.material_movements, purchase_orders: t.purchase_orders,
  goods_receipts: t.goods_receipts, goods_receipt_lines: t.goods_receipt_lines,
});
const itemMap = (items) => new Map(items.map((i) => [i.po_item_id, i]));

export function receivePurchaseOrder(actor, poId, input, { requestId }) {
  return runMockOperation({
    requestId, actorId: actor.user_id, operation: 'receive_purchase_order', targetType: 'purchase_order', targetId: String(poId),
    payload: { lines: receiptLines(input.lines), note: input.note ?? null }, successStatus: 201,
  }, () => {
    const t = workTables();
    const rows = loadPurchaseOrderRows(t, poId);
    if (!rows) throw createApiError('Purchase order tidak ditemukan.', 404);
    const lines = fromRule(validateReceiptLines(rows.po.status, itemMap(rows.items), input.lines));
    const noteError = reasonError(input.note, { required: false });
    if (noteError) throw createApiError(noteError, 400, undefined, { fieldErrors: { note: noteError } });
    const receiptId = writeReceipt(t, { poId, kind: 'normal', lines, note: noteOf(input.note), requestId, actorId: actor.user_id });
    const plan = lines.map((l) => ({ material_id: l.material_id, po_item_id: l.po_item_id, delta: decimalToCents(l.qty), type: 'penerimaan' }))
      .sort((a, b) => Number(a.material_id) - Number(b.material_id));
    const movements = applyMovements(t, plan, (row) => ({ receipt_id: receiptId, po_item_id: Number(row.po_item_id) }), actor.user_id);
    return { data: { purchase_order: refreshStatus(t, poId), receipt_id: String(receiptId), movements: movements.map(movementView) }, tables: changed(t) };
  });
}

export function reverseOrCorrectReceipt(actor, receiptId, input, { requestId, correct }) {
  return runMockOperation({
    requestId, actorId: actor.user_id, operation: correct ? 'correct_goods_receipt' : 'reverse_goods_receipt', targetType: 'goods_receipt',
    targetId: String(receiptId), payload: correct ? { lines: receiptLines(input.lines), reason: input.reason, note: input.note ?? null } : { reason: input.reason },
    successStatus: 201,
  }, () => {
    const t = workTables();
    const head = t.goods_receipts.find((r) => same(r.receipt_id, receiptId));
    if (!head) throw createApiError('Dokumen penerimaan tidak ditemukan.', 404);
    const poId = String(head.po_id);
    const rows = loadPurchaseOrderRows(t, poId);
    const doc = rows.receipts.find((r) => same(r.receipt_id, receiptId));
    const error = reversalTargetError('goods_receipt', { kind: doc.kind, reversed: doc.reversed_count > 0, replaced: doc.replaced_count > 0 });
    if (error) throw createApiError(error.message, error.status, error.code);
    const items = itemMap(rows.items);
    const O = doc.lines.map((l) => ({ ...l, material_id: items.get(l.po_item_id).material_id }));
    const P = correct ? fromRule(validateReceiptCorrection(rows.po.status, items, O, input.lines)) : null;
    const shape = correct ? correctionShapeError('goods_receipt', O, P) : null;
    if (shape) throw createApiError(shape.message, shape.status);
    const common = { poId, reason: input.reason.trim(), requestId, actorId: actor.user_id };
    const reversalId = writeReceipt(t, { ...common, kind: 'pembalik', lines: O, reversesId: Number(receiptId) });
    const replacementId = correct ? writeReceipt(t, { ...common, kind: 'pengganti', lines: P, note: noteOf(input.note), replacesId: Number(receiptId) }) : null;
    const movements = applyMovements(t, planReversalOrCorrection('goods_receipt', O, P),
      (row) => ({ receipt_id: row.reference === 'P' ? replacementId : reversalId, po_item_id: Number(row.po_item_id) }), actor.user_id);
    return {
      data: {
        purchase_order: refreshStatus(t, poId), reversal_id: String(reversalId), replacement_id: replacementId ? String(replacementId) : null,
        movements: movements.map(movementView),
      },
      tables: changed(t),
    };
  });
}
