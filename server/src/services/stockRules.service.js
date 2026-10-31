// services/stockRules.service.js
// FR-32 · UC-24 · AD-07 — aturan stok produk harian & bahan baku (fungsi murni).
// Port server dari client/src/utils/rules/stock.js (getRemainingStock, getDailyStockStatus, validateDailyPlan,
// isLowStock, getMaterialStatus, validateMaterial, validateStockIn) dengan perilaku & pesan sama.
// Sisa = qty_planned − qty_sold (tidak disimpan, SPEC §8); stok tidak boleh negatif (validation rule Stok).

/** Sisa stok produk ready hari ini; 0 bila belum ada rencana */
function getRemainingStock(dailyStock) {
  if (!dailyStock) return 0;
  return Math.max(0, dailyStock.qty_planned - dailyStock.qty_sold);
}

/**
 * Status stok produk harian: belum diisi (belum ada rencana hari ini), habis (sisa 0), tersedia.
 * @returns {'belum_diisi'|'habis'|'tersedia'}
 */
function getDailyStockStatus(dailyStock) {
  if (!dailyStock || (dailyStock.qty_planned === 0 && dailyStock.qty_sold === 0)) return 'belum_diisi';
  return getRemainingStock(dailyStock) > 0 ? 'tersedia' : 'habis';
}

/**
 * Validasi rencana stok harian (qty_planned): bilangan bulat ≥ 0 dan minimal jumlah yang sudah terjual hari itu.
 * @returns {string|null}
 */
function validateDailyPlan(qtyPlanned, qtySold = 0) {
  const n = Number(qtyPlanned);
  if (qtyPlanned === '' || qtyPlanned == null || !Number.isInteger(n)) return 'Isi jumlah dalam bilangan bulat';
  if (n < 0) return 'Stok tidak boleh negatif';
  if (n < qtySold) return `Minimal ${qtySold} (sudah terjual ${qtySold})`;
  return null;
}

/** FR-32: bahan menipis bila stok ≤ batas minimum */
function isLowStock(material) {
  return Number(material.stock) <= Number(material.min_stock);
}

/** Status bahan baku: habis (≤ 0), menipis (≤ minimum), aman */
function getMaterialStatus(material) {
  if (Number(material.stock) <= 0) return 'habis';
  return isLowStock(material) ? 'menipis' : 'aman';
}

/** Angka DECIMAL(10,2) ≥ 0 dengan maks. 2 angka desimal (titik sebagai pemisah desimal) */
function decimalError(value, { label, max, positive = false }) {
  const s = String(value ?? '').trim();
  const n = Number(s);
  const Label = label[0].toUpperCase() + label.slice(1);
  if (!s || !Number.isFinite(n)) return `Isi ${label}`;
  if (n < 0) return `${Label} tidak boleh negatif`;
  if (positive && n === 0) return `${Label} harus lebih dari 0`;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return 'Maksimal 2 angka desimal';
  if (n > max) return `${Label} terlalu besar`;
  return null;
}

/**
 * Validasi bahan baku (SPEC §8 raw_materials): nama wajib & unik, satuan wajib, stok & minimum ≥ 0.
 * @param {{name, unit, stock, min_stock}} input — nilai mentah form
 * @param {Array<{material_id: string, name: string}>} materials — bahan tersimpan
 * @param {string|null} materialId — bahan yang diubah
 * @param {{nameMax, unitMax, qtyMax}} limits
 */
function validateMaterial(input, materials, materialId, { nameMax, unitMax, qtyMax }) {
  const errors = {};
  const name = String(input.name ?? '').trim();
  const unit = String(input.unit ?? '').trim();
  if (!name) errors.name = 'Isi nama bahan';
  else if (name.length > nameMax) errors.name = `Maksimal ${nameMax} karakter`;
  else if (materials.some((m) => m.material_id !== materialId && m.name.trim().toLowerCase() === name.toLowerCase())) {
    errors.name = 'Bahan dengan nama ini sudah ada';
  }
  if (!unit) errors.unit = 'Isi satuan, mis. kg atau butir';
  else if (unit.length > unitMax) errors.unit = `Maksimal ${unitMax} karakter`;
  const stock = decimalError(input.stock, { label: 'stok', max: qtyMax });
  if (stock) errors.stock = stock;
  const min = decimalError(input.min_stock, { label: 'batas minimum', max: qtyMax });
  if (min) errors.min_stock = min;
  return errors;
}

/**
 * Validasi "Catat Stok Masuk": jumlah > 0, maks. 2 desimal, stok baru tidak melewati batas kolom.
 * @returns {string|null}
 */
function validateStockIn(qty, currentStock, qtyMax) {
  const error = decimalError(qty, { label: 'jumlah masuk', max: qtyMax, positive: true });
  if (error) return error;
  // Dihitung dalam sen (bilangan bulat) agar batas DECIMAL(10,2) tepat — 99.999.999,98 + 0,01 tidak dianggap lewat batas
  const cents = (n) => Math.round(Number(n) * 100);
  return cents(currentStock) + cents(qty) > cents(qtyMax) ? 'Stok baru melebihi batas penyimpanan' : null;
}

module.exports = {
  getRemainingStock,
  getDailyStockStatus,
  validateDailyPlan,
  isLowStock,
  getMaterialStatus,
  validateMaterial,
  validateStockIn,
};
