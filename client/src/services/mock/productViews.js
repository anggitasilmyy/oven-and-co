// services/mock/productViews.js
// Step 4 · Membentuk data produk siap tampil (gabungan products, kategori, foto, stok, rating)

import { AVAILABILITY_TYPE } from '../../constants/product';
import { averageRating, getRemainingStock } from '../../utils/businessRules';

/** Konteks join tabel yang dibutuhkan toProductView */
export function buildProductContext(tables, todayKey) {
  const itemProduct = new Map(tables.order_items.map((i) => [i.order_item_id, i.product_id]));
  const reviewsByProduct = new Map();
  for (const r of tables.reviews) {
    const pid = itemProduct.get(r.order_item_id);
    reviewsByProduct.set(pid, [...(reviewsByProduct.get(pid) ?? []), r]);
  }
  return {
    categories: new Map(tables.categories.map((c) => [c.category_id, c])),
    images: tables.product_images,
    todayStocks: new Map(
      tables.daily_stocks.filter((s) => s.stock_date === todayKey).map((s) => [s.product_id, s])
    ),
    reviewsByProduct,
  };
}

/** Produk + nama kategori, foto utama, rating, dan sisa stok hari ini (khusus ready) */
export function toProductView(product, ctx) {
  const image = ctx.images
    .filter((img) => img.product_id === product.product_id)
    .sort((a, b) => a.sort_order - b.sort_order)[0];
  const isReady = product.availability_type === AVAILABILITY_TYPE.READY;
  const stock = ctx.todayStocks.get(product.product_id);
  return {
    product_id: product.product_id,
    name: product.name,
    price: product.price,
    category_id: product.category_id,
    category_name: ctx.categories.get(product.category_id)?.name ?? '',
    availability_type: product.availability_type,
    lead_time_days: product.lead_time_days,
    is_active: product.is_active,
    image_url: image?.image_url ?? null,
    rating: averageRating(ctx.reviewsByProduct.get(product.product_id) ?? []),
    remaining_today: isReady ? getRemainingStock(stock) : null,
  };
}
