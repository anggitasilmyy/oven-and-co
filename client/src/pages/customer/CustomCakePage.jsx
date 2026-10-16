// pages/customer/CustomCakePage.jsx
// FR-10 · UC-06 · BR-02 · C-11 Custom Cake Builder (6 langkah)
// Step 5.2: stepper 6 langkah (Ukuran → Bentuk → Rasa → Krim & Topping → Tulisan → Tanggal), preview kue,
// harga berjalan (harga dasar + Σ extra_price), tanggal ≥ H+3, ringkasan dengan Ubah, Tambah ke Keranjang.
// FocusPageGrid + ActionBar: < lg bar bawah · ≥ lg panel aksi sticky di kanan.

import { CakeSlice } from 'lucide-react';
import FocusPageGrid from '../../components/layout/FocusPageGrid';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import Toast, { useToast } from '../../components/ui/Toast';
import CustomCakeBuilder from '../../components/customer/CustomCakeBuilder';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getCustomCakeBuilder } from '../../services/customCakeService';

export default function CustomCakePage() {
  const query = useServiceQuery(() => getCustomCakeBuilder(), []);
  const { toast, showToast, hideToast } = useToast();

  let body;
  if (query.error) {
    body = <div className="page-container py-6"><ErrorState message="Custom Cake Builder gagal dimuat." onRetry={query.reload} /></div>;
  } else if (query.loading && !query.data) {
    body = (
      <FocusPageGrid aside={<div className="hidden lg:block card p-6"><Skeleton count={3} /></div>}>
        <div className="space-y-5" aria-busy="true" aria-label="Memuat Custom Cake Builder">
          <Skeleton count={2} />
          <Skeleton variant="block" className="h-16 w-full rounded-card" />
          <Skeleton variant="block" className="aspect-[4/3] md:aspect-[16/7] w-full rounded-card" />
          <Skeleton count={3} />
        </div>
      </FocusPageGrid>
    );
  } else if (!query.data) {
    body = (
      <div className="page-container py-10">
        <div className="card">
          <EmptyState
            icon={<CakeSlice size={36} aria-hidden="true" />}
            title="Custom cake belum tersedia"
            description="Saat ini custom cake sedang tidak dibuka. Coba lagi nanti."
          />
        </div>
      </div>
    );
  } else {
    body = <CustomCakeBuilder builder={query.data} notify={showToast} />;
  }

  return (
    <>
      {body}
      <Toast {...toast} onClose={hideToast} />
    </>
  );
}
