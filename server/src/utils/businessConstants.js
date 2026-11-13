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

// Step 6.5 C4 · FR-14 · NFR-05 — hasil fungsi internal pemrosesan notifikasi payment gateway (paymentGateway.service.js).
// Bukan kode HTTP: pemanggil (simulatePaid) menerjemahkannya ke kontrak rute.
const GATEWAY_PAYMENT_REASON = Object.freeze({
  NOT_PENDING: 'NOT_PENDING', // pesanan/pembayaran tidak lagi menunggu (lunas, dibatalkan, Bayar di Toko, …)
  EXPIRED: 'EXPIRED', // expired_at < now (BR-06) — notifikasi terlambat ditolak
  INVALID_NOTIFICATION: 'INVALID_NOTIFICATION', // gateway_ref / nominal / metode tidak cocok dengan data pembayaran
});
// Kelompok metode yang dibayar lewat payment gateway (Bayar di Toko tidak)
const GATEWAY_PAYMENT_GROUPS = Object.freeze([PAYMENT_GROUP.QRIS, PAYMENT_GROUP.EWALLET, PAYMENT_GROUP.VA]);

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
// T2 (ROADMAP 6.4.10): metode bayar dinonaktifkan Owner (AD-11) selagi checkout / ganti metode berjalan → 409 + rollback
const PAYMENT_METHOD_UNAVAILABLE_TEXT = 'Metode pembayaran baru saja dinonaktifkan. Pilih metode lain lalu coba lagi.';

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

// FR-18 · BR-007 · SPEC §4 — notifications.type (client constants/notification.js NOTIFICATION_TYPE)
const NOTIFICATION_TYPE = Object.freeze({
  ORDER_STATUS: 'order_status',
  PROMO: 'promo',
  POINTS: 'points',
});

// Judul & isi notifikasi perubahan status — SAMA PERSIS dengan client constants/notification.js ORDER_STATUS_NOTIFICATION.
// `{order}` diganti nomor pesanan; Siap Diambil menambahkan kode pickup, Dibatalkan menambahkan alasan.
const ORDER_STATUS_NOTIFICATION = Object.freeze({
  [ORDER_STATUS.MENUNGGU_PEMBAYARAN]: Object.freeze({
    title: 'Pesanan dibuat',
    body: 'Pesanan {order} menunggu pembayaran. Selesaikan pembayaran sebelum batas waktu.',
  }),
  [ORDER_STATUS.DIKONFIRMASI]: Object.freeze({
    title: 'Pesanan dikonfirmasi',
    body: 'Pesanan {order} sudah kami terima dan akan segera diproses.',
  }),
  [ORDER_STATUS.SEDANG_DISIAPKAN]: Object.freeze({
    title: 'Pesanan sedang disiapkan',
    body: 'Pesanan {order} sedang disiapkan oleh tim dapur Oven & Co.',
  }),
  [ORDER_STATUS.SIAP_DIAMBIL]: Object.freeze({
    title: 'Pesanan siap diambil',
    body: 'Pesanan {order} siap diambil di toko. Tunjukkan kode pickup saat mengambil.',
  }),
  [ORDER_STATUS.DALAM_PENGIRIMAN]: Object.freeze({
    title: 'Pesanan dalam pengiriman',
    body: 'Pesanan {order} sedang diantar kurir ke alamatmu.',
  }),
  [ORDER_STATUS.SELESAI]: Object.freeze({
    title: 'Pesanan selesai',
    body: 'Pesanan {order} selesai. Terima kasih! Beri ulasan untuk mendapatkan bonus poin.',
  }),
  [ORDER_STATUS.DIBATALKAN]: Object.freeze({
    title: 'Pesanan dibatalkan',
    body: 'Pesanan {order} dibatalkan.',
  }),
});

// Batas kolom notifications.title / body (SPEC §8)
const NOTIFICATION_TITLE_MAX = 100;
const NOTIFICATION_BODY_MAX = 255;

