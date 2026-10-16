// routes/AppRoutes.jsx
// Step 3 · Authentication (update dari Step 2) · Step 4: DashboardPage lazy-load
// Semua rute dari SPEC.md bagian 7 + proteksi ProtectedRoute & RoleRoute

import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Layouts
import CustomerLayout from '../layouts/CustomerLayout';
import FocusLayout from '../layouts/FocusLayout';
import AdminLayout from '../layouts/AdminLayout';

// Guards
import ProtectedRoute from './ProtectedRoute';
import RoleRoute from './RoleRoute';

// ── Halaman Pelanggan ────────────────────────────────────────────────────────
import OnboardingPage from '../pages/customer/OnboardingPage';
import MasukPage from '../pages/customer/MasukPage';
import DaftarPage from '../pages/customer/DaftarPage';
import LupaSandiPage from '../pages/customer/LupaSandiPage';
import BerandaPage from '../pages/customer/BerandaPage';
import KatalogPage from '../pages/customer/KatalogPage';
import CariPage from '../pages/customer/CariPage';
import DetailProdukPage from '../pages/customer/DetailProdukPage';
import UlasanProdukPage from '../pages/customer/UlasanProdukPage';
import CustomCakePage from '../pages/customer/CustomCakePage';
import KeranjangPage from '../pages/customer/KeranjangPage';
import CheckoutPage from '../pages/customer/CheckoutPage';
import PembayaranPage from '../pages/customer/PembayaranPage';
import BayarPage from '../pages/customer/BayarPage';
import PesananBerhasilPage from '../pages/customer/PesananBerhasilPage';
import RiwayatPesananPage from '../pages/customer/RiwayatPesananPage';
import DetailPesananPage from '../pages/customer/DetailPesananPage';
import FormUlasanPage from '../pages/customer/FormUlasanPage';
import AkunPage from '../pages/customer/AkunPage';
import UbahProfilPage from '../pages/customer/UbahProfilPage';
import VoucherPoinPage from '../pages/customer/VoucherPoinPage';
import AlamatPage from '../pages/customer/AlamatPage';
import WishlistPage from '../pages/customer/WishlistPage';
import NotifikasiPage from '../pages/customer/NotifikasiPage';

// ── Halaman Admin ────────────────────────────────────────────────────────────
import AdminLoginPage from '../pages/admin/AdminLoginPage';
// Step 4: Dashboard dimuat terpisah (lazy) karena memakai Recharts — bundle awal pelanggan tetap ringan
const DashboardPage = lazy(() => import('../pages/admin/DashboardPage'));
import PesananAdminPage from '../pages/admin/PesananAdminPage';
import DetailPesananAdminPage from '../pages/admin/DetailPesananAdminPage';
import KalenderPage from '../pages/admin/KalenderPage';
import ProdukAdminPage from '../pages/admin/ProdukAdminPage';
import StokPage from '../pages/admin/StokPage';
import LaporanPage from '../pages/admin/LaporanPage';
import PromoPage from '../pages/admin/PromoPage';
import PelangganPage from '../pages/admin/PelangganPage';
import PengaturanPage from '../pages/admin/PengaturanPage';

import DashboardSkeleton from '../components/admin/DashboardSkeleton';

// ── Halaman Dev (hanya development) ─────────────────────────────────────────
import DesignSystemPage from '../pages/dev/DesignSystemPage';

// ── Komponen redirect onboarding ─────────────────────────────────────────────
import OnboardingGuard from './OnboardingGuard';

