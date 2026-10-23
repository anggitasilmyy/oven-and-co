// hooks/useCartView.js
// Step 5.3 · FR-11 · C-12 · C-13 — isi keranjang (useCartStore) diperkaya service keranjang:
// harga & stok terbaru, tanggal siap per item, dan BR-03 tanggal siap gabungan.

import useCartStore from '../stores/useCartStore';
import useServiceQuery from './useServiceQuery';
import { getCartView } from '../services/cartService';
import { findStockIssues, applyLineQuantity, exceedsLineLimit } from '../utils/businessRules';
import { AVAILABILITY_TYPE } from '../constants/product';
import { CART_LINE_MAX_QUANTITY } from '../constants/cart';

export default function useCartView() {
  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const query = useServiceQuery(() => getCartView(items), [items]);
  // Data lama dipakai selama memuat ulang (hanya item yang masih ada). Jumlah selalu dari store agar klik
  // beruntun pada stepper tidak hilang saat service belum selesai memuat.
  // Step 6.3: jumlah > batas per item (mis. hasil gabung keranjang tamu) ditandai, tidak dipotong.
  const lines = (query.data?.lines ?? []).flatMap((l) => {
    const item = items.find((i) => i.cart_item_id === l.cart_item_id);
    return item ? [applyLineQuantity(l, item.quantity)] : [];
  });

  /** Batas jumlah: produk ready = sisa stok hari ini dikurangi jumlah item lain produk yang sama (maks. 99) */
  const maxQuantityOf = (line) => {
    if (line.availability_type !== AVAILABILITY_TYPE.READY) return CART_LINE_MAX_QUANTITY;
    const others = lines
      .filter((l) => l.product_id === line.product_id && l.cart_item_id !== line.cart_item_id)
      .reduce((s, l) => s + l.quantity, 0);
    return Math.min(CART_LINE_MAX_QUANTITY, Math.max(0, (line.remaining_today ?? 0) - others));
  };

  // Keranjang > 50 baris (mis. hasil gabung) tetap tampil; checkout diblokir sampai item dikurangi
  const overLineLimit = exceedsLineLimit(items);
  const blocked =
    overLineLimit || lines.some((l) => !l.available) || findStockIssues(lines.filter((l) => l.available)).length > 0;

  return {
    items, lines, view: query.data, loading: query.loading && !query.data, error: query.error, reload: query.reload,
    maxQuantityOf, blocked, overLineLimit, updateQuantity, removeItem,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
  };
}
