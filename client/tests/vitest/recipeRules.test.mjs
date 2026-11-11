// Uji CR-03 CP3 (Vitest, CR-03 §B10) · FR-39, FR-40, BR-13 – BR-16, SPEC §5 & §6 — aturan murni client utils/rules/recipe.js &
// utils/rules/materialRequirement.js. Skenario dari fixture bersama server (tests/helpers/recipeFixtures.js) dan uji
// silang: hasil client harus identik dengan server (services/recipeRules.service.js,
// services/materialRequirementRules.service.js) untuk input yang sama.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const F = require('../../../server/tests/helpers/recipeFixtures.js');
const SR = require('../../../server/src/services/recipeRules.service.js');
const SM = require('../../../server/src/services/materialRequirementRules.service.js');
const SC = require('../../../server/src/utils/businessConstants.js');
const R = await import('../../src/utils/rules/recipe.js');
const M = await import('../../src/utils/rules/materialRequirement.js');
const C = await import('../../src/constants/recipe.js');

const butterRow = (out) => out.rows.find((r) => r.material_id === '2');

test('konstanta client = server', () => {
  assert.deepEqual([...C.MATERIAL_DEMAND_STATUSES], [...SC.MATERIAL_DEMAND_STATUSES]);
  assert.equal(C.RECIPE_MAX_ITEMS, SC.RECIPE_MAX_ITEMS);
  assert.equal(C.RECIPE_QTY_DECIMALS, SC.RECIPE_QTY_DECIMALS);
  assert.equal(C.MATERIAL_REQUIREMENT_WINDOW_DAYS, SC.MATERIAL_REQUIREMENT_WINDOW_DAYS);
  assert.deepEqual({ ...C.MATERIAL_DEMAND_STATUS }, { ...SC.MATERIAL_DEMAND_STATUS });
});

test('validasi takaran (SPEC §6): kasus fixture sama persis dengan server', () => {
  for (const [value, expected] of F.QTY_CASES) {
    assert.equal(R.qtyPerUnitError(value), expected, String(value));
    assert.equal(R.qtyPerUnitError(value), SR.qtyPerUnitError(value), String(value));
  }
  assert.equal(R.milliToNumber(7n * 15n), 0.105);
  assert.equal(R.milliToDecimalString(R.decimalToMilli('9999999.999')), '9999999.999');
});

test('validasi komposisi: duplikat, tidak terdaftar, maks. 30 baris — identik dengan server', () => {
  const materials = [{ material_id: '1' }, { material_id: '2' }];
  const cases = [
    [],
    [{ material_id: '2', qty_per_unit: '0.015' }, { material_id: 1, qty_per_unit: '1.5' }],
    [{ material_id: '2', qty_per_unit: '0.015' }, { material_id: '2', qty_per_unit: '1' }, { material_id: '9', qty_per_unit: 1 }, {}],
    Array.from({ length: 31 }, () => ({ material_id: '1', qty_per_unit: '1' })),
    'bukan-array',
  ];
  for (const items of cases) assert.deepEqual(R.validateRecipeItems(items, materials), SR.validateRecipeItems(items, materials));
  const stored = [{ material_id: '2', qty_per_unit: '0.500' }];
  assert.equal(R.isRecipeChanged(stored, R.validateRecipeItems([{ material_id: '2', qty_per_unit: '0.5' }], materials).items), false);
});

test('§B3.6 contoh dokumen: harian, tertunggak, kumulatif, sisa, status per tanggal', () => {
  for (const [date, expected] of Object.entries(F.B36_EXPECTED)) {
    const row = butterRow(M.computeMaterialRequirements(F.b36Input(date)));
    for (const [key, value] of Object.entries(expected)) assert.equal(row[key], value, `${date} ${key}`);
  }
  const out = M.computeMaterialRequirements(F.b36Input('2026-11-14'));
  assert.deepEqual(out.products_without_recipe, [{ product_id: '4', name: 'Assorted Cookies Box', daily_quantity: 0, cumulative_quantity: 12 }]);
  assert.deepEqual(out.summary, { kurang: 0, menipis: 1, cukup: 1 });
});

