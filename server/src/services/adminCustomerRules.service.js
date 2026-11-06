// services/adminCustomerRules.service.js
// Step 6.4.8 · FR-35 · UC-25 · BR-09 · BR-11 · AD-10 — aturan murni pelanggan & moderasi ulasan, port dari client
// utils/rules/adminCustomer.js. "Mengambil data pelanggan beserta total pesanan dan belanja; menyimpan balasan atau
// status tersembunyi" (FR-35).
//   - total pesanan = pesanan yang tidak dibatalkan (semua status lain, termasuk belum lunas);
//   - total belanja = Σ total pesanan penjualan (lunas & tidak dibatalkan — definisi yang sama dengan AD-02/AD-08);
//   - level = poin earn + review_bonus tahun kalender berjalan WIB (TF-11) dengan ambang store_settings (AD-09);
//   - pesanan terakhir = waktu pesanan terbaru apa pun statusnya.
// Validasi balasan ada di validators/adminCustomer.validator.js (pesan sama dengan mock validateAdminReply).

const { ADMIN_REVIEW_RATING_ALL } = require('../utils/businessConstants');
const { getMemberLevel } = require('./loyaltyRules.service');

const toIso = (value) => (value == null ? null : new Date(value).toISOString());
const compareId = (a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);

/**
 * Baris tabel pelanggan (bentuk client buildCustomerRows).
 * @param {{user_id, name, email, phone, is_active}} customer
 * @param {{totalOrders?, spendCents?, lastOrderAt?, yearlyPoints?}} aggregate — tidak ada = pelanggan tanpa pesanan/poin
 * @param {{gold_min_points, platinum_min_points}} settings
 */
function toCustomerRow(customer, aggregate, settings) {
  return {
    user_id: customer.user_id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    is_active: customer.is_active !== false,
    total_orders: aggregate?.totalOrders ?? 0,
    total_spend: (aggregate?.spendCents ?? 0) / 100,
    level: getMemberLevel(aggregate?.yearlyPoints ?? 0, settings).level,
    last_order_at: toIso(aggregate?.lastOrderAt),
  };
}

/** Pesanan terakhir terbaru dulu (tanpa pesanan di akhir), lalu nama, lalu id (urutan stabil) */
function sortCustomerRows(rows) {
  return [...rows].sort((a, b) => (b.last_order_at ?? '').localeCompare(a.last_order_at ?? '')
    || a.name.localeCompare(b.name) || compareId(a.user_id, b.user_id));
}

/** Filter rating ulasan admin ('semua' atau '1'–'5'); ulasan tersembunyi tetap tampil untuk admin. Terbaru dulu. */
function filterAdminReviews(reviews, rating = ADMIN_REVIEW_RATING_ALL) {
  const matched = /^[1-5]$/.test(String(rating)) ? reviews.filter((r) => r.rating === Number(rating)) : reviews;
  return [...matched].sort((a, b) => b.created_at.localeCompare(a.created_at) || compareId(b.review_id, a.review_id));
}

/** Ringkasan seluruh ulasan (tanpa filter rating) */
function summarizeAdminReviews(reviews) {
  return {
    total: reviews.length,
    hidden: reviews.filter((r) => r.is_hidden).length,
    unreplied: reviews.filter((r) => !r.admin_reply).length,
  };
}

module.exports = {
  toCustomerRow,
  sortCustomerRows,
  filterAdminReviews,
  summarizeAdminReviews,
};
