// services/mock/cartViews.js
// Step 5.3 · FR-11 · BR-01 – BR-03 — item keranjang digabung dengan data produk terbaru (harga, stok, tanggal siap).
// Harga dihitung ulang dari tabel (bukan snapshot keranjang) agar sama dengan harga saat pesanan dibuat.

import { getTables } from './db';
import { getMockTodayKey, getMockCurrentTime } from './mockClock';
import {
  getRemainingStock, getCartItemReadyDate, findDuplicateDesignLines, checkCartDesign, getEarliestReadyDate,
} from '../../utils/businessRules';
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
/**
 * Step 6.3 (re-review #4): pemeriksaan desain sama urutannya dengan server (lihat utils/rules/cart.js checkCartDesign).
 * @param {{checkDesignUsage?: boolean, userId?: number|string|null}} [options]
 *   checkDesignUsage: tolak desain yang sudah dipesan / tanggal siapnya < H+3 (keranjang & pembuatan pesanan);
 *   tidak dipakai untuk tampilan pesanan lama. userId: kepemilikan desain diperiksa bila diisi.
 *   Bila checkDesignUsage, `tables` harus memuat order_items.
 */
export function buildCartLines(items, tables = getTables(...CART_VIEW_TABLES), options = {}) {
  const todayKey = getMockTodayKey();
  const now = getMockCurrentTime();
  const designCtx = { userId: options.userId, orderedDesignIds: null, earliestCustomDate: null };
  if (options.checkDesignUsage) {
    designCtx.orderedDesignIds = new Set((tables.order_items ?? []).map((i) => i.design_id).filter((id) => id != null));
  }
  const checked = items.map((item) => {
    const product = tables.products.find((p) => p.product_id === item.product_id);
    const variant = item.variant_id ? tables.product_variants.find((v) => v.variant_id === item.variant_id) : null;
    const design = item.design_id ? tables.custom_cake_designs.find((d) => d.design_id === item.design_id) : null;
    if (!product?.is_active) return { product, variant, design, reason: CART_UNAVAILABLE_REASON.PRODUCT_UNAVAILABLE, designValid: false };
    const ctx = options.checkDesignUsage
      ? { ...designCtx, earliestCustomDate: getEarliestReadyDate(product, now, tables.store_settings) }
      : designCtx;
    const designCheck = checkCartDesign(item, product, design, ctx);
    // Step 6.3: alasan sama dengan API (constants/cart.js); jumlah > batas ditandai, tidak dipotong
    const reason =
      (item.variant_id && !variant?.is_active ? CART_UNAVAILABLE_REASON.VARIANT_UNAVAILABLE : null) ??
      designCheck.reason ??
      (item.quantity > CART_LINE_MAX_QUANTITY ? CART_UNAVAILABLE_REASON.QUANTITY_EXCEEDS_LIMIT : null);
    return { product, variant, design: designCheck.designValid ? design : null, reason, designValid: designCheck.designValid };
  });
  // Satu design_id hanya satu baris; hanya desain sah yang dihitung (sama dengan server designAccess.service.js)
  const duplicateDesignLines = findDuplicateDesignLines(items, (_item, index) => checked[index].designValid);
  return items.map((item, index) => {
    const { product, variant, design } = checked[index];
    const isCustom = product?.availability_type === AVAILABILITY_TYPE.CUSTOM;
    const unavailableReason =
      checked[index].reason ?? (duplicateDesignLines.has(index) ? CART_UNAVAILABLE_REASON.DESIGN_DUPLICATE_LINE : null);
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
