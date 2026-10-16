// components/customer/SearchBar.jsx
// Step 5.1 · FR-07 · C-08 — kolom pencarian aktif dengan tombol hapus

import { Search, X } from 'lucide-react';

/**
 * @param {string} value
 * @param {Function} onChange — (text) → void
 * @param {Function} onSubmit — (text) → void (Enter / tombol keyboard "Cari")
 */
export default function SearchBar({ value, onChange, onSubmit, autoFocus = true }) {
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
      className="relative"
    >
      <label htmlFor="cari-produk" className="sr-only">Cari produk</label>
      <Search size={18} aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-primary pointer-events-none" />
      <input
        id="cari-produk"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        // autoFocus: halaman ini dibuka khusus untuk mengetik kata kunci (UI/UX Spec: kolom aktif)
        autoFocus={autoFocus}
        placeholder="Cari croissant, cake, cookies..."
        className="input h-12 pl-11 pr-12 bg-surface text-base [&::-webkit-search-cancel-button]:hidden"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Hapus kata kunci"
          className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full
                     text-cocoa/60 hover:bg-beige hover:text-cocoa focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <X size={18} aria-hidden="true" />
        </button>
      )}
    </form>
  );
}
