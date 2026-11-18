// Uji CR-04c (Vitest) · FR-47 · BR-22, BR-33 · Draft 0.8.3 §3 aturan 6, §9 — aturan murni laporan operasional client
// (utils/rules/operationsReport.js, mode mock) = server (services/operationsReportRules.service.js, mode API) untuk input sama;
// IT-23 (kontribusi standar per periode, 0,015 × 7 = 0,105; aktual 0,10 → selisih −0,005) dan IT-32 (batas agregat
// ±999.999.999.999,999 / rupiah ±9.999.999.999.999,99 → 200, di atasnya 422; fail-safe MILLI_PRECISION_LOST).

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SK = require('../../../server/src/utils/businessConstants.js');
const SR = require('../../../server/src/services/operationsReportRules.service.js');
const KC = await import('../../src/constants/report.js');
const CR = await import('../../src/utils/rules/operationsReport.js');

const run = (fn, input) => {
  try { return { ok: true, value: fn(input) }; } catch (e) {
    return { ok: false, status: e.statusCode ?? e.status ?? null, code: e.apiCode ?? e.code ?? null, message: e.message };
  }
};
const both = (input, label) => {
  const [c, s] = [run(CR.buildOperationsReport, input), run(SR.buildOperationsReport, input)];
  assert.deepEqual(c, s, label);
  return s;
};
const empty = () => ({ ordered: [], cancelled: [], receipts: [], movements: [], outputs: [], recipes: [], materials: [], plans: [], sales: { revenue_cents: 0n, transactions: 0 } });
const M = (id, name = `B${id}`) => ({ material_id: id, name, unit: 'kg' });
const sup = { supplier_id: '1', supplier_name: 'Sup A' };

test('konstanta laporan client = server', () => {
  for (const k of ['REPORT_QTY_LIMIT_MILLI', 'REPORT_RUPIAH_LIMIT_CENTS', 'REPORT_ERROR_CODE', 'REPORT_AGGREGATE_LIMIT_TEXT', 'REPORT_MOVEMENT_TYPES', 'REPORT_ISSUE_MOVEMENT_TYPES', 'REPORT_RECEIPT_MOVEMENT_TYPES']) {
    assert.deepEqual(KC[k], SK[k], k);
  }
});

test('data kosong → seluruh bagian kosong & total 0 (client = server)', () => {
  const r = both(empty(), 'kosong');
  assert.deepEqual(r.value, {
    purchases: { ordered: { rows: [], total_value: 0 }, cancelled: { rows: [], total_value: 0 }, received: { rows: [], total_value: 0 } },
    movements: [], usage: [], production: [], plan_vs_output: [], revenue: { revenue: 0, transactions: 0 },
  });
});

test('pembelian per supplier × bahan; nilai = Σ round per baris (BR-22); penerimaan bertanda; mutasi per bahan × jenis', () => {
  const input = {
    ...empty(),
    ordered: [{ ...sup, ...M('2'), qty_ordered: '2.5', unit_price: '1000.01' }, { ...sup, ...M('1'), qty_ordered: '10.00', unit_price: '1500.55' },
      { ...sup, ...M('1'), qty_ordered: '0.33', unit_price: '0.05' }],
    cancelled: [{ ...sup, ...M('1'), qty_cancelled: '1.5', unit_price: '1500.55' }],
    receipts: [{ ...sup, ...M('1'), qty_change: '4.00', unit_price: '1500.55' }, { ...sup, ...M('1'), qty_change: '-4.00', unit_price: '1500.55' },
      { ...sup, ...M('1'), qty_change: '3.00', unit_price: '1500.55' }],
    movements: [{ ...M('2'), type: 'pengeluaran_produksi', qty_change: '-0.10' }, { ...M('1'), type: 'penerimaan', qty_change: '4.00' },
      { ...M('1'), type: 'pembalik_penerimaan', qty_change: '-4.00' }, { ...M('1'), type: 'penerimaan', qty_change: '3.00' }, { ...M('1'), type: 'saldo_awal', qty_change: '5.00' }],
  };
  const r = both(input, 'pembelian').value;
  assert.deepEqual(r.purchases.ordered.rows.map((x) => [x.material_id, x.qty, x.value]), [['1', 10.33, 15005.52], ['2', 2.5, 2500.03]]);
  assert.equal(r.purchases.ordered.total_value, 17505.55);
  assert.deepEqual([r.purchases.cancelled.total_value, r.purchases.received.rows[0].qty, r.purchases.received.total_value], [2250.83, 3, 4501.65]);
  assert.deepEqual(r.movements.map((x) => [x.material_id, x.type, x.qty_change, x.count]),
    [['1', 'saldo_awal', 5, 1], ['1', 'penerimaan', 7, 2], ['1', 'pembalik_penerimaan', -4, 1], ['2', 'pengeluaran_produksi', -0.1, 1]]);
});

