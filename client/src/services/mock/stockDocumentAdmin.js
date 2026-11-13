// services/mock/stockDocumentAdmin.js
// CR-04a CP6 · FR-44 · UC-35 · BR-23, BR-24, BR-30, BR-35 · AD-07 — dokumen stok baru di mode mock, pengganti
// adminStockDocument.service server (CP4): stock opname, pembalik & koreksi stok masuk, riwayat mutasi. Aturan murni sama
// (utils/rules/stockLedger, purchasing.reasonError); respons berbentuk sama dengan API (ID teks, angka lewat milliToNumber).

import { getMockUsers } from './users';
import { loadLedgerTables, applyMovements, runMockOperation, nextId, nowIso, toDecimalText, movementView } from './ledgerMock';
import { getMaterialStatus } from '../../utils/businessRules';
import { reversalTargetError, planReversalOrCorrection, correctionShapeError, planStockCount } from '../../utils/rules/stockLedger';
import { decimalToCents } from '../../utils/rules/decimalInput';
import { decimalToMilli, milliToNumber } from '../../utils/rules/recipe';
import { createApiError } from '../../utils/apiErrors';

const notFound = (message) => createApiError(message, 404);
const view = (row) => ({ ...row, status: getMaterialStatus(row) });
const doc = (t, fields) => ({
  adjustment_id: nextId(t.stock_adjustments, 'adjustment_id'), qty: null, counted_stock: null, system_stock: null, reverses_id: null,
  replaces_id: null, reason: null, opening_material_id: null, created_at: nowIso(), ...fields,
});
const tablesOf = (t) => ({ raw_materials: t.raw_materials, stock_adjustments: t.stock_adjustments, material_movements: t.material_movements });

/** POST stock-counts — input sudah divalidasi & dinormalisasi rute mock (requestBody.validateStockCountBody) */
export function countStock(actor, materialId, input, { requestId }) {
  return runMockOperation({
    requestId, actorId: actor.user_id, operation: 'count_stock', targetType: 'raw_material', targetId: String(materialId), payload: input, successStatus: 201,
  }, () => {
    const t = tablesOf(loadLedgerTables());
    const material = t.raw_materials.find((m) => String(m.material_id) === String(materialId));
    if (!material) throw notFound('Bahan baku tidak ditemukan.');
    const plan = planStockCount(toDecimalText(material.stock), input.counted_stock, input.expected_stock);
    if (plan.status !== 200) throw createApiError(plan.message, plan.status, plan.code);
    const row = doc(t, {
      material_id: material.material_id, kind: 'stock_opname', counted_stock: plan.document.counted_stock, system_stock: plan.document.system_stock,
      reason: input.reason, operation_request_id: requestId, created_by: actor.user_id,
    });
    t.stock_adjustments = [...t.stock_adjustments, row];
    const delta = decimalToCents(plan.document.counted_stock) - decimalToCents(plan.document.system_stock);
    const [movement] = delta === 0n ? [] : applyMovements(t, [{ material_id: String(material.material_id), delta, type: 'stock_opname' }],
      () => ({ adjustment_id: row.adjustment_id }), actor.user_id);
    const data = { material: view(t.raw_materials.find((m) => m.material_id === material.material_id)), adjustment_id: String(row.adjustment_id), movement: movementView(movement) };
    return { data, tables: t };
  });
}

/** POST stock-adjustments/:id/reverse { reason } · /correct { qty, reason } — input dari requestBody.validateStockDocumentBody */
export function reverseOrCorrectStockIn(actor, adjustmentId, input, { requestId, correct }) {
  return runMockOperation({
    requestId, actorId: actor.user_id, operation: correct ? 'correct_stock_in' : 'reverse_stock_in', targetType: 'stock_adjustment',
    targetId: String(adjustmentId), payload: input, successStatus: 201,
  }, () => {
    const t = tablesOf(loadLedgerTables());
    const original = t.stock_adjustments.find((d) => String(d.adjustment_id) === String(adjustmentId));
    if (!original) throw notFound('Dokumen stok tidak ditemukan.');
    const error = reversalTargetError('stock_adjustment', {
      kind: original.kind, reversed: t.stock_adjustments.some((d) => String(d.reverses_id) === String(adjustmentId)),
      replaced: t.stock_adjustments.some((d) => String(d.replaces_id) === String(adjustmentId)),
    });
    if (error) throw createApiError(error.message, error.status, error.code);
    const materialId = String(original.material_id);
    const O = [{ material_id: materialId, qty: original.qty }];
    const P = correct ? [{ material_id: materialId, qty: input.qty }] : null;
    const shape = correct ? correctionShapeError('stock_adjustment', O, P) : null;
    if (shape) throw createApiError(shape.message, shape.status);
    const common = { material_id: original.material_id, reason: input.reason, operation_request_id: requestId, created_by: actor.user_id };
    const reversal = doc(t, { ...common, kind: 'pembalik_stok_masuk', qty: original.qty, reverses_id: original.adjustment_id });
    t.stock_adjustments = [...t.stock_adjustments, reversal];
    const replacement = correct ? doc(t, { ...common, kind: 'pengganti_stok_masuk', qty: input.qty, replaces_id: original.adjustment_id }) : null;
    if (replacement) t.stock_adjustments = [...t.stock_adjustments, replacement];
    const [movement] = applyMovements(t, planReversalOrCorrection('stock_adjustment', O, P),
      (row) => ({ adjustment_id: row.reference === 'P' ? replacement.adjustment_id : reversal.adjustment_id }), actor.user_id);
    const data = {
      material: view(t.raw_materials.find((m) => String(m.material_id) === materialId)), reversal_id: String(reversal.adjustment_id),
      replacement_id: replacement ? String(replacement.adjustment_id) : null, movement: movementView(movement),
    };
    return { data, tables: t };
  });
}

const num = (value) => (value == null ? null : milliToNumber(decimalToMilli(String(value))));

/** GET raw-materials/:id/movements → { material, movements[] } (urut movement_id naik) */
export function buildMaterialMovements(materialId) {
  const t = loadLedgerTables();
  const material = t.raw_materials.find((m) => String(m.material_id) === String(materialId));
  if (!material) throw notFound('Bahan baku tidak ditemukan.');
  const docs = new Map(t.stock_adjustments.map((d) => [String(d.adjustment_id), d]));
  const receipts = new Map(t.goods_receipts.map((r) => [String(r.receipt_id), r]));
  const names = new Map(getMockUsers().map((u) => [String(u.user_id), u.name]));
  return {
    material: view(material),
    movements: t.material_movements.filter((m) => String(m.material_id) === String(materialId)).sort((a, b) => a.movement_id - b.movement_id).map((m) => {
      const d = m.adjustment_id != null ? docs.get(String(m.adjustment_id)) : null;
      const r = m.receipt_id != null ? receipts.get(String(m.receipt_id)) : null;
      return {
        movement_id: String(m.movement_id), type: m.type, qty_change: num(m.qty_change), stock_before: num(m.stock_before), stock_after: num(m.stock_after),
        created_at: m.created_at, created_by: m.created_by == null ? null : names.get(String(m.created_by)) ?? null,
        document: d ? {
          source: 'stock_adjustment', id: String(d.adjustment_id), kind: d.kind, qty: num(d.qty), reason: d.reason,
          effective: !t.stock_adjustments.some((x) => String(x.reverses_id) === String(d.adjustment_id) || String(x.replaces_id) === String(d.adjustment_id)),
        }
          : { source: 'goods_receipt', id: String(r.receipt_id), kind: r.kind, reason: r.reason, po_id: String(r.po_id) },
      };
    }),
  };
}
