// services/mock/materialIssueAdmin.js
// CR-04b · FR-46 · UC-37 · BR-23, BR-24, BR-26, BR-30, BR-31 · AD-13 detail WO — pengganti materialIssue.service server di
// mode mock: pengeluaran (stok berkurang tepat sekali lewat buku mutasi mock, saldo ≥ 0), pembalik murni (R) dan koreksi
// (R + P berbagi request_id; satu mutasi bersih per bahan rujuk P bila bahan ada di P, selain itu R). Aturan murni sama.

import { runMockOperation, nextId, nowIso, applyMovements, movementView } from './ledgerMock';
import { workTables, lockWorkOrder } from './workOrderAdmin';
import { workOrderView, loadWorkOrderRows } from './workOrderData';
import { validateIssueLines, issueStatusError, issueCorrectionStatusError, issuePlan } from '../../utils/rules/workOrder';
import { reversalTargetError, planReversalOrCorrection, correctionShapeError } from '../../utils/rules/stockLedger';
import { issueLines } from '../../utils/rules/purchasePayload';
import { createApiError } from '../../utils/apiErrors';

const same = (a, b) => String(a) === String(b);
export const ISSUE_NOT_FOUND = 'Dokumen pengeluaran tidak ditemukan.';

export function fromRule(result) {
  if (result.status === 400) throw createApiError(Object.values(result.errors)[0], 400, undefined, { fieldErrors: result.errors });
  if (result.status !== 200) throw createApiError(result.message, result.status, result.code);
  return result.value;
}
export const failIf = (error) => { if (error) throw createApiError(error.message, error.status, error.code); };
const masterIds = (t) => new Set(t.raw_materials.map((m) => String(m.material_id)));

export function writeIssue(t, { woId, kind, lines, reason = null, reversesId = null, replacesId = null, requestId, actorId }) {
  const issueId = nextId(t.material_issues, 'issue_id');
  t.material_issues = [...t.material_issues, {
    issue_id: issueId, wo_id: Number(woId), kind, reverses_id: reversesId, replaces_id: replacesId, reason,
    operation_request_id: requestId, created_by: actorId, created_at: nowIso(),
  }];
  const first = nextId(t.material_issue_lines, 'line_id');
  t.material_issue_lines = [...t.material_issue_lines, ...lines.map((l, k) => ({ line_id: first + k, issue_id: issueId, material_id: Number(l.material_id), qty: l.qty }))];
  return issueId;
}

/** Pengeluaran normal di tabel kerja (dipakai juga Selesaikan WO) → {issueId, movements} */
export function issueWithinOperation(t, { woId, lines, requestId, actorId }) {
  const value = fromRule(validateIssueLines(masterIds(t), lines));
  const issueId = writeIssue(t, { woId, kind: 'normal', lines: value, requestId, actorId });
  const movements = applyMovements(t, issuePlan(value), () => ({ issue_id: issueId }), actorId);
  return { issueId, movements };
}

export const changedTables = (t) => ({
  raw_materials: t.raw_materials, material_movements: t.material_movements, work_orders: t.work_orders,
  material_issues: t.material_issues, material_issue_lines: t.material_issue_lines, production_outputs: t.production_outputs,
});

export function issueMaterials(actor, woId, input, { requestId }) {
  return runMockOperation({
    requestId, actorId: actor.user_id, operation: 'issue_material', targetType: 'work_order', targetId: String(woId),
    payload: { lines: issueLines(input.lines) }, successStatus: 201,
  }, () => {
    const t = workTables();
    failIf(issueStatusError(lockWorkOrder(t, woId).status));
    const { issueId, movements } = issueWithinOperation(t, { woId, lines: input.lines, requestId, actorId: actor.user_id });
    return { data: { work_order: workOrderView(t, woId), issue_id: String(issueId), movements: movements.map(movementView) }, tables: changedTables(t) };
  });
}

export function reverseOrCorrectIssue(actor, issueId, input, { requestId, correct }) {
  return runMockOperation({
    requestId, actorId: actor.user_id, operation: correct ? 'correct_material_issue' : 'reverse_material_issue', targetType: 'material_issue',
    targetId: String(issueId), payload: correct ? { lines: issueLines(input.lines), reason: input.reason } : { reason: input.reason }, successStatus: 201,
  }, () => {
    const t = workTables();
    const head = t.material_issues.find((d) => same(d.issue_id, issueId));
    if (!head) throw createApiError(ISSUE_NOT_FOUND, 404);
    const woId = String(head.wo_id);
    failIf(issueCorrectionStatusError(lockWorkOrder(t, woId).status));
    const doc = loadWorkOrderRows(t, woId).issues.find((d) => same(d.issue_id, issueId));
    failIf(reversalTargetError('material_issue', { kind: doc.kind, reversed: doc.reversed_count > 0, replaced: doc.replaced_count > 0 }));
    const O = doc.lines.map((l) => ({ material_id: String(l.material_id), qty: l.qty }));
    const P = correct ? fromRule(validateIssueLines(masterIds(t), input.lines)) : null;
    const shape = correct ? correctionShapeError('material_issue', O, P) : null;
    if (shape) throw createApiError(shape.message, shape.status);
    const common = { woId, reason: input.reason.trim(), requestId, actorId: actor.user_id };
    const reversalId = writeIssue(t, { ...common, kind: 'pembalik', lines: O, reversesId: Number(issueId) });
    const replacementId = correct ? writeIssue(t, { ...common, kind: 'pengganti', lines: P, replacesId: Number(issueId) }) : null;
    const movements = applyMovements(t, planReversalOrCorrection('material_issue', O, P),
      (row) => ({ issue_id: row.reference === 'P' ? replacementId : reversalId }), actor.user_id);
    return {
      data: {
        work_order: workOrderView(t, woId), reversal_id: String(reversalId), replacement_id: replacementId ? String(replacementId) : null,
        movements: movements.map(movementView),
      },
      tables: changedTables(t),
    };
  });
}
