// hooks/useCatalogFilters.js
// Step 5.1 · FR-06 · C-06/C-07 — filter katalog disimpan di URL (?kategori=&ketersediaan=&harga_min=…)

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { parseCatalogQuery, buildCatalogQuery, EMPTY_CATALOG_FILTERS } from '../utils/catalogQuery';

export default function useCatalogFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseCatalogQuery(searchParams), [searchParams]);

  /** Ganti sebagian filter; replace agar tombol Kembali tidak melewati setiap perubahan filter */
  const updateFilters = useCallback(
    (patch) => setSearchParams(buildCatalogQuery({ ...filters, ...patch }), { replace: true }),
    [filters, setSearchParams]
  );

  /** Kosongkan filter C-07; kategori & urutan dipertahankan */
  const resetFilters = useCallback(
    () => updateFilters({ ...EMPTY_CATALOG_FILTERS, categoryId: filters.categoryId, sort: filters.sort }),
    [filters.categoryId, filters.sort, updateFilters]
  );

  return { filters, updateFilters, resetFilters };
}
