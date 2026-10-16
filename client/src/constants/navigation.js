// constants/navigation.js
// Step 2.5 (PR A) · SPEC §7 — menu navigasi pelanggan
// Dipakai bersama oleh BottomNav (< md), SiteHeader (≥ md), dan AccountLayout (≥ lg)

import { Home, Grid2X2, ShoppingBag, User, UserPen, Ticket, MapPin, Heart } from 'lucide-react';
import { CUSTOMER_ROUTES } from './routes';

/** 4 menu utama: Beranda, Katalog, Pesanan, Akun */
export const CUSTOMER_NAV_ITEMS = [
  { label: 'Beranda', to: CUSTOMER_ROUTES.BERANDA, Icon: Home, end: true },
  { label: 'Katalog', to: CUSTOMER_ROUTES.KATALOG, Icon: Grid2X2 },
  { label: 'Pesanan', to: CUSTOMER_ROUTES.RIWAYAT_PESANAN, Icon: ShoppingBag },
  { label: 'Akun', to: CUSTOMER_ROUTES.AKUN, Icon: User },
];

/** Menu sub-akun C-20 (tombol Keluar ditangani terpisah) */
export const ACCOUNT_MENU_ITEMS = [
  { label: 'Ubah Profil', to: CUSTOMER_ROUTES.UBAH_PROFIL, Icon: UserPen },
  { label: 'Voucher & Poin', to: CUSTOMER_ROUTES.VOUCHER_POIN, Icon: Ticket },
  { label: 'Alamat', to: CUSTOMER_ROUTES.ALAMAT, Icon: MapPin },
  { label: 'Wishlist', to: CUSTOMER_ROUTES.WISHLIST, Icon: Heart },
];
