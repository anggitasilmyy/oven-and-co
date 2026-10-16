// hooks/useQuickAddToCart.js
// Step 4 · C-05 aksi "menambah produk ready dengan tombol +" (UI/UX spec Home)
// Memakai aksi addItem yang SUDAH ADA di useCartStore; jumlah dibatasi sisa stok hari ini (validation rule).

import useCartStore from '../stores/useCartStore';
import { useToast } from '../components/ui/Toast';

export default function useQuickAddToCart() {
  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const { toast, showToast, hideToast } = useToast();

  const addProduct = (product) => {
    const inCart = items
      .filter((i) => i.product_id === product.product_id && !i.variant_id && !i.design_id)
      .reduce((sum, i) => sum + i.quantity, 0);
    if (inCart + 1 > product.remaining_today) {
      showToast('error', `Stok ${product.name} hari ini tinggal ${product.remaining_today}.`);
      return;
    }
    addItem({
      product_id: product.product_id,
      quantity: 1,
      name: product.name,
      price: product.price,
      image_url: product.image_url,
    });
    showToast('success', `${product.name} ditambahkan ke keranjang.`);
  };

  return { addProduct, toast, hideToast };
}
