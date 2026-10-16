// components/admin/OrderFilters.jsx
// Step 4 · FR-28 · AD-03 — filter: cari nomor pesanan, rentang tanggal pesan, Pickup/Delivery, metode bayar
// < lg: filter tambahan bisa dibuka-tutup agar daftar tetap terlihat.

import { useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import Button from '../ui/Button';
import { FULFILLMENT_LABEL, FULFILLMENT_TYPE } from '../../constants/orderStatus';

const fieldClass =
  'h-input w-full rounded-btn border border-beige bg-white px-3 text-sm text-cocoa ' +
  'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary';

/**
 * @param {{search, dateFrom, dateTo, fulfillment, methodCode}} values
 * @param {Function} onChange — (field, value) → void
 * @param {Function} onReset
 * @param {Array} paymentMethods
 */
export default function OrderFilters({ values, onChange, onReset, paymentMethods }) {
  const [open, setOpen] = useState(false);
  const activeCount = ['dateFrom', 'dateTo', 'fulfillment', 'methodCode'].filter((k) => values[k]).length;
  const field = (name) => ({ value: values[name], onChange: (e) => onChange(name, e.target.value) });

  return (
    <div className="card-admin p-4 space-y-4">
      <div className="flex gap-3">
        <label className="relative flex-1 min-w-0">
          <span className="sr-only">Cari nomor pesanan</span>
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-cocoa/50" aria-hidden="true" />
          <input type="search" placeholder="Cari nomor pesanan, mis. OVC-261016" className={`${fieldClass} pl-10`} {...field('search')} />
        </label>
        <Button
          variant="secondary"
          size="sm"
          className="lg:hidden shrink-0 !h-12"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="order-filter-fields"
          leftIcon={<SlidersHorizontal size={16} aria-hidden="true" />}
        >
          Filter{activeCount ? ` (${activeCount})` : ''}
        </Button>
      </div>

      <div id="order-filter-fields" className={`${open ? 'grid' : 'hidden'} lg:grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end`}>
        <label className="space-y-1 text-xs font-semibold text-cocoa/75">
          <span>Tanggal pesan dari</span>
          <input type="date" className={fieldClass} max={values.dateTo || undefined} {...field('dateFrom')} />
        </label>
        <label className="space-y-1 text-xs font-semibold text-cocoa/75">
          <span>Sampai</span>
          <input type="date" className={fieldClass} min={values.dateFrom || undefined} {...field('dateTo')} />
        </label>
        <label className="space-y-1 text-xs font-semibold text-cocoa/75">
          <span>Pengambilan</span>
          <select className={fieldClass} {...field('fulfillment')}>
            <option value="">Pickup & Delivery</option>
            {Object.values(FULFILLMENT_TYPE).map((f) => <option key={f} value={f}>{FULFILLMENT_LABEL[f]}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold text-cocoa/75">
          <span>Metode pembayaran</span>
          <select className={fieldClass} {...field('methodCode')}>
            <option value="">Semua metode</option>
            {paymentMethods.map((m) => <option key={m.method_code} value={m.method_code}>{m.name}</option>)}
          </select>
        </label>
        <Button variant="ghost" size="sm" onClick={onReset} leftIcon={<X size={16} aria-hidden="true" />} className="!h-12">
          Reset
        </Button>
      </div>
    </div>
  );
}
