// components/admin/ReportTransactionsTable.jsx
// Step 5.8 · FR-33 · AD-08 — tabel transaksi lunas periode terpilih (tabel ≥ md, kartu < md) + paginasi
// Nomor pesanan menautkan ke Detail Pesanan AD-04.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable from './DataTable';
import Pagination from './Pagination';
import { orderDetailPath } from './orderColumns';
import { FULFILLMENT_LABEL } from '../../constants/orderStatus';
import { REPORT_TRANSACTIONS_PAGE_SIZE } from '../../constants/report';
import { formatRupiah, formatDateShort, formatTime, formatNumber } from '../../utils/format';

const orderLink = (r) => (
  <Link to={orderDetailPath(r.order_number)} className="inline-flex min-h-touch-min items-center rounded font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
    {r.order_number}
  </Link>
);
const when = (r) => `${formatDateShort(r.created_at)}, ${formatTime(r.created_at)}`;

const COLUMNS = [
  { key: 'order_number', header: 'No. Pesanan', className: 'whitespace-nowrap', render: orderLink },
  { key: 'created_at', header: 'Tanggal', className: 'whitespace-nowrap tabular-nums', render: when },
  { key: 'customer_name', header: 'Pelanggan', className: 'min-w-[140px]' },
  { key: 'fulfillment_type', header: 'Pengambilan', render: (r) => FULFILLMENT_LABEL[r.fulfillment_type] },
  { key: 'method_name', header: 'Metode Bayar', className: 'whitespace-nowrap' },
  { key: 'item_count', header: 'Item', align: 'right', className: 'tabular-nums', render: (r) => formatNumber(r.item_count) },
  { key: 'total', header: 'Total', align: 'right', className: 'whitespace-nowrap font-semibold tabular-nums', render: (r) => formatRupiah(r.total) },
];

/** @param {Array} rows — report.transactions */
export default function ReportTransactionsTable({ rows }) {
  const [page, setPage] = useState(1);
  if (!rows.length) return <p className="text-sm text-cocoa/70">Belum ada transaksi lunas pada periode ini.</p>;
  const totalPages = Math.ceil(rows.length / REPORT_TRANSACTIONS_PAGE_SIZE);
  const current = Math.min(page, totalPages);
  const visible = rows.slice((current - 1) * REPORT_TRANSACTIONS_PAGE_SIZE, current * REPORT_TRANSACTIONS_PAGE_SIZE);

  return (
    <div className="space-y-4">
      <ul className="space-y-3 md:hidden" aria-label="Transaksi lunas">
        {visible.map((r) => (
          <li key={r.order_id} className="rounded-xl border border-beige p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              {orderLink(r)}
              <span className="font-semibold tabular-nums text-cocoa">{formatRupiah(r.total)}</span>
            </div>
            <p className="mt-1 text-xs text-cocoa/70">{r.customer_name} · {when(r)}</p>
            <p className="text-xs text-cocoa/70">{FULFILLMENT_LABEL[r.fulfillment_type]} · {r.method_name} · {r.item_count} item</p>
          </li>
        ))}
      </ul>
      <DataTable className="hidden md:block" label="Transaksi lunas" columns={COLUMNS} rows={visible} rowKey={(r) => r.order_id} minWidth="min-w-[820px]" />
      <Pagination page={current} totalPages={totalPages} onChange={setPage} label="Halaman transaksi" />
      <p className="text-xs text-cocoa/65 tabular-nums">{formatNumber(rows.length)} transaksi lunas</p>
    </div>
  );
}
