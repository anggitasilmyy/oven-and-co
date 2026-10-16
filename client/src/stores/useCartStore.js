// stores/useCartStore.js
// Step 3 · Authentication
// FR-04 · BR-04 · Zustand store untuk keranjang (tamu & pengguna login)
//
// Strategi penyimpanan:
//   - Tamu   : localStorage key "ovenco_mock_cart_guest"
//   - Login  : localStorage key "ovenco_mock_cart_{userId}"
// Saat login, keranjang tamu digabung ke keranjang akun (FR-04).

import { create } from 'zustand';

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
    return raw ? JSON.parse(raw) : [];
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

/**
 * Gabungkan dua array items keranjang.
 * Jika ada produk yang sama (product_id + variant_id + design_id),
 * jumlahnya dijumlahkan.
 * @param {Array} base  — keranjang akun (target)
 * @param {Array} guest — keranjang tamu (sumber)
 * @returns {Array}
 */
function mergeItems(base, guest) {
  const result = [...base];
  for (const gItem of guest) {
    const idx = result.findIndex(
      (b) =>
        b.product_id === gItem.product_id &&
        b.variant_id === gItem.variant_id &&
        b.design_id === gItem.design_id
    );
    if (idx !== -1) {
      result[idx] = { ...result[idx], quantity: result[idx].quantity + gItem.quantity };
    } else {
      result.push({ ...gItem });
    }
  }
  return result;
}

const useCartStore = create((set, get) => ({
  /** Array item keranjang yang aktif */
  items: readCart(GUEST_CART_KEY),

  /** Key localStorage yang sedang aktif */
  _storageKey: GUEST_CART_KEY,

  // ── Actions ──────────────────────────────────────────────────────────────

  /**
   * Tambah item ke keranjang.
   * @param {{product_id, variant_id?, design_id?, quantity, note?, preferred_date?}} item
   */
  addItem: (item) => {
    const { items, _storageKey } = get();
    const idx = items.findIndex(
      (i) =>
        i.product_id === item.product_id &&
        (i.variant_id ?? null) === (item.variant_id ?? null) &&
        (i.design_id ?? null) === (item.design_id ?? null)
    );
    let next;
    if (idx !== -1) {
      next = items.map((i, j) =>
        j === idx ? { ...i, quantity: i.quantity + (item.quantity ?? 1) } : i
      );
    } else {
      next = [
        ...items,
        {
          cart_item_id: Date.now(),
          product_id: item.product_id,
          variant_id: item.variant_id ?? null,
          design_id: item.design_id ?? null,
          quantity: item.quantity ?? 1,
          note: item.note ?? '',
          preferred_date: item.preferred_date ?? null,
          // Snapshot harga & nama untuk tampilan keranjang (diisi caller)
          name: item.name ?? '',
          price: item.price ?? 0,
          image_url: item.image_url ?? null,
        },
      ];
    }
    writeCart(_storageKey, next);
    set({ items: next });
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
    const merged = mergeItems(userItems, guestItems);
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
