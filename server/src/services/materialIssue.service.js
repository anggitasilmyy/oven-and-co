// services/materialIssue.service.js
// CR-04b · FR-46 · UC-37 · BR-23, BR-24, BR-26, BR-30, BR-31, BR-34 · K11 · AD-13 detail WO — pengeluaran bahan WO
// (mengurangi stok tepat sekali per operasi, saldo ≥ 0, AC-46.1), pembalik murni (R, stok kembali) dan koreksi (R + P
// berbagi operation_request_id; satu mutasi bersih per bahan merujuk P bila bahan ada di P, selain itu R — Draft §4.3).
// Stok hanya berubah lewat stockLedger.service (buku mutasi); tanpa reservasi (K11). request_id WAJIB.
// Urutan kunci (§10.1): users S → operation_requests → work_orders FOR UPDATE → dokumen asal O FOR UPDATE →
// raw_materials FOR UPDATE urut material_id. WO dari dokumen asal dibaca DI LUAR transaksi lalu dicocokkan setelah dikunci.

const prisma = require('../lib/prisma');
const { AUDIT_ACTION, AUDIT_ENTITY } = require('../utils/businessConstants');
const { recordAudit } = require('./auditLog.service');
const { runOperation } = require('./operationRequest.service');
const { lockExistingMaterials, writeMovements, movementView } = require('./stockLedger.service');
const { validateIssueLines, issueStatusError, issueCorrectionStatusError, issuePlan } = require('./workOrderRules.service');
const { reversalTargetError, planReversalOrCorrection, correctionShapeError } = require('./stockLedgerRules.service');
const { lockWorkOrder } = require('./workOrder.service');
const { loadWorkOrder } = require('./workOrderView.service');
const { toWorkOrderView } = require('./workOrderViewRules.service');
const { issueLines } = require('./purchasePayload.service');

const ISSUE_NOT_FOUND = 'Dokumen pengeluaran tidak ditemukan.';

function httpError(statusCode, message, extra = {}) {
  return Object.assign(new Error(message), { statusCode, ...extra });
}

const failFromRule = (result) => {
  if (result.status === 400) throw httpError(400, Object.values(result.errors)[0], { fieldErrors: result.errors });
  if (result.status !== 200) throw httpError(result.status, result.message, result.code ? { apiCode: result.code } : {});
  return result.value;
};
const failIf = (error) => { if (error) throw httpError(error.status, error.message, error.code ? { apiCode: error.code } : {}); };
const candidates = (lines) => (Array.isArray(lines) ? lines.map((l) => l?.material_id) : []);

async function writeIssue(tx, { woId, kind, lines, reason = null, reversesId = null, replacesId = null, requestId, actorId }) {
  const issue = await tx.materialIssue.create({
    data: { woId: BigInt(woId), kind, reason, reversesId, replacesId, operationRequestId: requestId, createdBy: BigInt(actorId) },
    select: { issueId: true },
  });
  await tx.materialIssueLine.createMany({ data: lines.map((l) => ({ issueId: issue.issueId, materialId: BigInt(l.material_id), qty: l.qty })) });
  return issue.issueId;
}

/**
 * Pengeluaran normal di dalam transaksi yang sudah mengunci WO (dipakai juga oleh Selesaikan WO untuk pengeluaran
 * terakhir). Kunci bahan → validasi baris → dokumen + baris → mutasi −qty → stok. → {issueId, movements}
 */
async function issueWithinTransaction(tx, { woId, lines, requestId, actorId }) {
  const locked = await lockExistingMaterials(tx, candidates(lines));
  const value = failFromRule(validateIssueLines(new Set(locked.keys()), lines));
  const issueId = await writeIssue(tx, { woId, kind: 'normal', lines: value, requestId, actorId });
  const movements = await writeMovements(tx, locked, issuePlan(value), () => ({ issueId }), actorId);
  return { issueId, movements };
}

