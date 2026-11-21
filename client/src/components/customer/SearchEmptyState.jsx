// components/customer/SearchEmptyState.jsx
// Step 5.1 · FR-07 · C-08 — empty state "Belum ada hasil untuk '…'" + chip saran
// Step 8 · F-10: memakai EmptyState (ui) — struktur ikon/judul/deskripsi tidak ditulis ulang.

import { ShoppingBasket } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import { PopularSearchChips } from './SearchSuggestions';

export default function SearchEmptyState({ query, onSelect }) {
  return (
    <div className="card p-6 md:p-10">
      <EmptyState
        className=""
        titleAs="h2"
        icon={<ShoppingBasket size={36} aria-hidden="true" />}
        title={`Belum ada hasil untuk “${query}”`}
        description="Coba kata kunci lain, misalnya nama produk atau kategori."
      >
        <div className="[&_h2]:justify-center [&_div]:justify-center">
          <PopularSearchChips onSelect={onSelect} title="Coba cari" />
        </div>
      </EmptyState>
    </div>
  );
}
