// components/ui/BottomSheet.jsx
// Step 2 · Layout & Komponen Dasar
// Dipakai untuk: C-07 Filter (di dalam KatalogPage)

import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Panel slide-up dari bawah layar.
 *
 * @param {boolean} isOpen
 * @param {Function} onClose
 * @param {string} title
 * @param {React.ReactNode} children
 */
export default function BottomSheet({ isOpen, onClose, title, children }) {
  // Kunci scroll body saat sheet terbuka
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    // Overlay
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full max-w-[480px] bg-surface rounded-t-[24px] shadow-xl animate-slide-up">
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-beige" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-beige">
          <h2 className="font-display text-lg text-cocoa">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-beige transition-colors"
            aria-label="Tutup"
          >
            <X size={18} className="text-cocoa/60" />
          </button>
        </div>

        {/* Konten */}
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