// Alasan notifikasi poin (client mock: adminOrderWrites / reviewWrites / orderCancellation buildPointsNotification)
const POINTS_NOTIFICATION_REASON = Object.freeze({
  EARN: (orderNumber) => `pesanan ${orderNumber}`,
  REVIEW_BONUS: (orderNumber) => `ulasan pesanan ${orderNumber}`,
  REFUND: (orderNumber) => `pembatalan pesanan ${orderNumber}`,
});

// TF-14 (penyedia email belum ditentukan) · SPEC §10: salinan email notifikasi hanya dicetak ke console server,
// sama seperti OTP ([DEV OTP] di auth.service).
const NOTIFICATION_EMAIL_LOG_PREFIX = '[DEV EMAIL]';

// FR-38 · BR-06 — pembatalan otomatis pembayaran online (Step 6.5 C2). Alasan = client constants/checkout.js
// PAYMENT_TIMEOUT_CANCEL_REASON & seed. "30 menit" sesuai SPEC BR-06; payment_timeout_minutes tidak bisa diubah lewat
// AD-11 (validator membuangnya), jadi teks ini tetap benar.
const PAYMENT_TIMEOUT_CANCEL_REASON = 'Tidak dibayar dalam 30 menit (BR-06)';
// Status baris payments saat batas bayar lewat (mock orderCancellation.js & seed: 'expired'); orders.payment_status tetap unpaid
const AUTO_CANCEL_PAYMENT_STATUS = PAYMENT_TRANSACTION_STATUS.EXPIRED;

// FR-38 · BR-07 — pembatalan otomatis Bayar di Toko yang tidak diambil sampai jam tutup (Step 6.5 C3). Alasan = teks seed
// mock client (services/mock/seed/orderStateRules.js). Status baris payments sama dengan BR-06 (`expired`, keputusan H2).
const PICKUP_CLOSE_CANCEL_REASON = 'Tidak diambil sampai jam tutup (BR-07)';
// Status "belum diambil" yang dibatalkan BR-07 (keputusan D1); Selesai/Dibatalkan tidak pernah
const PICKUP_AUTO_CANCEL_STATUSES = Object.freeze([
  ORDER_STATUS.DIKONFIRMASI, ORDER_STATUS.SEDANG_DISIAPKAN, ORDER_STATUS.SIAP_DIAMBIL,
]);

// Step 6.5 C5 · FR-37 — audit log aktivitas admin (tabel audit_logs; keputusan K2/K3). `entity` = nama tabel yang diubah,
// `entity_id` = primary key baris itu. Semua ≤ 50 karakter (VARCHAR(50)); tanpa nilai lama/baru & tanpa data sensitif.
const AUDIT_ACTION = Object.freeze({
  UPDATE_ORDER_STATUS: 'update_order_status',
  MARK_ORDER_PAID: 'mark_order_paid',
  UPDATE_PRODUCT_PRICE: 'update_product_price',
  UPDATE_VARIANT_PRICE: 'update_variant_price',
  UPDATE_CUSTOM_OPTION_PRICE: 'update_custom_option_price',
  UPDATE_DAILY_STOCK_PLAN: 'update_daily_stock_plan',
  CORRECT_RAW_MATERIAL_STOCK: 'correct_raw_material_stock',
  RAW_MATERIAL_STOCK_IN: 'raw_material_stock_in',
  UPDATE_PRODUCT_RECIPE: 'update_product_recipe', // CR-03 · FR-39 (entity products)
  // CR-04a · FR-44 · BR-34 (Draft 0.8.3 §10.2): dokumen stok AD-07 baru; aksi AD-07 lama tetap
  // Errata E1 B.4 (keputusan Pemilik Project 13 Nov 2026): bahan baru + saldo awal dalam satu transaksi
  CREATE_RAW_MATERIAL: 'create_raw_material',
  // CR-04a · FR-41 – FR-43 · BR-34 (Draft 0.8.3 §10.2): pembelian
  CREATE_SUPPLIER: 'create_supplier',
  UPDATE_SUPPLIER: 'update_supplier',
  SET_SUPPLIER_ACTIVE: 'set_supplier_active',
  CREATE_PURCHASE_ORDER: 'create_purchase_order',
  UPDATE_PURCHASE_ORDER: 'update_purchase_order',
  ORDER_PURCHASE_ORDER: 'order_purchase_order',
  CANCEL_PURCHASE_ORDER: 'cancel_purchase_order',
  RECEIVE_PURCHASE_ORDER: 'receive_purchase_order',
  REVERSE_GOODS_RECEIPT: 'reverse_goods_receipt',
  CORRECT_GOODS_RECEIPT: 'correct_goods_receipt',
  COUNT_STOCK: 'count_stock',
  REVERSE_STOCK_IN: 'reverse_stock_in',
  CORRECT_STOCK_IN: 'correct_stock_in',
});
const AUDIT_ENTITY = Object.freeze({
  ORDERS: 'orders',
  PRODUCTS: 'products',
  PRODUCT_VARIANTS: 'product_variants',
  CUSTOM_OPTIONS: 'custom_options',
  DAILY_STOCKS: 'daily_stocks',
  RAW_MATERIALS: 'raw_materials',
  SUPPLIERS: 'suppliers', // CR-04a
  PURCHASE_ORDERS: 'purchase_orders', // CR-04a
  GOODS_RECEIPTS: 'goods_receipts', // CR-04a
});
// Pesan 401 pelaku tidak ada / nonaktif — sama dengan middleware auth & adminStaffRules ACTOR_INACTIVE
const AUDIT_ACTOR_INACTIVE_TEXT = 'Akun tidak ditemukan atau tidak aktif.';

