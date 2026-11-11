// Aturan murni CR-03 CP3 (recipeRules.service.js, materialRequirementRules.service.js) — FR-39, FR-40, BR-13 – BR-16,
// SPEC §5 "Aturan estimasi kebutuhan bahan" & §6; skenario CR-03 §B3.2 – §B3.8. Client setara: utils/rules/recipe.js,
// utils/rules/materialRequirement.js (uji silang di client tests/unit/recipeRules.test.mjs).

const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/services/recipeRules.service');
const M = require('../src/services/materialRequirementRules.service');
const F = require('./helpers/recipeFixtures');

const MATERIALS = [{ material_id: '1' }, { material_id: '2' }, { material_id: '7' }];
const butterRow = (out) => out.rows.find((r) => r.material_id === '2');

test('desimal ↔ milli-satuan eksak (BigInt, tanpa float)', () => {
  assert.equal(R.decimalToMilli('0.015'), 15n);
  assert.equal(R.decimalToMilli('6.50'), 6500n);
  assert.equal(R.decimalToMilli('9999999.999'), 9999999999n);
  assert.equal(R.decimalToMilli('-0.125'), -125n);
  assert.equal(R.milliToDecimalString(105n), '0.105');
  assert.equal(R.milliToDecimalString(-125n), '-0.125');
  assert.equal(R.milliToNumber(7n * 15n), 0.105); // 7 × 0,015 (float: 0.10500000000000001)
  assert.throws(() => R.decimalToMilli('0.0015'));
  assert.throws(() => R.decimalToMilli('abc'));
});

test('validasi takaran: string desimal > 0, maks. 3 desimal, ≤ 9.999.999,999; JSON number ditolak', () => {
  for (const [value, expected] of F.QTY_CASES) assert.equal(R.qtyPerUnitError(value), expected, String(value));
});

test('validasi komposisi: bahan terdaftar, sekali per produk, maks. 30 baris, daftar kosong sah', () => {
  assert.deepEqual(R.validateRecipeItems([], MATERIALS), { errors: {}, items: [] });
  const ok = R.validateRecipeItems([{ material_id: '2', qty_per_unit: '0.015' }, { material_id: 7, qty_per_unit: '1.500' }], MATERIALS);
  assert.deepEqual(ok, { errors: {}, items: [{ material_id: '2', qty_per_unit_milli: 15n }, { material_id: '7', qty_per_unit_milli: 1500n }] });
  const bad = R.validateRecipeItems([
    { material_id: '2', qty_per_unit: '0.015' }, { material_id: '2', qty_per_unit: '0.020' },
    { material_id: '99', qty_per_unit: '1' }, { material_id: 'x', qty_per_unit: 0.5 }, { qty_per_unit: '1' },
  ], MATERIALS);
  assert.deepEqual(bad.errors, {
    'items.1.material_id': 'Bahan sudah ada di komposisi', 'items.2.material_id': 'Bahan tidak terdaftar',
    'items.3.material_id': 'Bahan tidak valid', 'items.3.qty_per_unit': 'Kirim takaran sebagai teks desimal',
    'items.4.material_id': 'Pilih bahan',
  });
  assert.deepEqual(bad.items, []); // semua atau tidak sama sekali
  const many = (n) => Array.from({ length: n }, (_, i) => ({ material_id: String(i + 1), qty_per_unit: '1' }));
  const all = Array.from({ length: 31 }, (_, i) => ({ material_id: String(i + 1) }));
  assert.deepEqual(R.validateRecipeItems(many(30), all).errors, {});
  assert.equal(R.validateRecipeItems(many(31), all).errors.items, 'Maksimal 30 bahan per produk');
  assert.equal(R.validateRecipeItems('x', MATERIALS).errors.items, 'Daftar komposisi tidak valid');
});

