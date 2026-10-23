// services/mock/cartViews.js
// Step 5.3 · FR-11 · BR-01 – BR-03 — item keranjang digabung dengan data produk terbaru (harga, stok, tanggal siap).
// Harga dihitung ulang dari tabel (bukan snapshot keranjang) agar sama dengan harga saat pesanan dibuat.

import { getTables } from './db';
import { getMockTodayKey, getMockCurrentTime } from './mockClock';
import { getRemainingStock, getCartItemReadyDate, findDuplicateDesignLines } from '../../utils/businessRules';
import { AVAILABILITY_TYPE } from '../../constants/product';
import { CART_LINE_MAX_QUANTITY, CART_UNAVAILABLE_REASON } from '../../constants/cart';

export const CART_VIEW_TABLES = [
  'products', 'product_images', 'product_variants', 'daily_stocks', 'store_settings',
  'custom_options', 'custom_cake_designs', 'custom_cake_design_options',
];

/** Ringkasan desain custom cake, mis. "Diameter 20 cm · Hati · Red Velvet · Buttercream" */
function designSummary(design, tables) {
  if (!design) return null;
  const optionIds = tables.custom_cake_design_options.filter((o) => o.design_id === design.design_id).map((o) => o.option_id);
  const names = tables.custom_options.filter((o) => optionIds.includes(o.option_id)).map((o) => o.name);
  return {
    options: names.join(' · '),
    writing: design.writing_text ? `"${design.writing_text}" · ${design.writing_color}` : null,
    has_reference_photo: Boolean(design.reference_photo_url),
  };
}

/**
 * @param {Array} items — item useCartStore
 * @returns {Array} baris siap tampil; `available: false` bila produk/varian/desain tidak bisa dipesan lagi
 */
export function buildCartLines(items, tables = getTables(...CART_VIEW_TABLES)) {
  const todayKey = getMockTodayKey();
  const now = getMockCurrentTime();
  // Step 6.3: satu design_id hanya satu baris (sama dengan server/src/services/designAccess.service.js)
  const duplicateDesignLines = findDuplicateDesignLines(items);
  return items.map((item, index) => {
    const product = tables.products.find((p) => p.product_id === item.product_id);
    const variant = item.variant_id ? tables.product_variants.find((v) => v.variant_id === item.variant_id) : null;
    const design = item.design_id ? tables.custom_cake_designs.find((d) => d.design_id === item.design_id) : null;
    const isCustom = product?.availability_type === AVAILABILITY_TYPE.CUSTOM;
    // Step 6.3: alasan sama dengan API (constants/cart.js); jumlah > batas ditandai, tidak dipotong
    const unavailableReason = !product?.is_active
      ? CART_UNAVAILABLE_REASON.PRODUCT_UNAVAILABLE
      : item.variant_id && !variant?.is_active
        ? CART_UNAVAILABLE_REASON.VARIANT_UNAVAILABLE
        : isCustom && !design
          ? CART_UNAVAILABLE_REASON.DESIGN_NOT_FOUND
          : design && duplicateDesignLines.has(index)
            ? CART_UNAVAILABLE_REASON.DESIGN_DUPLICATE_LINE
            : item.quantity > CART_LINE_MAX_QUANTITY
            ? CART_UNAVAILABLE_REASON.QUANTITY_EXCEEDS_LIMIT
            : null;
    const available = unavailableReason === null;
    const unitPrice = isCustom ? design?.price ?? item.price : (product?.price ?? item.price) + (variant?.extra_price ?? 0);
    const stock = tables.daily_stocks.find((s) => s.product_id === item.product_id && s.stock_date === todayKey);
    const image = tables.product_images
      .filter((img) => img.product_id === item.product_id)
      .sort((a, b) => a.sort_order - b.sort_order)[0];
    return {
      cart_item_id: item.cart_item_id,
      product_id: item.product_id,
      variant_id: item.variant_id ?? null,
      design_id: item.design_id ?? null,
      name: product?.name ?? item.name,
      variant_name: variant?.name ?? null,
      design: designSummary(design, tables),
      note: item.note,
      quantity: item.quantity,
      availability_type: product?.availability_type ?? AVAILABILITY_TYPE.READY,
      image_url: image?.image_url ?? item.image_url ?? null,
      unit_price: unitPrice,
      line_total: unitPrice * item.quantity,
      remaining_today: product?.availability_type === AVAILABILITY_TYPE.READY ? getRemainingStock(stock) : null,
      ready_date: product ? getCartItemReadyDate(item, product, now, tables.store_settings) : todayKey,
      available,
      unavailable_reason: unavailableReason,
    };
  });
}
