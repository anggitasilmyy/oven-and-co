// services/operationsReportRules.service.js
// CR-04c · FR-47 · UC-38 · BR-22, BR-33 · AD-08 tab Operasional (Draft 0.8.3 §3 aturan 6, §6, §9) — aturan murni laporan
// operasional. Port setara di client: utils/rules/operationsReport.js (uji silang client tests/vitest/operationsReport.test.mjs).
// Masukan = baris sumber yang SUDAH difilter per dasar tanggal §9 (WIB) dalam satu snapshot; kuantitas & harga sebagai teks
// desimal (tanpa Number()). Agregasi BigInt: kuantitas milli, rupiah sen (nilai per baris dibulatkan §6). Urutan §3 aturan 6:
// agregasi → pemeriksaan batas kebijakan (422 REPORT_AGGREGATE_LIMIT, tanpa data sebagian) → serialisasi eksak
// (milliToNumber; gagal → MILLI_PRECISION_LOST). Keputusan Pemilik Project (CR-04c): baris pembelian per supplier × bahan,
// mutasi per bahan × jenis (saldo awal ikut), pemakaian per bahan, hasil per WO, rencana vs hasil per produk termasuk WO batal.

const {
  REPORT_QTY_LIMIT_MILLI, REPORT_RUPIAH_LIMIT_CENTS, REPORT_ERROR_CODE, REPORT_AGGREGATE_LIMIT_TEXT, REPORT_MOVEMENT_TYPES,
  REPORT_ISSUE_MOVEMENT_TYPES,
} = require('../utils/businessConstants');
const { decimalToMilli, milliToNumber } = require('./recipeRules.service');
const { lineValueCents } = require('./purchaseValueRules.service');

const byId = (a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);
const abs = (v) => (v < 0n ? -v : v);
/** Rupiah sen → JSON number lewat fail-safe yang sama (sen × 10 = milli rupiah) */
const centsToNumber = (cents) => milliToNumber(cents * 10n);
const OUTPUT_SIGN = Object.freeze({ normal: 1n, pengganti: 1n, pembalik: -1n });

function limitError() {
  return Object.assign(new Error(REPORT_AGGREGATE_LIMIT_TEXT), { statusCode: 422, apiCode: REPORT_ERROR_CODE.REPORT_AGGREGATE_LIMIT });
}