test('perubahan komposisi (audit): pasangan material_id + qty_per_unit, urutan diabaikan', () => {
  const stored = [{ material_id: '2', qty_per_unit: '0.500' }, { material_id: '7', qty_per_unit: '1.500' }];
  const v = (rows) => R.validateRecipeItems(rows, MATERIALS).items;
  assert.equal(R.isRecipeChanged(stored, v([{ material_id: '7', qty_per_unit: '1.5' }, { material_id: '2', qty_per_unit: '0.5' }])), false);
  assert.equal(R.isRecipeChanged(stored, v([{ material_id: '2', qty_per_unit: '0.501' }, { material_id: '7', qty_per_unit: '1.5' }])), true);
  assert.equal(R.isRecipeChanged(stored, v([{ material_id: '2', qty_per_unit: '0.5' }])), true);
  assert.equal(R.isRecipeChanged(stored, []), true);
  assert.equal(R.isRecipeChanged([], []), false);
});

test('§B3.2 status: hanya Dikonfirmasi & Sedang Disiapkan yang dihitung', () => {
  const statuses = ['menunggu_pembayaran', 'dikonfirmasi', 'sedang_disiapkan', 'siap_diambil', 'dalam_pengiriman', 'selesai', 'dibatalkan'];
  const items = statuses.map((s) => F.item(s, '5', 'preorder', s, F.T, 1));
  const q = M.collectProductQuantities({ todayKey: F.T, date: F.T, orderItems: items });
  assert.equal(q.cumulative.get('5'), 2n);
});

test('§B3.3 produk ready: rencana hari ini penuh, item ready pesanan bukan tambahan, tanggal mendatang = 0', () => {
  const plan = [{ product_id: '1', availability_type: 'ready', stock_date: F.T, qty_planned: 40 }];
  const readyItem = [F.item('Q-A', '1', 'ready', 'dikonfirmasi', F.T, 3)];
  const today = M.collectProductQuantities({ todayKey: F.T, date: F.T, orderItems: readyItem, readyPlans: plan });
  assert.equal(today.daily.get('1'), 40n); // simulasi A: checkout/batal Q-A tidak mengubah estimasi
  const later = M.collectProductQuantities({ todayKey: F.T, date: '2026-11-14', orderItems: readyItem, readyPlans: plan });
  assert.equal(later.daily.get('1'), undefined);
  assert.equal(later.cumulative.get('1'), 40n); // rencana hari ini tetap masuk kumulatif
  const otherDay = [{ product_id: '1', availability_type: 'ready', stock_date: '2026-11-10', qty_planned: 30 }];
  assert.equal(M.collectProductQuantities({ todayKey: F.T, date: F.T, readyPlans: otherDay }).cumulative.size, 0);
  // E-9: tipe dibaca saat estimasi — rencana produk yang kini bukan ready diabaikan
  const changed = [{ product_id: '1', availability_type: 'preorder', stock_date: F.T, qty_planned: 40 }];
  assert.equal(M.collectProductQuantities({ todayKey: F.T, date: F.T, readyPlans: changed }).cumulative.size, 0);
});

test('§B3.3.2 – §B3.3.3 pesanan campuran: croissant tidak dihitung, cake dihitung pada ready_date', () => {
  const plan = [{ product_id: '1', availability_type: 'ready', stock_date: F.T, qty_planned: 40 }];
  const qb = [F.item('Q-B', '1', 'ready', 'dikonfirmasi', '2026-11-14', 2), F.item('Q-B', '5', 'preorder', 'dikonfirmasi', '2026-11-14', 1)];
  const b = M.computeMaterialRequirements({ ...F.b36Input('2026-11-14'), orderItems: qb, readyPlans: plan, materials: [F.BUTTER] });
  assert.deepEqual([butterRow(b).daily_need, butterRow(b).cumulative_need], [0.25, 0.85]);
  const qc = [F.item('Q-C', '1', 'ready', 'dikonfirmasi', F.T, 4), F.item('Q-C', '5', 'preorder', 'dikonfirmasi', F.T, 1)];
  const c = M.computeMaterialRequirements({ ...F.b36Input(F.T), orderItems: qc, readyPlans: plan, materials: [F.BUTTER] });
  assert.equal(butterRow(c).daily_need, 0.85);
});

