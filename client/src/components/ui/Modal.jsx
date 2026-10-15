// components/ui/Modal.jsx
// Step 2 · Layout & Komponen Dasar

import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Dialog modal center-screen.
 *
 * @param {boolean} isOpen
 * @param {Function} onClose
 * @param {string} title
 * @param {React.ReactNode} children
 * @param {React.ReactNode} footer — slot untuk tombol aksi
 */
export default function Modal({ isOpen, onClose, title, children, footer }) {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5"
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
      <div className="relative w-full max-w-[380px] bg-surface rounded-card shadow-xl animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 id="modal-title" className="font-display text-lg text-cocoa">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-beige transition-colors"
            aria-label="Tutup modal"
          >
            <X size={18} className="text-cocoa/60" />
          </button>
        </div>

        {/* Konten */}
        <div className="px-5 pb-4 text-sm text-cocoa/80 leading-relaxed">
          {children}
        </div>

        {/* Footer (slot tombol) */}
        {footer && (
          <div className="px-5 pb-5 flex gap-3 justify-end border-t border-beige pt-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
