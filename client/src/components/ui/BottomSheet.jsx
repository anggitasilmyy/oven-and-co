// components/ui/BottomSheet.jsx
// Step 2 · Layout & Komponen Dasar — Step 2.5 (PR A): responsive (CR-01)
// Dipakai untuk: C-07 Filter (di dalam KatalogPage)
// < md : panel slide-up dari bawah
// ≥ md : dialog di tengah layar dengan lebar terbatas (murni CSS)

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * @param {boolean} isOpen
 * @param {Function} onClose
 * @param {string} title
 * @param {React.ReactNode} children
 * @param {React.ReactNode} footer — slot tombol aksi (opsional), menempel di bawah panel
 */
export default function BottomSheet({ isOpen, onClose, title, children, footer }) {
  // Kunci scroll body saat sheet terbuka
  useEffect(() => {
    if (!isOpen) return undefined;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Tutup dengan Escape (penting untuk versi dialog di desktop)
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Portal ke <body>: overlay fixed tidak terpengaruh margin (space-y-*) atau transform milik induknya
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-8"
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
      <div
        className="relative w-full max-h-[85vh] flex flex-col bg-surface shadow-xl
                   rounded-t-[24px] animate-slide-up pb-[env(safe-area-inset-bottom)]
                   md:max-w-[560px] md:max-h-[80vh] md:rounded-card md:pb-0 md:animate-modal-in"
      >
        {/* Handle bar — hanya gaya bottom sheet (< md) */}
        <div className="flex justify-center pt-3 pb-1 md:hidden" aria-hidden="true">
          <div className="w-10 h-1 rounded-full bg-beige" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 md:px-6 md:pt-5 border-b border-beige">
          <h2 className="font-display text-lg md:text-xl text-cocoa">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-cocoa/70
                       hover:bg-beige hover:text-cocoa active:scale-95 transition
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label="Tutup"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Konten */}
        <div className="px-5 py-4 md:px-6 flex-1 overflow-y-auto">{children}</div>

        {footer && (
          <div className="px-5 py-4 md:px-6 border-t border-beige flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
