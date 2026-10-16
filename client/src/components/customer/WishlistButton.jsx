// components/customer/WishlistButton.jsx
// Step 5.1 · FR-25 — tombol hati (kartu produk & galeri detail); area sentuh 44 px

import { Heart } from 'lucide-react';

/**
 * @param {boolean} active — produk sudah ada di wishlist
 * @param {string} productName — untuk label aksesibilitas
 */
export default function WishlistButton({ active, productName, onClick, disabled, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={active ? `Hapus ${productName} dari wishlist` : `Simpan ${productName} ke wishlist`}
      className={`w-11 h-11 rounded-full flex items-center justify-center bg-surface/95 shadow-sm
                  transition hover:scale-105 active:scale-95 disabled:opacity-60
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
    >
      <Heart
        size={20}
        aria-hidden="true"
        className={active ? 'fill-error text-error' : 'text-cocoa'}
      />
    </button>
  );
}
