// components/ui/Modal.jsx
// Step 2 · Layout & Komponen Dasar — Step 2.5 (PR A): lebar responsif & animasi tanpa translateX

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Lebar maksimum panel per ukuran (di HP selalu lebar penuh dikurangi padding) */
const SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md lg:max-w-lg',
  lg: 'sm:max-w-lg lg:max-w-2xl',
};

/**
 * Dialog modal center-screen.
 *
 * @param {boolean} isOpen
 * @param {Function} onClose
 * @param {string} title
 * @param {React.ReactNode} children
 * @param {React.ReactNode} footer — slot untuk tombol aksi
 * @param {'sm'|'md'|'lg'} size — lebar maksimum di layar ≥ sm
 */
export default function Modal({ isOpen, onClose, title, children, footer, size = 'md' }) {
  // Kunci scroll body
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Tutup dengan Escape
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    if (isOpen) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Portal ke <body>: overlay fixed tidak terpengaruh margin (space-y-*) atau transform milik induknya
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5 md:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      {/* animate-modal-in: fade + scale tanpa translate (bug lama: modal tergeser ke kiri) */}
      <div
        className={`relative w-full ${SIZES[size] ?? SIZES.md} max-h-[calc(100dvh-40px)] flex flex-col
                    bg-surface rounded-card shadow-xl animate-modal-in`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3 md:px-6">
          <h2 id="modal-title" className="font-display text-lg text-cocoa">
            {title}
          </h2>
          <button
            onClick={onClose}
            type="button"
            className="w-11 h-11 -mr-2 shrink-0 flex items-center justify-center rounded-full text-cocoa/70
                       hover:bg-beige hover:text-cocoa active:scale-95 transition
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label="Tutup modal"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Konten */}
        <div className="px-5 pb-4 md:px-6 text-sm text-cocoa/80 leading-relaxed overflow-y-auto">
          {children}
        </div>

        {/* Footer (slot tombol) */}
        {footer && (
          <div className="px-5 pb-5 md:px-6 pt-4 border-t border-beige flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
