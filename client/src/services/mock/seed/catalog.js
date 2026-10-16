// services/mock/seed/catalog.js
// Step 4 · Data contoh katalog sesuai SPEC §8 (struktur tabel) & §9 (data seed)
// Produk SPEC §9 dipertahankan; produk/harga lain = data contoh.

import { addDaysToKey } from '../../../utils/date';
import { STORE_SETTINGS_DEFAULT } from '../../../constants/storeConfig';

// categories — SPEC §9
export const CATEGORIES = [
  { category_id: 1, name: 'Roti', sort_order: 1 },
  { category_id: 2, name: 'Cake', sort_order: 2 },
  { category_id: 3, name: 'Pastry', sort_order: 3 },
  { category_id: 4, name: 'Cookies', sort_order: 4 },
  { category_id: 5, name: 'Custom Cake', sort_order: 5 },
];

const product = (product_id, category_id, name, price, availability_type, extra = {}) => ({
  product_id,
  category_id,
  name,
  description: extra.description ?? '',
  ingredients: extra.ingredients ?? null,
  allergens: extra.allergens ?? null,
  price,
  availability_type,
  lead_time_days: { ready: 0, preorder: 1, custom: 3 }[availability_type],
  is_active: extra.is_active ?? true,
});

// products — 6 produk pertama dari SPEC §9 (harga croissant dari SPEC), sisanya data contoh
export const PRODUCTS = [
  product(1, 3, 'Classic Butter Croissant', 28000, 'ready', {
    description: 'Croissant butter berlapis, renyah di luar dan lembut di dalam, dipanggang setiap pagi.',
    ingredients: 'Tepung terigu, butter Prancis, susu, telur, gula, ragi, garam', // data contoh
    allergens: 'Gluten, susu, telur',
  }),
  product(2, 1, 'Signature Cinnamon Roll', 32000, 'ready', { // data contoh
    description: 'Roti gulung kayu manis dengan glaze cream cheese.',
    allergens: 'Gluten, susu, telur',
  }),
  product(3, 2, 'Chocolate Lava Cake', 45000, 'ready', { // data contoh
    description: 'Cake cokelat hangat dengan isian cokelat leleh.',
    allergens: 'Gluten, susu, telur',
  }),
  product(4, 4, 'Assorted Cookies Box', 120000, 'ready', { // data contoh
    description: 'Satu kotak isi 12 cookies aneka rasa.',
    allergens: 'Gluten, susu, telur, kacang',
  }),
  product(5, 2, 'Premium Birthday Cake', 385000, 'preorder', { // data contoh
    description: 'Cake ulang tahun 20 cm dengan dekorasi buttercream.',
    ingredients: 'Tepung terigu, telur, gula, butter, susu, buttercream, pewarna makanan', // data contoh
    allergens: 'Gluten, susu, telur',
  }),
  product(6, 5, 'Custom Celebration Cake', 450000, 'custom', { // data contoh — harga dasar
    description: 'Rancang ukuran, bentuk, rasa, krim, dan tulisan sesuai acaramu.',
    allergens: 'Gluten, susu, telur',
  }),
  product(7, 3, 'Almond Croissant', 34000, 'ready', { allergens: 'Gluten, susu, telur, kacang' }), // data contoh
  product(8, 3, 'Pain au Chocolat', 30000, 'ready', { allergens: 'Gluten, susu, telur' }), // data contoh
  product(9, 1, 'Sourdough Country Loaf', 65000, 'preorder', { allergens: 'Gluten' }), // data contoh
  product(10, 1, 'Soft Milk Bun (isi 6)', 42000, 'ready', { allergens: 'Gluten, susu, telur' }), // data contoh
  product(11, 2, 'Red Velvet Slice', 38000, 'ready', { is_active: false }), // data contoh — nonaktif
  product(12, 4, 'Choco Chip Cookies Jar', 75000, 'ready', { allergens: 'Gluten, susu, telur' }), // data contoh
];

// product_images ada di seed/productMedia.js (Step 5.1)

/**
 * Rencana produksi harian (qty_planned di daily_stocks) per produk ready — data contoh.
 * Pain au Chocolat sengaja sedikit agar ada contoh produk ready yang habis hari ini.
 */
export const DAILY_STOCK_PLAN = { 1: 40, 2: 30, 3: 18, 4: 12, 7: 24, 8: 8, 10: 15, 12: 14 };

// raw_materials — data contoh (beberapa ≤ minimum untuk peringatan Stok Menipis)
export const RAW_MATERIALS = [
  { material_id: 1, name: 'Tepung terigu protein tinggi', unit: 'kg', stock: 42, min_stock: 25 },
  { material_id: 2, name: 'Butter Prancis', unit: 'kg', stock: 6.5, min_stock: 8 },
  { material_id: 3, name: 'Gula pasir', unit: 'kg', stock: 18, min_stock: 10 },
  { material_id: 4, name: 'Telur ayam', unit: 'butir', stock: 96, min_stock: 120 },
  { material_id: 5, name: 'Cokelat couverture', unit: 'kg', stock: 3, min_stock: 3 },
  { material_id: 6, name: 'Susu UHT', unit: 'liter', stock: 24, min_stock: 12 },
  { material_id: 7, name: 'Ragi instan', unit: 'gram', stock: 900, min_stock: 500 },
  { material_id: 8, name: 'Cream cheese', unit: 'kg', stock: 4, min_stock: 2.5 },
];

