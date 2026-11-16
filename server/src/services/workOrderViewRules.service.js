// services/workOrderViewRules.service.js
// CR-04b · FR-45, FR-46 · BR-27, BR-36 · AC-46.5 · AD-13 detail WO — aturan murni tampilan Work Order (dipisah dari
// loader workOrderView.service agar mode mock memakai port identik: client utils/rules/workOrderView.js, diuji silang).
// Masukan = baris mentah {wo, recipe, issues, outputs, materials} (DECIMAL sebagai teks). Hasil bersih (§8.3) dan
// standar/aktual/selisih (§8.4) eksak dalam milli BigInt; keluaran angka JSON lewat fail-safe CR-03 milliToNumber
// (pemeriksaan bolak-balik; kehilangan presisi → error MILLI_PRECISION_LOST, tanpa pembulatan prematur).

const { decimalToMilli, milliToNumber } = require('./recipeRules.service');
const { netOutput, materialUsage } = require('./workOrderRules.service');

const iso = (d) => (d ? new Date(d).toISOString() : null);
const qty = (text) => milliToNumber(decimalToMilli(String(text)));
const idOrNull = (v) => (v == null ? null : String(v));
const dateKey = (d) => (typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10));

/**
 * @param {{wo: object, recipe: object[], issues: object[], outputs: object[], materials: Map<string, {name, unit}>}} data
 *   issues[]: {issue_id, kind, reverses_id, replaces_id, reason, created_at, reversed_count, replaced_count, lines[{material_id, qty}]}
 *   outputs[]: {output_id, kind, qty_output, reverses_id, replaces_id, reason, recorded_at, reversed_count, replaced_count}
 */
function toWorkOrderView({ wo, recipe, issues, outputs, materials }) {
  const material = (id) => materials.get(String(id)) ?? { name: '', unit: '' };
  const effective = (d) => d.kind !== 'pembalik' && Number(d.reversed_count) === 0 && Number(d.replaced_count) === 0;
  const output = netOutput(outputs.map((o) => ({ kind: o.kind, qty_output: Number(o.qty_output) })));
  const issueLines = issues.flatMap((d) => d.lines.map((l) => ({ material_id: String(l.material_id), qty: l.qty, kind: d.kind })));
  const usage = materialUsage(recipe.map((r) => ({ material_id: String(r.material_id), qty_per_unit: r.qty_per_unit })), issueLines, output);
  return {
    wo_id: String(wo.wo_id), wo_number: wo.wo_number, product_id: String(wo.product_id), product_name: wo.product_name,
    production_date: dateKey(wo.production_date), qty_planned: Number(wo.qty_planned), status: wo.status, note: wo.note ?? null,
    recipe_snapshot_at: iso(wo.recipe_snapshot_at), started_at: iso(wo.started_at), completed_at: iso(wo.completed_at),
    cancelled_at: iso(wo.cancelled_at), created_at: iso(wo.created_at),
    net_output: output,
    without_recipe: Boolean(wo.recipe_snapshot_at) && recipe.length === 0,
    recipe: recipe.map((r) => ({ material_id: String(r.material_id), ...material(r.material_id), qty_per_unit: qty(r.qty_per_unit) })),
    issues: issues.map((d) => ({
      issue_id: String(d.issue_id), kind: d.kind, reverses_id: idOrNull(d.reverses_id), replaces_id: idOrNull(d.replaces_id),
      reason: d.reason ?? null, created_at: iso(d.created_at), effective: effective(d),
      lines: d.lines.map((l) => ({ material_id: String(l.material_id), ...material(l.material_id), qty: qty(l.qty) })),
    })),
    outputs: outputs.map((o) => ({
      output_id: String(o.output_id), kind: o.kind, qty_output: Number(o.qty_output), reverses_id: idOrNull(o.reverses_id),
      replaces_id: idOrNull(o.replaces_id), reason: o.reason ?? null, recorded_at: iso(o.recorded_at), effective: effective(o),
    })),
    usage: usage.map((u) => ({
      material_id: u.material_id, ...material(u.material_id), in_recipe: u.in_recipe,
      standard: milliToNumber(u.standard), actual: milliToNumber(u.actual), variance: milliToNumber(u.variance),
    })),
  };
}

/** Ringkasan daftar WO (AD-13): hasil bersih dari dokumen hasil */
function toWorkOrderListRow(wo, outputs) {
  return {
    wo_id: String(wo.wo_id), wo_number: wo.wo_number, product_id: String(wo.product_id), product_name: wo.product_name,
    production_date: dateKey(wo.production_date), qty_planned: Number(wo.qty_planned), status: wo.status,
    net_output: netOutput(outputs.map((o) => ({ kind: o.kind, qty_output: Number(o.qty_output) }))), created_at: iso(wo.created_at),
  };
}

module.exports = { iso, qty, toWorkOrderView, toWorkOrderListRow };
