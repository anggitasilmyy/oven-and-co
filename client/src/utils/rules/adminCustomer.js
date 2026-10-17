// utils/rules/adminCustomer.js
// Step 5.8 · FR-35 · UC-25 · BR-09 · BR-11 · AD-10 — ringkasan pelanggan & moderasi ulasan (fungsi murni)
// "Mengambil data pelanggan beserta total pesanan dan belanja; menyimpan balasan atau status tersembunyi" (FR-35).

import { isSalesOrder } from './sales';
import { getYearlyEarnedPoints, getMemberLevel } from './loyalty';
import { ORDER_STATUS } from '../../constants/orderStatus';
import { ADMIN_REPLY_MAX, ADMIN_REVIEW_RATING_ALL } from '../../constants/adminCustomer';

/**
 * Baris tabel pelanggan: total pesanan (tidak dibatalkan), total belanja (pesanan lunas), level, pesanan terakhir.
 * @param {{customers, orders, pointTransactions, settings, year}} p — customers: users ber-role customer
 */
export function buildCustomerRows({ customers, orders, pointTransactions, settings, year }) {
  return customers.map((c) => {
    const mine = orders.filter((o) => o.user_id === c.user_id);
    const counted = mine.filter((o) => o.order_status !== ORDER_STATUS.DIBATALKAN);
    const last = mine.reduce((latest, o) => (!latest || o.created_at > latest ? o.created_at : latest), null);
    const yearly = getYearlyEarnedPoints(pointTransactions.filter((tx) => tx.user_id === c.user_id), year);
    return {
      user_id: c.user_id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      is_active: c.is_active !== false,
      total_orders: counted.length,
      total_spend: mine.filter(isSalesOrder).reduce((s, o) => s + o.total, 0),
      level: getMemberLevel(yearly, settings).level,
      last_order_at: last,
    };
  }).sort((a, b) => (b.last_order_at ?? '').localeCompare(a.last_order_at ?? '') || a.name.localeCompare(b.name));
}

/** Cari pelanggan berdasarkan nama, email, atau nomor HP (tanpa memperhatikan huruf besar/spasi) */
export function filterCustomers(rows, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return rows;
  const digits = q.replace(/\D/g, '');
  return rows.filter((r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)
    || (digits.length >= 3 && r.phone.replace(/\D/g, '').includes(digits)));
}

/** Filter rating ulasan admin ('semua' atau '1'–'5'); ulasan tersembunyi tetap tampil untuk admin. Terbaru dulu. */
export function filterAdminReviews(reviews, rating = ADMIN_REVIEW_RATING_ALL) {
  const matched = /^[1-5]$/.test(String(rating)) ? reviews.filter((r) => r.rating === Number(rating)) : reviews;
  return [...matched].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.review_id - a.review_id);
}

/** Validasi balasan admin: wajib diisi, maks. ADMIN_REPLY_MAX karakter */
export function validateAdminReply(text) {
  const value = String(text ?? '').trim();
  if (!value) return 'Tulis balasan terlebih dahulu';
  if (value.length > ADMIN_REPLY_MAX) return `Balasan maksimal ${ADMIN_REPLY_MAX} karakter`;
  return '';
}
