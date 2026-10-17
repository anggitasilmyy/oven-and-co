// pages/admin/PesananAdminPage.jsx
// FR-28 · UC-20 · AD-03 Daftar Pesanan (landing Staf; juga Owner)
// Step 4: tab status + jumlah, filter (nomor pesanan, tanggal, Pickup/Delivery, metode bayar), tabel/kartu, halaman.
// Ubah status, verifikasi pickup, tandai lunas, dan cetak struk ada di AD-04 (Step 5.6, tombol Detail).

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import DataTable from '../../components/admin/DataTable';
import OrderCardList from '../../components/admin/OrderCardList';
import OrderFilters from '../../components/admin/OrderFilters';
import OrderStatusTabs from '../../components/admin/OrderStatusTabs';
import Pagination from '../../components/admin/Pagination';
import { ADMIN_ORDER_COLUMNS } from '../../components/admin/orderColumns';
import useServiceQuery from '../../hooks/useServiceQuery';
import useDebounce from '../../hooks/useDebounce';
import { getAdminOrders, getPaymentMethods } from '../../services/adminOrderService';
import { ORDER_STATUS_TABS } from '../../constants/orderStatus';

/** Nama parameter URL ↔ field filter (tab & filter bisa dibagikan/di-refresh) */
const PARAM = { tab: 'tab', dateFrom: 'dari', dateTo: 'sampai', fulfillment: 'ambil', methodCode: 'metode', page: 'hal' };

export default function PesananAdminPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);

  const tabParam = params.get(PARAM.tab);
  const tab = ORDER_STATUS_TABS.some((t) => t.key === tabParam) ? tabParam : ORDER_STATUS_TABS[0].key;
  const filters = {
    dateFrom: params.get(PARAM.dateFrom) ?? '',
    dateTo: params.get(PARAM.dateTo) ?? '',
    fulfillment: params.get(PARAM.fulfillment) ?? '',
    methodCode: params.get(PARAM.methodCode) ?? '',
  };
  const page = Number(params.get(PARAM.page)) || 1;
  const query = { tab, search: debouncedSearch, ...filters, page };

  const orders = useServiceQuery(() => getAdminOrders(query), [query]);
  const methods = useServiceQuery(getPaymentMethods);

  /** Ubah satu parameter; filter apa pun mengembalikan ke halaman 1 */
  const update = (field, value) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value && !(field === 'tab' && value === ORDER_STATUS_TABS[0].key)) next.set(PARAM[field], value);
      else next.delete(PARAM[field]);
      if (field !== 'page') next.delete(PARAM.page);
      return next;
    });
  };
  const handleSearch = (value) => {
    setSearch(value);
    update('page', '');
  };
  const reset = () => {
    setSearch('');
    setParams(tab === ORDER_STATUS_TABS[0].key ? {} : { [PARAM.tab]: tab });
  };

  const data = orders.data;
  const firstRow = data ? (data.page - 1) * data.pageSize + 1 : 0;

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader screenCode="AD-03" title="Daftar Pesanan" description="Pantau pesanan berdasarkan status, tanggal, cara pengambilan, dan metode pembayaran." />

      <OrderFilters
        values={{ search, ...filters }}
        onChange={(field, value) => (field === 'search' ? handleSearch(value) : update(field, value))}
        onReset={reset}
        paymentMethods={methods.data ?? []}
      />

      <OrderStatusTabs active={tab} counts={data?.tabCounts ?? null} onChange={(key) => update('tab', key)} />

      {orders.error && <ErrorState message={orders.error.message || 'Daftar pesanan gagal dimuat.'} onRetry={orders.reload} />}

      {!data && orders.loading && (
        <div className="card-admin p-4 space-y-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="block" className="h-12 w-full" />)}
        </div>
      )}

      {data && (
        <section aria-label="Hasil daftar pesanan" aria-busy={orders.loading} className={`space-y-4 transition-opacity ${orders.loading ? 'opacity-60' : ''}`}>
          <p className="text-sm text-cocoa/70" aria-live="polite">
            {data.totalFiltered
              ? `Menampilkan ${firstRow}–${firstRow + data.rows.length - 1} dari ${data.totalFiltered} pesanan`
              : 'Tidak ada pesanan yang cocok'}
          </p>

          {data.rows.length === 0 ? (
            <div className="card-admin">
              <EmptyState
                icon={<ClipboardList size={32} aria-hidden="true" />}
                title="Pesanan tidak ditemukan"
                description="Ubah tab status atau filter untuk melihat pesanan lain."
                actionLabel="Reset filter"
                onAction={reset}
              />
            </div>
          ) : (
            <>
              <div className="md:hidden">
                <OrderCardList rows={data.rows} />
              </div>
              <div className="hidden md:block card-admin p-1 2xl:p-3">
                <DataTable label="Daftar pesanan" columns={ADMIN_ORDER_COLUMNS} rows={data.rows} rowKey={(r) => r.order_id} minWidth="min-w-[800px]" />
              </div>
            </>
          )}

          <Pagination page={data.page} totalPages={data.totalPages} onChange={(n) => update('page', String(n))} />
        </section>
      )}
    </div>
  );
}
