// pages/admin/KalenderPage.jsx
// FR-29 · UC-22 · BR-02 · BR-03 · AD-05 Kalender Produksi (Staf & Owner)
// Step 5.6: kalender bulanan dengan jumlah pesanan pre-order & custom cake per tanggal siap, panel daftar produksi
// tanggal terpilih (per produk, jumlah, nomor pesanan). Data dari pesanan tersimpan; bulan & tanggal disimpan di URL
// (?bulan=YYYY-MM&tanggal=YYYY-MM-DD, kosong = hari ini). Layout: < lg kalender lalu daftar; ≥ lg daftar di panel kanan.

import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import ProductionCalendarGrid from '../../components/admin/ProductionCalendarGrid';
import ProductionDayPanel from '../../components/admin/ProductionDayPanel';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getProductionCalendar } from '../../services/adminOrderService';
import { monthKeyOf, shiftMonthKey } from '../../utils/businessRules';

const valid = (value, re) => (re.test(value ?? '') ? value : null);

export default function KalenderPage() {
  const [params, setParams] = useSearchParams();
  const monthParam = valid(params.get('bulan'), /^\d{4}-\d{2}$/);
  const dateParam = valid(params.get('tanggal'), /^\d{4}-\d{2}-\d{2}$/);
  const query = useServiceQuery(() => getProductionCalendar(monthParam, dateParam), [monthParam, dateParam]);
  const data = query.data;

  const select = (date) => setParams({ bulan: monthKeyOf(date), tanggal: date });
  // Bulan dari URL lebih dulu: klik cepat beruntun tetap bergeser walau data bulan sebelumnya belum selesai dimuat
  const shiftMonth = (delta) => setParams({ bulan: shiftMonthKey(monthParam ?? data.month_key, delta) });
  const goToday = () => setParams({});

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader screenCode="AD-05" title="Kalender Produksi" description="Pesanan pre-order dan custom cake yang perlu disiapkan, dikelompokkan berdasarkan tanggal siap." />

      {query.error && <ErrorState message={query.error.message || 'Kalender gagal dimuat.'} onRetry={query.reload} />}

      {!data && !query.error && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]" aria-busy="true" aria-label="Memuat kalender">
          <Skeleton variant="block" className="h-[420px] w-full rounded-card-admin" />
          <Skeleton variant="block" className="h-[320px] w-full rounded-card-admin" />
        </div>
      )}

      {data && (
        <div className={`grid gap-5 lg:gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_400px] lg:items-start transition-opacity ${query.loading ? 'opacity-60' : ''}`} aria-busy={query.loading}>
          <ProductionCalendarGrid calendar={data} selectedDate={data.selected.date} onSelect={select} onShiftMonth={shiftMonth} onToday={goToday} />
          <div className="lg:sticky lg:top-24">
            <ProductionDayPanel date={data.selected.date} groups={data.selected.groups} />
          </div>
        </div>
      )}
    </div>
  );
}
