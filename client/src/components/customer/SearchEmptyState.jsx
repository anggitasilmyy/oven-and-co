// components/customer/SearchEmptyState.jsx
// Step 5.1 · FR-07 · C-08 — empty state "Belum ada hasil untuk '…'" + chip saran

import { ShoppingBasket } from 'lucide-react';
import { PopularSearchChips } from './SearchSuggestions';

export default function SearchEmptyState({ query, onSelect }) {
  return (
    <div className="card p-6 md:p-10 flex flex-col items-center text-center gap-5">
      <div className="w-20 h-20 rounded-full bg-beige flex items-center justify-center text-primary/60">
        <ShoppingBasket size={36} aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <h2 className="font-display text-xl text-cocoa">Belum ada hasil untuk “{query}”</h2>
        <p className="text-sm text-cocoa/65 max-w-sm">Coba kata kunci lain, misalnya nama produk atau kategori.</p>
      </div>
      <div className="[&_h2]:justify-center [&_div]:justify-center">
        <PopularSearchChips onSelect={onSelect} title="Coba cari" />
      </div>
    </div>
  );
}
