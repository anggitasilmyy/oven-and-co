// services/productionOutput.service.js
// CR-04b · FR-46 · UC-37 · BR-25, BR-28, BR-29, BR-31, BR-34, BR-36 · K13, K14 · AD-13 detail WO — Selesaikan WO: tepat
// satu dokumen hasil `normal` per WO (hasil 0 sah; UNIQUE normal_wo_id), pengeluaran terakhir opsional dalam operasi yang
// sama, status → Selesai (penyelesaian kedua ditolak 409, AC-46.2). Pembalik & koreksi hasil tiga kasus (Draft §8.2):
// 0 → q pengganti langsung P; p → q R + P; p → 0 R saja (kondisi terminal: koreksi berikutnya 409); status WO tetap
// Selesai. Hasil hanya dicatat — TIDAK menulis daily_stocks, products, orders, order_items, stok bahan (K13, BR-29).
// Urutan kunci (§10.1): users S → operation_requests → work_orders FOR UPDATE → dokumen asal O FOR UPDATE (→ bahan bila
// ada pengeluaran terakhir). WO dari dokumen asal dibaca DI LUAR transaksi lalu dicocokkan setelah dikunci.

const prisma = require('../lib/prisma');
const { AUDIT_ACTION, AUDIT_ENTITY, WO_STATUS } = require('../utils/businessConstants');
const { recordAudit } = require('./auditLog.service');
const { runOperation } = require('./operationRequest.service');
const { movementView } = require('./stockLedger.service');
const { completionStatusError, parseWorkOrderQty, planOutputReversal, planOutputCorrection } = require('./workOrderRules.service');
const { lockWorkOrder } = require('./workOrder.service');
const { issueWithinTransaction } = require('./materialIssue.service');
const { loadWorkOrder } = require('./workOrderView.service');
const { toWorkOrderView } = require('./workOrderViewRules.service');
const { issueLines } = require('./purchasePayload.service');

const OUTPUT_NOT_FOUND = 'Dokumen hasil produksi tidak ditemukan.';

function httpError(statusCode, message, extra = {}) {
  return Object.assign(new Error(message), { statusCode, ...extra });
}
const failIf = (error) => {
  if (!error) return;
  if (error.errors) throw httpError(400, Object.values(error.errors)[0], { fieldErrors: error.errors });
  throw httpError(error.status, error.message, error.code ? { apiCode: error.code } : {});
};
const hasLines = (lines) => Array.isArray(lines) && lines.length > 0;

/** POST /api/admin/work-orders/:id/complete { qty_output, lines? } (request_id wajib) → 201 */
async function completeWorkOrder(actorId, woId, input, { requestId, now = new Date() }) {
  return runOperation({
    actorId, requestId, operation: 'complete_work_order', targetType: 'work_order', targetId: String(woId),
    payload: { qty_output: input.qty_output ?? null, lines: hasLines(input.lines) ? issueLines(input.lines) : null }, successStatus: 201,
  }, async (tx) => {
    const wo = await lockWorkOrder(tx, woId);
    failIf(completionStatusError(wo.status));
    const qty = parseWorkOrderQty(input.qty_output, { min: 0 });
    if (qty.error) throw httpError(400, qty.error, { fieldErrors: { qty_output: qty.error } });
    const issue = hasLines(input.lines) ? await issueWithinTransaction(tx, { woId, lines: input.lines, requestId, actorId }) : null;
    const output = await tx.productionOutput.create({
      data: {
        woId: BigInt(woId), kind: 'normal', qtyOutput: qty.value, normalWoId: BigInt(woId), operationRequestId: requestId, createdBy: BigInt(actorId),
      },
      select: { outputId: true },
    });
    await tx.workOrder.update({ where: { woId: BigInt(woId) }, data: { status: WO_STATUS.SELESAI, completedAt: now } });
    await recordAudit(tx, { actorId, action: AUDIT_ACTION.COMPLETE_WORK_ORDER, entity: AUDIT_ENTITY.WORK_ORDERS, entityId: woId, now });
    return {
      work_order: toWorkOrderView(await loadWorkOrder(tx, woId)), output_id: String(output.outputId),
      issue_id: issue ? String(issue.issueId) : null, movements: (issue?.movements ?? []).map(movementView),
    };
  });
}

/**
 * POST /api/admin/production-outputs/:id/reverse { reason } dan /correct { qty_output, reason } → 201.
 * Dokumen tidak berlaku (termasuk rantai terminal) → 409 DOCUMENT_ALREADY_SUPERSEDED; kasus terlarang → 400.
 */
async function reverseOrCorrectOutput(actorId, outputId, input, { requestId, correct, now = new Date() }) {
  const head = await prisma.productionOutput.findUnique({ where: { outputId: BigInt(outputId) }, select: { woId: true } });
  if (!head) throw httpError(404, OUTPUT_NOT_FOUND);
  const woId = String(head.woId);
  return runOperation({
    actorId, requestId, operation: correct ? 'correct_production_output' : 'reverse_production_output', targetType: 'production_output',
    targetId: String(outputId), payload: correct ? { qty_output: input.qty_output ?? null, reason: input.reason } : { reason: input.reason },
    successStatus: 201,
  }, async (tx) => {
    await lockWorkOrder(tx, woId);
    const [original] = await tx.$queryRaw`SELECT output_id, wo_id FROM production_outputs WHERE output_id = ${BigInt(outputId)} FOR UPDATE`;
    if (!original || String(original.wo_id) !== woId) throw httpError(409, 'Data hasil produksi sudah berubah. Muat ulang data.');
    const data = await loadWorkOrder(tx, woId);
    const o = data.outputs.find((x) => String(x.output_id) === String(outputId));
    const doc = { kind: o.kind, qty_output: Number(o.qty_output), reversed: Number(o.reversed_count) > 0, replaced: Number(o.replaced_count) > 0 };
    const plan = correct ? planOutputCorrection(doc, input.qty_output) : planOutputReversal(doc);
    if (plan.status !== 200) failIf(plan);
    const reason = input.reason.trim();
    const ids = {};
    for (const d of plan.documents) {
      const row = await tx.productionOutput.create({
        data: {
          woId: BigInt(woId), kind: d.kind, qtyOutput: d.qty_output, reason, operationRequestId: requestId, createdBy: BigInt(actorId),
          ...(d.kind === 'pembalik' ? { reversesId: BigInt(outputId) } : { replacesId: BigInt(outputId) }),
        },
        select: { outputId: true },
      });
      ids[d.kind] = String(row.outputId);
    }
    await recordAudit(tx, {
      actorId, action: correct ? AUDIT_ACTION.CORRECT_PRODUCTION_OUTPUT : AUDIT_ACTION.REVERSE_PRODUCTION_OUTPUT,
      entity: AUDIT_ENTITY.PRODUCTION_OUTPUTS, entityId: outputId, now,
    });
    return { work_order: toWorkOrderView(await loadWorkOrder(tx, woId)), reversal_id: ids.pembalik ?? null, replacement_id: ids.pengganti ?? null };
  });
}

module.exports = { OUTPUT_NOT_FOUND, completeWorkOrder, reverseOrCorrectOutput };
