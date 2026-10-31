// utils/businessConstants.js
// Kode & batas aturan bisnis bersama (sama dengan client/src/constants/*) — BR-01 · BR-02 · FR-05 · FR-09 · FR-11

const AVAILABILITY_TYPE = Object.freeze({
  READY: 'ready',
  PREORDER: 'preorder',
  CUSTOM: 'custom',
});

// SPEC §4 · enum OrderStatus (client constants/orderStatus.js)
const ORDER_STATUS = Object.freeze({
  MENUNGGU_PEMBAYARAN: 'menunggu_pembayaran',
  DIKONFIRMASI: 'dikonfirmasi',
  SEDANG_DISIAPKAN: 'sedang_disiapkan',
  SIAP_DIAMBIL: 'siap_diambil',
  DALAM_PENGIRIMAN: 'dalam_pengiriman',
  SELESAI: 'selesai',
  DIBATALKAN: 'dibatalkan',
});

// SPEC §4 · label status (client constants/orderStatus.js ORDER_STATUS_LABEL) — dipakai stepper tracking C-18
const ORDER_STATUS_LABEL = Object.freeze({
  [ORDER_STATUS.MENUNGGU_PEMBAYARAN]: 'Menunggu Pembayaran',
  [ORDER_STATUS.DIKONFIRMASI]: 'Dikonfirmasi',
  [ORDER_STATUS.SEDANG_DISIAPKAN]: 'Sedang Disiapkan',
  [ORDER_STATUS.SIAP_DIAMBIL]: 'Siap Diambil',
  [ORDER_STATUS.DALAM_PENGIRIMAN]: 'Dalam Pengiriman',
  [ORDER_STATUS.SELESAI]: 'Selesai',
  [ORDER_STATUS.DIBATALKAN]: 'Dibatalkan',
});

// BR-08: pelanggan hanya bisa membatalkan sebelum Sedang Disiapkan (client CANCELLABLE_STATUSES)
const CANCELLABLE_STATUSES = Object.freeze([ORDER_STATUS.MENUNGGU_PEMBAYARAN, ORDER_STATUS.DIKONFIRMASI]);

// Pesan WhatsApp awal tombol "Hubungi Oven & Co." (client constants/orderHistory.js WHATSAPP_ORDER_MESSAGE)
const WHATSAPP_ORDER_MESSAGE = (orderNumber) => `Halo Oven & Co., saya ingin bertanya tentang pesanan ${orderNumber}.`;

// AD-03 · tab status Daftar Pesanan admin (client constants/orderStatus.js ORDER_STATUS_TABS); statuses kosong = semua
const ADMIN_ORDER_TABS = Object.freeze([
  { key: 'semua', statuses: [] },
  { key: ORDER_STATUS.MENUNGGU_PEMBAYARAN, statuses: [ORDER_STATUS.MENUNGGU_PEMBAYARAN] },
  { key: ORDER_STATUS.DIKONFIRMASI, statuses: [ORDER_STATUS.DIKONFIRMASI] },
  { key: ORDER_STATUS.SEDANG_DISIAPKAN, statuses: [ORDER_STATUS.SEDANG_DISIAPKAN] },
  { key: 'siap', statuses: [ORDER_STATUS.SIAP_DIAMBIL, ORDER_STATUS.DALAM_PENGIRIMAN] },
  { key: ORDER_STATUS.SELESAI, statuses: [ORDER_STATUS.SELESAI] },
  { key: ORDER_STATUS.DIBATALKAN, statuses: [ORDER_STATUS.DIBATALKAN] },
].map((tab) => Object.freeze(tab)));

// Baris per halaman tabel AD-03 (client constants/dashboard.js ADMIN_ORDERS_PAGE_SIZE)
const ADMIN_ORDERS_PAGE_SIZE = 10;

