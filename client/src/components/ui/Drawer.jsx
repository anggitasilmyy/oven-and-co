// components/ui/Drawer.jsx
// Step 5.7 · AD-06 — panel samping kanan untuk form panjang (UI/UX Spec Batch 7: "Add/Edit product drawer")
// < md: layar penuh · ≥ md: panel kanan lebar terbatas. Pola sama dengan Modal (portal, Escape, kunci scroll).

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * @param {boolean} isOpen
 * @param {Function} [onClose] — kosongkan saat menyimpan agar drawer tidak tertutup
 * @param {string} title
 * @param {React.ReactNode} [description]
 * @param {React.ReactNode} footer — tombol aksi, menempel di bawah panel
 */
export default function Drawer({ isOpen, onClose, title, description, children, footer }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative flex h-full w-full flex-col bg-surface shadow-xl animate-drawer-in md:max-w-xl lg:max-w-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-beige px-5 py-4 md:px-6">
          <div className="min-w-0">
            <h2 id="drawer-title" className="font-display text-xl text-cocoa">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-cocoa/70">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!onClose}
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-cocoa/70 transition
                       hover:bg-beige hover:text-cocoa disabled:opacity-40
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label="Tutup panel"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 md:px-6">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-3 border-t border-beige px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-end md:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