export default function AppRoutes() {
  return (
    <Routes>

      {/* ── Onboarding (standalone, tanpa layout) ─────────────────────────── */}
      <Route path="/onboarding" element={<OnboardingPage />} />

      {/* ── Auth — FocusLayout ─────────────────────────────────────────────── */}
      <Route element={<FocusLayout />}>
        <Route path="/masuk" element={<MasukPage />} />
        <Route path="/daftar" element={<DaftarPage />} />
        <Route path="/lupa-sandi" element={<LupaSandiPage />} />
      </Route>

      {/* ── Halaman Pelanggan — CustomerLayout (bottom nav) ────────────────── */}
      <Route element={<CustomerLayout />}>
        {/* Beranda: redirect ke onboarding jika kunjungan pertama */}
        <Route index element={<OnboardingGuard><BerandaPage /></OnboardingGuard>} />
        <Route path="/katalog" element={<KatalogPage />} />
        <Route path="/cari" element={<CariPage />} />

        {/* Keranjang TIDAK diproteksi — tamu boleh membuka (BR-04) */}
        {/* Riwayat Pesanan & Akun memerlukan login */}
        <Route
          path="/pesanan"
          element={<ProtectedRoute><RiwayatPesananPage /></ProtectedRoute>}
        />
        <Route
          path="/akun"
          element={<ProtectedRoute><AkunPage /></ProtectedRoute>}
        />
      </Route>

      {/* ── Halaman Pelanggan — FocusLayout (tanpa bottom nav) ───────────── */}
      <Route element={<FocusLayout />}>
        {/* Produk & Ulasan — publik */}
        <Route path="/produk/:id" element={<DetailProdukPage />} />
        <Route path="/produk/:id/ulasan" element={<UlasanProdukPage />} />

        {/* Custom Cake — publik (login diminta saat checkout) */}
        <Route path="/custom-cake" element={<CustomCakePage />} />

        {/* Keranjang — publik (tamu boleh) */}
        <Route path="/keranjang" element={<KeranjangPage />} />

        {/* Alur checkout & setelahnya — wajib login (BR-04) */}
        <Route
          path="/checkout"
          element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>}
        />
        <Route
          path="/checkout/pembayaran"
          element={<ProtectedRoute><PembayaranPage /></ProtectedRoute>}
        />
        <Route
          path="/bayar/:orderNumber"
          element={<ProtectedRoute><BayarPage /></ProtectedRoute>}
        />
        <Route
          path="/pesanan-berhasil/:orderNumber"
          element={<ProtectedRoute><PesananBerhasilPage /></ProtectedRoute>}
        />

        {/* Detail & tracking pesanan — wajib login */}
        <Route
          path="/pesanan/:orderNumber"
          element={<ProtectedRoute><DetailPesananPage /></ProtectedRoute>}
        />
        <Route
          path="/pesanan/:orderNumber/ulasan"
          element={<ProtectedRoute><FormUlasanPage /></ProtectedRoute>}
        />

        {/* Sub-akun — wajib login */}
        <Route
          path="/akun/ubah-profil"
          element={<ProtectedRoute><UbahProfilPage /></ProtectedRoute>}
        />
        <Route
          path="/akun/voucher-poin"
          element={<ProtectedRoute><VoucherPoinPage /></ProtectedRoute>}
        />
        <Route
          path="/akun/alamat"
          element={<ProtectedRoute><AlamatPage /></ProtectedRoute>}
        />
        <Route
          path="/akun/wishlist"
          element={<ProtectedRoute><WishlistPage /></ProtectedRoute>}
        />
        <Route
          path="/notifikasi"
          element={<ProtectedRoute><NotifikasiPage /></ProtectedRoute>}
        />
      </Route>

      {/* ── Admin — standalone login ──────────────────────────────────────── */}
      <Route path="/admin/login" element={<AdminLoginPage />} />

      {/* ── Admin — AdminLayout (sidebar) dengan proteksi role ───────────── */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />

        {/* Owner only */}
        <Route
          path="dashboard"
          element={
            <RoleRoute roles={['owner']}>
              <Suspense fallback={<DashboardSkeleton />}><DashboardPage /></Suspense>
            </RoleRoute>
          }
        />

        {/* Staf & Owner */}
        <Route path="pesanan" element={<RoleRoute roles={['staf', 'owner']}><PesananAdminPage /></RoleRoute>} />
        <Route path="pesanan/:orderNumber" element={<RoleRoute roles={['staf', 'owner']}><DetailPesananAdminPage /></RoleRoute>} />
        <Route path="kalender" element={<RoleRoute roles={['staf', 'owner']}><KalenderPage /></RoleRoute>} />
        <Route path="produk" element={<RoleRoute roles={['staf', 'owner']}><ProdukAdminPage /></RoleRoute>} />
        <Route path="stok" element={<RoleRoute roles={['staf', 'owner']}><StokPage /></RoleRoute>} />
        <Route path="pelanggan" element={<RoleRoute roles={['staf', 'owner']}><PelangganPage /></RoleRoute>} />

        {/* Owner only */}
        <Route path="laporan" element={<RoleRoute roles={['owner']}><LaporanPage /></RoleRoute>} />
        <Route path="promo" element={<RoleRoute roles={['owner']}><PromoPage /></RoleRoute>} />
        <Route path="pengaturan" element={<RoleRoute roles={['owner']}><PengaturanPage /></RoleRoute>} />
      </Route>

      {/* ── Dev only ──────────────────────────────────────────────────────── */}
      <Route path="/dev/design" element={<DesignSystemPage />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
