// services/mock/adminCatalogViews.js
// Step 5.7 · FR-30 · FR-31 · AD-06 — data tabel produk, form produk, dan opsi custom cake untuk admin (mode mock)
// Berbeda dengan katalog pelanggan, produk & opsi NONAKTIF ikut tampil agar bisa diaktifkan kembali.

import { getTables } from './db';
import { getMockTodayKey } from './mockClock';
import { buildProductContext, toProductView } from './productViews';
import { AVAILABILITY_TYPE } from '../../constants/product';
import { CUSTOM_OPTION_GROUPS } from '../../constants/customCake';
import { CUSTOM_CAKE_MIN_LEAD_DAYS } from '../../constants/storeConfig';

export const ADMIN_CATALOG_TABLES = [
  'categories', 'products', 'product_images', 'product_variants', 'daily_stocks', 'reviews', 'order_items',
];

const byOrder = (a, b) => a.sort_order - b.sort_order;

/** Kategori urut sort_order (pilihan form) */
export function sortedCategories(categories) {
  return [...categories].sort(byOrder);
}

/**
 * Baris tabel AD-06: foto, nama, kategori, tipe, harga, stok hari ini, rating, status aktif.
 * Urut kategori lalu id agar produk sejenis berdekatan.
 */
export function buildAdminProductRows() {
  const tables = getTables(...ADMIN_CATALOG_TABLES);
  const ctx = buildProductContext(tables, getMockTodayKey());
  const categoryOrder = new Map(tables.categories.map((c) => [c.category_id, c.sort_order]));
  return {
    categories: sortedCategories(tables.categories),
    rows: [...tables.products]
      .sort((a, b) => (categoryOrder.get(a.category_id) ?? 99) - (categoryOrder.get(b.category_id) ?? 99) || a.product_id - b.product_id)
      .map((p) => ({
        ...toProductView(p, ctx),
        has_stock_today: ctx.todayStocks.has(p.product_id),
        photo_count: tables.product_images.filter((img) => img.product_id === p.product_id).length,
      })),
  };
}

/** Isi form ubah produk (semua varian, termasuk nonaktif); null bila tidak ditemukan */
export function buildAdminProductForm(productId) {
  const tables = getTables('products', 'product_images', 'product_variants');
  const product = tables.products.find((p) => p.product_id === Number(productId));
  if (!product) return null;
  return {
    ...product,
    photos: tables.product_images
      .filter((img) => img.product_id === product.product_id)
      .sort(byOrder)
      .map(({ image_id, image_url }) => ({ image_id, image_url })),
    variants: tables.product_variants
      .filter((v) => v.product_id === product.product_id)
      .sort((a, b) => a.variant_id - b.variant_id),
  };
}

/** Opsi custom cake per kelompok (aktif & nonaktif) + lead time produk custom aktif (BR-02, minimal H-3) */
export function buildAdminCustomOptions() {
  const { custom_options: options, products } = getTables('custom_options', 'products');
  const customProduct = products.find((p) => p.is_active && p.availability_type === AVAILABILITY_TYPE.CUSTOM);
  return {
    groups: CUSTOM_OPTION_GROUPS.map((group) => ({
      group,
      options: options.filter((o) => o.option_group === group).sort((a, b) => a.option_id - b.option_id),
    })),
    custom_product: customProduct
      ? { product_id: customProduct.product_id, name: customProduct.name, price: customProduct.price }
      : null,
    lead_time_days: Math.max(CUSTOM_CAKE_MIN_LEAD_DAYS, customProduct?.lead_time_days ?? 0),
  };
}