// AD-05 · FR-29: status yang dihitung sebagai pekerjaan produksi (client constants/adminOrder.js PRODUCTION_STATUSES).
// Menunggu Pembayaran belum pasti (bisa batal otomatis BR-06) dan Dibatalkan bukan pekerjaan produksi; Selesai tetap
// tampil sebagai catatan tanggal lampau.
const PRODUCTION_STATUSES = Object.freeze([
  ORDER_STATUS.DIKONFIRMASI,
  ORDER_STATUS.SEDANG_DISIAPKAN,
  ORDER_STATUS.SIAP_DIAMBIL,
  ORDER_STATUS.DALAM_PENGIRIMAN,
  ORDER_STATUS.SELESAI,
]);

// orders.payment_status
const PAYMENT_STATUS = Object.freeze({
  UNPAID: 'unpaid',
  PAID: 'paid',
  REFUNDED: 'refunded',
});

// payments.status
const PAYMENT_TRANSACTION_STATUS = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  EXPIRED: 'expired',
  FAILED: 'failed',
  REFUNDED: 'refunded',
});

const PAYMENT_OPTION = Object.freeze({
  ONLINE: 'online',
  PAY_AT_STORE: 'pay_at_store',
});

const FULFILLMENT_TYPE = Object.freeze({
  PICKUP: 'pickup',
  DELIVERY: 'delivery',
});

// payment_methods.method_group & kode metode Bayar di Toko (client constants/checkout.js)
const PAYMENT_GROUP = Object.freeze({ QRIS: 'qris', EWALLET: 'ewallet', VA: 'va', STORE: 'store' });
const PAY_AT_STORE_METHOD = 'pay_at_store';

// Simulasi payment gateway (SPEC §10): prefiks payments.payment_code per kelompok (client PAYMENT_CODE_PREFIX)
const PAYMENT_CODE_PREFIX = Object.freeze({
  [PAYMENT_GROUP.QRIS]: 'QRIS-SIM-',
  [PAYMENT_GROUP.EWALLET]: 'EW',
  [PAYMENT_GROUP.VA]: '8808',
});
const PAYMENT_CODE_DIGITS = Object.freeze({ [PAYMENT_GROUP.EWALLET]: 8, [PAYMENT_GROUP.VA]: 10 });
const GATEWAY_REF_PREFIX = 'SIM-';

// orders.pickup_code VARCHAR(10): "PK" + 4 digit (sama dengan mock)
const PICKUP_CODE_PREFIX = 'PK';
const PICKUP_CODE_DIGITS = 4;

// Nomor pesanan OVC-YYMMDD-NNN (AGENTS.md §5)
const ORDER_NUMBER_PREFIX = 'OVC';

/**
 * Asumsi prototype — slot ambil/antar 2 jam di dalam jam operasional (client constants/checkout.js TIME_SLOTS).
 * Disaring lagi dengan operating_hours per hari.
 */
const TIME_SLOTS = Object.freeze([
  { start: '07:00', end: '09:00' },
  { start: '09:00', end: '11:00' },
  { start: '11:00', end: '13:00' },
  { start: '13:00', end: '15:00' },
  { start: '15:00', end: '17:00' },
  { start: '17:00', end: '19:00' },
].map((slot) => Object.freeze(slot)));

// Rentang tanggal checkout (hari, termasuk hari ini) — client constants/checkout.js CHECKOUT_DATE_WINDOW_DAYS
const CHECKOUT_DATE_WINDOW_DAYS = 14;

// TF-10: jam operasional contoh bila tabel operating_hours kosong (client constants/storeConfig.js)
const OPERATING_HOURS_DEFAULT = Object.freeze({ open_time: '07:00', close_time: '20:00' });

// Teks validation rule Pembayaran & Voucher (SPEC §6)
const PAY_AT_STORE_DISABLED_TEXT = 'Tidak tersedia untuk pre-order dan delivery';
const VOUCHER_INVALID_TEXT = 'Voucher tidak berlaku untuk pesanan ini';

const ROLES = Object.freeze({
  CUSTOMER: 'customer',
});

