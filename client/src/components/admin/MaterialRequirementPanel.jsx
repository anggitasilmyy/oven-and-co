// components/admin/MaterialRequirementPanel.jsx
// CR-03 CP7 · FR-40 · UC-32 · BR-14 – BR-16 · AD-07 tab "Kebutuhan Bahan" (§B8): pemilih "Hitung sampai tanggal"
// (hari ini s.d. hari ini + 29, WIB, dari `window` API), judul "Stok dialokasikan <dari> – <s.d.>", ringkasan status,
// peringatan produk tanpa komposisi (E-7), teks keterangan wajib K-14 (selalu tampil), tabel/kartu per bahan.
// Semua angka & batas tanggal berasal dari respons API/mock — tanpa perhitungan kedua di frontend.

import { useState } from 'react';
import { AlertTriangle, Info, Wheat } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import Skeleton from '../ui/Skeleton';
import FormField from './FormField';
import { fieldClass } from './fieldClass';
import MaterialRequirementTable from './MaterialRequirementTable';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getMaterialRequirements } from '../../services/stockService';
import { MATERIAL_DEMAND_STATUS_META, MATERIAL_REQUIREMENT_NOTE } from '../../constants/recipe';
import { formatDateShort, formatNumber } from '../../utils/format';
import { parseDateKey } from '../../utils/date';

const dayLabel = (key) => formatDateShort(parseDateKey(key));

export default function MaterialRequirementPanel() {
  const [date, setDate] = useState(''); // kosong = hari ini (ditentukan server, WIB)
  const query = useServiceQuery(() => getMaterialRequirements(date), [date]);
  const data = query.data;

  return (
    <div className="space-y-4">
      <div className="card-admin flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
        <FormField id="requirement-date" label="Hitung sampai tanggal" className="sm:w-64"
          hint={data ? `Pilih ${dayLabel(data.window.from)} – ${dayLabel(data.window.to)}` : undefined}>
          <input
            type="date"
            className={fieldClass()}
            value={date || data?.date || ''}
            min={data?.window.from}
            max={data?.window.to}
            disabled={!data && !query.error}
            onChange={(e) => setDate(e.target.value)}
          />
        </FormField>
        {date && <Button variant="secondary" size="sm" onClick={() => setDate('')}>Kembali ke hari ini</Button>}
      </div>

      <p className="flex items-start gap-2 rounded-btn border border-beige bg-surface px-4 py-3 text-sm text-cocoa" role="note" aria-label="Keterangan estimasi">
        <Info size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <span>{MATERIAL_REQUIREMENT_NOTE}</span>
      </p>

      {query.error && (
        <ErrorState message={query.error.message || 'Kebutuhan bahan gagal dimuat.'} onRetry={query.reload} />
      )}
      {!query.error && !data && (
        <div className="card-admin space-y-3 p-4" aria-busy="true" aria-label="Memuat kebutuhan bahan">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} variant="block" className="h-14 w-full" />)}
        </div>
      )}
      {!query.error && data && (
        <section aria-label="Hasil kebutuhan bahan" aria-busy={query.loading} className={`space-y-4 transition-opacity ${query.loading ? 'opacity-60' : ''}`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-serif text-lg font-semibold text-cocoa">
              Stok dialokasikan {dayLabel(data.cumulative_range.from)} – {dayLabel(data.cumulative_range.to)}
            </h2>
            <ul className="flex flex-wrap gap-2 text-sm" aria-label="Ringkasan status kebutuhan">
              {Object.entries(MATERIAL_DEMAND_STATUS_META).map(([key, meta]) => (
                <li key={key}><Badge variant={meta.variant}>{meta.label}: {data.summary[key]}</Badge></li>
              ))}
            </ul>
          </div>
          {data.products_without_recipe.length > 0 && (
            <div role="status" className="rounded-btn border border-peach bg-peach/30 px-4 py-3 text-sm text-cocoa">
              <p className="flex items-start gap-2 font-semibold">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
                {data.products_without_recipe.length} produk belum punya komposisi dan tidak dihitung
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-9 text-xs" aria-label="Produk belum punya komposisi">
                {data.products_without_recipe.map((p) => (
                  <li key={p.product_id}>
                    {p.name ?? `Produk #${p.product_id}`} — {dayLabel(data.date)}: {formatNumber(p.daily_quantity)} pcs · total s.d. {dayLabel(data.date)}: {formatNumber(p.cumulative_quantity)} pcs
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.rows.length === 0 ? (
            <div className="card-admin">
              <EmptyState icon={<Wheat size={32} aria-hidden="true" />} title="Belum ada bahan baku" description="Tambahkan bahan baku di tab Bahan Baku agar kebutuhannya dapat dihitung." />
            </div>
          ) : (
            <MaterialRequirementTable rows={data.rows} dateLabel={dayLabel(data.date)} />
          )}
        </section>
      )}
    </div>
  );
}
