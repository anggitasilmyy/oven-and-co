// services/customCakeCartService.js
// FR-10 · FR-11 · FR-04 · C-11 — simpan desain custom cake lalu masukkan ke keranjang pemilik yang sah.
// Step 6.3 (temuan H1, M-A, L2, L3): pembuatan desain boleh oleh tamu, jadi hasilnya TIDAK dibuang bila sesi berganti
// saat request berjalan. Keranjang tujuan ditentukan secara deterministik dari urutan identitas yang teramati selama
// operasi (resolveDesignCart):
//   - identitas akhir = identitas awal                → keranjang aktif;
//   - desain milik akun (pelanggan A)                 → hanya keranjang A (tidak pernah keranjang akun lain);
//   - desain TAMU, lalu SATU pelanggan X masuk & masih aktif → keranjang X, sama seperti penggabungan keranjang tamu saat
//     login (FR-04) — desain tidak hilang walau penggabungan berjalan sebelum respons tiba;
//   - desain TAMU lainnya (sesi berakhir, staf/owner aktif, akun lain sempat aktif) → keranjang tamu (tidak digabung
//     diam-diam ke akun mana pun; pengguna diberi tahu lewat pesan hasil).
// Token akses desain tamu (design_token) ikut disimpan di baris keranjang; pemeriksaan kepemilikan di server tetap.
// Request ber-identitas yang berganti pengguna sudah ditolak apiClient (CLIENT_SESSION_CHANGED) sehingga tidak sampai
// ke sini.

import useAuthStore from '../stores/useAuthStore';
import useCartStore from '../stores/useCartStore';
import { createCustomCakeDesign } from './customCakeService';
import { syncSessionFromStorage } from './sessionSync';
import { trackSessionKeys } from './sessionScope';
import { getCartOwnerId, getSessionTreeKey, GUEST_SESSION_KEY } from '../utils/sessionIdentity';
import {
  DESIGN_ADDED_MESSAGE, DESIGN_CART_NOTICE, DESIGN_SAVED_CART_FULL_MESSAGE, DESIGN_SAVED_STORAGE_FAILED_MESSAGE,
} from '../constants/cart';

/** Keranjang tujuan desain */
export const DESIGN_CART_TARGET = {
  /** Keranjang aktif (identitas tidak berubah) */
  ACTIVE: 'active',
  /** Desain tamu → keranjang pelanggan yang masuk selama penyimpanan (FR-04) */
  ACCOUNT_MERGED: 'account_merged',
  /** Desain tamu → keranjang tamu; belum tergabung ke akun yang aktif (lihat GUEST_CART_REASON) */
  GUEST_CART: 'guest_cart',
  /** Desain akun → keranjang akun pembuatnya, karena identitas aktif berganti */
  ORIGINAL_OWNER: 'original_owner',
};

/** Alasan desain tamu tetap di keranjang tamu */
export const GUEST_CART_REASON = {
  /** Sesi akun berakhir (mis. token ditolak → fallback tamu); keranjang tamu = keranjang aktif */
  SESSION_EXPIRED: 'session_expired',
  /** Staf/owner aktif: tidak punya keranjang akun */
  STAFF_SESSION: 'staff_session',
  /** Akun lain sempat aktif selama penyimpanan */
  NOT_MERGED: 'not_merged',
};

/**
 * Tentukan keranjang tujuan desain (fungsi murni).
 * @param {{keys: string[], startOwnerId: string|null, isGuestDesign: boolean, currentUser: object|null}} params
 *   keys — urutan kunci identitas yang teramati (kunci awal di indeks 0)
 * @returns {{target: string, ownerId: string|null, reason: string|null}}
 */
