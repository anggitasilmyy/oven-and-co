// components/layout/PageHeader.jsx
// Step 2.5 (PR A) · NFR-06 Responsive (CR-01)
// Judul halaman seragam: kode layar, judul, deskripsi, dan slot aksi di kanan (≥ md).
// Step 8 · F-05: tautan kembali opsional (`back`) untuk sub-halaman yang memakai CustomerLayout (pengganti tombol
//   kembali FocusLayout). Step 8 · F-06: kode layar internal (mis. "AD-03") hanya tampil di mode development.

import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/** Kode layar hanya untuk pengembangan — tidak dirender di build produksi */
const SHOW_SCREEN_CODE = import.meta.env.DEV;

/**
 * @param {string} screenCode — kode layar, mis. "C-06" atau "AD-03" (hanya tampil di mode development)
 * @param {string} title
 * @param {React.ReactNode} description
 * @param {React.ReactNode} actions — tombol aksi; di HP turun ke bawah judul
 * @param {{to: string, label: string, hideOnDesktop?: boolean}} back — tautan kembali ke halaman induk;
 *        hideOnDesktop: sembunyikan ≥ lg bila navigasi samping (mis. sidebar Akun) sudah tersedia
 */
export default function PageHeader({ screenCode, title, description, actions, back, className = '' }) {
  return (
    <div
      className={`flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6 ${className}`}
    >
      <div className="min-w-0">
        {back && (
          <Link
            to={back.to}
            className={`inline-flex items-center gap-1.5 min-h-touch-min -ml-1 px-1 mb-1 rounded-btn text-sm font-semibold text-primary
                        hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                        ${back.hideOnDesktop ? 'lg:hidden' : ''}`}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {back.label}
          </Link>
        )}
        {SHOW_SCREEN_CODE && screenCode && (
          <p className="text-xs font-semibold text-primary tracking-widest uppercase mb-1">
            {screenCode}
          </p>
        )}
        <h1 className="font-display text-3xl lg:text-4xl text-cocoa leading-tight">{title}</h1>
        {description && (
          <p className="mt-2 text-sm md:text-base text-cocoa-muted max-w-prose">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3 shrink-0">{actions}</div>}
    </div>
  );
}
