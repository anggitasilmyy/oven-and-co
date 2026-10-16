// components/admin/OrderStatusDonut.jsx
// Step 4 · FR-27 · AD-02 — donut pesanan per status + legenda berlabel & jumlah (tidak hanya warna)
// Setiap baris legenda menautkan ke tab status yang sama di AD-03.

import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  ORDER_STATUS, ORDER_STATUS_LABEL, ORDER_STATUS_CHART_COLOR, ORDER_STATUS_TABS,
} from '../../constants/orderStatus';
import { ADMIN_ROUTES } from '../../constants/routes';
import { formatNumber } from '../../utils/format';

const tabFor = (status) => ORDER_STATUS_TABS.find((t) => t.statuses.includes(status))?.key;

/** @param {Record<string, number>} counts — jumlah per status; @param {number} total */
export default function OrderStatusDonut({ counts, total }) {
  const data = Object.values(ORDER_STATUS).map((status) => ({
    status, label: ORDER_STATUS_LABEL[status], value: counts[status] ?? 0,
  }));

  return (
    <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-8 xl:grid-cols-1 xl:gap-4 items-center">
      <div className="relative h-40 w-40 mx-auto" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data.filter((d) => d.value > 0)}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="100%"
              stroke="#fff"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.filter((d) => d.value > 0).map((d) => (
                <Cell key={d.status} fill={ORDER_STATUS_CHART_COLOR[d.status]} />
              ))}
            </Pie>
            <Tooltip formatter={(v, name) => [`${v} pesanan`, name]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-cocoa tabular-nums">{formatNumber(total)}</span>
          <span className="text-[11px] text-cocoa/70">pesanan</span>
        </div>
      </div>

      <ul className="space-y-0.5 min-w-0" aria-label="Jumlah pesanan per status">
        {data.map((d) => (
          <li key={d.status}>
            <Link
              to={`${ADMIN_ROUTES.PESANAN}?tab=${tabFor(d.status)}`}
              className="flex items-center gap-2.5 min-h-[36px] px-2 -mx-2 rounded-lg text-sm hover:bg-cream
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ORDER_STATUS_CHART_COLOR[d.status] }} />
              <span className="flex-1 min-w-0 truncate text-cocoa/80">{d.label}</span>
              <span className="font-semibold text-cocoa tabular-nums">{d.value}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
