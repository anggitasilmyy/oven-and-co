// components/customer/CatalogToolbar.jsx
// Step 5.1 · FR-06 · C-06 — jumlah hasil + tombol "Filter & Urutan" (hanya < lg) dengan badge jumlah filter aktif

import { SlidersHorizontal } from 'lucide-react';
import Button from '../ui/Button';
import { CATALOG_SORT_OPTIONS } from '../../constants/catalog';

export default function CatalogToolbar({ resultCount, loading, activeFilterCount, sort, onOpenFilter }) {
  const sortLabel = CATALOG_SORT_OPTIONS.find((o) => o.value === sort)?.label;
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-cocoa/70" aria-live="polite">
        {loading && resultCount == null ? 'Memuat produk…' : (
          <>
            <span className="font-semibold text-cocoa">{resultCount} produk</span>
            <span className="hidden sm:inline"> · Urutan: {sortLabel}</span>
          </>
        )}
      </p>
      <Button
        variant="secondary"
        size="sm"
        className="lg:hidden"
        leftIcon={<SlidersHorizontal size={16} aria-hidden="true" />}
        onClick={onOpenFilter}
        aria-label={activeFilterCount ? `Filter & Urutan, ${activeFilterCount} filter aktif` : 'Filter & Urutan'}
      >
        Filter &amp; Urutan
        {activeFilterCount > 0 && (
          <span aria-hidden="true" className="min-w-[20px] h-5 px-1.5 rounded-pill bg-primary text-white text-[11px] font-bold leading-5 tabular-nums">
            {activeFilterCount}
          </span>
        )}
      </Button>
    </div>
  );
}
