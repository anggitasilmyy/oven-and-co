// pages/customer/KatalogPage.jsx
// FR-06 · UC-05 · C-06 Katalog + C-07 Filter
// Step 5.1: tab kategori, grid produk aktif (badge Ready/Pre-order/Custom), filter & urutan tersimpan di URL.
//   < lg : tombol "Filter & Urutan" membuka C-07 (BottomSheet di HP, dialog di tablet)
//   ≥ lg : isi filter yang sama tampil sebagai sidebar kiri dan langsung diterapkan

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, SearchX } from 'lucide-react';
import PageContainer from '../../components/layout/PageContainer';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Toast from '../../components/ui/Toast';
import CategoryTabs from '../../components/customer/CategoryTabs';
import CatalogToolbar from '../../components/customer/CatalogToolbar';
import CatalogFilterPanel from '../../components/customer/CatalogFilterPanel';
import CatalogFilterSheet from '../../components/customer/CatalogFilterSheet';
import ProductGrid from '../../components/customer/ProductGrid';
import useServiceQuery from '../../hooks/useServiceQuery';
import useCatalogFilters from '../../hooks/useCatalogFilters';
import useQuickAddToCart from '../../hooks/useQuickAddToCart';
import useWishlist from '../../hooks/useWishlist';
import useMediaQuery from '../../hooks/useMediaQuery';
import { getCategories } from '../../services/productService';
import { getCatalogProducts } from '../../services/catalogService';
import { filterCatalog, sortCatalog, countActiveFilters } from '../../utils/businessRules';
import { CUSTOMER_ROUTES } from '../../constants/routes';
import { MEDIA_QUERY } from '../../constants/breakpoints';

const GRID_COLS = { base: 2, md: 3, xl: 4 };

export default function KatalogPage() {
  const [filterOpen, setFilterOpen] = useState(false);
  const isDesktop = useMediaQuery(MEDIA_QUERY.LG_UP);
  const { filters, updateFilters, resetFilters } = useCatalogFilters();
  const categories = useServiceQuery(getCategories);
  const catalog = useServiceQuery(getCatalogProducts);
  const { addProduct, toast, showToast, hideToast } = useQuickAddToCart();
  const wishlist = useWishlist(showToast);

  const products = useMemo(
    () => (catalog.data ? sortCatalog(filterCatalog(catalog.data, filters), filters.sort) : null),
    [catalog.data, filters]
  );
  const activeFilterCount = countActiveFilters(filters);
  const countFor = (draft) => (catalog.data ? filterCatalog(catalog.data, draft).length : 0);

  const empty = (
    <div className="card">
      <EmptyState
        icon={<SearchX size={36} aria-hidden="true" />}
        title="Produk tidak ditemukan"
        description="Belum ada produk yang cocok dengan filter ini. Coba ubah atau reset filter."
        actionLabel={activeFilterCount ? 'Reset filter' : undefined}
        onAction={activeFilterCount ? resetFilters : undefined}
      />
    </div>
  );

  return (
    <PageContainer className="py-6 lg:py-10 space-y-5 lg:space-y-6">
      <PageHeader
        title="Katalog"
        description="Roti, cake, pastry, dan cookies segar dari dapur Oven & Co."
        actions={
          <Link to={CUSTOMER_ROUTES.CARI} className="btn-ghost h-11 px-4 border border-beige bg-surface" aria-label="Cari produk">
            <Search size={18} aria-hidden="true" />
            <span>Cari</span>
          </Link>
        }
      />

      <CategoryTabs
        categories={categories.data ?? []}
        value={filters.categoryId}
        onChange={(categoryId) => updateFilters({ categoryId })}
      />

      <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)] lg:gap-8 lg:items-start">
        {/* Sidebar filter — hanya ≥ lg */}
        <aside aria-label="Filter & Urutan" data-layout="catalog-filter-sidebar" className="hidden lg:block card p-5 sticky top-24">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display text-xl text-cocoa">Filter</h2>
            <Button variant="ghost" size="sm" className="-mr-3" onClick={resetFilters} disabled={!activeFilterCount}>
              Reset
            </Button>
          </div>
          <CatalogFilterPanel idPrefix="sidebar" value={filters} onChange={updateFilters} />
        </aside>

        <section aria-label="Hasil katalog" className="space-y-4 min-w-0">
          <CatalogToolbar
            resultCount={products?.length}
            loading={catalog.loading}
            activeFilterCount={activeFilterCount}
            sort={filters.sort}
            onOpenFilter={() => setFilterOpen(true)}
          />
          {catalog.error ? (
            <ErrorState message="Katalog gagal dimuat." onRetry={catalog.reload} />
          ) : (
            <ProductGrid
              products={products}
              loading={catalog.loading}
              cols={GRID_COLS}
              onAdd={addProduct}
              wishlist={wishlist}
              empty={empty}
            />
          )}
        </section>
      </div>

      {/* C-07 — hanya < lg (≥ lg memakai sidebar) */}
      <CatalogFilterSheet
        isOpen={filterOpen && !isDesktop}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        countFor={countFor}
        onApply={(draft) => {
          updateFilters(draft);
          setFilterOpen(false);
        }}
      />

      <Toast {...toast} onClose={hideToast} />
    </PageContainer>
  );
}
