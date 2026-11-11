// components/admin/RecipeForm.jsx
// CR-03 CP6 · FR-39 · UC-31 · BR-13 · BR-16 · AD-06 — isi form Komposisi (§B8): daftar baris bahan, "Tambah Bahan",
// empty state, pesan error. Dirender oleh RecipeFormModal setelah komposisi & master bahan dimuat.

import { Plus, PackageOpen } from 'lucide-react';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import FormError from '../ui/FormError';
import RecipeItemRow from './RecipeItemRow';
import useRecipeForm from '../../hooks/useRecipeForm';
import { RECIPE_MAX_ITEMS } from '../../constants/recipe';
import { AVAILABILITY_TYPE } from '../../constants/product';

/**
 * @param {{productId, data: {recipe, materials}, formId: string, onSavingChange: Function, onSaved: Function}} props
 *   onSaved — (komposisi tersimpan) → void
 */
export default function RecipeForm({ productId, data, formId, onSavingChange, onSaved }) {
  const form = useRecipeForm(productId, data, onSavingChange);
  const { rows, saving } = form;
  const usedIds = new Set(rows.map((r) => r.material_id).filter(Boolean));
  const noMaterials = data.materials.length === 0;

  const save = async (e) => {
    e.preventDefault();
    const saved = await form.submit();
    if (saved) onSaved(saved);
  };

  return (
    <form id={formId} noValidate className="space-y-4" onSubmit={save}>
      <p className="text-sm text-cocoa/75">
        Takaran bahan untuk membuat 1 pcs produk (maks. 3 angka desimal, mis. 0,015). Satuan mengikuti master Bahan Baku.
        {data.recipe.availability_type === AVAILABILITY_TYPE.CUSTOM && ' Custom cake memakai satu komposisi standar untuk semua pilihan builder.'}
      </p>
      {rows.length === 0 ? (
        <EmptyState
          icon={<PackageOpen size={28} aria-hidden="true" />}
          title="Belum ada komposisi"
          description="Produk tanpa komposisi tidak ikut dihitung di Kebutuhan Bahan. Tambahkan bahan dari master Bahan Baku."
        />
      ) : (
        <ul className="space-y-3" aria-label="Daftar bahan komposisi">
          {rows.map((row, i) => (
            <RecipeItemRow
              key={row.key} row={row} index={i} materials={data.materials} usedIds={usedIds} errorOf={form.errorOf}
              onChange={form.updateRow} onRemove={form.removeRow} disabled={saving}
            />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={form.addRow} disabled={saving || !form.canAdd || noMaterials}
          leftIcon={<Plus size={16} aria-hidden="true" />}>
          Tambah Bahan
        </Button>
        <span className="text-xs text-cocoa/60 tabular-nums">{rows.length}/{RECIPE_MAX_ITEMS} bahan</span>
      </div>
      {noMaterials && <p className="text-xs text-cocoa/70">Master Bahan Baku masih kosong. Tambahkan bahan di menu Stok terlebih dahulu.</p>}
      <FormError message={form.error} />
    </form>
  );
}
