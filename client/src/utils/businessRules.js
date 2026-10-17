// utils/businessRules.js
// Step 4 · Aturan bisnis murni (tanpa side effect) — dipakai service mock, nanti dites di Step 7
// Step 5.1: isi dipecah per domain ke utils/rules/*. File ini tetap menjadi titik impor tunggal
// (barrel) agar import lama dan unit test Step 7 tidak perlu berubah.
// Step 5.4: rules/orderTracking (tracking, batal, Pesan Lagi, ulasan).

export * from './rules/stock';
export * from './rules/sales';
export * from './rules/rating';
export * from './rules/loyalty';
export * from './rules/promo';
export * from './rules/readyDate';
export * from './rules/catalog';
export * from './rules/cart';
export * from './rules/customCake';
export * from './rules/checkout';
export * from './rules/order';
export * from './rules/orderTracking';
// Step 5.5: rules/account (profil, alamat, voucher) & rules/notification (notifikasi in-app).
export * from './rules/account';
export * from './rules/notification';
// Step 5.6: rules/adminOrder (ubah status admin, kode pickup, tandai lunas) & rules/production (kalender produksi).
export * from './rules/adminOrder';
export * from './rules/production';
