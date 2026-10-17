// components/admin/PaymentMethodDonut.jsx
// Step 5.8 · FR-33 · AD-08 — donut metode pembayaran + legenda berlabel (jumlah transaksi & omzet, tidak hanya warna)

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { PAYMENT_GROUP_CHART_COLOR } from '../../constants/report';
import { formatNumber, formatRupiah } from '../../utils/format';

// Metode dalam kelompok yang sama dibedakan dengan opasitas agar tetap memakai palet brand
const OPACITY_STEPS = [1, 0.72, 0.5, 0.34];

/** @param {Array<{method_code, name, method_group, transactions, revenue}>} methods */
export default function PaymentMethodDonut({ methods }) {
  if (!methods.length) return <p className="text-sm text-cocoa/70">Belum ada transaksi lunas pada periode ini.</p>;
  const seen = {};
  const data = methods.map((m) => {
    const index = (seen[m.method_group] = (seen[m.method_group] ?? -1) + 1);
    return { ...m, color: PAYMENT_GROUP_CHART_COLOR[m.method_group] ?? '#5C3D2E', opacity: OPACITY_STEPS[index % OPACITY_STEPS.length] };
  });
  const total = methods.reduce((s, m) => s + m.transactions, 0);

  return (
    <div className="grid items-center gap-4 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-8 xl:grid-cols-1 xl:gap-4">
      <div className="relative mx-auto h-40 w-40" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="transactions" nameKey="name" innerRadius="62%" outerRadius="100%" stroke="#fff" strokeWidth={2} isAnimationActive={false}>
              {data.map((d) => <Cell key={d.method_code} fill={d.color} fillOpacity={d.opacity} />)}
            </Pie>
            <Tooltip formatter={(v, name) => [`${v} transaksi`, name]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-cocoa">{formatNumber(total)}</span>
          <span className="text-[11px] text-cocoa/70">transaksi</span>
        </div>
      </div>
      <ul className="min-w-0 space-y-1" aria-label="Transaksi per metode pembayaran">
        {data.map((d) => (
          <li key={d.method_code} className="flex min-h-[36px] items-center gap-2.5 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color, opacity: d.opacity }} />
            <span className="min-w-0 flex-1 truncate text-cocoa/80">{d.name}</span>
            <span className="shrink-0 text-xs tabular-nums text-cocoa/65">{formatRupiah(d.revenue)}</span>
            <span className="w-8 shrink-0 text-right font-semibold tabular-nums text-cocoa">{d.transactions}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
