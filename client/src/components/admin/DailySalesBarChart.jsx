// components/admin/DailySalesBarChart.jsx
// Step 5.8 · FR-33 · AD-08 — grafik batang omzet per hari (Recharts) + tabel tersembunyi untuk pembaca layar
// UI/UX Spec Batch 7: "Bar chart sales per day". Satu seri → tanpa legenda.

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatRupiah, formatDate } from '../../utils/format';
import { parseDateKey } from '../../utils/date';

const tickDate = (key) => parseDateKey(key).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
const compactRupiah = (v) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt` : `${Math.round(v / 1000)} rb`;

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-xl border border-beige bg-white px-3 py-2 text-xs text-cocoa shadow-lg">
      <p className="font-semibold">{formatDate(parseDateKey(point.date))}</p>
      <p className="mt-1 tabular-nums">Omzet: <strong>{formatRupiah(point.revenue)}</strong></p>
      <p className="tabular-nums text-cocoa/70">{point.orders} transaksi lunas</p>
    </div>
  );
}

/** @param {Array<{date, revenue, orders}>} data */
export default function DailySalesBarChart({ data }) {
  return (
    <>
      <div className="h-56 w-full min-w-0 md:h-72" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#F1E6D6" />
            <XAxis dataKey="date" tickFormatter={tickDate} tickLine={false} axisLine={false} minTickGap={12} tick={{ fill: '#7a5240', fontSize: 12 }} />
            <YAxis tickFormatter={compactRupiah} tickLine={false} axisLine={false} width={48} tick={{ fill: '#7a5240', fontSize: 12 }} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: '#F1E6D6', opacity: 0.5 }} />
            <Bar dataKey="revenue" fill="#8B5E3C" radius={[6, 6, 0, 0]} maxBarSize={44} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Dibungkus div: <table class="sr-only"> tetap melebar mengikuti isi dan membuat overflow di 360 px */}
      <div className="sr-only">
      <table>
        <caption>Omzet per hari</caption>
        <thead><tr><th>Tanggal</th><th>Omzet</th><th>Transaksi lunas</th></tr></thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}><td>{formatDate(parseDateKey(d.date))}</td><td>{formatRupiah(d.revenue)}</td><td>{d.orders}</td></tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
