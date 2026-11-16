// services/mock/productionOutputAdmin.js
// CR-04b · FR-46 · UC-37 · BR-25, BR-28, BR-29, BR-36 · K13, K14 · AD-13 detail WO — pengganti productionOutput.service
// server di mode mock: Selesaikan WO (satu dokumen hasil normal, hasil 0 sah, pengeluaran terakhir opsional dalam operasi
// yang sama) dan pembalik/koreksi hasil tiga kasus (§8.2) dengan kondisi terminal. Hasil hanya dicatat — tidak menulis
// stok jual, rencana stok harian, pesanan, maupun stok bahan (K13). Aturan murni sama dengan server.

import { runMockOperation, nextId, nowIso, movementView } from './ledgerMock';
import { workTables, lockWorkOrder } from './workOrderAdmin';
import { workOrderView, loadWorkOrderRows } from './workOrderData';
import { issueWithinOperation, changedTables, failIf } from './materialIssueAdmin';
import { completionStatusError, parseWorkOrderQty, planOutputReversal, planOutputCorrection } from '../../utils/rules/workOrder';
import { issueLines } from '../../utils/rules/purchasePayload';
import { WO_STATUS } from '../../constants/workOrder';
import { createApiError } from '../../utils/apiErrors';

const same = (a, b) => String(a) === String(b);
const hasLines = (lines) => Array.isArray(lines) && lines.length > 0;
export const OUTPUT_NOT_FOUND = 'Dokumen hasil produksi tidak ditemukan.';

function fail(plan) {
  if (plan.errors) throw createApiError(Object.values(plan.errors)[0], 400, undefined, { fieldErrors: plan.errors });
  throw createApiError(plan.message, plan.status, plan.code);
}

function writeOutput(t, { woId, kind, qty, reason = null, reversesId = null, replacesId = null, requestId, actorId }) {
  const outputId = nextId(t.production_outputs, 'output_id');
  t.production_outputs = [...t.production_outputs, {
    output_id: outputId, wo_id: Number(woId), kind, qty_output: qty, normal_wo_id: kind === 'normal' ? Number(woId) : null,
    reverses_id: reversesId, replaces_id: replacesId, reason, operation_request_id: requestId, created_by: actorId, recorded_at: nowIso(),
  }];
  return outputId;
}

export function completeWorkOrder(actor, woId, input, { requestId }) {
  return runMockOperation({
    requestId, actorId: actor.user_id, operation: 'complete_work_order', targetType: 'work_order', targetId: String(woId),
    payload: { qty_output: input.qty_output ?? null, lines: hasLines(input.lines) ? issueLines(input.lines) : null }, successStatus: 201,
  }, () => {
    const t = workTables();
    failIf(completionStatusError(lockWorkOrder(t, woId).status));
    const qty = parseWorkOrderQty(input.qty_output, { min: 0 });
    if (qty.error) throw createApiError(qty.error, 400, undefined, { fieldErrors: { qty_output: qty.error } });
    const issue = hasLines(input.lines) ? issueWithinOperation(t, { woId, lines: input.lines, requestId, actorId: actor.user_id }) : null;
    const outputId = writeOutput(t, { woId, kind: 'normal', qty: qty.value, requestId, actorId: actor.user_id });
    const at = nowIso();
    t.work_orders = t.work_orders.map((w) => (same(w.wo_id, woId) ? { ...w, status: WO_STATUS.SELESAI, completed_at: at, updated_at: at } : w));
    return {
      data: {
        work_order: workOrderView(t, woId), output_id: String(outputId), issue_id: issue ? String(issue.issueId) : null,
        movements: (issue?.movements ?? []).map(movementView),
      },
      tables: changedTables(t),
    };
  });
}

export function reverseOrCorrectOutput(actor, outputId, input, { requestId, correct }) {
  return runMockOperation({
    requestId, actorId: actor.user_id, operation: correct ? 'correct_production_output' : 'reverse_production_output', targetType: 'production_output',
    targetId: String(outputId), payload: correct ? { qty_output: input.qty_output ?? null, reason: input.reason } : { reason: input.reason }, successStatus: 201,
  }, () => {
    const t = workTables();
    const head = t.production_outputs.find((o) => same(o.output_id, outputId));
    if (!head) throw createApiError(OUTPUT_NOT_FOUND, 404);
    const woId = String(head.wo_id);
    lockWorkOrder(t, woId);
    const o = loadWorkOrderRows(t, woId).outputs.find((x) => same(x.output_id, outputId));
    const doc = { kind: o.kind, qty_output: Number(o.qty_output), reversed: o.reversed_count > 0, replaced: o.replaced_count > 0 };
    const plan = correct ? planOutputCorrection(doc, input.qty_output) : planOutputReversal(doc);
    if (plan.status !== 200) fail(plan);
    const ids = {};
    for (const d of plan.documents) {
      ids[d.kind] = String(writeOutput(t, {
        woId, kind: d.kind, qty: d.qty_output, reason: input.reason.trim(), requestId, actorId: actor.user_id,
        ...(d.kind === 'pembalik' ? { reversesId: Number(outputId) } : { replacesId: Number(outputId) }),
      }));
    }
    return { data: { work_order: workOrderView(t, woId), reversal_id: ids.pembalik ?? null, replacement_id: ids.pengganti ?? null }, tables: changedTables(t) };
  });
}