// Penjadwal pembatalan otomatis (jobs/autoCancelOrders.js; dipakai bersama BR-07 di C3)
const AUTO_CANCEL_JOB = Object.freeze({
  NAME: 'autoCancelOrders',
  CRON: '* * * * *', // tiap menit
  BATCH_SIZE: 100, // pesanan per putaran; sisanya diproses putaran berikutnya
  // Batas eksekusi query kandidat (di luar transaksi) — MAX_EXECUTION_TIME MySQL, termasuk tunggu metadata lock
  CANDIDATE_QUERY_TIMEOUT_MS: 5000,
  // Shutdown menunggu putaran berjalan sampai SELESAI (tanpa batas yang memotong transaksi); setelah ini hanya dicatat
  SHUTDOWN_LOG_AFTER_MS: 10000,
  ENABLED_ENV: 'AUTO_CANCEL_ENABLED', // "false" → job tidak dijalankan
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
  // 500 (keputusan pemilik project, CR-03 CP5): hasil perhitungan milli-satuan tidak dapat dikirim sebagai JSON number
  // tanpa kehilangan presisi (fail-safe SPEC §5) — satu-satunya kode yang boleh dikirim bersama status 500
  MILLI_PRECISION_LOST: 'MILLI_PRECISION_LOST',
});
const MILLI_PRECISION_LOST_TEXT = 'Hasil perhitungan tidak dapat direpresentasikan secara aman.';

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
  materialName: 100, // raw_materials.name VARCHAR(100)
  materialUnit: 20, // raw_materials.unit VARCHAR(20)
});

// Batas angka DECIMAL(12,2) (harga) & DECIMAL(10,2) (stok bahan baku)
const MAX_PRICE = 9999999999.99;
const MAX_MATERIAL_QTY = 99999999.99;

// CR-03 · FR-39/FR-40 · BR-13 – BR-15 (SPEC §5, §6, §10) — komposisi bahan & estimasi kebutuhan bahan
// Status pesanan yang masih membutuhkan bahan (terpisah dari PRODUCTION_STATUSES AD-05, yang tidak diubah)
const MATERIAL_DEMAND_STATUSES = Object.freeze([ORDER_STATUS.DIKONFIRMASI, ORDER_STATUS.SEDANG_DISIAPKAN]);
const RECIPE_MAX_ITEMS = 30; // maks. bahan per produk (asumsi prototype, SPEC §10)
const RECIPE_QTY_DECIMALS = 3; // takaran DECIMAL(10,3) — maks. 9.999.999,999
const MATERIAL_REQUIREMENT_WINDOW_DAYS = 30; // hari ini s.d. hari ini + 29 (SPEC §6, §10)
const MATERIAL_DEMAND_STATUS = Object.freeze({ KURANG: 'kurang', MENIPIS: 'menipis', CUKUP: 'cukup' });

