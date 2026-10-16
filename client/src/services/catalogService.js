// services/catalogService.js
// Step 5.1 · FR-06 · FR-07 · C-06 – C-08 — daftar produk katalog & pencarian
// Filter/urutan dihitung fungsi murni di utils/rules/catalog.js agar sama dengan jumlah di tombol
// "Tampilkan N produk" (C-07). Komponen tidak boleh membaca mock/localStorage langsung.

import { apiClient } from './apiClient';
import { getTables } from './mock/db';
import { getMockTodayKey } from './mock/mockClock';
import { buildProductContext, toProductView } from './mock/productViews';
import { getBestSellerTotals, searchCatalog } from '../utils/businessRules';
import { lastNDateKeys } from '../utils/date';
import { SALES_WINDOW_DAYS } from '../constants/dashboard';

const CATALOG_TABLES = ['categories', 'products', 'product_images', 'daily_stocks', 'reviews', 'order_items', 'orders'];

/** Semua produk aktif + jumlah terjual 7 hari (dasar urutan "Terlaris", sama dengan Best Sellers) */
function loadActiveProductViews() {
  const todayKey = getMockTodayKey();
  const tables = getTables(...CATALOG_TABLES);
  const ctx = buildProductContext(tables, todayKey);
  const totals = getBestSellerTotals(
    tables.orders, tables.order_items, lastNDateKeys(todayKey, SALES_WINDOW_DAYS), Infinity
  );
  const sold = new Map(totals.map((t) => [t.product_id, t.quantity]));
  return tables.products
    .filter((p) => p.is_active)
    .map((p) => ({ ...toProductView(p, ctx), sold_count: sold.get(p.product_id) ?? 0 }));
}

/** @returns {Promise<Array>} produk aktif (FR-06: hanya produk aktif) */
export function getCatalogProducts() {
  return apiClient('/products', { mockHandler: loadActiveProductViews });
}

/** FR-07: cari pada nama & kategori produk aktif */
export function searchProducts(query) {
  return apiClient(`/products?search=${encodeURIComponent(query)}`, {
    mockHandler: () => searchCatalog(loadActiveProductViews(), query),
  });
}