export function resolveDesignCart({ keys, startOwnerId, isGuestDesign, currentUser }) {
  const currentKey = getSessionTreeKey(currentUser);
  const currentOwnerId = getCartOwnerId(currentUser);
  const result = (target, ownerId, reason = null) => ({ target, ownerId, reason });

  if (currentKey === keys[0]) return result(DESIGN_CART_TARGET.ACTIVE, currentOwnerId);
  if (!isGuestDesign) return result(DESIGN_CART_TARGET.ORIGINAL_OWNER, startOwnerId);

  // Akun yang pernah aktif selama operasi: hanya boleh satu, yaitu pelanggan yang aktif sekarang
  const accounts = new Set([...keys, currentKey].filter((key) => key !== GUEST_SESSION_KEY));
  if (currentOwnerId !== null && accounts.size === 1 && accounts.has(currentKey)) {
    return result(DESIGN_CART_TARGET.ACCOUNT_MERGED, currentOwnerId);
  }

  let reason = GUEST_CART_REASON.NOT_MERGED;
  if (currentKey === GUEST_SESSION_KEY) reason = GUEST_CART_REASON.SESSION_EXPIRED;
  else if (currentOwnerId === null) reason = GUEST_CART_REASON.STAFF_SESSION;
  return result(DESIGN_CART_TARGET.GUEST_CART, null, reason);
}

/**
 * Pesan untuk hasil saveCustomCakeToCart — sesuai hasil sebenarnya (tidak mengklaim berhasil bila belum masuk keranjang).
 * @returns {{type: 'success'|'error'|'info', message: string, replacesSessionNotice: boolean}}
 */
export function getDesignCartNotice({ added, target, reason }) {
  const notice = (type, message) => ({
    type, message, replacesSessionNotice: reason === GUEST_CART_REASON.SESSION_EXPIRED,
  });
  if (!added) return notice('error', DESIGN_SAVED_CART_FULL_MESSAGE);
  if (target === DESIGN_CART_TARGET.ACTIVE) return notice('success', DESIGN_ADDED_MESSAGE);
  if (target === DESIGN_CART_TARGET.ACCOUNT_MERGED) return notice('success', DESIGN_CART_NOTICE[target]);
  if (target === DESIGN_CART_TARGET.GUEST_CART) return notice('info', DESIGN_CART_NOTICE[reason]);
  return notice('info', DESIGN_CART_NOTICE[target]);
}

function toCartItem(saved, product) {
  return {
    product_id: product.product_id,
    design_id: saved.design_id,
    // Token akses desain tamu (null untuk desain pelanggan & mode mock)
    design_token: saved.design_token ?? null,
    quantity: 1,
    preferred_date: saved.ready_date,
    name: product.name,
    price: saved.price,
    image_url: product.image_url,
  };
}

/**
 * @param {object} design — isi builder (selections, writingText, writingColor, referencePhoto, readyDate)
 * @param {{product_id, name, image_url}} product — produk custom cake dari builder
 * @returns {Promise<{saved: object, added: boolean, target: string, ownerId: string|null, reason: string|null}>}
 *   added false = ditolak batas baris keranjang tujuan (desain tetap tersimpan)
 * @throws {Error} gagal menyimpan desain, sesi berganti (CLIENT_SESSION_CHANGED), atau keranjang gagal ditulis
 */
export async function saveCustomCakeToCart(design, product) {
  // Event storage dari tab lain mungkin belum diproses → identitas awal dicatat setelah tab ini disamakan
  syncSessionFromStorage();
  const tracker = trackSessionKeys();
  const startOwnerId = getCartOwnerId(useAuthStore.getState().user);

  try {
    const saved = await createCustomCakeDesign(design);
    syncSessionFromStorage();
    const placement = resolveDesignCart({
      keys: tracker.keys(),
      startOwnerId,
      // Desain tamu: dimulai tanpa akun pelanggan, atau disimpan ulang sebagai tamu (bertoken) setelah sesi berakhir
      isGuestDesign: startOwnerId === null || Boolean(saved.design_token),
      currentUser: useAuthStore.getState().user,
    });

    let added;
    try {
      added = useCartStore.getState().addItemToOwnerCart(placement.ownerId, toCartItem(saved, product));
    } catch {
      throw new Error(DESIGN_SAVED_STORAGE_FAILED_MESSAGE);
    }
    return { saved, added, ...placement };
  } finally {
    tracker.stop();
  }
}
