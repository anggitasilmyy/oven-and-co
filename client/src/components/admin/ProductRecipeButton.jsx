// components/admin/ProductRecipeButton.jsx
// CR-03 CP6 · FR-39 · AD-06 — aksi baris "Komposisi" (membuka RecipeFormModal), area sentuh 44 px

import { ListChecks } from 'lucide-react';

/** @param {{row: {product_id, name}, onRecipe: Function}} props */
export default function ProductRecipeButton({ row, onRecipe }) {
  return (
    <button
      type="button"
      onClick={() => onRecipe(row)}
      className="inline-flex h-11 min-w-touch-min items-center justify-center gap-1.5 rounded-lg border border-beige px-3 text-xs font-semibold
                 text-primary hover:bg-beige/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      aria-label={`Komposisi bahan ${row.name}`}
    >
      <ListChecks size={14} aria-hidden="true" /> Komposisi
    </button>
  );
}
