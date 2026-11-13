// services/adminStockDocument.service.js
// CR-04a CP4 · FR-44 · UC-35 · BR-23, BR-24, BR-30, BR-34, BR-35 (Draft 0.8.3 §2.5, §2.7, §4, §5.1, §10) — dokumen stok
// AD-07 baru (Staf & Owner): stock opname, pembalik & koreksi stok masuk, riwayat mutasi. Aturan murni CP3
// (stockLedgerRules, purchasingRules.reasonError); tulis lewat stockLedger.service dalam runOperation (request_id WAJIB).
// Urutan kunci: opname 1 users → 2 operation_requests → 3 store_settings → 8 raw_materials;
//               pembalik/koreksi 1 → 2 → 7 dokumen asal O (FOR UPDATE) → 8 raw_materials.

const prisma = require('../lib/prisma');
const { AUDIT_ACTION, AUDIT_ENTITY } = require('../utils/businessConstants');
const { lockAdminMasterData } = require('./adminMasterDataLock.service');
const { recordAudit } = require('./auditLog.service');
const { runOperation } = require('./operationRequest.service');
const { lockMaterials, writeMovements, movementView, MATERIAL_NOT_FOUND } = require('./stockLedger.service');
const { reversalTargetError, planReversalOrCorrection, correctionShapeError, planStockCount } = require('./stockLedgerRules.service');
const { decimalToCents } = require('./decimalInputRules.service');
const { decimalToMilli, milliToNumber } = require('./recipeRules.service');
const { mapMaterial } = require('./adminRawMaterial.service');

const DOCUMENT_NOT_FOUND = 'Dokumen stok tidak ditemukan.';

function httpError(statusCode, message, apiCode) {
  return Object.assign(new Error(message), { statusCode, ...(apiCode ? { apiCode } : {}) });
}

const reasonOrNull = (reason) => (typeof reason === 'string' && reason.trim() ? reason.trim() : null);

async function materialView(tx, materialId) {
  return mapMaterial(await tx.rawMaterial.findUnique({ where: { materialId: BigInt(materialId) } }));
}

/**
 * POST /api/admin/raw-materials/:id/stock-counts { counted_stock, expected_stock, reason? } (input sudah divalidasi).
 * expected_stock ≠ stok terkunci → 409 STOCK_CHANGED tanpa dokumen; selisih 0 → dokumen tanpa mutasi; audit count_stock.
 */
async function countStock(actorId, materialId, input, { requestId, now = new Date() }) {
  return runOperation({
    actorId, requestId, operation: 'count_stock', targetType: 'raw_material', targetId: String(materialId), payload: input, successStatus: 201,
  }, async (tx) => {
    await lockAdminMasterData(tx);
    const locked = await lockMaterials(tx, [materialId]);
    const plan = planStockCount(locked.get(String(materialId)), input.counted_stock, input.expected_stock);
    if (plan.status !== 200) throw httpError(plan.status, plan.message, plan.code);
    const doc = await tx.stockAdjustment.create({
      data: {
        materialId: BigInt(materialId), kind: 'stock_opname', countedStock: plan.document.counted_stock, systemStock: plan.document.system_stock,
        reason: reasonOrNull(input.reason), createdBy: BigInt(actorId), operationRequestId: requestId,
      },
      select: { adjustmentId: true },
    });
    const delta = decimalToCents(plan.document.counted_stock) - decimalToCents(plan.document.system_stock);
    const [movement] = delta === 0n ? [] : await writeMovements(tx, locked, [{ material_id: String(materialId), delta, type: 'stock_opname' }],
      () => ({ adjustmentId: doc.adjustmentId }), actorId);
    await recordAudit(tx, { actorId, action: AUDIT_ACTION.COUNT_STOCK, entity: AUDIT_ENTITY.RAW_MATERIALS, entityId: materialId, now });
    return { material: await materialView(tx, materialId), adjustment_id: String(doc.adjustmentId), movement: movementView(movement) };
  });
}

/** Kunci dokumen asal O (FOR UPDATE) + status berlaku (sudah dirujuk reverses_id / replaces_id?) */
async function lockOriginal(tx, adjustmentId) {
  const [doc] = await tx.$queryRaw`SELECT adjustment_id, material_id, kind, CAST(qty AS CHAR) AS qty
    FROM stock_adjustments WHERE adjustment_id = ${BigInt(adjustmentId)} FOR UPDATE`;
  if (!doc) throw httpError(404, DOCUMENT_NOT_FOUND);
  const reversed = await tx.stockAdjustment.count({ where: { reversesId: BigInt(adjustmentId) } });
  const replaced = await tx.stockAdjustment.count({ where: { replacesId: BigInt(adjustmentId) } });
  const error = reversalTargetError('stock_adjustment', { kind: doc.kind, reversed: reversed > 0, replaced: replaced > 0 });
  if (error) throw httpError(error.status, error.message, error.code);
  return { id: BigInt(doc.adjustment_id), materialId: String(doc.material_id), qty: doc.qty };
}

