// components/admin/IssueLinesEditor.jsx
// CR-04b · FR-46 · UC-37 · BR-26 · AD-13 — baris pengeluaran bahan (bahan dari master, sekali per dokumen; jumlah teks
// desimal > 0, koma diterima) untuk Catat pengeluaran, Koreksi pengeluaran, dan pengeluaran terakhir saat Selesaikan WO.
// Bahan resep (snapshot WO) ditandai; bahan di luar resep tetap boleh (standar 0, Draft §8.4).

import { Plus, Trash2 } from 'lucide-react';
import Button from '../ui/Button';
import FormField from './FormField';
import { fieldClass } from './fieldClass';
import { WO_MAX_ISSUE_LINES } from '../../constants/workOrder';

let rowKey = 0;

/**
 * @param {string} idPrefix — prefiks id input (unik per form)
 * @param {Array<{key, material_id, qty}>} rows
 * @param {Function} setRows — setter React (menerima fungsi)
 * @param {Array} materials — bahan master {material_id, name, unit}
 * @param {Set<string>} recipeIds — material_id snapshot resep WO
 * @param {Function} errorOf — (fieldKey) → pesan | undefined (kunci `lines.<i>.material_id|qty`, `lines`)
 * @param {Function} onTouch — dipanggil setiap isi berubah
 * @param {number} [minRows] — 1 (wajib) atau 0 (opsional)
 */
export default function IssueLinesEditor({ idPrefix, rows, setRows, materials, recipeIds, errorOf, onTouch, minRows = 1 }) {
  const update = (key, patch) => { setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r))); onTouch(); };
  const add = () => { setRows((list) => [...list, { key: `${idPrefix}-n${(rowKey += 1)}`, material_id: '', qty: '' }]); onTouch(); };
  const unitOf = (id) => materials.find((m) => String(m.material_id) === id)?.unit ?? '';

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-cocoa">Bahan ({rows.length}/{WO_MAX_ISSUE_LINES})</legend>
      {rows.map((r, i) => (
        <div key={r.key} className="grid gap-2 rounded-btn border border-beige p-3 sm:grid-cols-[1fr_160px_44px] sm:items-start">
          <FormField id={`${idPrefix}-${r.key}-material`} label="Bahan" error={errorOf(`lines.${i}.material_id`)}>
            <select className={fieldClass(errorOf(`lines.${i}.material_id`))} value={r.material_id} onChange={(e) => update(r.key, { material_id: e.target.value })}>
              <option value="">Pilih bahan</option>
              {materials.map((m) => <option key={m.material_id} value={String(m.material_id)}>{m.name} ({m.unit}){recipeIds.has(String(m.material_id)) ? ' · resep' : ''}</option>)}
            </select>
          </FormField>
          <FormField id={`${idPrefix}-${r.key}-qty`} label={`Jumlah${unitOf(r.material_id) ? ` (${unitOf(r.material_id)})` : ''}`} error={errorOf(`lines.${i}.qty`)}>
            <input inputMode="decimal" className={`${fieldClass(errorOf(`lines.${i}.qty`))} tabular-nums`} value={r.qty} onChange={(e) => update(r.key, { qty: e.target.value })} />
          </FormField>
          <button type="button" className="inline-flex h-11 w-11 items-center justify-center self-end rounded-lg text-error hover:bg-red-50 disabled:opacity-40 sm:mt-7"
            onClick={() => { setRows((list) => list.filter((x) => x.key !== r.key)); onTouch(); }} disabled={rows.length <= minRows} aria-label={`Hapus bahan ${i + 1}`}>
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
      {errorOf('lines') && <p className="text-xs text-error">{errorOf('lines')}</p>}
      <Button type="button" size="sm" variant="ghost" onClick={add} disabled={rows.length >= WO_MAX_ISSUE_LINES} leftIcon={<Plus size={16} aria-hidden="true" />}>Tambah bahan</Button>
    </fieldset>
  );
}