// Lead time per tipe (SPEC §8: 0 ready, 1 pre-order, 3 custom · BR-02). Maksimum = asumsi prototype client
// LEAD_TIME_MAX_DAYS: tanggal siap tercepat harus tetap di jendela tanggal Detail Produk & Checkout (14 hari).
const LEAD_TIME_MAX_DAYS = PREORDER_DATE_WINDOW_DAYS - 2;
const LEAD_TIME_RULE = Object.freeze({
  [AVAILABILITY_TYPE.READY]: Object.freeze({ min: 0, max: 0 }),
  [AVAILABILITY_TYPE.PREORDER]: Object.freeze({ min: PREORDER_MIN_LEAD_DAYS, max: LEAD_TIME_MAX_DAYS }),
  [AVAILABILITY_TYPE.CUSTOM]: Object.freeze({ min: CUSTOM_CAKE_MIN_LEAD_DAYS, max: LEAD_TIME_MAX_DAYS }),
});

// Kolom TEXT MySQL (products.description, products.ingredients): maks. 65.535 BYTE, bukan karakter
const TEXT_MAX_BYTES = 65535;

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

// Step 6.4 · FR-27 · AD-02 Dashboard (client constants/dashboard.js & constants/orderStatus.js)
const BEST_SELLER_LIMIT = 5;
const RECENT_ORDERS_LIMIT = 5;
const NEEDS_PROCESSING_STATUSES = Object.freeze([ORDER_STATUS.DIKONFIRMASI, ORDER_STATUS.SEDANG_DISIAPKAN]);

// Step 6.4.7 · FR-33 · AD-08 Laporan Penjualan (client constants/report.js). Periode = A-08 (harian/mingguan/bulanan)
// + rentang khusus (UI/UX Spec). Asumsi prototype: mingguan = 7 hari terakhir, bulanan = bulan berjalan s.d. hari ini,
// rentang maks. 92 hari & tidak melewati hari ini.
const REPORT_PERIOD = Object.freeze({ HARIAN: 'harian', MINGGUAN: 'mingguan', BULANAN: 'bulanan', RENTANG: 'rentang' });
const REPORT_WEEK_DAYS = 7;
const REPORT_MAX_RANGE_DAYS = 92;
const REPORT_BEST_SELLER_LIMIT = 5;

// Step 6.4.8 · FR-35 · AD-10 Pelanggan & Ulasan (client constants/adminCustomer.js). Asumsi prototype: balasan admin
// maks. 500 karakter (reviews.admin_reply bertipe TEXT); filter rating 'semua' atau bintang tepat 1–5.
const ADMIN_REPLY_MAX = 500;
const ADMIN_REVIEW_RATING_ALL = 'semua';

// Step 6.4.9 · FR-34 · BR-09 · BR-10 · AD-09 Promo & Loyalty (client constants/adminPromo.js). Batas panjang = SPEC §8
// (vouchers.code VARCHAR(20), title VARCHAR(100)). Asumsi prototype: kuota 0–100.000, persen 1–100, batas aturan loyalty.
const DISCOUNT_TYPE = Object.freeze({ PERCENT: 'percent', AMOUNT: 'amount' });
const VOUCHER_FIELD_MAX = Object.freeze({ code: 20, title: 100 });
const VOUCHER_CODE_PATTERN = /^[A-Z0-9]+$/;
const VOUCHER_MAX_QUOTA = 100000;
const VOUCHER_MAX_PERCENT = 100;
const ADMIN_VOUCHER_STATUS = Object.freeze({
  AKTIF: 'aktif', TERJADWAL: 'terjadwal', KUOTA_HABIS: 'kuota_habis', BERAKHIR: 'berakhir', NONAKTIF: 'nonaktif',
});
// review_bonus_points tidak diatur di AD-09 (UI/UX Spec AD-09 hanya aturan dapat/tukar poin & ambang level)
const LOYALTY_FIELDS = Object.freeze(['earn_amount_per_point', 'redeem_points_unit', 'redeem_value', 'gold_min_points', 'platinum_min_points']);
const LOYALTY_MAX = Object.freeze({ amount: 10000000, points: 1000000 });

