// services/savedCartRules.service.js
// FR-04 · FR-11 · BR-04 · C-12 — aturan murni keranjang akun yang tersimpan (tabel carts/cart_items).
// Port server dari client/src/utils/rules/cart.js (cartItemKey, mergeCartItems) dengan perilaku sama:
//   - Identitas item = produk + varian + tanggal pre-order + catatan; item custom cake = design_id saja
//     (satu desain satu baris, jumlah > 1 untuk kue identik).
//   - Item beridentitas sama dijumlahkan. Jumlah > 99 dan baris > 50 TIDAK dipotong; tampilan keranjang
//     (POST /api/cart) menandainya agar pelanggan menyesuaikan sendiri sebelum checkout.

/** Bentuk item tervalidasi (validators/cart.validator.js) → kunci identitas yang sama dengan client */
function cartItemKey(item) {
  if (item.design_id != null) return JSON.stringify(['design', String(item.design_id)]);
  return JSON.stringify([
    String(item.product_id),
    item.variant_id == null ? null : String(item.variant_id),
    null,
    item.preferred_date ?? null,
    String(item.note ?? '').trim(),
  ]);
}

/**
 * Gabungkan `incoming` ke `base` (urutan base dipertahankan, item baru di belakang).
 * design_token dibawa dari item mana pun yang memilikinya (dipakai untuk klaim desain tamu).
 * @returns {Array<object>} array baru; input tidak diubah
 */
function mergeSavedCartItems(base, incoming) {
  const result = base.map((item) => ({ ...item }));

  for (const item of incoming) {
    const key = cartItemKey(item);
    const existing = result.find((entry) => cartItemKey(entry) === key);

    if (existing) {
      existing.quantity += item.quantity;
      existing.design_token = existing.design_token ?? item.design_token ?? null;
    } else {
      result.push({ ...item });
    }
  }

  return result;
}

/** Alasan baris tidak disimpan ke keranjang akun (dikembalikan di `skipped`) */
const SKIP_REASON = Object.freeze({
  PRODUCT_NOT_FOUND: 'product_not_found',
  VARIANT_NOT_FOUND: 'variant_not_found',
  DESIGN_NOT_FOUND: 'design_not_found',
});

/**
 * Baris yang boleh disimpan: produk ada, varian (bila ada) milik produk itu, dan desain (bila ada) milik pelanggan
 * SETELAH klaim. Produk/varian nonaktif, desain kedaluwarsa/sudah dipesan, jumlah > 99 tetap disimpan dan ditandai
 * tampilan keranjang (sama dengan keranjang lokal). Desain orang lain tidak pernah disimpan ke keranjang akun.
 * @param {object} item
 * @param {{products: Map<string, {variants: Array<{variantId: bigint}>}>, ownedDesignIds: Set<string>}} context
 * @returns {string|null} SKIP_REASON atau null
 */
function getSkipReason(item, { products, ownedDesignIds }) {
  const product = products.get(String(item.product_id));
  if (!product) return SKIP_REASON.PRODUCT_NOT_FOUND;

  if (item.variant_id != null && !product.variants.some((v) => String(v.variantId) === String(item.variant_id))) {
    return SKIP_REASON.VARIANT_NOT_FOUND;
  }

  if (item.design_id != null && !ownedDesignIds.has(String(item.design_id))) {
    return SKIP_REASON.DESIGN_NOT_FOUND;
  }

  return null;
}

module.exports = {
  SKIP_REASON,
  cartItemKey,
  mergeSavedCartItems,
  getSkipReason,
};
