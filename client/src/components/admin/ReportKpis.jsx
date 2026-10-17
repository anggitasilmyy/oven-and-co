// components/admin/ReportKpis.jsx
// Step 5.8 · FR-33 · AD-08 — 4 KPI laporan: Omzet, Jumlah Transaksi, Rata-rata per Transaksi, Produk Terjual
// Grid 2 kolom < 1280 px, 4 kolom ≥ 1280 px (sama dengan KPI Dashboard).

import { Package, Receipt, Calculator, Wallet } from 'lucide-react';
import ResponsiveGrid from '../layout/ResponsiveGrid';
import KpiCard from './KpiCard';
import { formatNumber, formatRupiah } from '../../utils/format';

/** @param {{revenue, transactions, average, itemsSold}} kpi */
export default function ReportKpis({ kpi }) {
  return (
    <ResponsiveGrid cols={{ base: 2, xl: 4 }} gap="md">
      <KpiCard icon={Wallet} label="Omzet" value={formatRupiah(kpi.revenue)} hint="Pesanan lunas, tidak dibatalkan" />
      <KpiCard icon={Receipt} label="Jumlah Transaksi" value={formatNumber(kpi.transactions)} hint="Transaksi lunas" tone="bg-blue-50 text-blue-700" />
      <KpiCard icon={Calculator} label="Rata-rata per Transaksi" value={formatRupiah(kpi.average)} hint="Omzet ÷ transaksi" tone="bg-orange-50 text-orange-700" />
      <KpiCard icon={Package} label="Produk Terjual" value={formatNumber(kpi.itemsSold)} hint="Jumlah item dari transaksi lunas" tone="bg-green-50 text-green-700" />
    </ResponsiveGrid>
  );
}