// Step 6.4.10 · FR-36 · UC-30 · AD-11 Pengaturan — kontrak client constants/settings.js & mock settingsAdmin.js
// Field profil yang dibaca/diubah AD-11 (mock PROFILE_FIELDS). Koordinat toko (OI-01), payment_timeout_minutes, dan
// review_bonus_points TIDAK termasuk (bukan isi A-11 / UI/UX Spec AD-11); aturan loyalty milik AD-09.
const STORE_PROFILE_FIELDS = Object.freeze([
  'store_name', 'address', 'whatsapp_number', 'preorder_cutoff_time', 'delivery_radius_km', 'delivery_fee_per_km',
]);
const STORE_FIELD_MAX = Object.freeze({
  storeName: 100, // store_settings.store_name VARCHAR(100)
  address: 255, // asumsi prototype client (kolom TEXT) agar alamat ringkas di struk
  whatsapp: 20, // store_settings.whatsapp_number VARCHAR(20)
  userName: 100, // users.name VARCHAR(100)
  email: 150, // users.email VARCHAR(150)
});
const MAX_DELIVERY_RADIUS_KM = 999.99; // DECIMAL(5,2)
const MAX_DELIVERY_FEE_PER_KM = 1000000; // asumsi prototype client
const DAYS_OF_WEEK = Object.freeze([1, 2, 3, 4, 5, 6, 7]); // operating_hours.day_of_week: 1 Senin – 7 Minggu
// Peran akun yang dapat dibuat/diatur Owner (PRD Batch 7: "staff accounts with roles (Owner, Staf)")
const ADMIN_ACCOUNT_ROLES = Object.freeze(['staf', 'owner']);
const OWNER_ROLE = 'owner';

// CR-04a · FR-41 – FR-44 · BR-17 – BR-24, BR-30, BR-31, BR-35 (SPEC §5, §6, §10; Draft 0.8.3 §3 – §7, §14) — pembelian
// & buku mutasi. Batas ditulis sebagai teks desimal (dibaca lewat BigInt, tidak pernah float).
const PO_MAX_ITEMS = 30; // asumsi prototype SPEC §10
const PO_NUMBER_PREFIX = 'PO'; // nomor PO-YYMMDD-NNN (SPEC §10), tanggal WIB saat PO dibuat
const STOCK_QTY_MAX = '99999999.99'; // DECIMAL(10,2)
const PURCHASE_PRICE_MAX = '9999999999.99'; // DECIMAL(12,2); juga batas nilai baris & nilai PO
const DOCUMENT_REASON_MAX = 255;
const PO_STATUS = Object.freeze({
  DRAFT: 'draft', DIPESAN: 'dipesan', DITERIMA_SEBAGIAN: 'diterima_sebagian', DITERIMA: 'diterima', DIBATALKAN: 'dibatalkan',
});
// Transisi manual PO (BR-19): pesan dari Draft; batal dari Draft/Dipesan/Diterima Sebagian. Diterima Sebagian &
// Diterima dihitung dari jumlah bersih diterima (bukan transisi manual). Diterima & Dibatalkan final.
const PO_MANUAL_TRANSITIONS = Object.freeze({
  draft: Object.freeze(['dipesan', 'dibatalkan']),
  dipesan: Object.freeze(['dibatalkan']),
  diterima_sebagian: Object.freeze(['dibatalkan']),
  diterima: Object.freeze([]),
  dibatalkan: Object.freeze([]),
});
const PO_RECEIVABLE_STATUSES = Object.freeze(['dipesan', 'diterima_sebagian']);
const SUPPLIER_FIELD_MAX = Object.freeze({ name: 100, phone: 20, email: 100, address: 255, contactPerson: 100, note: 255 });
const LEDGER_ERROR_CODE = Object.freeze({
  REQUEST_ID_REUSED: 'REQUEST_ID_REUSED',
  REQUEST_IN_PROGRESS: 'REQUEST_IN_PROGRESS',
  DOCUMENT_ALREADY_SUPERSEDED: 'DOCUMENT_ALREADY_SUPERSEDED',
  STOCK_OUT_OF_RANGE: 'STOCK_OUT_OF_RANGE',
  STOCK_CHANGED: 'STOCK_CHANGED',
});
// Allowlist request_id (Draft §5.1, bagian CR-04a): operasi → wajib/opsional. Operasi lain menolak request_id.
const REQUEST_ID_POLICY = Object.freeze({
  create_supplier: 'required',
  update_supplier: 'optional',
  set_supplier_active: 'optional',
  create_purchase_order: 'required',
  update_purchase_order: 'optional',
  transition_purchase_order: 'required',
  receive_purchase_order: 'required',
  reverse_goods_receipt: 'required',
  correct_goods_receipt: 'required',
  create_raw_material: 'optional',
  update_raw_material: 'optional',
  raw_material_stock_in: 'optional',
  count_stock: 'required',
  reverse_stock_in: 'required',
  correct_stock_in: 'required',
});

