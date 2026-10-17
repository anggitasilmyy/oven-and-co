// services/mock/seed/derivedRecords.js
// Step 4 · Data turunan dari pesanan contoh: daily_stocks, reviews, point_transactions
// Diturunkan (bukan diketik manual) agar stok, rating, dan poin konsisten dengan pesanan.

import { ORDER_STATUS } from '../../../constants/orderStatus';
import { STORE_SETTINGS_DEFAULT } from '../../../constants/storeConfig';
import { pointsEarnedFor, getYearlyEarnedPoints } from '../../../utils/businessRules';
import { atTime } from '../mockClock';
import { createRandom } from './random';

/**
 * daily_stocks untuk setiap tanggal & produk ready yang direncanakan.
 * Produk di `soldOutTodayIds` direncanakan sebanyak yang sudah terjual → habis hari ini.
 */
export function buildDailyStocks({ dateKeys, todayKey, stockPlan, sold, soldOutTodayIds }) {
  const rows = [];
  for (const dateKey of dateKeys) {
    for (const [pid, planned] of Object.entries(stockPlan)) {
      const productId = Number(pid);
      const qtySold = sold[dateKey]?.[productId] ?? 0;
      const soldOut = dateKey === todayKey && soldOutTodayIds.includes(productId);
      rows.push({
        stock_id: rows.length + 1,
        product_id: productId,
        stock_date: dateKey,
        qty_planned: soldOut ? qtySold : planned,
        qty_sold: qtySold,
      });
    }
  }
  return rows;
}

const TAGS = ['Lembut', 'Fresh', 'Manisnya pas', 'Packaging rapi', 'Tepat waktu'];
const COMMENTS = [
  'Masih hangat waktu diambil, enak banget!',
  'Rasanya konsisten, jadi langganan.',
  'Pas untuk sarapan keluarga.',
  'Teksturnya mantap, akan pesan lagi.',
  null,
];

/** Waktu pesanan dianggap Selesai (Step 5.4: dipakai juga riwayat status contoh) */
export function completedAt(order, todayKey, now) {
  return order.ready_date === todayKey ? new Date(now.getTime() - 10 * 60000) : atTime(order.ready_date, '19:00');
}

/** Ulasan untuk sebagian item pesanan Selesai (BR-11: hanya pesanan Selesai, 1 ulasan per item) */
export function buildReviews({ orders, orderItems, todayKey, now }) {
  const rng = createRandom(7331);
  const reviews = [];
  for (const order of orders) {
    if (order.order_status !== ORDER_STATUS.SELESAI) continue;
    for (const item of orderItems.filter((i) => i.order_id === order.order_id)) {
      if (rng.next() >= 0.4) continue;
      const createdAt = new Date(completedAt(order, todayKey, now).getTime() + rng.int(2, 20) * 3600000);
      if (createdAt > now) continue;
      const rating = rng.weighted([{ value: 5, weight: 62 }, { value: 4, weight: 30 }, { value: 3, weight: 8 }]);
      reviews.push({
        review_id: reviews.length + 1,
        user_id: order.user_id,
        order_item_id: item.order_item_id,
        rating,
        tags: rng.pick(TAGS),
        comment: rng.pick(COMMENTS),
        // Contoh moderasi: sebagian ulasan bintang 3 disembunyikan admin (tidak dihitung rata-rata)
        is_hidden: rating === 3 && rng.next() < 0.5,
        admin_reply: null,
        created_at: createdAt.toISOString(),
      });
    }
  }
  return reviews;
}

/**
 * point_transactions: earn untuk pesanan Selesai, review_bonus untuk ulasan,
 * plus riwayat awal tahun akun demo agar saldonya sesuai SPEC §9 (1.250 poin · Gold).
 */
export function buildPointTransactions({ orders, reviews, todayKey, now, demoCustomerId, demoBalance }) {
  const txs = [];
  const add = (tx) => txs.push({ point_tx_id: txs.length + 1, order_id: null, review_id: null, ...tx });

  for (const order of orders) {
    if (order.order_status !== ORDER_STATUS.SELESAI) continue;
    add({
      user_id: order.user_id, type: 'earn', points: pointsEarnedFor(order.total),
      order_id: order.order_id, created_at: completedAt(order, todayKey, now).toISOString(),
    });
  }
  for (const review of reviews) {
    add({
      user_id: review.user_id, type: 'review_bonus', points: STORE_SETTINGS_DEFAULT.review_bonus_points,
      review_id: review.review_id, created_at: review.created_at,
    });
  }

  // Riwayat sebelum periode data contoh (pesanan lama tidak ikut di-seed).
  // Dicatat 1 Januari pukul 08.00/09.00 agar tidak pernah bertanggal di masa depan, dan dihitung
  // supaya saldo = SPEC §9 serta poin tahun berjalan tetap di rentang Gold walau hari ini awal Januari.
  const year = Number(todayKey.slice(0, 4));
  const demoTxs = txs.filter((t) => t.user_id === demoCustomerId);
  const generated = demoTxs.reduce((s, t) => s + t.points, 0);
  const generatedThisYear = getYearlyEarnedPoints(demoTxs, year);
  const opening = Math.max(300, demoBalance + 200 - generated, STORE_SETTINGS_DEFAULT.gold_min_points - generatedThisYear);
  add({ user_id: demoCustomerId, type: 'earn', points: opening, created_at: new Date(year, 0, 1, 8).toISOString() });
  add({
    user_id: demoCustomerId, type: 'redeem', points: demoBalance - generated - opening,
    created_at: new Date(year, 0, 1, 9).toISOString(),
  });
  return txs.sort((a, b) => a.created_at.localeCompare(b.created_at)).map((t, i) => ({ ...t, point_tx_id: i + 1 }));
}
