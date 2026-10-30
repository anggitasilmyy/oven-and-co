// prisma/seed/catalog.js
// Step 6.1 · Data master seed — SPEC §9 (data contoh) & §10 (asumsi prototype).
// Nilai disalin dari data mock frontend (client/src/services/mock/seed/*, users.js) agar mode mock dan mode API
// menampilkan katalog yang sama. Produk/harga selain Classic Butter Croissant, opsi custom cake, nama pelanggan,
// alamat, dan nomor = data contoh (SPEC §9).

/** Tanggal acuan seed (deterministik). Sama dengan tanggal uji frontend; bisa diganti lewat SEED_ANCHOR_DATE. */
const ANCHOR_DATE = process.env.SEED_ANCHOR_DATE || '2026-10-16';

// categories — SPEC §9
const CATEGORIES = [
  { categoryId: 1, name: 'Roti', sortOrder: 1 },
  { categoryId: 2, name: 'Cake', sortOrder: 2 },
  { categoryId: 3, name: 'Pastry', sortOrder: 3 },
  { categoryId: 4, name: 'Cookies', sortOrder: 4 },
  { categoryId: 5, name: 'Custom Cake', sortOrder: 5 },
];

const LEAD_TIME = { ready: 0, preorder: 1, custom: 3 };
const product = (productId, categoryId, name, price, availabilityType, extra = {}) => ({
  productId, categoryId, name, price, availabilityType, leadTimeDays: LEAD_TIME[availabilityType],
  description: extra.description ?? '', ingredients: extra.ingredients ?? null, allergens: extra.allergens ?? null,
  isActive: extra.isActive ?? true,
});

// products — 6 produk SPEC §9 (harga croissant Rp 28.000 dari SPEC), sisanya data contoh
const PRODUCTS = [
  product(1, 3, 'Classic Butter Croissant', 28000, 'ready', {
    description: 'Croissant butter berlapis, renyah di luar dan lembut di dalam, dipanggang setiap pagi.',
    ingredients: 'Tepung terigu, butter Prancis, susu, telur, gula, ragi, garam', allergens: 'Gluten, susu, telur',
  }),
  product(2, 1, 'Signature Cinnamon Roll', 32000, 'ready', { description: 'Roti gulung kayu manis dengan glaze cream cheese.', allergens: 'Gluten, susu, telur' }), // data contoh
  product(3, 2, 'Chocolate Lava Cake', 45000, 'ready', { description: 'Cake cokelat hangat dengan isian cokelat leleh.', allergens: 'Gluten, susu, telur' }), // data contoh
  product(4, 4, 'Assorted Cookies Box', 120000, 'ready', { description: 'Satu kotak isi 12 cookies aneka rasa.', allergens: 'Gluten, susu, telur, kacang' }), // data contoh
  product(5, 2, 'Premium Birthday Cake', 385000, 'preorder', { // data contoh
    description: 'Cake ulang tahun 20 cm dengan dekorasi buttercream.',
    ingredients: 'Tepung terigu, telur, gula, butter, susu, buttercream, pewarna makanan', allergens: 'Gluten, susu, telur',
  }),
  product(6, 5, 'Custom Celebration Cake', 450000, 'custom', { description: 'Rancang ukuran, bentuk, rasa, krim, dan tulisan sesuai acaramu.', allergens: 'Gluten, susu, telur' }), // data contoh — harga dasar
  product(7, 3, 'Almond Croissant', 34000, 'ready', { allergens: 'Gluten, susu, telur, kacang' }), // data contoh
  product(8, 3, 'Pain au Chocolat', 30000, 'ready', { allergens: 'Gluten, susu, telur' }), // data contoh
  product(9, 1, 'Sourdough Country Loaf', 65000, 'preorder', { allergens: 'Gluten' }), // data contoh
  product(10, 1, 'Soft Milk Bun (isi 6)', 42000, 'ready', { allergens: 'Gluten, susu, telur' }), // data contoh
  product(11, 2, 'Red Velvet Slice', 38000, 'ready', { isActive: false }), // data contoh — nonaktif
  product(12, 4, 'Choco Chip Cookies Jar', 75000, 'ready', { allergens: 'Gluten, susu, telur' }), // data contoh
];

