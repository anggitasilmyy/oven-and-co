// components/admin/DashboardKpis.jsx
// Step 4 · FR-27 · AD-02 — tepat 4 KPI: omzet hari ini, jumlah pesanan, perlu diproses, rating rata-rata
// Grid 2 kolom < 1280 px (konten admin di samping sidebar terlalu sempit untuk 4 angka Rupiah), 4 kolom ≥ 1280 px.

import { ArrowDownRight, ArrowUpRight, ClipboardList, Star, Timer, Wallet } from 'lucide-react';
import ResponsiveGrid from '../layout/ResponsiveGrid';
import KpiCard from './KpiCard';
import { ADMIN_ROUTES } from '../../constants/routes';
import { formatNumber, formatRupiah } from '../../utils/format';

function ChangeHint({ change }) {
  if (change == null) return <span>Belum ada pembanding kemarin</span>;
  const up = change >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center font-semibold ${up ? 'text-green-700' : 'text-error'}`}>
        <Icon size={14} aria-hidden="true" />
        {up ? '+' : ''}{change}%
      </span>
      vs kemarin
    </span>
  );
}

/** @param {{revenueToday, revenueChange, ordersToday, needsProcessing, rating}} kpi */
export default function DashboardKpis({ kpi }) {
  return (
    <ResponsiveGrid cols={{ base: 2, xl: 4 }} gap="md">
      <KpiCard icon={Wallet} label="Omzet Hari Ini" value={formatRupiah(kpi.revenueToday)} hint={<ChangeHint change={kpi.revenueChange} />} />
      <KpiCard
        icon={ClipboardList}
        label="Pesanan Hari Ini"
        value={formatNumber(kpi.ordersToday)}
        hint="Semua status, dibuat hari ini"
        tone="bg-blue-50 text-blue-700"
      />
      <KpiCard
        icon={Timer}
        label="Perlu Diproses"
        value={formatNumber(kpi.needsProcessing)}
        hint="Dikonfirmasi & sedang disiapkan"
        tone="bg-orange-50 text-orange-700"
        to={ADMIN_ROUTES.PESANAN}
      />
      <KpiCard
        icon={Star}
        label="Rating Rata-rata"
        value={kpi.rating.average != null ? kpi.rating.average.toLocaleString('id-ID', { minimumFractionDigits: 1 }) : '–'}
        hint={`dari ${formatNumber(kpi.rating.count)} ulasan`}
        tone="bg-yellow-50 text-yellow-700"
      />
    </ResponsiveGrid>
  );
}
