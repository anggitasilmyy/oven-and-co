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
// Step 5.1: tabel yang ditulis pengguna (wishlists) masuk USER_TABLES — hanya diisi dari seed bila tabelnya
// belum ada di perangkat. Refresh, pergantian tanggal, dan kenaikan SEED_VERSION TIDAK menimpanya.
// Tabel pengguna hanya dibuat ulang bila USER_SCHEMA_VERSION dinaikkan (perubahan skema yang butuh migrasi).
// Step 5.2 – 5.3: desain custom cake & pesanan buatan pelanggan disimpan di tabel yang juga berisi data contoh.
// Baris dengan id ≥ USER_ROW_ID_START dipertahankan saat data contoh dibuat ulang (lihat mock/userRows.js).
// Step 5.4: tabel order_status_histories (riwayat status untuk tracking C-18); ulasan pelanggan (C-19) dan
// riwayat status buatan pengguna juga dipertahankan, kecuali yang merujuk pesanan contoh.

import { lastNDateKeys } from '../../utils/date';
import { SALES_WINDOW_DAYS } from '../../constants/dashboard';
import { readMock, writeMock, hasMock } from './storage';
import { getMockTodayKey, getMockNow, getMockCurrentTime } from './mockClock';
import { getMockUsers } from './users';
import {
  CATEGORIES, PRODUCTS, DAILY_STOCK_PLAN, RAW_MATERIALS,
  PAYMENT_METHODS, CUSTOM_OPTIONS, STORE_SETTINGS, buildVouchers,
} from './seed/catalog';
import { PRODUCT_IMAGES } from './seed/productMedia';
import { PRODUCT_VARIANTS, withAdminReplies, buildWishlists } from './seed/productExtras';
import { SAMPLE_CUSTOMERS, DEMO_CUSTOMER_ID, DEMO_CUSTOMER_POINT_BALANCE } from './seed/customers';
import { generateOrders } from './seed/orderGenerator';
import { buildDailyStocks, buildReviews, buildPointTransactions } from './seed/derivedRecords';
import { buildAddresses, buildUserVouchers } from './seed/customerExtras';
import { PRESERVED_USER_ROWS, isUserRow, reapplyUserOrderEffects, dropRowsLinkedToSeed } from './userRows';
import { buildStatusHistories } from './seed/statusHistories';
import { expireOverdueUserOrders } from './orderCancellation';

/** Naikkan bila struktur/isi seed berubah agar data lama di browser diganti */
const SEED_VERSION = 5; // v4: foto produk asli (WebP) & review_photos dikosongkan · v5: order_status_histories
const META_KEY = 'meta';

/** Produk ready yang dibuat habis hari ini (contoh: tidak boleh tampil di Fresh from Oven Today) */
const SOLD_OUT_TODAY_IDS = [8];

export const TABLES = [
  'categories', 'products', 'product_images', 'product_variants', 'daily_stocks', 'raw_materials',
  'payment_methods', 'custom_options', 'custom_cake_designs', 'custom_cake_design_options', 'vouchers',
  'orders', 'order_items', 'payments', 'reviews', 'review_photos', 'point_transactions', 'store_settings',
  'order_status_histories', // Step 5.4
];

/** Tabel yang ditulis pengguna — tidak pernah ditimpa oleh pembuatan ulang data contoh */
export const USER_TABLES = ['wishlists', 'addresses', 'user_vouchers']; // Step 5.3: alamat & voucher pelanggan

/**
 * Versi skema tabel pengguna. Naikkan HANYA bila struktur USER_TABLES berubah dan data lama tidak bisa
 * dipakai lagi; saat itu tabel pengguna diisi ulang dari seed (prototype belum punya migrasi).
 */
const USER_SCHEMA_VERSION = 1;

// Step 5.2 – 5.3: baris buatan pengguna di tabel data contoh — lihat ./userRows.js
export { USER_ROW_ID_START, nextUserRowId } from './userRows';

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
    order_status_histories: buildStatusHistories({ orders: generated.orders, todayKey, now }),
    reviews,
    // Ulasan contoh tanpa foto: foto katalog/stok tidak boleh tampil seolah-olah kiriman pelanggan.
    review_photos: [],
    point_transactions: buildPointTransactions({
      orders: generated.orders, reviews, todayKey, now,
      demoCustomerId: DEMO_CUSTOMER_ID, demoBalance: DEMO_CUSTOMER_POINT_BALANCE,
    }),
    store_settings: STORE_SETTINGS,
    wishlists: buildWishlists(DEMO_CUSTOMER_ID, now),
    addresses: buildAddresses(DEMO_CUSTOMER_ID),
    user_vouchers: buildUserVouchers(DEMO_CUSTOMER_ID, now),
  };
}

/** Pastikan seed sesuai versi & tanggal hari ini; buat ulang bila perlu */
function ensureSeed() {
  const todayKey = getMockTodayKey();
  const meta = readMock(META_KEY);
  const userSchemaChanged = meta?.user_schema != null && meta.user_schema !== USER_SCHEMA_VERSION;
  const missingUserTables = USER_TABLES.filter((t) => userSchemaChanged || !hasMock(t));
  if (meta?.version === SEED_VERSION && meta?.anchor_date === todayKey && missingUserTables.length === 0) return;

  const seed = buildSeed(todayKey);
  // Baris buatan pengguna di tabel data contoh dibaca sebelum ditimpa, lalu ditambahkan kembali
  const keptRows = dropRowsLinkedToSeed(Object.fromEntries(
    Object.entries(PRESERVED_USER_ROWS).map(([t, idKey]) => [t, [readMock(t, [])].flat().filter((r) => isUserRow(r, idKey))])
  ));
  reapplyUserOrderEffects(seed, keptRows);
  TABLES.forEach((t) => writeMock(t, keptRows[t] ? [...seed[t], ...keptRows[t]] : seed[t]));
  // Data pengguna: hanya dibuat bila belum ada (atau skemanya berubah), tidak pernah ditimpa
  missingUserTables.forEach((t) => writeMock(t, seed[t]));
  writeMock(META_KEY, { version: SEED_VERSION, anchor_date: todayKey, user_schema: USER_SCHEMA_VERSION });
}

/**
 * Ambil beberapa tabel sekaligus.
 * @param {...string} names — nama tabel SPEC §8
 * @returns {object} { [nama]: rows }
 */
export function getTables(...names) {
  ensureSeed();
  // BR-06 (Step 5.3): pesanan pelanggan yang lewat 30 menit dibatalkan sebelum data apa pun dibaca, sehingga
  // katalog, keranjang, checkout, halaman bayar, dan admin melihat status & stok yang sama (pengganti job Step 6.5).
  expireOverdueUserOrders({ read: readMock, write: writeMock, now: getMockCurrentTime() });
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