// payment_methods — SPEC §8
export const PAYMENT_METHODS = [
  { method_code: 'qris', name: 'QRIS', method_group: 'qris', is_active: true },
  { method_code: 'gopay', name: 'GoPay', method_group: 'ewallet', is_active: true },
  { method_code: 'ovo', name: 'OVO', method_group: 'ewallet', is_active: true },
  { method_code: 'dana', name: 'DANA', method_group: 'ewallet', is_active: true },
  { method_code: 'shopeepay', name: 'ShopeePay', method_group: 'ewallet', is_active: true },
  { method_code: 'va_bca', name: 'BCA Virtual Account', method_group: 'va', is_active: true },
  { method_code: 'va_bni', name: 'BNI Virtual Account', method_group: 'va', is_active: true },
  { method_code: 'va_mandiri', name: 'Mandiri Virtual Account', method_group: 'va', is_active: true },
  { method_code: 'va_bri', name: 'BRI Virtual Account', method_group: 'va', is_active: true },
  { method_code: 'pay_at_store', name: 'Bayar di Toko', method_group: 'store', is_active: true },
];

// custom_options — data contoh (dipakai pesanan custom cake contoh; dikelola di Step 5.2/5.7)
export const CUSTOM_OPTIONS = [
  { option_id: 1, option_group: 'ukuran', name: 'Diameter 15 cm', description: '6–8 porsi', extra_price: 0 },
  { option_id: 2, option_group: 'ukuran', name: 'Diameter 20 cm', description: '10–14 porsi', extra_price: 150000 },
  { option_id: 3, option_group: 'ukuran', name: 'Diameter 24 cm', description: '16–20 porsi', extra_price: 300000 },
  { option_id: 4, option_group: 'bentuk', name: 'Bulat', description: null, extra_price: 0 },
  { option_id: 5, option_group: 'bentuk', name: 'Kotak', description: null, extra_price: 25000 },
  { option_id: 6, option_group: 'bentuk', name: 'Hati', description: null, extra_price: 50000 },
  { option_id: 7, option_group: 'rasa', name: 'Vanilla', description: null, extra_price: 0 },
  { option_id: 8, option_group: 'rasa', name: 'Cokelat', description: null, extra_price: 25000 },
  { option_id: 9, option_group: 'rasa', name: 'Red Velvet', description: null, extra_price: 40000 },
  { option_id: 10, option_group: 'krim_topping', name: 'Buttercream', description: null, extra_price: 0 },
  { option_id: 11, option_group: 'krim_topping', name: 'Whipped cream & buah segar', description: null, extra_price: 60000 },
  { option_id: 12, option_group: 'krim_topping', name: 'Ganache cokelat', description: null, extra_price: 50000 },
].map((o) => ({ ...o, image_url: null, is_active: true }));

/** vouchers — periode relatif terhadap hari ini agar promo contoh selalu bisa dites */
export function buildVouchers(todayKey) {
  return [
    {
      voucher_id: 1, code: 'WEEKEND15', title: 'Weekend Treat: Diskon 15% Assorted Cookies Box',
      discount_type: 'percent', discount_value: 15, product_id: 4, quota: 50,
      valid_from: addDaysToKey(todayKey, -2), valid_to: addDaysToKey(todayKey, 12), is_active: true,
    },
    { // data contoh
      voucher_id: 2, code: 'HEMAT10', title: 'Hemat Rp 10.000 untuk semua produk',
      discount_type: 'amount', discount_value: 10000, product_id: null, quota: 100,
      valid_from: addDaysToKey(todayKey, -5), valid_to: addDaysToKey(todayKey, 20), is_active: true,
    },
    { // data contoh — sudah berakhir, tidak boleh tampil sebagai promo aktif
      voucher_id: 3, code: 'CROISSANT20', title: 'Diskon 20% Classic Butter Croissant',
      discount_type: 'percent', discount_value: 20, product_id: 1, quota: 30,
      valid_from: addDaysToKey(todayKey, -40), valid_to: addDaysToKey(todayKey, -10), is_active: true,
    },
  ];
}

// store_settings — 1 baris; alamat & WhatsApp dummy (OI-01)
export const STORE_SETTINGS = {
  setting_id: 1,
  ...STORE_SETTINGS_DEFAULT,
  address: 'Jl. Contoh Roti No. 1, Kota Contoh', // data contoh
  latitude: -6.2,
  longitude: 106.8,
  whatsapp_number: '+620000000000', // data contoh
};
