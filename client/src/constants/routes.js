// constants/routes.js
// Step 2 · Layout & Komponen Dasar
// Sumber: SPEC.md bagian 7

/** Rute pelanggan */
export const CUSTOMER_ROUTES = {
  ONBOARDING: '/onboarding',
  MASUK: '/masuk',
  DAFTAR: '/daftar',
  LUPA_SANDI: '/lupa-sandi',
  BERANDA: '/',
  KATALOG: '/katalog',
  CARI: '/cari',
  PRODUK_DETAIL: '/produk/:id',
  PRODUK_ULASAN: '/produk/:id/ulasan',
  CUSTOM_CAKE: '/custom-cake',
  KERANJANG: '/keranjang',
  CHECKOUT: '/checkout',
  PEMBAYARAN: '/checkout/pembayaran',
  BAYAR: '/bayar/:orderNumber',
  PESANAN_BERHASIL: '/pesanan-berhasil/:orderNumber',
  RIWAYAT_PESANAN: '/pesanan',
  DETAIL_PESANAN: '/pesanan/:orderNumber',
  FORM_ULASAN: '/pesanan/:orderNumber/ulasan',
  AKUN: '/akun',
  UBAH_PROFIL: '/akun/ubah-profil',
  VOUCHER_POIN: '/akun/voucher-poin',
  ALAMAT: '/akun/alamat',
  WISHLIST: '/akun/wishlist',
  NOTIFIKASI: '/notifikasi',
};

/** Rute admin */
export const ADMIN_ROUTES = {
  LOGIN: '/admin/login',
  DASHBOARD: '/admin/dashboard',
  PESANAN: '/admin/pesanan',
  DETAIL_PESANAN: '/admin/pesanan/:orderNumber',
  KALENDER: '/admin/kalender',
  PRODUK: '/admin/produk',
  STOK: '/admin/stok',
  LAPORAN: '/admin/laporan',
  PROMO: '/admin/promo',
  PELANGGAN: '/admin/pelanggan',
  PENGATURAN: '/admin/pengaturan',
};

/** Helper: isi parameter dinamis pada path rute
 * @example buildPath(CUSTOMER_ROUTES.PRODUK_DETAIL, { id: '123' }) → '/produk/123'
 */
export function buildPath(template, params = {}) {
  return Object.entries(params).reduce(
    (path, [key, val]) => path.replace(`:${key}`, val),
    template
  );
}
