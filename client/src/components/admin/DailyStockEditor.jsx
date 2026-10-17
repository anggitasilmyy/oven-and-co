// components/admin/DailyStockEditor.jsx
// Step 5.7 · FR-32 · UC-24 · BR-01 · AD-07 — tab "Stok Produk Harian": produk, rencana, terjual, sisa, status.
// Admin mengisi rencana (qty_planned) produk ready hari ini; terjual dihitung dari pesanan (TF-12) dan tidak diubah.
// Satu daftar responsif: baris tabel di ≥ md, kartu di < md (input tidak diduplikasi).

import { useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import FormError from '../ui/FormError';
import ProductImage from '../ui/ProductImage';
import { fieldClass } from './fieldClass';
import { validateDailyPlan, getDailyStockStatus } from '../../utils/businessRules';
import { DAILY_STOCK_STATUS } from '../../constants/adminCatalog';
import { formatNumber } from '../../utils/format';

const STATUS_BY_KEY = Object.fromEntries(Object.values(DAILY_STOCK_STATUS).map((s) => [s.key, s]));
const GRID = 'md:grid md:grid-cols-[minmax(0,1fr)_150px_88px_88px_120px] md:items-center md:gap-4';

/**
 * @param {Array} rows — dari getDailyStocks
 * @param {Function} onSave — async (plans) → lempar Error (dengan fieldErrors) bila ditolak
 */
export default function DailyStockEditor({ rows, onSave }) {
  const [drafts, setDrafts] = useState({}); // { product_id: string }
  const [serverErrors, setServerErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const changed = rows.filter((r) => drafts[r.product_id] != null && String(drafts[r.product_id]) !== String(r.qty_planned));
  const errorOf = (r) => serverErrors[r.product_id]
    || (drafts[r.product_id] != null ? validateDailyPlan(drafts[r.product_id], r.qty_sold) : null);
  const hasErrors = changed.some((r) => errorOf(r));

  const save = async () => {
    if (!changed.length || hasErrors) return;
    setSaving(true);
    setError('');
    try {
      await onSave(changed.map((r) => ({ product_id: r.product_id, qty_planned: Number(drafts[r.product_id]) })));
      setDrafts({});
      setServerErrors({});
    } catch (err) {
      setServerErrors(err.fieldErrors ?? {});
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  const reset = () => { setDrafts({}); setServerErrors({}); setError(''); };

  return (
    <div className="space-y-4">
      <div className="card-admin overflow-hidden">
        <div className={`hidden border-b border-beige px-4 py-3 text-xs font-semibold uppercase tracking-wide text-cocoa/70 ${GRID}`} aria-hidden="true">
          <span>Produk</span><span>Rencana</span><span className="text-right">Terjual</span><span className="text-right">Sisa</span><span>Status</span>
        </div>
        <ul aria-label="Stok produk harian" className="divide-y divide-beige/70">
          {rows.map((r) => {
            const draft = drafts[r.product_id];
            const planned = draft ?? String(r.qty_planned);
            const rowError = errorOf(r);
            const preview = rowError ? null : Math.max(0, Number(planned) - r.qty_sold);
            // Pratinjau status dari rencana yang sedang diketik (belum disimpan)
            const status = STATUS_BY_KEY[draft != null && !rowError ? getDailyStockStatus({ qty_planned: Number(planned), qty_sold: r.qty_sold }) : r.status];
            const inputId = `plan-${r.product_id}`;
            return (
              <li key={r.product_id} className={`px-4 py-3 ${GRID}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <ProductImage src={r.image_url} alt="" sizes="56px" className="h-11 w-14 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-cocoa">{r.name}</p>
                    <p className="text-xs text-cocoa/60">{r.category_name}</p>
                  </div>
                </div>
                <div className="mt-3 md:mt-0">
                  <label htmlFor={inputId} className="mb-1 block text-xs font-semibold text-cocoa/75 md:sr-only">Rencana stok {r.name}</label>
                  <input
                    id={inputId}
                    type="number"
                    inputMode="numeric"
                    min={r.qty_sold}
                    step="1"
                    value={planned}
                    onChange={(e) => { setDrafts((d) => ({ ...d, [r.product_id]: e.target.value })); setServerErrors((s) => ({ ...s, [r.product_id]: undefined })); }}
                    className={`${fieldClass(rowError)} tabular-nums`}
                    aria-invalid={Boolean(rowError)}
                    aria-describedby={rowError ? `${inputId}-error` : undefined}
                  />
                  <FormError id={`${inputId}-error`} message={rowError} className="mt-1 text-xs" />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm md:contents">
                  <div className="md:text-right"><dt className="text-xs text-cocoa/60 md:sr-only">Terjual</dt><dd className="tabular-nums text-cocoa">{formatNumber(r.qty_sold)}</dd></div>
                  <div className="md:text-right"><dt className="text-xs text-cocoa/60 md:sr-only">Sisa</dt><dd className="font-semibold tabular-nums text-cocoa">{formatNumber(preview ?? r.remaining)}</dd></div>
                  <div><dt className="text-xs text-cocoa/60 md:sr-only">Status</dt><dd><Badge variant={status.variant}>{status.label}</Badge></dd></div>
                </dl>
              </li>
            );
          })}
        </ul>
      </div>
      <FormError message={error} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        {changed.length > 0 && <p className="text-sm text-cocoa/70 sm:mr-auto" aria-live="polite">{changed.length} produk diubah, belum disimpan</p>}
        <Button variant="ghost" size="sm" onClick={reset} disabled={!changed.length || saving} leftIcon={<RotateCcw size={16} aria-hidden="true" />}>Batalkan perubahan</Button>
        <Button size="sm" onClick={save} loading={saving} disabled={!changed.length || hasErrors} leftIcon={<Save size={16} aria-hidden="true" />}>Simpan Stok</Button>
      </div>
    </div>
  );
}