test('§B3.4 / §B3.6 harian, tertunggak, kumulatif, sisa, status — angka contoh dokumen', () => {
  for (const [date, expected] of Object.entries(F.B36_EXPECTED)) {
    const row = butterRow(M.computeMaterialRequirements(F.b36Input(date)));
    for (const [key, value] of Object.entries(expected)) assert.equal(row[key], value, `${date} ${key}`);
  }
});

test('§B3.6 / B7.3 bentuk hasil: produk tanpa komposisi teridentifikasi, urutan, ringkasan, rentang', () => {
  const out = M.computeMaterialRequirements(F.b36Input('2026-11-14'));
  assert.deepEqual(out.products_without_recipe, [{ product_id: '4', name: 'Assorted Cookies Box', daily_quantity: 0, cumulative_quantity: 12 }]);
  assert.deepEqual(out.cumulative_range, { from: F.T, to: '2026-11-14' });
  assert.deepEqual(out.window, { from: F.T, to: '2026-12-10' });
  assert.equal(out.includes_ready_plan, true);
  assert.deepEqual(out.rows.map((r) => [r.material_id, r.status]), [['2', 'menipis'], ['1', 'cukup']]);
  assert.deepEqual(out.summary, { kurang: 0, menipis: 1, cukup: 1 });
  assert.deepEqual(butterRow(out), { material_id: '2', name: 'Butter Prancis', unit: 'kg', stock: 6.5, min_stock: 8,
    daily_need: 0.3, backlog_need: 0.25, cumulative_need: 2.15, remaining: 4.35, shortage: 0, status: 'menipis' });
  const empty = M.computeMaterialRequirements(F.b36Input('2026-11-14', { recipes: [] }));
  assert.deepEqual(empty.products_without_recipe.map((p) => p.product_id), ['1', '4', '5', '6']);
  assert.equal(butterRow(empty).cumulative_need, 0);
});

test('§B3.5 / §B3.8 presisi & status: tanpa pembulatan dini, batas kurang/menipis/cukup', () => {
  const material = (stock, min) => [{ material_id: '2', name: 'B', unit: 'kg', stock, min_stock: min }];
  const items = [F.item('X', '5', 'preorder', 'dikonfirmasi', F.T, 7)];
  const recipes = [{ product_id: '5', material_id: '2', qty_per_unit: '0.015' }];
  const run = (stock, min) => M.computeMaterialRequirements({ todayKey: F.T, date: F.T, orderItems: items, readyPlans: [], recipes, materials: material(stock, min) }).rows[0];
  assert.deepEqual([run('0.10', '0').cumulative_need, run('0.10', '0').shortage, run('0.10', '0').remaining, run('0.10', '0').status], [0.105, 0.005, -0.005, 'kurang']);
  assert.equal(run('0.11', '0.00').status, 'cukup'); // sisa 0,005 > minimum 0
  assert.equal(run('0.11', '0.01').status, 'menipis'); // sisa 0,005 ≤ minimum 0,01 (stok 2 desimal vs kebutuhan 3 desimal)
  assert.equal(run('0.105', '0').status, 'menipis'); // sisa tepat 0
  assert.equal(M.getDemandStatus(0n, 0n), 'menipis');
  assert.equal(M.getDemandStatus(5n, 5n), 'menipis');
  assert.equal(M.getDemandStatus(6n, 5n), 'cukup');
  assert.equal(M.getDemandStatus(-1n, 0n), 'kurang');
});

