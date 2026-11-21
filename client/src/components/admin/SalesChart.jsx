// components/admin/SalesChart.jsx
// Step 4 · FR-27 · AD-02 — grafik omzet 7 hari (Recharts), satu seri → tanpa legenda
// Garis Soft Brown + area Caramel (PRD Batch 6); tabel tersembunyi untuk pembaca layar.

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatRupiah, formatDate } from '../../utils/format';
import { parseDateKey } from '../../utils/date';
import { CHART_COLOR } from '../../constants/chartColors';

const shortDay = (key) => parseDateKey(key).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' });

/** 1.750.000 → "1,8 jt" */
const compactRupiah = (v) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt` : `${Math.round(v / 1000)} rb`;

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-xl border border-beige bg-white px-3 py-2 shadow-lg text-xs text-cocoa">
      <p className="font-semibold">{formatDate(parseDateKey(point.date))}</p>
      <p className="mt-1 tabular-nums">Omzet: <strong>{formatRupiah(point.revenue)}</strong></p>
      <p className="tabular-nums text-cocoa-muted">{point.orders} transaksi lunas</p>
    </div>
  );
}

/** @param {Array<{date, revenue, orders}>} data */
export default function SalesChart({ data }) {
  return (
    <>
      <div className="h-56 md:h-72 w-full min-w-0" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLOR.caramel} stopOpacity={0.45} />
                <stop offset="100%" stopColor={CHART_COLOR.caramel} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={CHART_COLOR.grid} />
            <XAxis dataKey="date" tickFormatter={shortDay} tickLine={false} axisLine={false} tick={{ fill: CHART_COLOR.axis, fontSize: 12 }} />
            <YAxis tickFormatter={compactRupiah} tickLine={false} axisLine={false} width={48} tick={{ fill: CHART_COLOR.axis, fontSize: 12 }} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: CHART_COLOR.primary, strokeDasharray: '4 4' }} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke={CHART_COLOR.primary}
              strokeWidth={2}
              fill="url(#salesFill)"
              dot={{ r: 4, fill: CHART_COLOR.primary, stroke: CHART_COLOR.white, strokeWidth: 2 }}
              activeDot={{ r: 6, fill: CHART_COLOR.primary, stroke: CHART_COLOR.white, strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {/* Step 8 · F-03: dibungkus div sr-only (pola DailySalesBarChart) — <table class="sr-only"> tetap melebar mengikuti
          isi sehingga menimbulkan overflow horizontal 14 px di 360 px */}
      <div className="sr-only">
        <table>
          <caption>Omzet 7 hari terakhir</caption>
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