// product_images — file WebP lokal frontend (client/public/images/products, lisensi di docs/IMAGE_SOURCES.md)
const PHOTOS = {
  1: ['butter-croissant-1', 'butter-croissant-2'], 2: ['cinnamon-roll-1', 'cinnamon-roll-2'], 3: ['lava-cake-1'],
  4: ['cookies-box-1'], 5: ['birthday-cake-1'], 6: ['custom-cake-1'], 7: ['almond-croissant-1', 'almond-croissant-2'],
  8: ['pain-au-chocolat-1'], 9: ['sourdough-1'], 10: ['milk-bun-1'], 11: ['red-velvet-1'], 12: ['cookies-jar-1'],
};
// Foto utama image_id = product_id; foto galeri tambahan memakai id lanjutan (sama dengan mock)
const PRODUCT_IMAGES = [
  ...PRODUCTS.map((p) => ({ imageId: p.productId, productId: p.productId, imageUrl: `/images/products/${PHOTOS[p.productId][0]}.webp`, sortOrder: 1 })),
  ...Object.entries(PHOTOS).flatMap(([pid, files]) => files.slice(1).map((f, i) => ({ productId: Number(pid), imageUrl: `/images/products/${f}.webp`, sortOrder: i + 2 })))
    .map((img, i) => ({ imageId: PRODUCTS.length + i + 1, ...img })),
];

// product_variants — Croissant sesuai UI/UX Spec; lainnya data contoh
const PRODUCT_VARIANTS = [
  [1, 1, 'Original', 0], [2, 1, 'Almond', 6000], [3, 1, 'Chocolate', 5000], [4, 1, 'Matcha', 7000, false],
  [5, 2, 'Original', 0], [6, 2, 'Extra Cream Cheese', 5000], [7, 5, 'Vanilla', 0], [8, 5, 'Chocolate', 25000], [9, 5, 'Red Velvet', 40000],
].map(([variantId, productId, name, extraPrice, isActive = true]) => ({ variantId, productId, name, extraPrice, isActive }));

/** Rencana stok harian produk ready (qty_planned) — data contoh */
const DAILY_STOCK_PLAN = { 1: 40, 2: 30, 3: 18, 4: 12, 7: 24, 8: 8, 10: 15, 12: 14 };

// raw_materials — data contoh (beberapa ≤ minimum untuk peringatan Stok Menipis)
const RAW_MATERIALS = [
  [1, 'Tepung terigu protein tinggi', 'kg', 42, 25], [2, 'Butter Prancis', 'kg', 6.5, 8], [3, 'Gula pasir', 'kg', 18, 10],
  [4, 'Telur ayam', 'butir', 96, 120], [5, 'Cokelat couverture', 'kg', 3, 3], [6, 'Susu UHT', 'liter', 24, 12],
  [7, 'Ragi instan', 'gram', 900, 500], [8, 'Cream cheese', 'kg', 4, 2.5],
].map(([materialId, name, unit, stock, minStock]) => ({ materialId, name, unit, stock, minStock }));

// payment_methods — SPEC §8
const PAYMENT_METHODS = [
  ['qris', 'QRIS', 'qris'], ['gopay', 'GoPay', 'ewallet'], ['ovo', 'OVO', 'ewallet'], ['dana', 'DANA', 'ewallet'],
  ['shopeepay', 'ShopeePay', 'ewallet'], ['va_bca', 'BCA Virtual Account', 'va'], ['va_bni', 'BNI Virtual Account', 'va'],
  ['va_mandiri', 'Mandiri Virtual Account', 'va'], ['va_bri', 'BRI Virtual Account', 'va'], ['pay_at_store', 'Bayar di Toko', 'store'],
].map(([methodCode, name, methodGroup]) => ({ methodCode, name, methodGroup, isActive: true }));

// custom_options — data contoh
const CUSTOM_OPTIONS = [
  [1, 'ukuran', 'Diameter 15 cm', '6–8 porsi', 0], [2, 'ukuran', 'Diameter 20 cm', '10–14 porsi', 150000],
  [3, 'ukuran', 'Diameter 24 cm', '16–20 porsi', 300000], [4, 'bentuk', 'Bulat', null, 0], [5, 'bentuk', 'Kotak', null, 25000],
  [6, 'bentuk', 'Hati', null, 50000], [7, 'rasa', 'Vanilla', null, 0], [8, 'rasa', 'Cokelat', null, 25000],
  [9, 'rasa', 'Red Velvet', null, 40000], [10, 'krim_topping', 'Buttercream', null, 0],
  [11, 'krim_topping', 'Whipped cream & buah segar', null, 60000], [12, 'krim_topping', 'Ganache cokelat', null, 50000],
].map(([optionId, optionGroup, name, description, extraPrice]) => ({ optionId, optionGroup, name, description, extraPrice, imageUrl: null, isActive: true }));

/** TIME disimpan sebagai jam UTC pada tanggal 1970-01-01 (konvensi Prisma untuk @db.Time) */
const time = (hhmm) => new Date(`1970-01-01T${hhmm}:00.000Z`);