/** POST /api/admin/work-orders/:id/issues { lines[{material_id, qty}] } → 201 */
async function issueMaterials(actorId, woId, input, { requestId, now = new Date() }) {
  return runOperation({
    actorId, requestId, operation: 'issue_material', targetType: 'work_order', targetId: String(woId),
    payload: { lines: issueLines(input.lines) }, successStatus: 201,
  }, async (tx) => {
    const wo = await lockWorkOrder(tx, woId);
    failIf(issueStatusError(wo.status));
    const { issueId, movements } = await issueWithinTransaction(tx, { woId, lines: input.lines, requestId, actorId });
    await recordAudit(tx, { actorId, action: AUDIT_ACTION.ISSUE_MATERIAL, entity: AUDIT_ENTITY.MATERIAL_ISSUES, entityId: issueId, now });
    return { work_order: toWorkOrderView(await loadWorkOrder(tx, woId)), issue_id: String(issueId), movements: movements.map(movementView) };
  });
}

/**
 * POST /api/admin/material-issues/:id/reverse { reason } dan /correct { lines, reason } → 201. WO bukan Draft (§2.5).
 * O tidak berlaku → 409 DOCUMENT_ALREADY_SUPERSEDED; saldo akhir di luar [0, batas] → 409 STOCK_OUT_OF_RANGE (rollback).
 */
async function reverseOrCorrectIssue(actorId, issueId, input, { requestId, correct, now = new Date() }) {
  const head = await prisma.materialIssue.findUnique({ where: { issueId: BigInt(issueId) }, select: { woId: true } });
  if (!head) throw httpError(404, ISSUE_NOT_FOUND);
  const woId = String(head.woId);
  return runOperation({
    actorId, requestId, operation: correct ? 'correct_material_issue' : 'reverse_material_issue', targetType: 'material_issue',
    targetId: String(issueId), payload: correct ? { lines: issueLines(input.lines), reason: input.reason } : { reason: input.reason },
    successStatus: 201,
  }, async (tx) => {
    const wo = await lockWorkOrder(tx, woId);
    const [original] = await tx.$queryRaw`SELECT issue_id, wo_id, kind FROM material_issues WHERE issue_id = ${BigInt(issueId)} FOR UPDATE`;
    if (!original || String(original.wo_id) !== woId) throw httpError(409, 'Data pengeluaran sudah berubah. Muat ulang data.');
    failIf(issueCorrectionStatusError(wo.status));
    const data = await loadWorkOrder(tx, woId);
    const doc = data.issues.find((d) => String(d.issue_id) === String(issueId));
    failIf(reversalTargetError('material_issue', { kind: doc.kind, reversed: Number(doc.reversed_count) > 0, replaced: Number(doc.replaced_count) > 0 }));
    const O = doc.lines.map((l) => ({ material_id: String(l.material_id), qty: l.qty }));
    const locked = await lockExistingMaterials(tx, [...O.map((l) => l.material_id), ...(correct ? candidates(input.lines) : [])]);
    const P = correct ? failFromRule(validateIssueLines(new Set(locked.keys()), input.lines)) : null;
    const shape = correct ? correctionShapeError('material_issue', O, P) : null;
    if (shape) throw httpError(shape.status, shape.message);
    const common = { woId, reason: input.reason.trim(), requestId, actorId };
    const reversalId = await writeIssue(tx, { ...common, kind: 'pembalik', lines: O, reversesId: BigInt(issueId) });
    const replacementId = correct ? await writeIssue(tx, { ...common, kind: 'pengganti', lines: P, replacesId: BigInt(issueId) }) : null;
    const movements = await writeMovements(tx, locked, planReversalOrCorrection('material_issue', O, P),
      (row) => ({ issueId: row.reference === 'P' ? replacementId : reversalId }), actorId);
    await recordAudit(tx, {
      actorId, action: correct ? AUDIT_ACTION.CORRECT_MATERIAL_ISSUE : AUDIT_ACTION.REVERSE_MATERIAL_ISSUE, entity: AUDIT_ENTITY.MATERIAL_ISSUES, entityId: issueId, now,
    });
    return {
      work_order: toWorkOrderView(await loadWorkOrder(tx, woId)), reversal_id: String(reversalId),
      replacement_id: replacementId ? String(replacementId) : null, movements: movements.map(movementView),
    };
  });
}

module.exports = { ISSUE_NOT_FOUND, issueWithinTransaction, issueMaterials, reverseOrCorrectIssue };