/** Kelompokkan baris pembelian per supplier × bahan: qty (milli) & nilai (sen, Σ nilai per baris) */
function groupPurchases(rows, qtyKey) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.supplier_id}:${r.material_id}`;
    const g = groups.get(key) ?? { supplier_id: String(r.supplier_id), supplier_name: r.supplier_name, material_id: String(r.material_id), name: r.name, unit: r.unit, qty: 0n, value: 0n };
    g.qty += decimalToMilli(r[qtyKey]);
    g.value += lineValueCents(r[qtyKey], r.unit_price);
    groups.set(key, g);
  }
  const list = [...groups.values()].sort((a, b) => byId(a.supplier_id, b.supplier_id) || byId(a.material_id, b.material_id));
  return { rows: list, total_value: list.reduce((sum, g) => sum + g.value, 0n) };
}

/**
 * Laporan operasional periode (nilai BigInt; belum diserialisasi).
 * @param {object} input
 *   ordered:   [{supplier_id, supplier_name, material_id, name, unit, qty_ordered, unit_price}] — item PO dengan ordered_at di periode
 *   cancelled: [{…, qty_cancelled, unit_price}] — item PO dengan cancelled_at di periode
 *   receipts:  [{…, qty_change, unit_price}] — mutasi penerimaan/pembalik/koreksi (created_at di periode)
 *   movements: [{material_id, name, unit, type, qty_change}] — seluruh mutasi (created_at di periode)
 *   outputs:   [{output_id, wo_id, wo_number, product_id, product_name, kind, qty_output}] — dokumen hasil (recorded_at di periode)
 *   recipes:   [{wo_id, material_id, qty_per_unit}] — snapshot resep WO pada `outputs`
 *   materials: [{material_id, name, unit}] — nama bahan (pemakaian)
 *   plans:     [{product_id, product_name, qty_planned}] — seluruh WO (termasuk Dibatalkan) dengan production_date di periode; WO
 *              Dibatalkan tidak punya dokumen hasil sehingga hanya menambah rencana
 *   sales:     {revenue_cents: bigint, transactions: number} — omzet pembanding AD-08 apa adanya
 */
function aggregateOperations(input) {
  const purchases = {
    ordered: groupPurchases(input.ordered, 'qty_ordered'),
    cancelled: groupPurchases(input.cancelled, 'qty_cancelled'),
    received: groupPurchases(input.receipts, 'qty_change'),
  };

  const movementGroups = new Map();
  for (const m of input.movements) {
    const key = `${m.material_id}:${m.type}`;
    const g = movementGroups.get(key) ?? { material_id: String(m.material_id), name: m.name, unit: m.unit, type: m.type, qty_change: 0n, count: 0 };
    g.qty_change += decimalToMilli(m.qty_change);
    g.count += 1;
    movementGroups.set(key, g);
  }
  const movements = [...movementGroups.values()].sort((a, b) => byId(a.material_id, b.material_id)
    || REPORT_MOVEMENT_TYPES.indexOf(a.type) - REPORT_MOVEMENT_TYPES.indexOf(b.type));

  // Pemakaian (§9): aktual = −Σ qty_change mutasi pengeluaran periode; standar = Σ snapshot × hasil bertanda dokumen periode
  const materialInfo = new Map(input.materials.map((m) => [String(m.material_id), m]));
  const usage = new Map();
  const usageRow = (id) => {
    const key = String(id);
    if (!usage.has(key)) {
      const info = materialInfo.get(key) ?? { name: '', unit: '' };
      usage.set(key, { material_id: key, name: info.name, unit: info.unit, standard: 0n, actual: 0n });
    }
    return usage.get(key);
  };
  for (const m of input.movements) if (REPORT_ISSUE_MOVEMENT_TYPES.includes(m.type)) usageRow(m.material_id).actual -= decimalToMilli(m.qty_change);
  const recipeOf = new Map();
  for (const r of input.recipes) {
    const list = recipeOf.get(String(r.wo_id)) ?? [];
    list.push(r);
    recipeOf.set(String(r.wo_id), list);
  }
  for (const o of input.outputs) {
    const signed = OUTPUT_SIGN[o.kind] * BigInt(o.qty_output);
    for (const r of recipeOf.get(String(o.wo_id)) ?? []) usageRow(r.material_id).standard += decimalToMilli(r.qty_per_unit) * signed;
  }
  const usageRows = [...usage.values()].sort((a, b) => byId(a.material_id, b.material_id))
    .map((u) => ({ ...u, variance: u.actual - u.standard }));

  // Hasil produksi per WO (dokumen periode) & rencana vs hasil per produk
  const perWo = new Map();
  const outputByProduct = new Map();
  for (const o of input.outputs) {
    const key = String(o.wo_id);
    const g = perWo.get(key) ?? { wo_id: key, wo_number: o.wo_number, product_id: String(o.product_id), product_name: o.product_name, net_output: 0n, corrected: false };
    const signed = OUTPUT_SIGN[o.kind] * BigInt(o.qty_output);
    g.net_output += signed;
    if (o.kind !== 'normal') g.corrected = true;
    perWo.set(key, g);
    outputByProduct.set(String(o.product_id), (outputByProduct.get(String(o.product_id)) ?? 0n) + signed);
  }
  const plan = new Map();
  for (const p of input.plans) {
    const key = String(p.product_id);
    const g = plan.get(key) ?? { product_id: key, product_name: p.product_name, qty_planned: 0n, net_output: 0n };
    g.qty_planned += BigInt(p.qty_planned);
    plan.set(key, g);
  }
  for (const o of input.outputs) {
    const key = String(o.product_id);
    if (!plan.has(key)) plan.set(key, { product_id: key, product_name: o.product_name, qty_planned: 0n, net_output: 0n });
  }
  for (const g of plan.values()) g.net_output = outputByProduct.get(g.product_id) ?? 0n;

  return {
    purchases,
    movements,
    usage: usageRows,
    production: [...perWo.values()].sort((a, b) => byId(a.wo_id, b.wo_id)),
    plan_vs_output: [...plan.values()].sort((a, b) => byId(a.product_id, b.product_id)),
    sales: input.sales,
  };
}

/** Seluruh agregat kuantitas (milli) & rupiah (sen) dalam laporan — untuk pemeriksaan batas kebijakan */
function aggregateValues(agg) {
  const qty = [];
  const rupiah = [agg.sales.revenue_cents];
  for (const section of Object.values(agg.purchases)) {
    rupiah.push(section.total_value);
    for (const r of section.rows) { qty.push(r.qty); rupiah.push(r.value); }
  }
  for (const m of agg.movements) qty.push(m.qty_change);
  for (const u of agg.usage) qty.push(u.standard, u.actual, u.variance);
  for (const p of agg.production) qty.push(p.net_output * 1000n);
  for (const p of agg.plan_vs_output) qty.push(p.qty_planned * 1000n, p.net_output * 1000n);
  return { qty, rupiah };
}

/** 422 bila satu saja agregat melebihi batas (|nilai|) — dipanggil sebelum serialisasi */
function assertWithinLimits(agg) {
  const { qty, rupiah } = aggregateValues(agg);
  if (qty.some((v) => abs(v) > REPORT_QTY_LIMIT_MILLI) || rupiah.some((v) => abs(v) > REPORT_RUPIAH_LIMIT_CENTS)) throw limitError();
}

/** Serialisasi eksak: semua angka lewat milliToNumber (rupiah sen × 10); hasil bulat kecil tetap bilangan bulat */
function serializeOperations(agg) {
  const purchase = (section) => ({
    rows: section.rows.map((r) => ({ ...r, qty: milliToNumber(r.qty), value: centsToNumber(r.value) })),
    total_value: centsToNumber(section.total_value),
  });
  const count = (v) => milliToNumber(v * 1000n);
  return {
    purchases: { ordered: purchase(agg.purchases.ordered), cancelled: purchase(agg.purchases.cancelled), received: purchase(agg.purchases.received) },
    movements: agg.movements.map((m) => ({ ...m, qty_change: milliToNumber(m.qty_change) })),
    usage: agg.usage.map((u) => ({ ...u, standard: milliToNumber(u.standard), actual: milliToNumber(u.actual), variance: milliToNumber(u.variance) })),
    production: agg.production.map((p) => ({ ...p, net_output: count(p.net_output) })),
    plan_vs_output: agg.plan_vs_output.map((p) => ({ ...p, qty_planned: count(p.qty_planned), net_output: count(p.net_output) })),
    revenue: { revenue: centsToNumber(agg.sales.revenue_cents), transactions: agg.sales.transactions },
  };
}

/** Urutan lengkap §3 aturan 6: agregasi → batas (422) → serialisasi eksak (500) */
function buildOperationsReport(input) {
  const agg = aggregateOperations(input);
  assertWithinLimits(agg);
  return serializeOperations(agg);
}

module.exports = { centsToNumber, aggregateOperations, assertWithinLimits, serializeOperations, buildOperationsReport };
