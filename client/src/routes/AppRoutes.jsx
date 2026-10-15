// routes/AppRoutes.jsx
// Step 2 · Layout & Komponen Dasar
// Semua rute dari SPEC.md bagian 7
// Belum ada proteksi login (dikerjakan di Step 3)

import { Routes, Route, Navigate } from 'react-router-dom';

// Layouts
import CustomerLayout from '../layouts/CustomerLayout';
import FocusLayout from '../layouts/FocusLayout';
import AdminLayout from '../layouts/AdminLayout';

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
import DashboardPage from '../pages/admin/DashboardPage';
import PesananAdminPage from '../pages/admin/PesananAdminPage';
import DetailPesananAdminPage from '../pages/admin/DetailPesananAdminPage';
import KalenderPage from '../pages/admin/KalenderPage';
import ProdukAdminPage from '../pages/admin/ProdukAdminPage';
import StokPage from '../pages/admin/StokPage';
import LaporanPage from '../pages/admin/LaporanPage';
import PromoPage from '../pages/admin/PromoPage';
import PelangganPage from '../pages/admin/PelangganPage';
import PengaturanPage from '../pages/admin/PengaturanPage';

// ── Halaman Dev (hanya development) ─────────────────────────────────────────
import DesignSystemPage from '../pages/dev/DesignSystemPage';

export default function AppRoutes() {
  return (
    <Routes>

      {/* ── Auth / Onboarding (standalone, tanpa layout utama) ─────────────── */}
      <Route path="/onboarding" element={<OnboardingPage />} />

      {/* Auth menggunakan FocusLayout */}
      <Route element={<FocusLayout />}>
        <Route path="/masuk" element={<MasukPage />} />
        <Route path="/daftar" element={<DaftarPage />} />
        <Route path="/lupa-sandi" element={<LupaSandiPage />} />
      </Route>

      {/* ── Halaman Pelanggan — CustomerLayout (bottom nav) ──────────────── */}
      <Route element={<CustomerLayout />}>
        <Route index element={<BerandaPage />} />              {/* C-05 / */}
        <Route path="/katalog" element={<KatalogPage />} />    {/* C-06 + C-07 */}
        <Route path="/cari" element={<CariPage />} />          {/* C-08 */}
        <Route path="/pesanan" element={<RiwayatPesananPage />} />  {/* C-17 */}
        <Route path="/akun" element={<AkunPage />} />          {/* C-20 */}
      </Route>

      {/* ── Halaman Pelanggan — FocusLayout (tanpa bottom nav) ──────────── */}
      <Route element={<FocusLayout />}>
        {/* Produk */}
        <Route path="/produk/:id" element={<DetailProdukPage />} />         {/* C-09 */}
        <Route path="/produk/:id/ulasan" element={<UlasanProdukPage />} />  {/* C-10 */}

        {/* Custom Cake */}
        <Route path="/custom-cake" element={<CustomCakePage />} />          {/* C-11 */}

        {/* Alur pembelian */}
        <Route path="/keranjang" element={<KeranjangPage />} />             {/* C-12 */}
        <Route path="/checkout" element={<CheckoutPage />} />               {/* C-13 */}
        <Route path="/checkout/pembayaran" element={<PembayaranPage />} />  {/* C-14 */}
        <Route path="/bayar/:orderNumber" element={<BayarPage />} />        {/* C-15 */}
        <Route path="/pesanan-berhasil/:orderNumber" element={<PesananBerhasilPage />} /> {/* C-16 */}

        {/* Detail pesanan */}
        <Route path="/pesanan/:orderNumber" element={<DetailPesananPage />} />          {/* C-18 */}
        <Route path="/pesanan/:orderNumber/ulasan" element={<FormUlasanPage />} />      {/* C-19 */}

        {/* Sub-akun */}
        <Route path="/akun/ubah-profil" element={<UbahProfilPage />} />    {/* C-20b */}
        <Route path="/akun/voucher-poin" element={<VoucherPoinPage />} />  {/* C-21 */}
        <Route path="/akun/alamat" element={<AlamatPage />} />             {/* C-22 */}
        <Route path="/akun/wishlist" element={<WishlistPage />} />         {/* C-23 */}
        <Route path="/notifikasi" element={<NotifikasiPage />} />          {/* C-24 */}
      </Route>

      {/* ── Admin — standalone login ─────────────────────────────────────── */}
      <Route path="/admin/login" element={<AdminLoginPage />} />   {/* AD-01 */}

      {/* ── Admin — AdminLayout (sidebar) ───────────────────────────────── */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard"  element={<DashboardPage />} />             {/* AD-02 */}
        <Route path="pesanan"    element={<PesananAdminPage />} />          {/* AD-03 */}
        <Route path="pesanan/:orderNumber" element={<DetailPesananAdminPage />} />  {/* AD-04 */}
        <Route path="kalender"   element={<KalenderPage />} />              {/* AD-05 */}
        <Route path="produk"     element={<ProdukAdminPage />} />           {/* AD-06 */}
        <Route path="stok"       element={<StokPage />} />                  {/* AD-07 */}
        <Route path="laporan"    element={<LaporanPage />} />               {/* AD-08 */}
        <Route path="promo"      element={<PromoPage />} />                 {/* AD-09 */}
        <Route path="pelanggan"  element={<PelangganPage />} />             {/* AD-10 */}
        <Route path="pengaturan" element={<PengaturanPage />} />            {/* AD-11 */}
      </Route>

      {/* ── Dev only ─────────────────────────────────────────────────────── */}
      <Route path="/dev/design" element={<DesignSystemPage />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
