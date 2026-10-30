// hooks/useQuickAddToCart.js
// Step 4 · C-05 aksi "menambah produk ready dengan tombol +" (UI/UX spec Home)
// Memakai aksi addItem yang SUDAH ADA di useCartStore; jumlah dibatasi sisa stok hari ini (validation rule).

import useCartStore from '../stores/useCartStore';
import { useToast } from '../components/ui/Toast';
import { CART_LINE_LIMIT_MESSAGE } from '../constants/cart';

export default function useQuickAddToCart() {
  const addItem = useCartStore((s) => s.addItem);
  const { toast, showToast, hideToast } = useToast();

  const addProduct = (product) => {
    // Baca isi keranjang terbaru saat klik (bukan dari render terakhir) agar klik beruntun tetap dibatasi stok
    const inCart = useCartStore
      .getState()
      // Step 5.1 (review PR #5): stok harian dipakai bersama semua varian & tanggal → hitung semua item produk ini
      .items.filter((i) => i.product_id === product.product_id && !i.design_id)
      .reduce((sum, i) => sum + i.quantity, 0);
    if (inCart + 1 > product.remaining_today) {
      showToast(
        'error',
        `Stok ${product.name} hari ini tinggal ${product.remaining_today} dan ${inCart} sudah ada di keranjang.`
      );
      return;
    }
    const added = addItem({
      product_id: product.product_id,
      quantity: 1,
      name: product.name,
      price: product.price,
      image_url: product.image_url,
    });
    if (!added) {
      showToast('error', CART_LINE_LIMIT_MESSAGE);
      return;
    }
    showToast('success', `${product.name} ditambahkan ke keranjang.`);
  };

  // showToast ikut dikembalikan agar halaman memakai satu Toast untuk aksi lain (mis. wishlist, Step 5.1)
  return { addProduct, toast, showToast, hideToast };
}
