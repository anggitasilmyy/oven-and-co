// services/customCakeCartService.js
// FR-10 · FR-11 · C-11 — simpan desain custom cake lalu masukkan ke keranjang pemiliknya.
// Step 6.3 (temuan H1): pembuatan desain boleh oleh tamu, jadi hasilnya TIDAK dibuang bila sesi berganti saat request
// berjalan — tetapi hasil itu selalu masuk ke keranjang identitas yang MEMULAI request (tamu → keranjang tamu), tidak
// pernah ke keranjang pengguna lain yang baru masuk. Request ber-identitas yang berganti pengguna sudah ditolak
// apiClient (CLIENT_SESSION_CHANGED) sehingga tidak sampai ke sini.

import useAuthStore from '../stores/useAuthStore';
import useCartStore from '../stores/useCartStore';
import { createCustomCakeDesign } from './customCakeService';
import { syncSessionFromStorage } from './sessionSync';
import { getCartOwnerId, getSessionTreeKey } from '../utils/sessionIdentity';

/** Lokasi item yang ditambahkan */
export const DESIGN_CART_TARGET = {
  /** Keranjang aktif (identitas tidak berubah) */
  ACTIVE: 'active',
  /** Keranjang identitas pembuat desain, karena identitas aktif berganti saat request berjalan */
  ORIGINAL_OWNER: 'original_owner',
};

/**
 * @param {object} design — isi builder (selections, writingText, writingColor, referencePhoto, readyDate)
 * @param {{product_id, name, image_url}} product — produk custom cake dari builder
 * @returns {Promise<{saved: object, added: boolean, target: string}>}
 *   added false = ditolak batas baris keranjang (desain tetap tersimpan)
 */
export async function saveCustomCakeToCart(design, product) {
  const startUser = useAuthStore.getState().user;
  const startSessionKey = getSessionTreeKey(startUser);
  const startOwnerId = getCartOwnerId(startUser);

  const saved = await createCustomCakeDesign(design);
  const item = {
    product_id: product.product_id,
    design_id: saved.design_id,
    // Token akses desain tamu (null untuk pelanggan login & mode mock)
    design_token: saved.design_token ?? null,
    quantity: 1,
    preferred_date: saved.ready_date,
    name: product.name,
    price: saved.price,
    image_url: product.image_url,
  };

  // Event storage dari tab lain mungkin belum diproses → samakan dulu sebelum menentukan keranjang tujuan
  syncSessionFromStorage();
  const cart = useCartStore.getState();
  if (getSessionTreeKey(useAuthStore.getState().user) === startSessionKey) {
    return { saved, added: cart.addItem(item), target: DESIGN_CART_TARGET.ACTIVE };
  }
  return { saved, added: cart.addItemToOwnerCart(startOwnerId, item), target: DESIGN_CART_TARGET.ORIGINAL_OWNER };
}
