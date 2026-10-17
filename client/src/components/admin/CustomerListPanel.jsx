// components/admin/CustomerListPanel.jsx
// Step 5.8 · FR-35 · UC-25 · AD-10 — tabel pelanggan: nama, HP, total pesanan, total belanja, level member,
// pesanan terakhir (UI/UX Spec Batch 7) + pencarian. Tabel ≥ md, kartu < md, paginasi.

import { useState } from 'react';
import { Search, Users } from 'lucide-react';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import DataTable from './DataTable';
import Pagination from './Pagination';
import { fieldClass } from './fieldClass';
import { filterCustomers } from '../../utils/businessRules';
import { CUSTOMERS_PAGE_SIZE } from '../../constants/adminCustomer';
import { formatRupiah, formatNumber, formatDateShort } from '../../utils/format';

const level = (c) => <Badge variant={c.level.badge}>{c.level.label}</Badge>;
const lastOrder = (c) => (c.last_order_at ? formatDateShort(c.last_order_at) : 'Belum pernah');
const COLUMNS = [
  { key: 'name', header: 'Pelanggan', className: 'min-w-[180px]', render: (c) => <><span className="font-semibold">{c.name}</span><span className="block text-xs text-cocoa/65">{c.email}</span></> },
  { key: 'phone', header: 'No. HP', className: 'whitespace-nowrap tabular-nums' },
  { key: 'total_orders', header: 'Total Pesanan', align: 'right', className: 'tabular-nums', render: (c) => formatNumber(c.total_orders) },
  { key: 'total_spend', header: 'Total Belanja', align: 'right', className: 'whitespace-nowrap font-semibold tabular-nums', render: (c) => formatRupiah(c.total_spend) },
  { key: 'level', header: 'Level', render: level },
  { key: 'last_order_at', header: 'Pesanan Terakhir', className: 'whitespace-nowrap', render: lastOrder },
];

/** @param {Array} rows — getAdminCustomers() */
export default function CustomerListPanel({ rows }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const filtered = filterCustomers(rows, query);
  const totalPages = Math.max(1, Math.ceil(filtered.length / CUSTOMERS_PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const visible = filtered.slice((current - 1) * CUSTOMERS_PAGE_SIZE, current * CUSTOMERS_PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label htmlFor="customer-search" className="relative block w-full sm:max-w-sm">
          <span className="sr-only">Cari pelanggan</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cocoa/50" aria-hidden="true" />
          <input
            id="customer-search"
            type="search"
            placeholder="Cari nama, email, atau nomor HP"
            className={`${fieldClass()} pl-9`}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          />
        </label>
        <p className="text-sm tabular-nums text-cocoa/70" aria-live="polite">{formatNumber(filtered.length)} dari {formatNumber(rows.length)} pelanggan</p>
      </div>

      {visible.length === 0 ? (
        <div className="card-admin">
          <EmptyState icon={<Users size={32} aria-hidden="true" />} title={rows.length ? 'Pelanggan tidak ditemukan' : 'Belum ada pelanggan'}
            description={rows.length ? 'Coba kata kunci lain.' : 'Pelanggan yang mendaftar akan tampil di sini.'} />
        </div>
      ) : (
        <>
          <ul className="space-y-3 md:hidden" aria-label="Daftar pelanggan">
            {visible.map((c) => (
              <li key={c.user_id} className="card-admin space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="font-semibold text-cocoa">{c.name}</p><p className="text-xs tabular-nums text-cocoa/70">{c.phone}</p></div>
                  {level(c)}
                </div>
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-cocoa/60">Pesanan</dt><dd className="font-semibold tabular-nums text-cocoa">{formatNumber(c.total_orders)}</dd></div>
                  <div><dt className="text-cocoa/60">Belanja</dt><dd className="font-semibold tabular-nums text-cocoa">{formatRupiah(c.total_spend)}</dd></div>
                  <div><dt className="text-cocoa/60">Terakhir</dt><dd className="font-semibold text-cocoa">{lastOrder(c)}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
          <div className="card-admin hidden p-1 md:block 2xl:p-3">
            <DataTable label="Daftar pelanggan" columns={COLUMNS} rows={visible} rowKey={(c) => c.user_id} minWidth="min-w-[860px]" />
          </div>
          <Pagination page={current} totalPages={totalPages} onChange={setPage} label="Halaman daftar pelanggan" />
        </>
      )}
    </div>
  );
}
