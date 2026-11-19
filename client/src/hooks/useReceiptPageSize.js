// hooks/useReceiptPageSize.js
// Step 5.6 · FR-28 · AD-04 — ukuran kertas cetak struk kasir (thermal 80 mm).
// @page tidak bisa memakai tinggi "auto", jadi tinggi struk diukur tepat sebelum mencetak (beforeprint) lalu
// disuntikkan sebagai @page { size: 80mm <tinggi>mm; margin: 0 } — hasilnya satu lembar struk memanjang, bukan A4.
// Gaya hanya aktif selama halaman detail pesanan terpasang sehingga cetak halaman lain tidak terpengaruh.

import { useEffect } from 'react';

export const RECEIPT_WIDTH_MM = 80;
const PX_PER_MM = 96 / 25.4;
const FALLBACK_HEIGHT_MM = 200; // dipakai bila pengukuran gagal (konten tetap tercetak, sisa kertas kosong)
const SAFETY_MM = 2; // cadangan pembulatan agar tidak muncul halaman kedua kosong

/** Tinggi elemen struk (mm) saat dirender selebar kertas; elemen asli disembunyikan di layar, jadi diukur lewat salinan. */
function measureHeightMm(el) {
  const clone = el.cloneNode(true);
  clone.removeAttribute('data-print');
  clone.setAttribute('aria-hidden', 'true');
  Object.assign(clone.style, { display: 'block', position: 'absolute', left: '-10000px', top: '0', visibility: 'hidden' });
  document.body.appendChild(clone);
  const px = clone.getBoundingClientRect().height;
  clone.remove();
  return px > 0 ? Math.ceil(px / PX_PER_MM) + SAFETY_MM : FALLBACK_HEIGHT_MM;
}

/** @param {import('react').RefObject<HTMLElement>} receiptRef */
export default function useReceiptPageSize(receiptRef) {
  useEffect(() => {
    const style = document.createElement('style');
    style.setAttribute('data-receipt-page', '');
    const apply = () => {
      const height = receiptRef.current ? measureHeightMm(receiptRef.current) : FALLBACK_HEIGHT_MM;
      style.textContent = `@media print { @page { size: ${RECEIPT_WIDTH_MM}mm ${height}mm; margin: 0; } }`;
    };
    apply();
    document.head.appendChild(style);
    window.addEventListener('beforeprint', apply);
    return () => {
      window.removeEventListener('beforeprint', apply);
      style.remove();
    };
  }, [receiptRef]);
}
