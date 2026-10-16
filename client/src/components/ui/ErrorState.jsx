// components/ui/ErrorState.jsx
// Step 4 · Pesan error ringkas + tombol "Coba lagi" untuk bagian halaman yang gagal dimuat

import { AlertCircle, RefreshCw } from 'lucide-react';
import Button from './Button';

/**
 * @param {string} message — pesan untuk pengguna
 * @param {Function} onRetry — muat ulang data
 */
export default function ErrorState({ message = 'Data gagal dimuat.', onRetry, className = '' }) {
  return (
    <div
      role="alert"
      className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-btn border border-error/30
                  bg-red-50 px-4 py-3 text-sm text-error ${className}`}
    >
      <p className="flex items-center gap-2 flex-1 font-medium">
        <AlertCircle size={18} className="shrink-0" aria-hidden="true" />
        {message}
      </p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} leftIcon={<RefreshCw size={16} aria-hidden="true" />}>
          Coba lagi
        </Button>
      )}
    </div>
  );
}
