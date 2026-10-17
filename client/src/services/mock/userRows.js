// services/mock/userRows.js
// Step 5.2 – 5.3 · Baris buatan pengguna di tabel yang juga berisi data contoh (desain custom cake, pesanan).
// Step 5.4: riwayat status, ulasan, dan foto ulasan juga dipertahankan (lihat dropRowsLinkedToSeed).
// Step 5.5: notifikasi buatan pengguna juga dipertahankan.
// Baris dengan id ≥ USER_ROW_ID_START tidak pernah dipakai seed sehingga dipertahankan saat data contoh
// dibuat ulang (pergantian tanggal / SEED_VERSION). Efeknya pada stok & kuota voucher diterapkan ulang.

import { ORDER_STATUS } from '../../constants/orderStatus';
import { AVAILABILITY_TYPE } from '../../constants/product';
import { dateKeyOf } from '../../utils/date';

/** Id awal baris buatan pengguna di tabel data contoh — tidak pernah dipakai seed */
export const USER_ROW_ID_START = 1_000_000;

/** Tabel data contoh yang juga ditulis pengguna → kolom id penanda baris pengguna */
export const PRESERVED_USER_ROWS = {
  custom_cake_designs: 'design_id',
  custom_cake_design_options: 'design_id',
  orders: 'order_id',
  order_items: 'order_item_id',
  payments: 'payment_id',
  point_transactions: 'point_tx_id',
  order_status_histories: 'history_id', // Step 5.4
  reviews: 'review_id',
  review_photos: 'photo_id',
  notifications: 'notification_id', // Step 5.5
};

export const isUserRow = (row, idKey) => Number(row?.[idKey]) >= USER_ROW_ID_START;

/** Id baru untuk baris buatan pengguna (≥ USER_ROW_ID_START, lebih besar dari id yang ada) */
export function nextUserRowId(rows, idKey) {
  return rows.reduce((max, r) => (isUserRow(r, idKey) ? Math.max(max, Number(r[idKey])) : max), USER_ROW_ID_START - 1) + 1;
}

/**
 * Terapkan ulang efek pesanan pengguna pada data contoh baru (TF-12):
 * stok ready terjual pada tanggal pesanan dibuat & kuota voucher yang terpakai. Pesanan batal tidak dihitung.
 * @param {object} seed — tabel hasil seed (diubah langsung)
 * @param {object} kept — baris pengguna per tabel
 */
export function reapplyUserOrderEffects(seed, kept) {
  const active = (kept.orders ?? []).filter((o) => o.order_status !== ORDER_STATUS.DIBATALKAN);
  if (active.length === 0) return;
  const readyIds = new Set(seed.products.filter((p) => p.availability_type === AVAILABILITY_TYPE.READY).map((p) => p.product_id));
  for (const order of active) {
    const dateKey = dateKeyOf(order.created_at);
    for (const item of (kept.order_items ?? []).filter((i) => i.order_id === order.order_id && readyIds.has(i.product_id))) {
      const stock = seed.daily_stocks.find((s) => s.product_id === item.product_id && s.stock_date === dateKey);
      if (stock) stock.qty_sold += item.quantity;
    }
    const voucher = order.voucher_id && seed.vouchers.find((v) => v.voucher_id === order.voucher_id);
    if (voucher) voucher.quota = Math.max(0, voucher.quota - 1);
  }
}

/**
 * Step 5.4: baris pengguna yang merujuk pesanan CONTOH (id < USER_ROW_ID_START) dibuang saat data contoh dibuat
 * ulang — pesanan contoh berganti isi setiap hari, jadi ulasan/riwayat/poin untuknya tidak lagi cocok.
 * Contoh: ulasan pelanggan untuk item pesanan contoh, riwayat "Dibatalkan" dari pembatalan pesanan contoh.
 * @param {object} kept — baris pengguna per tabel
 * @returns {object} kept tanpa baris yang merujuk data contoh
 */
export function dropRowsLinkedToSeed(kept) {
  const userItemIds = new Set((kept.order_items ?? []).map((i) => i.order_item_id));
  const reviews = (kept.reviews ?? []).filter((r) => userItemIds.has(r.order_item_id));
  const reviewIds = new Set(reviews.map((r) => r.review_id));
  return {
    ...kept,
    reviews,
    review_photos: (kept.review_photos ?? []).filter((p) => reviewIds.has(p.review_id)),
    order_status_histories: (kept.order_status_histories ?? []).filter((h) => isUserRow(h, 'order_id')),
    // Step 5.5: notifikasi untuk pesanan contoh ikut dibuang (notifikasi tanpa pesanan dipertahankan)
    notifications: (kept.notifications ?? []).filter((n) => n.order_id == null || isUserRow(n, 'order_id')),
    point_transactions: (kept.point_transactions ?? []).filter((tx) =>
      (tx.review_id == null || reviewIds.has(tx.review_id)) && (tx.order_id == null || isUserRow(tx, 'order_id'))),
  };
}