/**
 * POST /api/admin/stock-adjustments/:id/reverse { reason } dan /correct { qty, reason } (input sudah divalidasi).
 * Pembalik: R (salinan O) + mutasi −qty merujuk R. Koreksi: R + P berbagi operation_request_id; satu mutasi bersih
 * qty(P) − qty(O) merujuk P (Δ = 0 → tanpa mutasi). Saldo akhir di luar batas → 409 STOCK_OUT_OF_RANGE (rollback).
 */
async function reverseOrCorrectStockIn(actorId, adjustmentId, input, { requestId, correct, now = new Date() }) {
  return runOperation({
    actorId, requestId, operation: correct ? 'correct_stock_in' : 'reverse_stock_in', targetType: 'stock_adjustment',
    targetId: String(adjustmentId), payload: input, successStatus: 201,
  }, async (tx) => {
    const original = await lockOriginal(tx, adjustmentId);
    const O = [{ material_id: original.materialId, qty: original.qty }];
    const P = correct ? [{ material_id: original.materialId, qty: input.qty }] : null;
    const shape = correct ? correctionShapeError('stock_adjustment', O, P) : null;
    if (shape) throw httpError(shape.status, shape.message);
    const locked = await lockMaterials(tx, [original.materialId]);
    const common = { materialId: BigInt(original.materialId), reason: input.reason, createdBy: BigInt(actorId), operationRequestId: requestId };
    const reversal = await tx.stockAdjustment.create({
      data: { ...common, kind: 'pembalik_stok_masuk', qty: original.qty, reversesId: original.id }, select: { adjustmentId: true },
    });
    const replacement = correct ? await tx.stockAdjustment.create({
      data: { ...common, kind: 'pengganti_stok_masuk', qty: input.qty, replacesId: original.id }, select: { adjustmentId: true },
    }) : null;
    const plan = planReversalOrCorrection('stock_adjustment', O, P);
    const [movement] = await writeMovements(tx, locked, plan,
      (row) => ({ adjustmentId: row.reference === 'P' ? replacement.adjustmentId : reversal.adjustmentId }), actorId);
    await recordAudit(tx, {
      actorId, action: correct ? AUDIT_ACTION.CORRECT_STOCK_IN : AUDIT_ACTION.REVERSE_STOCK_IN, entity: AUDIT_ENTITY.RAW_MATERIALS, entityId: original.materialId, now,
    });
    return {
      material: await materialView(tx, original.materialId), reversal_id: String(reversal.adjustmentId),
      replacement_id: replacement ? String(replacement.adjustmentId) : null, movement: movementView(movement),
    };
  });
}

const num = (value) => (value === null || value === undefined ? null : milliToNumber(decimalToMilli(String(value))));

/**
 * GET /api/admin/raw-materials/:id/movements → { material, movements[] } urut movement_id naik (buku mutasi).
 * CP6: dokumen stok membawa `qty` (jumlah dokumen) & `effective` (belum dibalik/dikoreksi, BR-30) agar AD-07 hanya menawarkan aksi yang sah.
 */
async function getMaterialMovements(materialId) {
  const material = await prisma.rawMaterial.findUnique({ where: { materialId: BigInt(materialId) } });
  if (!material) throw httpError(404, MATERIAL_NOT_FOUND);
  const rows = await prisma.materialMovement.findMany({
    where: { materialId: BigInt(materialId) },
    orderBy: { movementId: 'asc' },
    include: {
      adjustment: { select: { adjustmentId: true, kind: true, qty: true, reason: true, reversedBy: { select: { adjustmentId: true } }, replacedBy: { select: { adjustmentId: true } } } },
      receipt: { select: { receiptId: true, kind: true, reason: true, poId: true } },
      creator: { select: { name: true } },
    },
  });
  return {
    material: mapMaterial(material),
    movements: rows.map((m) => ({
      movement_id: String(m.movementId), type: m.type, qty_change: num(m.qtyChange), stock_before: num(m.stockBefore),
      stock_after: num(m.stockAfter), created_at: m.createdAt.toISOString(), created_by: m.creator?.name ?? null,
      document: m.adjustment
        ? { source: 'stock_adjustment', id: String(m.adjustment.adjustmentId), kind: m.adjustment.kind, qty: num(m.adjustment.qty), reason: m.adjustment.reason,
          effective: !m.adjustment.reversedBy && !m.adjustment.replacedBy }
        : { source: 'goods_receipt', id: String(m.receipt.receiptId), kind: m.receipt.kind, reason: m.receipt.reason, po_id: String(m.receipt.poId) },
    })),
  };
}

module.exports = { DOCUMENT_NOT_FOUND, countStock, reverseOrCorrectStockIn, getMaterialMovements };