// enum PointTransactionType (point_transactions.type)
const POINT_TX_TYPE = Object.freeze({
  EARN: 'earn',
  REDEEM: 'redeem',
  REVIEW_BONUS: 'review_bonus',
  REFUND: 'refund',
});

// BR-09 · TF-11: level member dari poin tahun kalender berjalan (client constants/storeConfig.js MEMBER_LEVEL)
const MEMBER_LEVEL = Object.freeze({
  SILVER: Object.freeze({ key: 'silver', label: 'Silver Member', badge: 'silver' }),
  GOLD: Object.freeze({ key: 'gold', label: 'Gold Member', badge: 'gold' }),
  PLATINUM: Object.freeze({ key: 'platinum', label: 'Platinum Member', badge: 'platinum' }),
});

// FR-23 · C-21: status voucher milik pelanggan (client constants/account.js VOUCHER_STATE)
const VOUCHER_STATE = Object.freeze({ USABLE: 'usable', USED: 'used', EXPIRED: 'expired' });

// Kode error di body respons (sama dengan client constants/apiErrors.js)
const API_ERROR_CODE = Object.freeze({
  // 401: token yang dikirim tidak berlaku (kedaluwarsa/rusak/akun nonaktif) → frontend menghapus sesi
  SESSION_INVALID: 'SESSION_INVALID',
  // 400: id sumber daya tidak valid (mis. /products/abc) → frontend menampilkan "tidak ditemukan"
  INVALID_ID: 'INVALID_ID',
});

// BR-02: pre-order minimal H-1, custom cake minimal H+3 (client constants/storeConfig.js)
const PREORDER_MIN_LEAD_DAYS = 1;
const CUSTOM_CAKE_MIN_LEAD_DAYS = 3;

// Jendela date picker frontend: tanggal yang bisa dipilih = hari ini s.d. hari ini + (jendela - 1)
// (client constants/productDetail.js PREORDER_DATE_WINDOW_DAYS, constants/customCake.js CUSTOM_CAKE_DATE_WINDOW_DAYS)
const PREORDER_DATE_WINDOW_DAYS = 14;
const CUSTOM_CAKE_DATE_WINDOW_DAYS = 30;

// Asumsi prototype — batas jumlah per baris keranjang (client constants/cart.js CART_LINE_MAX_QUANTITY).
// Baris di atas batas tidak membuat request gagal; baris ditandai `quantity_exceeds_limit`.
const CART_ITEM_MAX_QUANTITY = 99;

// Asumsi prototype — maksimal 50 baris berbeda dalam satu keranjang (client constants/cart.js CART_MAX_LINES).
// Keranjang di atas batas tetap ditampilkan dengan `exceeds_line_limit: true` agar pelanggan bisa menghapus item.
const CART_MAX_LINES = 50;

// Batas keras ukuran request POST /api/cart = 2 × CART_MAX_LINES (hasil maksimum satu kali gabung
// keranjang tamu 50 baris ke keranjang akun 50 baris). Di atas ini request ditolak 400.
const CART_REQUEST_MAX_ITEMS = CART_MAX_LINES * 2;

// ── Step 6.4 · AD-06 · AD-07 (client constants/adminCatalog.js, constants/product.js) ───────────────────────

// Kategori produk custom cake (client constants/product.js CUSTOM_CAKE_CATEGORY_NAME): diarahkan ke Custom Cake Builder
const CUSTOM_CAKE_CATEGORY_NAME = 'Custom Cake';

// Panjang maksimum kolom (SPEC §8)
const CATALOG_FIELD_MAX = Object.freeze({
  name: 100, // products.name VARCHAR(100)
  allergens: 255, // products.allergens VARCHAR(255)
  variantName: 50, // product_variants.name VARCHAR(50)
  optionName: 50, // custom_options.name VARCHAR(50)
  optionDescription: 100, // custom_options.description VARCHAR(100)
});

// Batas angka DECIMAL(12,2) (harga)
const MAX_PRICE = 9999999999.99;

