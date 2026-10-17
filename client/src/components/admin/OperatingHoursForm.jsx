// components/admin/OperatingHoursForm.jsx
// Step 5.8 · FR-36 · TF-10 · BR-01 · BR-07 · AD-11 — jam operasional per hari (operating_hours)
// Langsung berlaku: slot waktu checkout C-13 (slot di luar jam buka disembunyikan; hari tutup tanpa slot) dan
// batas bayar "Bayar di Toko" sebelum jam tutup di C-18 (BR-07).

import { useState } from 'react';
import { Save } from 'lucide-react';
import Button from '../ui/Button';
import Switch from '../ui/Switch';
import FormError from '../ui/FormError';
import { fieldClass } from './fieldClass';
import { validateOperatingHours } from '../../utils/businessRules';
import { updateOperatingHours } from '../../services/settingsService';
import { DAY_OF_WEEK_LABEL } from '../../constants/settings';
import { OPERATING_HOURS_DEFAULT } from '../../constants/storeConfig';

/** Hari tutup menyimpan jam null; saat dibuka lagi diisi jam contoh TF-10 */
const toForm = (h) => ({
  day_of_week: h.day_of_week, is_open: Boolean(h.is_open),
  open_time: h.open_time ?? OPERATING_HOURS_DEFAULT.open_time, close_time: h.close_time ?? OPERATING_HOURS_DEFAULT.close_time,
});

/**
 * @param {Array} hours — getStoreSettings().hours (7 baris)
 * @param {Function} onSaved — (message) → void
 */
export default function OperatingHoursForm({ hours, onSaved }) {
  const [rows, setRows] = useState(() => hours.map(toForm));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const errors = validateOperatingHours(rows);
  const initial = JSON.stringify(hours.map(toForm));
  const dirty = JSON.stringify(rows) !== initial;
  const update = (day, patch) => { setRows((rs) => rs.map((r) => (r.day_of_week === day ? { ...r, ...patch } : r))); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      await updateOperatingHours(rows);
      onSaved('Jam operasional disimpan');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <form noValidate onSubmit={submit} className="card-admin space-y-4 p-4 md:p-6" aria-labelledby="hours-title">
      <div>
        <h2 id="hours-title" className="text-base font-bold text-cocoa">Jam operasional</h2>
        <p className="text-xs text-cocoa/70">Slot pickup/delivery hanya tersedia di dalam jam buka.</p>
      </div>
      <ul className="divide-y divide-beige">
        {rows.map((r) => {
          const label = DAY_OF_WEEK_LABEL[r.day_of_week];
          const rowError = errors[r.day_of_week];
          return (
            <li key={r.day_of_week} className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 py-3 sm:grid-cols-[100px_auto_minmax(0,1fr)]">
              <span className="text-sm font-semibold text-cocoa">{label}</span>
              <span className="inline-flex items-center gap-1 text-sm text-cocoa">
                <Switch checked={r.is_open} onChange={(c) => update(r.day_of_week, { is_open: c })} label={`Toko buka hari ${label}`} />
                <span aria-hidden="true" className="w-10">{r.is_open ? 'Buka' : 'Tutup'}</span>
              </span>
              {r.is_open ? (
                <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-1">
                  <label className="text-xs text-cocoa/70">
                    Buka <span className="sr-only">{label}</span>
                    <input type="time" className={`${fieldClass(rowError)} mt-1`} value={r.open_time} onChange={(e) => update(r.day_of_week, { open_time: e.target.value })} aria-invalid={Boolean(rowError)} />
                  </label>
                  <label className="text-xs text-cocoa/70">
                    Tutup <span className="sr-only">{label}</span>
                    <input type="time" className={`${fieldClass(rowError)} mt-1`} value={r.close_time} onChange={(e) => update(r.day_of_week, { close_time: e.target.value })} aria-invalid={Boolean(rowError)} />
                  </label>
                  {rowError && <p className="col-span-2 text-xs text-error" role="alert">⚠ {rowError}</p>}
                </div>
              ) : (
                <p className="col-span-2 text-xs text-cocoa/65 sm:col-span-1">Toko tutup — tidak ada slot pickup/delivery</p>
              )}
            </li>
          );
        })}
      </ul>
      {errors.all && <p className="text-xs text-error" role="alert">⚠ {errors.all}</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <FormError message={error} />
        <Button type="submit" size="sm" loading={saving} disabled={!dirty || Object.keys(errors).length > 0} leftIcon={<Save size={16} aria-hidden="true" />}>Simpan jam</Button>
      </div>
    </form>
  );
}
