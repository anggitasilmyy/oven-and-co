// utils/businessConstants.js
// Kode & batas aturan bisnis bersama (sama dengan client/src/constants/*) — BR-01 · BR-02 · FR-05 · FR-09 · FR-11

const AVAILABILITY_TYPE = Object.freeze({
  READY: 'ready',
  PREORDER: 'preorder',
  CUSTOM: 'custom',
});

const ORDER_STATUS = Object.freeze({
  DIBATALKAN: 'dibatalkan',
});

const PAYMENT_STATUS = Object.freeze({
  PAID: 'paid',
});

const ROLES = Object.freeze({
  CUSTOMER: 'customer',
});

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

// FR-05: Best Sellers & urutan "Terlaris" memakai penjualan 7 hari (client constants/dashboard.js)
const SALES_WINDOW_DAYS = 7;

// FR-09: cuplikan ulasan di Detail Produk (client constants/productDetail.js)
const REVIEW_PREVIEW_LIMIT = 2;

module.exports = {
  AVAILABILITY_TYPE,
  ORDER_STATUS,
  PAYMENT_STATUS,
  ROLES,
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
};