// store_settings — 1 baris; nilai SPEC §8 & asumsi SPEC §10 (alamat, koordinat, WhatsApp dummy — OI-01)
const STORE_SETTINGS = {
  settingId: 1, storeName: 'Oven & Co.', address: 'Jl. Oven & Co. No. 1, Jakarta', latitude: -6.2, longitude: 106.8,
  whatsappNumber: '+620000000000', preorderCutoffTime: time('17:00'), deliveryRadiusKm: 10, deliveryFeePerKm: 2500,
  paymentTimeoutMinutes: 30, earnAmountPerPoint: 1000, redeemPointsUnit: 100, redeemValue: 5000,
  goldMinPoints: 500, platinumMinPoints: 2000, reviewBonusPoints: 20,
};

// operating_hours — 07.00–20.00 setiap hari (asumsi TF-10), 1 Senin – 7 Minggu
const OPERATING_HOURS = [1, 2, 3, 4, 5, 6, 7].map((day) => ({
  hourId: day, dayOfWeek: day, openTime: time('07:00'), closeTime: time('20:00'), isOpen: true,
}));

// users — 3 akun demo (sandi demo1234, di-hash bcrypt saat seed) + pelanggan contoh tanpa sandi (tidak bisa login)
const DEMO_PASSWORD = 'demo1234';
const DEMO_USERS = [
  { userId: 1, name: 'Anisa Pelanggan', email: 'pelanggan@demo.com', phone: '+6281234567890', role: 'customer', createdAt: '2024-01-15T08:00:00.000Z' },
  { userId: 2, name: 'Budi Staf', email: 'staf@demo.com', phone: '+6281234567891', role: 'staf', createdAt: '2024-03-01T08:00:00.000Z' },
  { userId: 3, name: 'Citra Owner', email: 'owner@demo.com', phone: '+6281234567892', role: 'owner', createdAt: '2023-06-01T08:00:00.000Z' },
];
const SAMPLE_CUSTOMERS = [ // data contoh
  [101, 'Rina Wulandari', 'rina.w'], [102, 'Dimas Pratama', 'dimas.p'], [103, 'Sari Kusuma', 'sari.k'], [104, 'Ahmad Fauzi', 'ahmad.f'],
  [105, 'Maya Lestari', 'maya.l'], [106, 'Yoga Saputra', 'yoga.s'], [107, 'Nadia Putri', 'nadia.p'], [108, 'Fajar Nugroho', 'fajar.n'],
  [109, 'Intan Permata', 'intan.p'], [110, 'Bayu Setiawan', 'bayu.s'],
].map(([userId, name, slug]) => ({
  userId, name, email: `${slug}@example.com`, phone: `+62800000${String(userId).padStart(4, '0')}`, role: 'customer', createdAt: '2026-01-10T09:00:00.000Z',
}));
const DEMO_CUSTOMER_ID = 1;
/** SPEC §9: saldo 1.250 poin · Gold Member */
const DEMO_POINT_BALANCE = 1250;

/** Titik di sekitar toko: offset km ke utara/timur (1° lintang ≈ 111 km) — sama dengan mock */
const near = (northKm, eastKm) => ({
  latitude: Math.round((STORE_SETTINGS.latitude + northKm / 111) * 1e7) / 1e7,
  longitude: Math.round((STORE_SETTINGS.longitude + eastKm / 111) * 1e7) / 1e7,
});
// addresses — 2 alamat dalam radius & 1 di luar radius 10 km (data contoh fiktif)
const ADDRESSES = [
  { addressId: 1, userId: 1, label: 'Rumah', recipientName: 'Pelanggan Demo', recipientPhone: '+6281234567890', fullAddress: 'Jl. Melati No. 12, Kel. Contoh Satu, Kota Contoh', ...near(3, 2), courierNote: 'Pagar hitam, bel di kanan', isPrimary: true },
  { addressId: 2, userId: 1, label: 'Kantor', recipientName: 'Pelanggan Demo', recipientPhone: '+6281234567890', fullAddress: 'Gedung Contoh Lt. 5, Jl. Kenanga Raya No. 45, Kota Contoh', ...near(-5, 4), courierNote: null, isPrimary: false },
  { addressId: 3, userId: 1, label: 'Rumah Orang Tua', recipientName: 'Pelanggan Demo', recipientPhone: '+6281234567890', fullAddress: 'Perum Griya Asri Blok C-7, Kab. Contoh', ...near(14, 9), courierNote: null, isPrimary: false },
];

module.exports = {
  ANCHOR_DATE, CATEGORIES, PRODUCTS, PRODUCT_IMAGES, PRODUCT_VARIANTS, DAILY_STOCK_PLAN, RAW_MATERIALS, PAYMENT_METHODS,
  CUSTOM_OPTIONS, STORE_SETTINGS, OPERATING_HOURS, DEMO_PASSWORD, DEMO_USERS, SAMPLE_CUSTOMERS, DEMO_CUSTOMER_ID,
  DEMO_POINT_BALANCE, ADDRESSES,
};
