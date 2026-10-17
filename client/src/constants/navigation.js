// constants/navigation.js
// Step 2.5 (PR A) · SPEC §7 — menu navigasi pelanggan
// Dipakai bersama oleh BottomNav (< md), SiteHeader (≥ md), dan AccountLayout (≥ lg)

import { Home, Grid2X2, ShoppingBag, User, UserPen, Ticket, MapPin, Heart, ClipboardList, Bell } from 'lucide-react';
import { CUSTOMER_ROUTES } from './routes';

/** 4 menu utama: Beranda, Katalog, Pesanan, Akun */
export const CUSTOMER_NAV_ITEMS = [
  { label: 'Beranda', to: CUSTOMER_ROUTES.BERANDA, Icon: Home, end: true },
  { label: 'Katalog', to: CUSTOMER_ROUTES.KATALOG, Icon: Grid2X2 },
  { label: 'Pesanan', to: CUSTOMER_ROUTES.RIWAYAT_PESANAN, Icon: ShoppingBag },
  { label: 'Akun', to: CUSTOMER_ROUTES.AKUN, Icon: User },
];

/**
 * Menu sub-akun C-20 (tombol Keluar ditangani terpisah).
 * Step 5.5: urutan & isi mengikuti UI/UX Spec Profile (C-20 s.d. C-24): Pesanan Saya, Voucher & Poin,
 * Alamat Tersimpan, Wishlist, Notifikasi, Ubah Profil, Keluar.
 */
export const ACCOUNT_MENU_ITEMS = [
  { key: 'pesanan', label: 'Pesanan Saya', to: CUSTOMER_ROUTES.RIWAYAT_PESANAN, Icon: ClipboardList },
  { key: 'voucher', label: 'Voucher & Poin', to: CUSTOMER_ROUTES.VOUCHER_POIN, Icon: Ticket },
  { key: 'alamat', label: 'Alamat Tersimpan', to: CUSTOMER_ROUTES.ALAMAT, Icon: MapPin },
  { key: 'wishlist', label: 'Wishlist', to: CUSTOMER_ROUTES.WISHLIST, Icon: Heart },
  { key: 'notifikasi', label: 'Notifikasi', to: CUSTOMER_ROUTES.NOTIFIKASI, Icon: Bell },
  { key: 'profil', label: 'Ubah Profil', to: CUSTOMER_ROUTES.UBAH_PROFIL, Icon: UserPen },
];