module.exports = {
  MILLI_PRECISION_LOST_TEXT,
  PO_MAX_ITEMS,
  PO_NUMBER_PREFIX,
  STOCK_QTY_MAX,
  PURCHASE_PRICE_MAX,
  DOCUMENT_REASON_MAX,
  PO_STATUS,
  PO_MANUAL_TRANSITIONS,
  PO_RECEIVABLE_STATUSES,
  SUPPLIER_FIELD_MAX,
  LEDGER_ERROR_CODE,
  REQUEST_ID_POLICY,
  MATERIAL_DEMAND_STATUSES,
  RECIPE_MAX_ITEMS,
  RECIPE_QTY_DECIMALS,
  MATERIAL_REQUIREMENT_WINDOW_DAYS,
  MATERIAL_DEMAND_STATUS,
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
  GATEWAY_PAYMENT_REASON,
  GATEWAY_PAYMENT_GROUPS,
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
  PAYMENT_METHOD_UNAVAILABLE_TEXT,
  ROLES,
  POINT_TX_TYPE,
  NOTIFICATION_TYPE,
  ORDER_STATUS_NOTIFICATION,
  NOTIFICATION_TITLE_MAX,
  NOTIFICATION_BODY_MAX,
  POINTS_NOTIFICATION_REASON,
  NOTIFICATION_EMAIL_LOG_PREFIX,
  PAYMENT_TIMEOUT_CANCEL_REASON,
  AUTO_CANCEL_PAYMENT_STATUS,
  PICKUP_CLOSE_CANCEL_REASON,
  PICKUP_AUTO_CANCEL_STATUSES,
  AUTO_CANCEL_JOB,
  AUDIT_ACTION,
  AUDIT_ENTITY,
  AUDIT_ACTOR_INACTIVE_TEXT,
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
  BEST_SELLER_LIMIT,
  RECENT_ORDERS_LIMIT,
  NEEDS_PROCESSING_STATUSES,
  REPORT_PERIOD,
  REPORT_WEEK_DAYS,
  REPORT_MAX_RANGE_DAYS,
  REPORT_BEST_SELLER_LIMIT,
  ADMIN_REPLY_MAX,
  ADMIN_REVIEW_RATING_ALL,
  DISCOUNT_TYPE,
  VOUCHER_FIELD_MAX,
  VOUCHER_CODE_PATTERN,
  VOUCHER_MAX_QUOTA,
  VOUCHER_MAX_PERCENT,
  ADMIN_VOUCHER_STATUS,
  LOYALTY_FIELDS,
  LOYALTY_MAX,
  STORE_PROFILE_FIELDS,
  STORE_FIELD_MAX,
  MAX_DELIVERY_RADIUS_KM,
  MAX_DELIVERY_FEE_PER_KM,
  DAYS_OF_WEEK,
  ADMIN_ACCOUNT_ROLES,
  OWNER_ROLE,
  CUSTOM_CAKE_CATEGORY_NAME,
  CATALOG_FIELD_MAX,
  MAX_PRICE,
  MAX_MATERIAL_QTY,
  LEAD_TIME_MAX_DAYS,
  LEAD_TIME_RULE,
  PRODUCT_PHOTO_MAX,
  CUSTOM_OPTION_GROUP_LABEL,
  TEXT_MAX_BYTES,
};
