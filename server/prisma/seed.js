// prisma/seed.js
// Step 6.1 · Seed data contoh (SPEC §9) & asumsi prototype (SPEC §10) — seed pilihan A: data master + pesanan contoh.
// Deterministik: id tetap, tanggal relatif terhadap ANCHOR_DATE (default 2026-10-16, bisa SEED_ANCHOR_DATE).
// Idempoten & tidak merusak: setiap baris di-upsert dengan `update: {}` — baris yang sudah ada (mis. diubah admin)
// tidak ditimpa, baris yang belum ada dibuat. Menjalankan seed berulang tidak membuat duplikat.
// Kata sandi akun demo di-hash bcrypt; tidak ada kata sandi plaintext yang disimpan.
// Jalankan: npm run db:seed (atau otomatis setelah `prisma migrate reset`).

require('dotenv').config();
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const C = require('./seed/catalog');
const { buildSampleOrders, DESIGN, DESIGN_OPTION_IDS, dayKey, at } = require('./seed/sampleOrders');

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 10;
const date = (offset) => new Date(`${dayKey(offset)}T00:00:00Z`);

/** Upsert "buat bila belum ada" untuk banyak baris */
async function ensureAll(model, rows, whereOf) {
  for (const row of rows) await prisma[model].upsert({ where: whereOf(row), create: row, update: {} });
  return rows.length;
}

// vouchers — periode relatif terhadap ANCHOR_DATE (sama dengan mock); WEEKEND15 dari SPEC §9
const VOUCHERS = [
  { voucherId: 1, code: 'WEEKEND15', title: 'Weekend Treat: Diskon 15% Assorted Cookies Box', discountType: 'percent', discountValue: 15, productId: 4, quota: 50, validFrom: date(-2), validTo: date(12), isActive: true },
  { voucherId: 2, code: 'HEMAT10', title: 'Hemat Rp 10.000 untuk semua produk', discountType: 'amount', discountValue: 10000, productId: null, quota: 100, validFrom: date(-5), validTo: date(20), isActive: true }, // data contoh
  { voucherId: 3, code: 'CROISSANT20', title: 'Diskon 20% Classic Butter Croissant', discountType: 'percent', discountValue: 20, productId: 1, quota: 30, validFrom: date(-40), validTo: date(-10), isActive: true }, // data contoh — sudah berakhir
];

async function main() {
  const counts = {};
  const passwordHash = await bcrypt.hash(C.DEMO_PASSWORD, BCRYPT_ROUNDS);
  const users = [
    ...C.DEMO_USERS.map((u) => ({ ...u, passwordHash, isActive: true, createdAt: new Date(u.createdAt) })),
    ...C.SAMPLE_CUSTOMERS.map((u) => ({ ...u, passwordHash: null, isActive: true, createdAt: new Date(u.createdAt) })),
  ];
  const orders = buildSampleOrders();

  // Urutan mengikuti foreign key (tabel induk dulu)
  counts.users = await ensureAll('user', users, (r) => ({ userId: r.userId }));
  counts.categories = await ensureAll('category', C.CATEGORIES, (r) => ({ categoryId: r.categoryId }));
  counts.products = await ensureAll('product', C.PRODUCTS, (r) => ({ productId: r.productId }));
  counts.product_images = await ensureAll('productImage', C.PRODUCT_IMAGES, (r) => ({ imageId: r.imageId }));
  counts.product_variants = await ensureAll('productVariant', C.PRODUCT_VARIANTS, (r) => ({ variantId: r.variantId }));
  counts.raw_materials = await ensureAll('rawMaterial', C.RAW_MATERIALS, (r) => ({ materialId: r.materialId }));
  counts.custom_options = await ensureAll('customOption', C.CUSTOM_OPTIONS, (r) => ({ optionId: r.optionId }));
  counts.payment_methods = await ensureAll('paymentMethod', C.PAYMENT_METHODS, (r) => ({ methodCode: r.methodCode }));
  counts.store_settings = await ensureAll('storeSetting', [C.STORE_SETTINGS], (r) => ({ settingId: r.settingId }));
  counts.operating_hours = await ensureAll('operatingHour', C.OPERATING_HOURS, (r) => ({ hourId: r.hourId }));
  counts.addresses = await ensureAll('address', C.ADDRESSES, (r) => ({ addressId: r.addressId }));
  counts.vouchers = await ensureAll('voucher', VOUCHERS, (r) => ({ voucherId: r.voucherId }));
  counts.user_vouchers = await ensureAll('userVoucher', VOUCHERS.map((v) => ({ userId: C.DEMO_CUSTOMER_ID, voucherId: v.voucherId, claimedAt: at(-2, '09:00'), usedAt: null })),
    (r) => ({ userId_voucherId: { userId: r.userId, voucherId: r.voucherId } }));
  counts.wishlists = await ensureAll('wishlist', [5, 7].map((productId, i) => ({ userId: C.DEMO_CUSTOMER_ID, productId, createdAt: at(-(i + 1), '19:00') })),
    (r) => ({ userId_productId: { userId: r.userId, productId: r.productId } }));
  counts.daily_stocks = await ensureAll('dailyStock', orders.dailyStocks, (r) => ({ productId_stockDate: { productId: r.productId, stockDate: r.stockDate } }));
  counts.custom_cake_designs = await ensureAll('customCakeDesign', [DESIGN], (r) => ({ designId: r.designId }));
  counts.custom_cake_design_options = await ensureAll('customCakeDesignOption', DESIGN_OPTION_IDS.map((optionId) => ({ designId: DESIGN.designId, optionId })),
    (r) => ({ designId_optionId: { designId: r.designId, optionId: r.optionId } }));
  counts.orders = await ensureAll('order', orders.orders, (r) => ({ orderNumber: r.orderNumber }));
  counts.order_items = await ensureAll('orderItem', orders.orderItems, (r) => ({ orderItemId: r.orderItemId }));
  counts.payments = await ensureAll('payment', orders.payments, (r) => ({ paymentId: r.paymentId }));
  counts.order_status_histories = await ensureAll('orderStatusHistory', orders.histories, (r) => ({ historyId: r.historyId }));
  counts.reviews = await ensureAll('review', orders.reviews, (r) => ({ reviewId: r.reviewId }));
  counts.point_transactions = await ensureAll('pointTransaction', orders.pointTransactions, (r) => ({ pointTxId: r.pointTxId }));
  counts.notifications = await ensureAll('notification', orders.notifications, (r) => ({ notificationId: r.notificationId }));
  // carts, cart_items, password_resets, review_photos, audit_logs sengaja kosong: diisi saat aplikasi dipakai
  // (keranjang, OTP, foto ulasan kiriman pelanggan, log aktivitas admin).

  console.log('Seed selesai (baris diperiksa per tabel):');
  console.table(counts);
}

main()
  .catch((err) => {
    console.error('Seed gagal:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