test('IT-23 (aturan): standar per periode dari dokumen hasil (recorded_at) & aktual dari mutasi pengeluaran; Σ periode = WO', () => {
  const recipes = [{ wo_id: '7', material_id: '1', qty_per_unit: '0.015' }];
  const wo = { wo_id: '7', wo_number: 'WO-261116-001', product_id: '3', product_name: 'Roti' };
  // Periode X: hasil normal 5, pengeluaran 0,10 · Periode Y: koreksi hasil 5 → 7 (R + P), koreksi pengeluaran tidak mengubah total
  const X = { ...empty(), recipes, materials: [M('1')], outputs: [{ ...wo, output_id: '1', kind: 'normal', qty_output: 5 }],
    movements: [{ ...M('1'), type: 'pengeluaran_produksi', qty_change: '-0.10' }], plans: [{ product_id: '3', product_name: 'Roti', qty_planned: 7 }] };
  const Y = { ...empty(), recipes, materials: [M('1')], outputs: [{ ...wo, output_id: '2', kind: 'pembalik', qty_output: 5 }, { ...wo, output_id: '3', kind: 'pengganti', qty_output: 7 }] };
  const x = both(X, 'X').value;
  const y = both(Y, 'Y').value;
  assert.deepEqual(x.usage, [{ material_id: '1', name: 'B1', unit: 'kg', standard: 0.075, actual: 0.1, variance: 0.025 }]);
  assert.deepEqual(y.usage, [{ material_id: '1', name: 'B1', unit: 'kg', standard: 0.03, actual: 0, variance: -0.03 }]);
  const all = both({ ...X, outputs: [...X.outputs, ...Y.outputs] }, 'X+Y').value;
  assert.deepEqual([all.usage[0].standard, all.usage[0].actual, all.usage[0].variance], [0.105, 0.1, -0.005], 'Σ kontribusi = WO: 0,015 × 7 = 0,105; selisih −0,005');
  assert.deepEqual([x.production[0].corrected, y.production[0].corrected, y.production[0].net_output, all.production[0].net_output], [false, true, 2, 7]);
  assert.deepEqual(x.plan_vs_output, [{ product_id: '3', product_name: 'Roti', qty_planned: 7, net_output: 5 }]);
});

test('IT-32 (aturan): batas agregat kuantitas & rupiah ±; di atas batas → 422 tanpa data sebagian; standar maks. eksak', () => {
  const qty = (text) => ({ ...empty(), movements: [{ ...M('1'), type: 'stok_masuk', qty_change: text }] });
  // Agregat tepat ±999.999.999.999,999 (beberapa mutasi) → 200 eksak
  const near = (sign) => ({ ...empty(), movements: Array.from({ length: 10 }, () => ({ ...M('1'), type: 'stok_masuk', qty_change: `${sign}99999999999.9999`.slice(0, -1) }))
    .concat([{ ...M('1'), type: 'stok_masuk', qty_change: `${sign}0.009` }]) });
  assert.deepEqual(both(near(''), '+batas').value.movements[0].qty_change, 999999999999.999);
  assert.deepEqual(both(near('-'), '−batas').value.movements[0].qty_change, -999999999999.999);
  for (const over of [{ ...near(''), movements: [...near('').movements, { ...M('1'), type: 'stok_masuk', qty_change: '0.001' }] },
    { ...near('-'), movements: [...near('-').movements, { ...M('1'), type: 'stok_masuk', qty_change: '-0.001' }] }]) {
    assert.deepEqual(both(over, '> batas'), { ok: false, status: 422, code: 'REPORT_AGGREGATE_LIMIT', message: 'Total laporan melebihi batas sistem. Persempit periode laporan.' });
  }
  assert.equal(both(qty('1'), 'kecil').ok, true);
  // Standar 9.999.999,999 × 10.000 = 99.999.999.990,000 eksak; × 11 WO melebihi batas → 422
  const wo = (i) => ({ wo_id: String(i), wo_number: `WO-261116-${String(i).padStart(3, '0')}`, product_id: '3', product_name: 'Roti', output_id: String(i), kind: 'normal', qty_output: 10000 });
  const big = (n) => ({ ...empty(), materials: [M('1')], outputs: Array.from({ length: n }, (_, i) => wo(i + 1)),
    recipes: Array.from({ length: n }, (_, i) => ({ wo_id: String(i + 1), material_id: '1', qty_per_unit: '9999999.999' })) });
  assert.equal(both(big(1), 'standar maks').value.usage[0].standard, 99999999990);
  assert.equal(both(big(10), '10 WO').value.usage[0].variance, -999999999900);
  assert.equal(both(big(11), '11 WO').status, 422);
  // Rupiah: omzet pembanding tepat ±9.999.999.999.999,99 → 200; di atasnya → 422
  const rp = (cents) => ({ ...empty(), sales: { revenue_cents: cents, transactions: 1 } });
  assert.equal(both(rp(999999999999999n), 'rp batas').value.revenue.revenue, 9999999999999.99);
  assert.equal(both(rp(-999999999999999n), 'rp −batas').value.revenue.revenue, -9999999999999.99);
  assert.equal(both(rp(1000000000000000n), 'rp > batas').status, 422);
  assert.equal(both(rp(-1000000000000000n), 'rp < −batas').status, 422);
});

test('IT-32 (fail-safe): serialisasi nilai yang sengaja tidak eksak → MILLI_PRECISION_LOST (client = server)', () => {
  // Melewati pemeriksaan batas (diuji di atas) untuk memastikan pengaman serialisasi tetap aktif
  const agg = { purchases: { ordered: { rows: [], total_value: 0n }, cancelled: { rows: [], total_value: 0n }, received: { rows: [], total_value: 0n } },
    movements: [{ material_id: '1', name: 'B', unit: 'kg', type: 'stok_masuk', qty_change: 123456789012345678901n, count: 1 }], usage: [], production: [], plan_vs_output: [],
    sales: { revenue_cents: 0n, transactions: 0 } };
  const c = run(CR.serializeOperations, agg);
  const s = run(SR.serializeOperations, agg);
  assert.deepEqual([c.ok, c.code], [false, 'MILLI_PRECISION_LOST']);
  assert.deepEqual([s.ok, s.code], [false, 'MILLI_PRECISION_LOST']);
});
