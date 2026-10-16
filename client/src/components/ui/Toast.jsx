// components/ui/Toast.jsx
// Step 2 · Layout & Komponen Dasar — Step 2.5 (PR A): posisi responsif
// < md : di tengah bawah, di atas BottomNav · ≥ md : pojok kanan bawah

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

/**
 * Toast notifikasi sementara.
 * Auto-dismiss setelah `duration` ms (default 3000).
 *
 * @param {'success'|'error'|'info'} type
 * @param {string} message
 * @param {boolean} show
 * @param {Function} onClose
 * @param {number} duration — ms sebelum auto-dismiss (default 3000)
 */
export default function Toast({ type = 'info', message, show, onClose, duration = 3000 }) {
  const [visible, setVisible] = useState(show);

  useEffect(() => {
    setVisible(show);
    if (show) {
      const timer = setTimeout(() => {
        setVisible(false);
        onClose?.();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [show, duration, onClose]);

  if (!visible) return null;

  const styles = {
    success: {
      bg: 'bg-sage border-sage',
      text: 'text-cocoa',
      Icon: CheckCircle,
    },
    error: {
      bg: 'bg-red-50 border-error/30',
      text: 'text-error',
      Icon: AlertCircle,
    },
    info: {
      bg: 'bg-peach/50 border-peach',
      text: 'text-cocoa',
      Icon: Info,
    },
  };

  const { bg, text, Icon } = styles[type] ?? styles.info;

  // Portal ke <body>: overlay fixed tidak terpengaruh margin (space-y-*) atau transform milik induknya
  return createPortal(
    <div
      role="alert"
      aria-live="assertive"
      className={`fixed z-[60] inset-x-5 mx-auto max-w-[440px]
        bottom-[calc(88px+env(safe-area-inset-bottom))]
        md:inset-x-auto md:right-6 md:bottom-6 md:mx-0 md:w-[380px] md:max-w-[calc(100vw-48px)]
        flex items-center gap-3 px-4 py-3
        rounded-btn border shadow-lg
        ${bg} ${text}
        animate-fade-in-up`}
    >
      <Icon size={18} className="shrink-0" />
      <p className="flex-1 text-sm font-medium">{message}</p>
      <button
        onClick={() => { setVisible(false); onClose?.(); }}
        type="button"
        className="shrink-0 w-11 h-11 -my-2 -mr-2 flex items-center justify-center rounded-full
                   opacity-70 hover:opacity-100 hover:bg-black/5 active:bg-black/10 transition
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        aria-label="Tutup notifikasi"
      >
        <X size={16} />
      </button>
    </div>,
    document.body
  );
}

/**
 * Hook sederhana untuk mengelola state Toast.
 * @returns {{ toast, showToast, hideToast }}
 *
 * Penggunaan:
 *   const { toast, showToast } = useToast();
 *   <Toast {...toast} onClose={hideToast} />
 *   showToast('success', 'Pesanan berhasil!');
 */
export function useToast() {
  const [toast, setToast] = useState({ show: false, type: 'info', message: '' });

  function showToast(type, message) {
    setToast({ show: true, type, message });
  }

  function hideToast() {
    setToast((prev) => ({ ...prev, show: false }));
  }

  return { toast, showToast, hideToast };
}
