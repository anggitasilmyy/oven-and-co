// services/cartService.js
// Step 5.3 · FR-11 · FR-04 · C-12 Keranjang — tampilan keranjang dengan harga, stok, dan tanggal siap terbaru.
// Isi keranjang tetap disimpan useCartStore (tamu & pelanggan); service ini hanya memperkaya datanya.
// Step 6.3 · FR-04 · BR-04: keranjang AKUN tersimpan di server (GET/PUT /api/cart/items, POST /api/cart/merge).
// Keranjang tamu tetap di localStorage. useCartStore BELUM memanggil fungsi ini (disambungkan di Step 6.6).

import { apiClient } from './apiClient';
import { getMockTodayKey } from './mock/mockClock';
import { buildCartLines, CART_VIEW_TABLES } from './mock/cartViews';
import { getTables } from './mock/db';
import useAuthStore from '../stores/useAuthStore';
import { userCartKey, readStoredCart, writeStoredCart } from '../stores/useCartStore';
import { requireMockRole } from './mock/mockSession';
import { mergeCartItems } from '../utils/rules/cart';
import { ROLES } from '../constants/roles';
import { findStockIssues, getCombinedReadyDate, exceedsLineLimit } from '../utils/businessRules';
import { CART_MAX_LINES } from '../constants/cart';

/**
 * @param {Array} items — item useCartStore
 * @returns {Promise<{lines, subtotal, ready_date, today_key, stock_issues, line_limit, exceeds_line_limit}>}
 */
export function getCartView(items) {
  return apiClient('/cart', {
    method: 'POST', // API: keranjang dibaca dari server; mock: dari item lokal
    body: { items },
    // Step 6.3: tanpa guestFallback — body berisi item keranjang AKUN; setelah sesi kedaluwarsa store pindah ke
    // keranjang tamu dan keranjang dihitung ulang otomatis dengan item tamu (bukan body lama dikirim sebagai tamu)
    mockHandler: () => {
      // Step 6.3 (re-review #4): kepemilikan, sekali pakai & kedaluwarsa desain diperiksa seperti di API
      const user = useAuthStore.getState().user;
      const lines = buildCartLines(items, getTables(...CART_VIEW_TABLES, 'order_items'), {
        checkDesignUsage: true,
        userId: user?.role === ROLES.CUSTOMER ? user.user_id : null,
      });
      const valid = lines.filter((l) => l.available);
      return {
        lines,
        subtotal: valid.reduce((s, l) => s + l.line_total, 0),
        // BR-03: tanggal siap pesanan = tanggal item dengan persiapan terlama
        ready_date: getCombinedReadyDate(valid.map((l) => l.ready_date)),
        today_key: getMockTodayKey(),
        stock_issues: findStockIssues(valid),
        // Step 6.3: sama dengan API — keranjang > batas baris tetap tampil, checkout diblokir
        line_limit: CART_MAX_LINES,
        exceeds_line_limit: exceedsLineLimit(items),
      };
    },
  });
}

// ── Step 6.3 · keranjang akun tersimpan (pelanggan login) ───────────────────

/** Mode mock: keranjang akun = key localStorage pelanggan login (sama dengan useCartStore) */
function mockAccountCartKey() {
  const user = requireMockRole(ROLES.CUSTOMER);
  return userCartKey(user.user_id);
}

/**
 * Isi keranjang akun yang tersimpan (tanpa harga — harga terbaru dari getCartView).
 * @returns {Promise<{items: Array}>}
 */
export function getSavedCart() {
  return apiClient('/cart/items', {
    mockHandler: () => ({ items: readStoredCart(mockAccountCartKey()) }),
  });
}

/**
 * Ganti seluruh isi keranjang akun. Server mengembalikan baris yang tidak bisa disimpan di `skipped`
 * (produk/varian tidak ada, desain bukan milik pelanggan).
 * @param {Array} items — item useCartStore
 * @returns {Promise<{items: Array, skipped: Array}>}
 */
export function saveCart(items) {
  return apiClient('/cart/items', {
    method: 'PUT',
    body: { items },
    mockHandler: () => {
      const key = mockAccountCartKey();
      writeStoredCart(key, mergeCartItems([], items));
      return { items: readStoredCart(key), skipped: [] };
    },
  });
}

/**
 * FR-04: gabungkan keranjang tamu ke keranjang akun saat login. design_token item tamu dipakai server untuk
 * mengklaim desain custom cake tamu (mode mock tidak memeriksa token — lihat ROADMAP 6.3).
 * @param {Array} guestItems — item keranjang tamu (localStorage)
 * @returns {Promise<{items: Array, skipped: Array}>}
 */
export function mergeGuestCartToAccount(guestItems) {
  return apiClient('/cart/merge', {
    method: 'POST',
    body: { items: guestItems },
    mockHandler: () => {
      const key = mockAccountCartKey();
      writeStoredCart(key, mergeCartItems(readStoredCart(key), guestItems));
      return { items: readStoredCart(key), skipped: [] };
    },
  });
}
