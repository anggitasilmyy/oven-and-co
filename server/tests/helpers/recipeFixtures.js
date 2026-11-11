// tests/helpers/recipeFixtures.js
// CR-03 CP3 · fixture skenario bersama untuk uji aturan murni server (node:test) dan client (tests/unit, uji silang).
// Data mengikuti contoh CR-03 §B3.3 (simulasi A–C) dan §B3.6: hari ini T = Rab 11 Nov 2026; Butter Prancis (kg)
// takaran croissant 0,015 · birthday cake 0,250 · custom cake 0,300; stok 6,50, minimum 8,00. // data contoh

const T = '2026-11-11';
const BUTTER = { material_id: '2', name: 'Butter Prancis', unit: 'kg', stock: '6.50', min_stock: '8.00' };
const FLOUR = { material_id: '1', name: 'Tepung terigu', unit: 'kg', stock: '42.00', min_stock: '25.00' };

const RECIPES = [
  { product_id: '1', material_id: '2', qty_per_unit: '0.015' }, // Classic Butter Croissant (ready)
  { product_id: '5', material_id: '2', qty_per_unit: '0.250' }, // Premium Birthday Cake (pre-order)
  { product_id: '6', material_id: '2', qty_per_unit: '0.300' }, // Custom Celebration Cake (custom, ukuran standar)
];

const item = (order, productId, type, status, readyDate, quantity) => ({
  order, product_id: productId, availability_type: type, order_status: status, ready_date: readyDate, quantity,
});

// §B3.6 — P1 – P9 (P9 = pesanan campuran; croissant-nya tidak dihitung sebagai tambahan)
const B36_ORDER_ITEMS = [
  item('P1', '5', 'preorder', 'dikonfirmasi', '2026-11-12', 2),
  item('P2', '5', 'preorder', 'sedang_disiapkan', '2026-11-11', 1),
  item('P3', '6', 'custom', 'menunggu_pembayaran', '2026-11-14', 1),
  item('P4', '5', 'preorder', 'siap_diambil', '2026-11-11', 1),
  item('P5', '5', 'preorder', 'selesai', '2026-11-10', 3),
  item('P6', '6', 'custom', 'dibatalkan', '2026-11-14', 1),
  item('P7', '6', 'custom', 'dikonfirmasi', '2026-11-14', 1), // opsi 24 cm → tetap takaran standar (BR-16)
  item('P8', '5', 'preorder', 'dikonfirmasi', '2026-11-09', 1), // terlambat → tertunggak
  item('P9', '1', 'ready', 'dikonfirmasi', '2026-11-12', 4),
  item('P9', '5', 'preorder', 'dikonfirmasi', '2026-11-12', 1),
];
const B36_READY_PLANS = [
  { product_id: '1', availability_type: 'ready', stock_date: T, qty_planned: 40 },
  { product_id: '4', availability_type: 'ready', stock_date: T, qty_planned: 12 }, // Cookies Box tanpa komposisi (E-7)
];

// Hasil yang diharapkan (Butter Prancis) per tanggal target — §B3.6 dan contoh respons B7.3
const B36_EXPECTED = {
  '2026-11-11': { daily_need: 0.85, backlog_need: 0.25, cumulative_need: 1.1, remaining: 5.4, shortage: 0, status: 'menipis' },
  '2026-11-12': { daily_need: 0.75, backlog_need: 0.25, cumulative_need: 1.85, remaining: 4.65, shortage: 0, status: 'menipis' },
  '2026-11-13': { daily_need: 0, backlog_need: 0.25, cumulative_need: 1.85, remaining: 4.65, shortage: 0, status: 'menipis' },
  '2026-11-14': { daily_need: 0.3, backlog_need: 0.25, cumulative_need: 2.15, remaining: 4.35, shortage: 0, status: 'menipis' },
  '2026-11-20': { daily_need: 0, backlog_need: 0.25, cumulative_need: 2.15, remaining: 4.35, shortage: 0, status: 'menipis' },
};

/** Input lengkap computeMaterialRequirements untuk tanggal target */
function b36Input(date, overrides = {}) {
  return {
    todayKey: T, date, orderItems: B36_ORDER_ITEMS, readyPlans: B36_READY_PLANS, recipes: RECIPES,
    materials: [FLOUR, BUTTER], productNames: { 4: 'Assorted Cookies Box' }, ...overrides,
  };
}

// Kasus validasi takaran: [nilai, pesan error yang diharapkan | null]
const QTY_CASES = [
  ['0.015', null], ['2', null], ['0.5', null], ['0.001', null], ['9999999.999', null], [' 0.5 ', null],
  ['0.0015', 'Maksimal 3 angka desimal'], ['10000000', 'Takaran terlalu besar'], ['0', 'Takaran harus lebih dari 0'],
  ['0.000', 'Takaran harus lebih dari 0'], ['', 'Isi takaran'], [null, 'Isi takaran'], [undefined, 'Isi takaran'],
  [0.015, 'Kirim takaran sebagai teks desimal'], [2, 'Kirim takaran sebagai teks desimal'],
  ['-1', 'Takaran tidak valid'], ['1e-3', 'Takaran tidak valid'], ['.5', 'Takaran tidak valid'],
  ['1.', 'Takaran tidak valid'], ['0,5', 'Takaran tidak valid'], ['abc', 'Takaran tidak valid'],
];

// Fail-safe presisi JSON number (keputusan pemilik project, CP3): [milli, teks JSON yang diharapkan | null = error]
const PRECISION_CASES = [
  [1n, '0.001'], [15n, '0.015'], [105n, '0.105'], [0n, '0'], [-125n, '-0.125'], [-5n, '-0.005'],
  [9999999999n, '9999999.999'], // takaran maks
  [99999999990n, '99999999.99'], // stok maks DECIMAL(10,2)
  [-49499999995050n, '-49499999995.05'], // sisa negatif: stok 0 − 1 pesanan penuh (50 × 99 × takaran maks)
  [999999999999999n, '999999999999.999'], // 15 digit signifikan — masih eksak
  [10n ** 24n, '1e+21'], // notasi eksponen yang tetap eksak
  [9999999999999999n, null], [-9999999999999999n, null], // 16 digit dengan 3 desimal — hilang presisi
  [2147483647n * 9999999999n, null], // qty_planned maks × takaran maks
  [10n ** 24n + 1n, null],
];

module.exports = { T, BUTTER, FLOUR, RECIPES, item, B36_ORDER_ITEMS, B36_READY_PLANS, B36_EXPECTED, b36Input, QTY_CASES, PRECISION_CASES };
