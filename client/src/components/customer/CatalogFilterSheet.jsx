// components/customer/CatalogFilterSheet.jsx
// Step 5.1 · FR-06 · C-07 — Filter & Urutan versi BottomSheet (< lg; dialog di 768–1023)
// Perubahan disimpan sebagai draf dan baru diterapkan lewat tombol "Tampilkan N produk".

import { useState } from 'react';
import BottomSheet from '../ui/BottomSheet';
import Button from '../ui/Button';
import CatalogFilterPanel from './CatalogFilterPanel';
import { EMPTY_CATALOG_FILTERS } from '../../utils/catalogQuery';

/**
 * @param {object} filters — filter aktif dari URL
 * @param {Function} countFor — (draftFilters) → jumlah produk yang akan tampil
 * @param {Function} onApply — (draftFilters) → void
 */
export default function CatalogFilterSheet({ isOpen, onClose, filters, countFor, onApply }) {
  const [draft, setDraft] = useState(filters);
  const [wasOpen, setWasOpen] = useState(isOpen);
  // Saat sheet dibuka, draf diambil ulang dari filter aktif
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setDraft(filters);
  }

  const count = countFor(draft);
  const reset = () => setDraft({ ...EMPTY_CATALOG_FILTERS, categoryId: draft.categoryId, sort: draft.sort });

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Filter & Urutan"
      footer={
        <>
          <Button variant="ghost" onClick={reset}>Reset</Button>
          <Button onClick={() => onApply(draft)} disabled={count === 0} className="sm:min-w-[220px]">
            {count === 0 ? 'Tidak ada produk' : `Tampilkan ${count} produk`}
          </Button>
        </>
      }
    >
      <CatalogFilterPanel idPrefix="sheet" value={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
    </BottomSheet>
  );
}
