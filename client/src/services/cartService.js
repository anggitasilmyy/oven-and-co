// services/cartService.js
// Step 5.3 · FR-11 · FR-04 · C-12 Keranjang — tampilan keranjang dengan harga, stok, dan tanggal siap terbaru.
// Isi keranjang tetap disimpan useCartStore (tamu & pelanggan); service ini hanya memperkaya datanya.

import { apiClient } from './apiClient';
import { getMockTodayKey } from './mock/mockClock';
import { buildCartLines } from './mock/cartViews';
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
    mockHandler: () => {
      const lines = buildCartLines(items);
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
