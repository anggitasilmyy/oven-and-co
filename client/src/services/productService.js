// services/productService.js
// Step 4 · FR-05 · C-05 — kategori, Fresh from Oven Today, Best Sellers, info custom cake
// Komponen tidak boleh membaca mock/localStorage langsung — selalu lewat service ini.

import { apiClient } from './apiClient';
import { getTables } from './mock/db';
import { getMockTodayKey } from './mock/mockClock';
import { buildProductContext, toProductView } from './mock/productViews';
import { isFreshToday, getBestSellerTotals } from '../utils/businessRules';
import { lastNDateKeys } from '../utils/date';
import { AVAILABILITY_TYPE } from '../constants/product';
import { SALES_WINDOW_DAYS, BEST_SELLER_LIMIT, HOME_SECTION_LIMIT } from '../constants/dashboard';

const CATALOG_TABLES = ['categories', 'products', 'product_images', 'daily_stocks', 'reviews', 'order_items'];

function loadCatalog() {
  const todayKey = getMockTodayKey();
  const tables = getTables(...CATALOG_TABLES);
  return { tables, todayKey, ctx: buildProductContext(tables, todayKey) };
}

/** Produk terlaris 7 hari (dipakai juga Dashboard lewat dashboardService → angka sama) */
export function computeBestSellers(limit = BEST_SELLER_LIMIT) {
  const { tables, todayKey, ctx } = loadCatalog();
  const { orders } = getTables('orders');
  const totals = getBestSellerTotals(
    orders, tables.order_items, lastNDateKeys(todayKey, SALES_WINDOW_DAYS), limit
  );
  return totals.map(({ product_id, quantity }) => ({
    ...toProductView(tables.products.find((p) => p.product_id === product_id), ctx),
    quantity_sold: quantity,
  }));
}

/** @returns {Promise<Array<{category_id, name, sort_order}>>} */
export function getCategories() {
  return apiClient('/categories', {
    mockHandler: () => [...getTables('categories').categories].sort((a, b) => a.sort_order - b.sort_order),
  });
}

/** Produk ready dengan stok tersedia hari ini (FR-05, BR-01) */
export function getFreshFromOvenToday({ limit = HOME_SECTION_LIMIT } = {}) {
  return apiClient(`/products/fresh-today?limit=${limit}`, {
    mockHandler: () => {
      const { tables, ctx } = loadCatalog();
      return tables.products
        .filter((p) => isFreshToday(p, ctx.todayStocks.get(p.product_id)))
        .map((p) => toProductView(p, ctx))
        .sort((a, b) => b.remaining_today - a.remaining_today || a.product_id - b.product_id)
        .slice(0, limit);
    },
  });
}

/** Produk terlaris berdasarkan jumlah terjual 7 hari terakhir (pesanan lunas, tidak dibatalkan) */
export function getBestSellers({ limit = BEST_SELLER_LIMIT } = {}) {
  return apiClient(`/products/best-sellers?limit=${limit}`, {
    mockHandler: () => computeBestSellers(limit).filter((p) => p.is_active),
  });
}

/** Produk custom cake aktif — harga mulai & lead time untuk banner Custom Cake */
export function getCustomCakeInfo() {
  return apiClient('/products?type=custom', {
    mockHandler: () => {
      const { tables, ctx } = loadCatalog();
      const product = tables.products.find(
        (p) => p.is_active && p.availability_type === AVAILABILITY_TYPE.CUSTOM
      );
      return product ? toProductView(product, ctx) : null;
    },
    // API mengembalikan array produk (GET /products?type=custom); banner hanya butuh produk pertama
  }).then((result) => (Array.isArray(result) ? result[0] ?? null : result));
}
