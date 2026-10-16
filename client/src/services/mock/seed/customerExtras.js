// services/mock/seed/customerExtras.js
// Step 5.3 · Data contoh akun demo pelanggan untuk checkout (C-13): alamat tersimpan & voucher milik pelanggan.
// Tabel pengguna (USER_TABLES) — hanya diisi bila belum ada di perangkat. Kelola alamat dibuat di Step 5.5 (C-22).

import { STORE_SETTINGS } from './catalog';

/** Titik di sekitar toko: offset km ke utara/timur (1° lintang ≈ 111 km) — data contoh */
const near = (northKm, eastKm) => ({
  latitude: Math.round((STORE_SETTINGS.latitude + northKm / 111) * 1e7) / 1e7,
  longitude: Math.round((STORE_SETTINGS.longitude + eastKm / 111) * 1e7) / 1e7,
});

/** addresses — 2 alamat dalam radius dan 1 di luar radius 10 km (uji validation rule Checkout) */
export function buildAddresses(demoCustomerId) {
  return [ // data contoh fiktif
    {
      address_id: 1, user_id: demoCustomerId, label: 'Rumah', recipient_name: 'Pelanggan Demo',
      recipient_phone: '+6281234567890', full_address: 'Jl. Melati No. 12, Kel. Contoh Satu, Kota Contoh',
      ...near(3, 2), courier_note: 'Pagar hitam, bel di kanan', is_primary: true,
    },
    {
      address_id: 2, user_id: demoCustomerId, label: 'Kantor', recipient_name: 'Pelanggan Demo',
      recipient_phone: '+6281234567890', full_address: 'Gedung Contoh Lt. 5, Jl. Kenanga Raya No. 45, Kota Contoh',
      ...near(-5, 4), courier_note: null, is_primary: false,
    },
    {
      address_id: 3, user_id: demoCustomerId, label: 'Rumah Orang Tua', recipient_name: 'Pelanggan Demo',
      recipient_phone: '+6281234567890', full_address: 'Perum Griya Asri Blok C-7, Kab. Contoh',
      ...near(14, 9), courier_note: null, is_primary: false,
    },
  ];
}

/** user_vouchers — voucher yang sudah diklaim akun demo (voucher_id dari buildVouchers) */
export function buildUserVouchers(demoCustomerId, now) {
  const claimedAt = new Date(now.getTime() - 2 * 86400000).toISOString();
  return [1, 2, 3].map((voucher_id) => ({ user_id: demoCustomerId, voucher_id, claimed_at: claimedAt, used_at: null }));
}
