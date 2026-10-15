// components/ui/Toast.jsx
// Step 2 · Layout & Komponen Dasar

import { useEffect, useState } from 'react';
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

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[60]
        w-[calc(100%-40px)] max-w-[440px]
        flex items-center gap-3 px-4 py-3
        rounded-btn border shadow-lg
        ${bg} ${text}
        animate-fade-in-up`}
    >
      <Icon size={18} className="shrink-0" />
      <p className="flex-1 text-sm font-medium">{message}</p>
      <button
        onClick={() => { setVisible(false); onClose?.(); }}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Tutup notifikasi"
      >
        <X size={16} />
      </button>
    </div>
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
