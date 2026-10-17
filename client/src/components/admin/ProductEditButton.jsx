// components/admin/ProductEditButton.jsx
// Step 5.7 · FR-30 · AD-06 — tombol "Ubah" produk (membuka drawer form), area sentuh 44 px

import { Pencil } from 'lucide-react';

/** @param {{row: {product_id, name}, onEdit: Function}} props */
export default function ProductEditButton({ row, onEdit }) {
  return (
    <button
      type="button"
      onClick={() => onEdit(row.product_id)}
      className="inline-flex h-11 min-w-touch-min items-center justify-center gap-1.5 rounded-lg border border-beige px-3 text-xs font-semibold
                 text-primary hover:bg-beige/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      aria-label={`Ubah ${row.name}`}
    >
      <Pencil size={14} aria-hidden="true" /> Ubah
    </button>
  );
}
