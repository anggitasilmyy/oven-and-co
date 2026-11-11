// components/admin/RecipeItemRow.jsx
// CR-03 CP6 · FR-39 · BR-13 · AD-06 — satu baris komposisi: pilih bahan dari master AD-07, takaran (maks. 3 desimal) dengan
// satuan bahan saat ini di sampingnya ("kg per 1 pcs", AC-39.5), hapus baris. Label tiap input (NFR-02), area sentuh 44 px.

import { Trash2 } from 'lucide-react';
import FormField from './FormField';
import { fieldClass } from './fieldClass';

/**
 * @param {{key, material_id, qty}} row
 * @param {number} index — urutan baris (0-based, sama dengan indeks fieldErrors `items.<i>.*`)
 * @param {Array} materials — master bahan AD-07
 * @param {Set<string>} usedIds — bahan yang sudah dipilih di baris lain
 */
export default function RecipeItemRow({ row, index, materials, usedIds, errorOf, onChange, onRemove, disabled }) {
  const material = materials.find((m) => String(m.material_id) === row.material_id);
  const idError = errorOf(`items.${index}.material_id`);
  const qtyError = errorOf(`items.${index}.qty_per_unit`);
  const base = `recipe-${row.key}`;
  return (
    <li className="grid gap-3 rounded-card border border-beige bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] sm:items-start">
      <FormField id={`${base}-material`} label={`Bahan ${index + 1}`} error={idError}>
        <select
          className={fieldClass(idError)}
          value={row.material_id}
          disabled={disabled}
          onChange={(e) => onChange(row.key, 'material_id', e.target.value)}
        >
          <option value="">Pilih bahan</option>
          {materials.map((m) => {
            const id = String(m.material_id);
            return <option key={id} value={id} disabled={usedIds.has(id) && id !== row.material_id}>{m.name} ({m.unit})</option>;
          })}
        </select>
      </FormField>
      <FormField id={`${base}-qty`} label="Takaran" error={qtyError} hint={material ? `${material.unit} per 1 pcs` : 'Pilih bahan untuk melihat satuan'}>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.015"
          className={`${fieldClass(qtyError)} tabular-nums`}
          value={row.qty}
          disabled={disabled}
          onChange={(e) => onChange(row.key, 'qty', e.target.value)}
        />
      </FormField>
      <button
        type="button"
        onClick={() => onRemove(row.key)}
        disabled={disabled}
        aria-label={`Hapus bahan ${index + 1}${material ? ` (${material.name})` : ''}`}
        className="inline-flex h-11 min-w-touch-min items-center justify-center gap-1.5 self-end rounded-lg border border-beige px-3 text-xs
                   font-semibold text-error hover:bg-error/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/40
                   disabled:opacity-50 sm:mt-7 sm:self-start"
      >
        <Trash2 size={14} aria-hidden="true" /> Hapus
      </button>
    </li>
  );
}
