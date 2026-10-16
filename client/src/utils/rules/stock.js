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
