// hooks/useProductPurchase.js
// Step 5.1 · FR-08 · C-09 — pilihan varian, jumlah, catatan, tanggal pre-order, dan tambah ke keranjang.
// Memakai aksi addItem yang SUDAH ADA di useCartStore. Validation rule Detail produk:
//   1 ≤ jumlah ≤ stok ready (dikurangi yang sudah di keranjang); tanggal pre-order ≥ tanggal siap tercepat.

import { useState } from 'react';
import useCartStore from '../stores/useCartStore';
import { getMaxAddableQuantity, clampQuantity, isSelectableDate } from '../utils/businessRules';
import { AVAILABILITY_TYPE } from '../constants/product';
import { NON_STOCK_MAX_QUANTITY } from '../constants/productDetail';

/** Jumlah produk ini di keranjang (semua varian) */
const quantityInCart = (items, productId) =>
  items.filter((i) => i.product_id === productId && !i.design_id).reduce((s, i) => s + i.quantity, 0);

/**
 * @param {object} product — hasil getProductDetail
 * @param {Function} notify — (type, message) → toast
 */
export default function useProductPurchase(product, notify) {
  const addItem = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);
  const isReady = product.availability_type === AVAILABILITY_TYPE.READY;
  const isPreorder = product.availability_type === AVAILABILITY_TYPE.PREORDER;

  const [variantId, setVariantId] = useState(product.variants[0]?.variant_id ?? null);
  const [rawQuantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  // Default: tanggal siap tercepat (pelanggan bisa memilih tanggal lain yang lebih lambat)
  const [preferredDate, setPreferredDate] = useState(isPreorder ? product.earliest_ready_date : null);

  const variant = product.variants.find((v) => v.variant_id === variantId) ?? null;
  const unitPrice = product.price + (variant?.extra_price ?? 0);
  const inCart = quantityInCart(cartItems, product.product_id);
  const maxQuantity = getMaxAddableQuantity({
    isReady, remainingToday: product.remaining_today, inCart, fallbackMax: NON_STOCK_MAX_QUANTITY,
  });
  const quantity = clampQuantity(rawQuantity, maxQuantity);
  const dateValid = !isPreorder || isSelectableDate(preferredDate, product.earliest_ready_date);

  let blockedReason = null;
  if (isReady && product.remaining_today === 0) blockedReason = 'Stok hari ini habis';
  else if (maxQuantity === 0) blockedReason = 'Semua stok hari ini sudah ada di keranjangmu';
  else if (!dateValid) blockedReason = 'Pilih tanggal ambil/antar';

  const addToCart = () => {
    // Cek ulang terhadap isi keranjang terbaru (klik beruntun)
    const latestMax = getMaxAddableQuantity({
      isReady, remainingToday: product.remaining_today,
      inCart: quantityInCart(useCartStore.getState().items, product.product_id), fallbackMax: NON_STOCK_MAX_QUANTITY,
    });
    if (blockedReason || quantity < 1 || quantity > latestMax) {
      notify('error', blockedReason ?? `Stok ${product.name} hari ini tinggal ${product.remaining_today}.`);
      return;
    }
    addItem({
      product_id: product.product_id,
      variant_id: variant?.variant_id ?? null,
      quantity,
      note: note.trim(),
      preferred_date: isPreorder ? preferredDate : null,
      name: variant ? `${product.name} · ${variant.name}` : product.name,
      price: unitPrice,
      image_url: product.image_url,
    });
    notify('success', 'Ditambahkan ke keranjang');
    setQuantity(1);
    setNote('');
  };

  return {
    variantId, setVariantId, quantity, setQuantity, maxQuantity, inCart, note, setNote,
    preferredDate, setPreferredDate, unitPrice, total: unitPrice * Math.max(quantity, 1),
    blockedReason, addToCart, isReady, isPreorder,
  };
}
