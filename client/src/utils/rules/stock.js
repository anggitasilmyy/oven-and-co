// utils/rules/stock.js
// Aturan stok (dipindah dari businessRules.js di Step 5.1 tanpa mengubah perilaku)
// FR-05 · FR-08 · FR-32 · BR-01 · SPEC §8: sisa = qty_planned - qty_sold (tidak disimpan)

import { AVAILABILITY_TYPE } from '../../constants/product';

/** Sisa stok harian; tidak pernah negatif (validation rule Stok) */
export function getRemainingStock(dailyStock) {
  if (!dailyStock) return 0;
  return Math.max(0, dailyStock.qty_planned - dailyStock.qty_sold);
}

/**
 * Produk tampil di "Fresh from Oven Today" (FR-05, BR-01):
 * aktif, bertipe ready, dan punya sisa stok hari ini > 0.
 */
export function isFreshToday(product, todayStock) {
  return (
    product.is_active &&
    product.availability_type === AVAILABILITY_TYPE.READY &&
    getRemainingStock(todayStock) > 0
  );
}

/** Bahan baku menipis bila stok ≤ minimum (FR-32) */
export function isLowStock(material) {
  return Number(material.stock) <= Number(material.min_stock);
}

/**
 * Batas jumlah yang masih boleh ditambahkan ke keranjang (FR-08, validation rule Detail produk).
 * Produk ready: sisa stok hari ini dikurangi jumlah produk yang sama di keranjang (semua varian).
 * Produk lain tidak dibatasi stok harian → `fallbackMax`.
 * @returns {number} ≥ 0
 */
export function getMaxAddableQuantity({ isReady, remainingToday, inCart = 0, fallbackMax }) {
  if (!isReady) return fallbackMax;
  return Math.max(0, (remainingToday ?? 0) - inCart);
}

/** Jumlah dibatasi ke rentang 1..max (max < 1 → 0, artinya tidak bisa ditambah) */
export function clampQuantity(quantity, max) {
  if (max < 1) return 0;
  return Math.min(Math.max(1, Math.floor(Number(quantity) || 1)), max);
}

// ── Step 5.7 · FR-32 · UC-24 · AD-07 — stok harian & bahan baku (validation rule Stok: tidak boleh negatif) ──

/**
 * Status stok produk harian: belum diisi (belum ada rencana hari ini), habis (sisa 0), tersedia.
 * @param {{qty_planned, qty_sold}|null} dailyStock
 * @returns {'belum_diisi'|'habis'|'tersedia'}
 */
export function getDailyStockStatus(dailyStock) {
  if (!dailyStock || (dailyStock.qty_planned === 0 && dailyStock.qty_sold === 0)) return 'belum_diisi';
  return getRemainingStock(dailyStock) > 0 ? 'tersedia' : 'habis';
}

/**
 * Validasi rencana stok harian (qty_planned). Sisa = rencana − terjual tidak boleh negatif,
 * jadi rencana minimal sama dengan jumlah yang sudah terjual hari itu.
 * @returns {string|null}
 */
export function validateDailyPlan(qtyPlanned, qtySold = 0) {
  const n = Number(qtyPlanned);
  if (qtyPlanned === '' || qtyPlanned == null || !Number.isInteger(n)) return 'Isi jumlah dalam bilangan bulat';
  if (n < 0) return 'Stok tidak boleh negatif';
  if (n < qtySold) return `Minimal ${qtySold} (sudah terjual ${qtySold})`;
  return null;
}

/** Status bahan baku: habis (≤ 0), menipis (≤ minimum, FR-32), aman */
export function getMaterialStatus(material) {
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
 * @param {Array} materials — bahan tersimpan
 * @param {number|null} materialId — bahan yang diubah
 * @param {{nameMax, unitMax, qtyMax}} limits
 * @returns {object} { field: pesan }
 */
export function validateMaterial(input, materials, materialId, { nameMax, unitMax, qtyMax }) {
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
export function validateStockIn(qty, currentStock, qtyMax) {
  const error = decimalError(qty, { label: 'jumlah masuk', max: qtyMax, positive: true });
  if (error) return error;
  return Number(currentStock) + Number(qty) > qtyMax ? 'Stok baru melebihi batas penyimpanan' : null;
}

/** Penjumlahan desimal 2 angka tanpa galat floating point (6.5 + 0.1 → 6.6) */
export function addDecimal(a, b) {
  return Math.round((Number(a) + Number(b)) * 100) / 100;
}
