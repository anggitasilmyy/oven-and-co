// pages/customer/CariPage.jsx
// FR-07 · UC-05 · C-08 Pencarian
// Step 5.1: cari pada nama & kategori produk aktif, riwayat pencarian di perangkat (TF-13, lewat
// hooks/useSearchHistory), chip Populer, hasil grid, empty state. Kata kunci tersimpan di URL (?q=).

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageContainer from '../../components/layout/PageContainer';
import PageHeader from '../../components/layout/PageHeader';
import ErrorState from '../../components/ui/ErrorState';
import Toast from '../../components/ui/Toast';
import SearchBar from '../../components/customer/SearchBar';
import SearchSuggestions from '../../components/customer/SearchSuggestions';
import SearchEmptyState from '../../components/customer/SearchEmptyState';
import ProductGrid from '../../components/customer/ProductGrid';
import useDebounce from '../../hooks/useDebounce';
import useServiceQuery from '../../hooks/useServiceQuery';
import useSearchHistory from '../../hooks/useSearchHistory';
import useQuickAddToCart from '../../hooks/useQuickAddToCart';
import useWishlist from '../../hooks/useWishlist';
import { searchProducts } from '../../services/catalogService';
import { normalizeQuery } from '../../utils/businessRules';
import { SEARCH_QUERY_PARAM } from '../../constants/catalog';

const GRID_COLS = { base: 2, md: 3, lg: 4 };
const noResults = () => Promise.resolve(null);

export default function CariPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [text, setText] = useState(searchParams.get(SEARCH_QUERY_PARAM) ?? '');
  const query = normalizeQuery(useDebounce(text, 250));
  const results = useServiceQuery(query ? () => searchProducts(query) : noResults, [query]);
  const { history, add, remove, clear } = useSearchHistory();
  const { addProduct, toast, showToast, hideToast } = useQuickAddToCart();
  const wishlist = useWishlist(showToast);

  const syncUrl = (value) => setSearchParams(value ? { [SEARCH_QUERY_PARAM]: value } : {}, { replace: true });
  const handleChange = (value) => {
    setText(value);
    syncUrl(value.trim());
  };
  /** Kata kunci dicari & disimpan ke riwayat saat dikirim (Enter, chip, atau riwayat) */
  const runSearch = (term) => {
    const clean = term.trim();
    if (!clean) return;
    setText(clean);
    syncUrl(clean);
    add(clean);
  };

  return (
    <PageContainer className="py-6 lg:py-10 space-y-6">
      <PageHeader title="Pencarian" />
      <div className="max-w-narrow">
        <SearchBar value={text} onChange={handleChange} onSubmit={runSearch} />
      </div>

      {!query ? (
        <SearchSuggestions history={history} onSelect={runSearch} onRemove={remove} onClear={clear} />
      ) : results.error ? (
        <ErrorState message="Pencarian gagal dimuat." onRetry={results.reload} />
      ) : (
        <section aria-label="Hasil pencarian" className="space-y-4">
          {results.data?.length > 0 && (
            <p className="text-sm text-cocoa/70" aria-live="polite">
              <span className="font-semibold text-cocoa">{results.data.length} hasil</span> untuk “{query}”
            </p>
          )}
          <ProductGrid
            products={results.data}
            loading={results.loading}
            cols={GRID_COLS}
            onAdd={addProduct}
            wishlist={wishlist}
            label="Hasil pencarian"
            empty={<SearchEmptyState query={query} onSelect={runSearch} />}
          />
        </section>
      )}

      <Toast {...toast} onClose={hideToast} />
    </PageContainer>
  );
}
