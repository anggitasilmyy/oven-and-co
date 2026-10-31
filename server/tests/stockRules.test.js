// Aturan murni Step 6.4 · AD-07 (stockRules.service.js) — sama dengan client utils/rules/stock.js (FR-32, SPEC §8).

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getRemainingStock, getDailyStockStatus, validateDailyPlan, getMaterialStatus, validateMaterial, validateStockIn,
} = require('../src/services/stockRules.service');

test('stok harian: sisa tidak negatif, status belum diisi / habis / tersedia, rencana ≥ terjual', () => {
  assert.equal(getRemainingStock(null), 0);
  assert.equal(getRemainingStock({ qty_planned: 3, qty_sold: 5 }), 0);
  assert.equal(getDailyStockStatus(null), 'belum_diisi');
  assert.equal(getDailyStockStatus({ qty_planned: 0, qty_sold: 0 }), 'belum_diisi');
  assert.equal(getDailyStockStatus({ qty_planned: 4, qty_sold: 4 }), 'habis');
  assert.equal(getDailyStockStatus({ qty_planned: 5, qty_sold: 4 }), 'tersedia');
  assert.equal(validateDailyPlan(5, 5), null);
  assert.equal(validateDailyPlan('0', 0), null);
  assert.equal(validateDailyPlan(4, 5), 'Minimal 5 (sudah terjual 5)');
  assert.equal(validateDailyPlan(null), 'Isi jumlah dalam bilangan bulat');
});

test('bahan baku: status batas tepat, desimal ≤ 2, stok masuk tidak melewati batas kolom', () => {
  assert.equal(getMaterialStatus({ stock: 0, min_stock: 0 }), 'habis');
  assert.equal(getMaterialStatus({ stock: 5, min_stock: 5 }), 'menipis');
  assert.equal(getMaterialStatus({ stock: 5.01, min_stock: 5 }), 'aman');
  const limits = { nameMax: 100, unitMax: 20, qtyMax: 99999999.99 };
  assert.deepEqual(validateMaterial({ name: 'A', unit: 'g', stock: '99999999.99', min_stock: '0' }, [], null, limits), {});
  assert.equal(validateMaterial({ name: 'A', unit: 'g', stock: '0.10', min_stock: 0 }, [], null, limits).stock, undefined);
  assert.equal(validateMaterial({ name: 'A', unit: 'g', stock: '.5', min_stock: 0 }, [], null, limits).stock, 'Maksimal 2 angka desimal');
  assert.equal(validateStockIn('0.01', 99999999.98, 99999999.99), null);
  assert.equal(validateStockIn('0.02', 99999999.98, 99999999.99), 'Stok baru melebihi batas penyimpanan');
});
