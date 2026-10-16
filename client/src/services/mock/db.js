// services/mock/db.js
// Step 4 · "Database" mock: tabel SPEC §8 disimpan per tabel di localStorage (ovenco_mock_<tabel>)
//
// Data contoh dibuat ulang otomatis bila versi seed berubah atau tanggal hari ini berganti,
// sehingga "hari ini" pada KPI, stok harian, dan Fresh from Oven Today selalu terisi.
// Hasil pembuatan deterministik → refresh halaman tidak mengubah angka.
//
// PERHATIAN untuk Step 5: pembuatan ulang MENIMPA semua tabel di TABLES (pesanan, stok, poin, ulasan).
// Saat pelanggan/admin mulai menulis data (checkout, ubah status), mekanisme ini harus diputuskan ulang
// agar data buatan pengguna tidak hilang saat tanggal berganti. Tabel users & keranjang tidak tersentuh.
// Step 5.1: tabel yang ditulis pengguna (wishlists) masuk USER_TABLES — diisi sekali per versi seed dan
// TIDAK ditimpa saat tanggal berganti.

import { lastNDateKeys } from '../../utils/date';
import { SALES_WINDOW_DAYS } from '../../constants/dashboard';
import { readMock, writeMock } from './storage';
import { getMockTodayKey, getMockNow } from './mockClock';
import { getMockUsers } from './users';
import {
  CATEGORIES, PRODUCTS, DAILY_STOCK_PLAN, RAW_MATERIALS,
  PAYMENT_METHODS, CUSTOM_OPTIONS, STORE_SETTINGS, buildVouchers,
} from './seed/catalog';
import { PRODUCT_IMAGES } from './seed/productMedia';
import { PRODUCT_VARIANTS, withAdminReplies, buildReviewPhotos, buildWishlists } from './seed/productExtras';
import { SAMPLE_CUSTOMERS, DEMO_CUSTOMER_ID, DEMO_CUSTOMER_POINT_BALANCE } from './seed/customers';
import { generateOrders } from './seed/orderGenerator';
import { buildDailyStocks, buildReviews, buildPointTransactions } from './seed/derivedRecords';

/** Naikkan bila struktur/isi seed berubah agar data lama di browser diganti */
const SEED_VERSION = 3;
const META_KEY = 'meta';

/** Produk ready yang dibuat habis hari ini (contoh: tidak boleh tampil di Fresh from Oven Today) */
const SOLD_OUT_TODAY_IDS = [8];

export const TABLES = [
  'categories', 'products', 'product_images', 'product_variants', 'daily_stocks', 'raw_materials',
  'payment_methods', 'custom_options', 'custom_cake_designs', 'custom_cake_design_options', 'vouchers',
  'orders', 'order_items', 'payments', 'reviews', 'review_photos', 'point_transactions', 'store_settings',
];

/** Tabel yang ditulis pengguna — hanya diisi ulang saat SEED_VERSION berubah */
export const USER_TABLES = ['wishlists'];

function buildSeed(todayKey) {
  const now = getMockNow();
  getMockUsers(); // pastikan pelanggan contoh sudah ada di tabel users mock
  const customerIds = SAMPLE_CUSTOMERS.map((c) => c.user_id);
  const generated = generateOrders({
    todayKey, now, products: PRODUCTS, variants: PRODUCT_VARIANTS, customerIds, demoCustomerId: DEMO_CUSTOMER_ID,
    customOptions: CUSTOM_OPTIONS, stockPlan: DAILY_STOCK_PLAN,
  });
  const reviews = withAdminReplies(
    buildReviews({ orders: generated.orders, orderItems: generated.order_items, todayKey, now })
  );

  return {
    categories: CATEGORIES,
    products: PRODUCTS,
    product_images: PRODUCT_IMAGES,
    product_variants: PRODUCT_VARIANTS,
    daily_stocks: buildDailyStocks({
      dateKeys: lastNDateKeys(todayKey, SALES_WINDOW_DAYS), todayKey,
      stockPlan: DAILY_STOCK_PLAN, sold: generated.sold, soldOutTodayIds: SOLD_OUT_TODAY_IDS,
    }),
    raw_materials: RAW_MATERIALS,
    payment_methods: PAYMENT_METHODS,
    custom_options: CUSTOM_OPTIONS,
    custom_cake_designs: generated.custom_cake_designs,
    custom_cake_design_options: generated.custom_cake_design_options,
    vouchers: buildVouchers(todayKey),
    orders: generated.orders,
    order_items: generated.order_items,
    payments: generated.payments,
    reviews,
    review_photos: buildReviewPhotos({ reviews, orderItems: generated.order_items, productImages: PRODUCT_IMAGES }),
    point_transactions: buildPointTransactions({
      orders: generated.orders, reviews, todayKey, now,
      demoCustomerId: DEMO_CUSTOMER_ID, demoBalance: DEMO_CUSTOMER_POINT_BALANCE,
    }),
    store_settings: STORE_SETTINGS,
    wishlists: buildWishlists(DEMO_CUSTOMER_ID, now),
  };
}

/** Pastikan seed sesuai versi & tanggal hari ini; buat ulang bila perlu */
function ensureSeed() {
  const todayKey = getMockTodayKey();
  const meta = readMock(META_KEY);
  if (meta?.version === SEED_VERSION && meta?.anchor_date === todayKey) return;
  const seed = buildSeed(todayKey);
  TABLES.forEach((t) => writeMock(t, seed[t]));
  // Data pengguna dipertahankan bila hanya tanggal yang berganti
  if (meta?.version !== SEED_VERSION) USER_TABLES.forEach((t) => writeMock(t, seed[t]));
  writeMock(META_KEY, { version: SEED_VERSION, anchor_date: todayKey });
}

/**
 * Ambil beberapa tabel sekaligus.
 * @param {...string} names — nama tabel SPEC §8
 * @returns {object} { [nama]: rows }
 */
export function getTables(...names) {
  ensureSeed();
  return Object.fromEntries(names.map((n) => [n, readMock(n, [])]));
}

/**
 * Ubah satu tabel mock (Step 5.1: dipakai wishlistService).
 * @param {string} name — nama tabel SPEC §8
 * @param {Function} updater — (rows) → rows baru
 * @returns {Array} rows baru
 */
export function updateTable(name, updater) {
  ensureSeed();
  const next = updater(readMock(name, []));
  writeMock(name, next);
  return next;
}
