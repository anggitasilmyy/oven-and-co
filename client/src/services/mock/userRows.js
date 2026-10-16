// services/mock/userRows.js
// Step 5.2 – 5.3 · Baris buatan pengguna di tabel yang juga berisi data contoh (desain custom cake, pesanan).
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