test('BR-16 custom cake: komposisi produk dasar custom, apa pun desain/opsi; E-7 tanpa komposisi tidak nol diam-diam', () => {
  const items = [F.item('C1', '6', 'custom', 'dikonfirmasi', F.T, 2)];
  const out = M.computeMaterialRequirements({ todayKey: F.T, date: F.T, orderItems: items, readyPlans: [], recipes: F.RECIPES, materials: [F.BUTTER] });
  assert.equal(out.rows[0].daily_need, 0.6);
  const none = M.computeMaterialRequirements({ todayKey: F.T, date: F.T, orderItems: items, readyPlans: [], recipes: [], materials: [F.BUTTER] });
  assert.deepEqual(none.products_without_recipe, [{ product_id: '6', name: null, daily_quantity: 2, cumulative_quantity: 2 }]);
});

test('jendela tanggal (SPEC §6): kosong = hari ini, T s.d. T + 29, selain itu 400-ready error', () => {
  assert.deepEqual(M.resolveRequirementDate(undefined, F.T), { date: F.T });
  assert.deepEqual(M.resolveRequirementDate('', F.T), { date: F.T });
  assert.deepEqual(M.resolveRequirementDate('2026-12-10', F.T), { date: '2026-12-10' });
  assert.deepEqual(M.resolveRequirementDate('2026-12-11', F.T), { error: 'Tanggal di luar rentang.' });
  assert.deepEqual(M.resolveRequirementDate('2026-11-10', F.T), { error: 'Tanggal di luar rentang.' });
  assert.deepEqual(M.resolveRequirementDate('2026-02-30', F.T), { error: 'Tanggal tidak valid.' });
  assert.deepEqual(M.resolveRequirementDate('14-11-2026', F.T), { error: 'Tanggal tidak valid.' });
  assert.throws(() => M.computeMaterialRequirements(F.b36Input('2026-11-10')));
});

test('fail-safe presisi JSON number: round-trip JSON.stringify eksak, selain itu MILLI_PRECISION_LOST', () => {
  for (const [milli, json] of F.PRECISION_CASES) {
    if (json === null) {
      assert.throws(() => R.milliToNumber(milli), (e) => e.code === R.MILLI_PRECISION_ERROR_CODE
        && e.milli === milli.toString() && e.message.includes('tanpa kehilangan presisi'), String(milli));
    } else {
      assert.equal(JSON.stringify(R.milliToNumber(milli)), json, String(milli));
    }
  }
  assert.equal(R.MILLI_PRECISION_ERROR_CODE, 'MILLI_PRECISION_LOST');
  // pengurai teks JSON: tanda negatif, pecahan, eksponen positif/negatif, teks bukan angka
  assert.equal(R.jsonNumberToMilli('0.105'), 105n);
  assert.equal(R.jsonNumberToMilli('-1.25e2'), -125000n);
  assert.equal(R.jsonNumberToMilli('1e+21'), 10n ** 24n);
  assert.equal(R.jsonNumberToMilli('2.5E-2'), 25n);
  assert.equal(R.jsonNumberToMilli('1.5e-7'), null); // bukan kelipatan milli
  assert.equal(R.jsonNumberToMilli('null'), null); // JSON.stringify(Infinity/NaN)
});

test('fail-safe di perhitungan: nilai eksak lolos, nilai yang hilang presisi melempar error (tanpa pembulatan diam-diam)', () => {
  const material = [{ material_id: '2', name: 'B', unit: 'kg', stock: '0', min_stock: '0' }];
  const recipes = [{ product_id: '1', material_id: '2', qty_per_unit: '9999999.999' }];
  const plan = (qty) => [{ product_id: '1', availability_type: 'ready', stock_date: F.T, qty_planned: qty }];
  const run = (qty) => M.computeMaterialRequirements({ todayKey: F.T, date: F.T, orderItems: [], readyPlans: plan(qty), recipes, materials: material });
  const ok = run(100).rows[0]; // 100 × 9.999.999,999 = 999.999.999,9
  assert.deepEqual([ok.cumulative_need, ok.remaining, ok.shortage, ok.status], [999999999.9, -999999999.9, 999999999.9, 'kurang']);
  assert.throws(() => run(2147483647), (e) => e.code === R.MILLI_PRECISION_ERROR_CODE);
});
