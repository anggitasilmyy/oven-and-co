// stores/useCartStore.js
// Step 3 · Authentication
// FR-04 · BR-04 · Zustand store untuk keranjang (tamu & pengguna login)
//
// Strategi penyimpanan:
//   - Tamu   : localStorage key "ovenco_mock_cart_guest"
//   - Login  : localStorage key "ovenco_mock_cart_{userId}"
// Saat login, keranjang tamu digabung ke keranjang akun (FR-04).

import { create } from 'zustand';
// Step 5.1 (review PR #5): identitas item (termasuk tanggal pre-order & catatan) dan id unik
// diatur fungsi murni di utils/rules/cart.js — dipakai addItem dan mergeGuestCart.
import { mergeCartItems, normalizeCartItems, wouldExceedLineLimit } from '../utils/rules/cart';

/** Key localStorage keranjang tamu */
const GUEST_CART_KEY = 'ovenco_mock_cart_guest';

/** Key localStorage keranjang pengguna tertentu */
const userCartKey = (userId) => `ovenco_mock_cart_${userId}`;

/**
 * Baca items keranjang dari localStorage.
 * @param {string} key
 * @returns {Array}
 */
function readCart(key) {
  try {
    const raw = localStorage.getItem(key);
    // Keranjang lama dilengkapi field default & id unik (kompatibilitas)
    return raw ? normalizeCartItems(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/**
 * Simpan items keranjang ke localStorage.
 * @param {string} key
 * @param {Array} items
 */
function writeCart(key, items) {
  localStorage.setItem(key, JSON.stringify(items));
}

const useCartStore = create((set, get) => ({
  /** Array item keranjang yang aktif */
  items: readCart(GUEST_CART_KEY),

  /** Key localStorage yang sedang aktif */
  _storageKey: GUEST_CART_KEY,

  // ── Actions ──────────────────────────────────────────────────────────────

  /**
   * Tambah item ke keranjang.
   * @param {{product_id, variant_id?, design_id?, design_token?, quantity, note?, preferred_date?}} item
   * @returns {boolean} false bila ditolak karena keranjang sudah berisi CART_MAX_LINES item berbeda (Step 6.3)
   */
  addItem: (item) => {
    const { items, _storageKey } = get();
    const entry = {
      product_id: item.product_id,
      variant_id: item.variant_id ?? null,
      design_id: item.design_id ?? null,
      preferred_date: item.preferred_date ?? null,
      note: item.note ?? '',
    };
    if (wouldExceedLineLimit(items, entry)) return false;
    // Item dengan produk, varian, desain, tanggal pre-order, dan catatan yang sama dijumlahkan;
    // selain itu menjadi item baru dengan cart_item_id unik.
    const next = mergeCartItems(items, [
      {
        ...entry,
        // Step 6.3: bukti akses desain custom cake tamu (dari POST /custom-cake-designs)
        design_token: item.design_token ?? null,
        quantity: item.quantity ?? 1,
        // Snapshot harga & nama untuk tampilan keranjang (diisi caller)
        name: item.name ?? '',
        price: item.price ?? 0,
        image_url: item.image_url ?? null,
      },
    ]);
    writeCart(_storageKey, next);
    set({ items: next });
    return true;
  },

  /**
   * Ubah jumlah item. Jika quantity ≤ 0, item dihapus.
   * @param {number} cart_item_id
   * @param {number} quantity
   */
  updateQuantity: (cart_item_id, quantity) => {
    const { items, _storageKey } = get();
    const next =
      quantity <= 0
        ? items.filter((i) => i.cart_item_id !== cart_item_id)
        : items.map((i) => (i.cart_item_id === cart_item_id ? { ...i, quantity } : i));
    writeCart(_storageKey, next);
    set({ items: next });
  },

  /**
   * Hapus satu item dari keranjang.
   * @param {number} cart_item_id
   */
  removeItem: (cart_item_id) => {
    const { items, _storageKey } = get();
    const next = items.filter((i) => i.cart_item_id !== cart_item_id);
    writeCart(_storageKey, next);
    set({ items: next });
  },

  /** Kosongkan keranjang (setelah checkout berhasil). */
  clearCart: () => {
    const { _storageKey } = get();
    writeCart(_storageKey, []);
    set({ items: [] });
  },

  /**
   * Dipanggil saat login berhasil (FR-04, BR-04).
   * Gabungkan keranjang tamu ke keranjang akun, lalu hapus keranjang tamu.
   * @param {number} userId
   */
  mergeGuestCart: (userId) => {
    const guestItems = readCart(GUEST_CART_KEY);
    const key = userCartKey(userId);
    const userItems = readCart(key);
    const merged = mergeCartItems(userItems, guestItems);
    writeCart(key, merged);
    // Hapus keranjang tamu
    localStorage.removeItem(GUEST_CART_KEY);
    set({ items: merged, _storageKey: key });
  },

  /**
   * Dipanggil saat logout — kembali ke keranjang tamu (kosong).
   */
  resetToGuest: () => {
    const guestItems = readCart(GUEST_CART_KEY);
    set({ items: guestItems, _storageKey: GUEST_CART_KEY });
  },

  /**
   * Dipanggil saat aplikasi load jika user sudah login (restore dari localStorage).
   * @param {number} userId
   */
  loadUserCart: (userId) => {
    const key = userCartKey(userId);
    const items = readCart(key);
    set({ items, _storageKey: key });
  },

  /** Jumlah total item (untuk badge keranjang) */
  totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

  /** Total harga keranjang */
  totalPrice: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
}));

export default useCartStore;