// Lead time per tipe (SPEC §8: 0 ready, 1 pre-order, 3 custom · BR-02). Maksimum = asumsi prototype client
// LEAD_TIME_MAX_DAYS: tanggal siap tercepat harus tetap di jendela tanggal Detail Produk & Checkout (14 hari).
const LEAD_TIME_MAX_DAYS = PREORDER_DATE_WINDOW_DAYS - 2;
const LEAD_TIME_RULE = Object.freeze({
  [AVAILABILITY_TYPE.READY]: Object.freeze({ min: 0, max: 0 }),
  [AVAILABILITY_TYPE.PREORDER]: Object.freeze({ min: PREORDER_MIN_LEAD_DAYS, max: LEAD_TIME_MAX_DAYS }),
  [AVAILABILITY_TYPE.CUSTOM]: Object.freeze({ min: CUSTOM_CAKE_MIN_LEAD_DAYS, max: LEAD_TIME_MAX_DAYS }),
});

// Foto produk maks. 5 (FR-30, validation rule Produk)
const PRODUCT_PHOTO_MAX = 5;

// Label kelompok opsi custom cake (client constants/adminCatalog.js CUSTOM_OPTION_GROUP_LABEL)
const CUSTOM_OPTION_GROUP_LABEL = Object.freeze({
  ukuran: 'Ukuran',
  bentuk: 'Bentuk',
  rasa: 'Rasa',
  krim_topping: 'Krim & Topping',
});

// FR-05: Best Sellers & urutan "Terlaris" memakai penjualan 7 hari (client constants/dashboard.js)
const SALES_WINDOW_DAYS = 7;

// FR-09: cuplikan ulasan di Detail Produk (client constants/productDetail.js)
const REVIEW_PREVIEW_LIMIT = 2;

module.exports = {
  AVAILABILITY_TYPE,
  ORDER_STATUS,
  ORDER_STATUS_LABEL,
  CANCELLABLE_STATUSES,
  WHATSAPP_ORDER_MESSAGE,
  ADMIN_ORDER_TABS,
  ADMIN_ORDERS_PAGE_SIZE,
  PRODUCTION_STATUSES,
  PAYMENT_STATUS,
  PAYMENT_TRANSACTION_STATUS,
  PAYMENT_OPTION,
  FULFILLMENT_TYPE,
  PAYMENT_GROUP,
  PAY_AT_STORE_METHOD,
  PAYMENT_CODE_PREFIX,
  PAYMENT_CODE_DIGITS,
  GATEWAY_REF_PREFIX,
  PICKUP_CODE_PREFIX,
  PICKUP_CODE_DIGITS,
  ORDER_NUMBER_PREFIX,
  TIME_SLOTS,
  CHECKOUT_DATE_WINDOW_DAYS,
  OPERATING_HOURS_DEFAULT,
  PAY_AT_STORE_DISABLED_TEXT,
  VOUCHER_INVALID_TEXT,
  ROLES,
  POINT_TX_TYPE,
  MEMBER_LEVEL,
  VOUCHER_STATE,
  API_ERROR_CODE,
  PREORDER_MIN_LEAD_DAYS,
  CUSTOM_CAKE_MIN_LEAD_DAYS,
  PREORDER_DATE_WINDOW_DAYS,
  CUSTOM_CAKE_DATE_WINDOW_DAYS,
  CART_ITEM_MAX_QUANTITY,
  CART_MAX_LINES,
  CART_REQUEST_MAX_ITEMS,
  SALES_WINDOW_DAYS,
  REVIEW_PREVIEW_LIMIT,
  CUSTOM_CAKE_CATEGORY_NAME,
  CATALOG_FIELD_MAX,
  MAX_PRICE,
  LEAD_TIME_MAX_DAYS,
  LEAD_TIME_RULE,
  PRODUCT_PHOTO_MAX,
  CUSTOM_OPTION_GROUP_LABEL,
};
