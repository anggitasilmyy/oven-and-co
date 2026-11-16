// services/mock/workOrderData.js
// CR-04b · FR-45, FR-46 · AD-13 — pengganti loader workOrderView.service server di mode mock: baris mentah WO (snapshot
// resep, dokumen pengeluaran + baris, dokumen hasil dengan jumlah pembalik/pengganti, nama/satuan bahan) → aturan murni
// yang sama (utils/rules/workOrderView.toWorkOrderView). Angka DECIMAL disimpan sebagai teks seperti kolom MySQL.

import { toWorkOrderView, toWorkOrderListRow } from '../../utils/rules/workOrderView';

const same = (a, b) => String(a) === String(b);
const counts = (rows, idKey, id) => ({
  reversed_count: rows.filter((x) => same(x.reverses_id, id)).length,
  replaced_count: rows.filter((x) => same(x.replaces_id, id)).length,
});
const withProduct = (t, wo) => ({ ...wo, product_name: t.products.find((p) => same(p.product_id, wo.product_id))?.name ?? '' });

/** {wo, recipe, issues, outputs, materials} untuk satu WO; null bila tidak ada */
export function loadWorkOrderRows(t, woId) {
  const wo = t.work_orders.find((w) => same(w.wo_id, woId));
  if (!wo) return null;
  const recipe = t.work_order_recipes.filter((r) => same(r.wo_id, woId)).sort((a, b) => Number(a.material_id) - Number(b.material_id));
  const issues = t.material_issues.filter((d) => same(d.wo_id, woId)).sort((a, b) => a.issue_id - b.issue_id).map((d) => ({
    ...d, ...counts(t.material_issues, 'issue_id', d.issue_id),
    lines: t.material_issue_lines.filter((l) => same(l.issue_id, d.issue_id)).sort((a, b) => Number(a.material_id) - Number(b.material_id)),
  }));
  const outputs = t.production_outputs.filter((o) => same(o.wo_id, woId)).sort((a, b) => a.output_id - b.output_id)
    .map((o) => ({ ...o, ...counts(t.production_outputs, 'output_id', o.output_id) }));
  const ids = new Set([...recipe.map((r) => String(r.material_id)), ...issues.flatMap((d) => d.lines.map((l) => String(l.material_id)))]);
  const materials = new Map(t.raw_materials.filter((m) => ids.has(String(m.material_id))).map((m) => [String(m.material_id), { name: m.name, unit: m.unit }]));
  return { wo: withProduct(t, wo), recipe, issues, outputs, materials };
}

export const workOrderView = (t, woId) => toWorkOrderView(loadWorkOrderRows(t, woId));

/** Daftar ringkas (terbaru dulu) dengan hasil bersih */
export function workOrderList(t) {
  return [...t.work_orders].sort((a, b) => b.wo_id - a.wo_id)
    .map((w) => toWorkOrderListRow(withProduct(t, w), t.production_outputs.filter((o) => same(o.wo_id, w.wo_id))));
}