test('hasil client identik dengan server untuk seluruh skenario fixture & jendela tanggal', () => {
  for (const date of [...Object.keys(F.B36_EXPECTED), '2026-12-10']) {
    assert.deepEqual(M.computeMaterialRequirements(F.b36Input(date)), SM.computeMaterialRequirements(F.b36Input(date)), date);
  }
  for (const d of [undefined, '', '2026-12-10', '2026-12-11', '2026-11-10', '2026-02-30', 'x']) {
    assert.deepEqual(M.resolveRequirementDate(d, F.T), SM.resolveRequirementDate(d, F.T), String(d));
  }
});

test('uji silang acak (300 kasus, deterministik): client = server', () => {
  let seed = 20261111;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const statuses = ['menunggu_pembayaran', 'dikonfirmasi', 'sedang_disiapkan', 'siap_diambil', 'selesai', 'dibatalkan'];
  const types = ['ready', 'preorder', 'custom'];
  const day = (offset) => { const d = new Date(Date.UTC(2026, 10, 11 + offset)); return d.toISOString().slice(0, 10); };
  for (let k = 0; k < 300; k += 1) {
    const orderItems = Array.from({ length: rnd(12) }, (_, i) => F.item(`O${i}`, String(1 + rnd(6)), types[rnd(3)], statuses[rnd(6)], day(rnd(20) - 5), rnd(9)));
    const readyPlans = Array.from({ length: rnd(4) }, () => ({ product_id: String(1 + rnd(6)), availability_type: types[rnd(3)], stock_date: day(rnd(2) - 1), qty_planned: rnd(60) }));
    const recipes = Array.from({ length: rnd(10) }, () => ({ product_id: String(1 + rnd(6)), material_id: String(1 + rnd(3)), qty_per_unit: `${rnd(5)}.${String(rnd(1000)).padStart(3, '0')}` }));
    const materials = [1, 2, 3].map((id) => ({ material_id: String(id), name: `B${id}`, unit: 'kg', stock: `${rnd(20)}.${String(rnd(100)).padStart(2, '0')}`, min_stock: `${rnd(10)}.00` }));
    const input = { todayKey: F.T, date: day(rnd(30)), orderItems, readyPlans, recipes, materials };
    assert.deepEqual(M.computeMaterialRequirements(input), SM.computeMaterialRequirements(input), `kasus ${k}`);
  }
});

// Hasil (nilai atau error) satu fungsi dalam bentuk yang bisa dibandingkan antar-implementasi
const outcome = (fn) => {
  try { return { value: JSON.stringify(fn()) }; } catch (e) { return { code: e.code, message: e.message, milli: e.milli }; }
};

test('fail-safe presisi JSON number: kasus fixture, client = server (nilai maupun error)', () => {
  assert.equal(R.MILLI_PRECISION_ERROR_CODE, SR.MILLI_PRECISION_ERROR_CODE);
  for (const [milli, json] of F.PRECISION_CASES) {
    const client = outcome(() => R.milliToNumber(milli));
    assert.deepEqual(client, outcome(() => SR.milliToNumber(milli)), String(milli));
    if (json === null) assert.equal(client.code, 'MILLI_PRECISION_LOST', String(milli));
    else assert.equal(client.value, json, String(milli));
  }
  for (const text of ['0.105', '-1.25e2', '1e+21', '2.5E-2', '1.5e-7', 'null', '-0']) {
    assert.equal(R.jsonNumberToMilli(text), SR.jsonNumberToMilli(text), text);
  }
});

test('fail-safe di perhitungan: error identik client = server; nilai eksak tetap number', () => {
  const material = [{ material_id: '2', name: 'B', unit: 'kg', stock: '0', min_stock: '0' }];
  const recipes = [{ product_id: '1', material_id: '2', qty_per_unit: '9999999.999' }];
  for (const qty of [1, 100, 100000, 100001, 2147483647]) {
    const input = { todayKey: F.T, date: F.T, orderItems: [], readyPlans: [{ product_id: '1', availability_type: 'ready', stock_date: F.T, qty_planned: qty }], recipes, materials: material };
    assert.deepEqual(outcome(() => M.computeMaterialRequirements(input)), outcome(() => SM.computeMaterialRequirements(input)), String(qty));
  }
  const big = { todayKey: F.T, date: F.T, orderItems: [], readyPlans: [{ product_id: '1', availability_type: 'ready', stock_date: F.T, qty_planned: 2147483647 }], recipes, materials: material };
  assert.equal(outcome(() => M.computeMaterialRequirements(big)).code, 'MILLI_PRECISION_LOST');
});
