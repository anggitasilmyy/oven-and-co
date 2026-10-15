// pages/customer/DetailPesananPage.jsx
// C-18 · Detail & Tracking Pesanan
// Step 2 · Placeholder

import { useParams } from 'react-router-dom';

export default function DetailPesananPage() {
  const { orderNumber } = useParams();

  return (
    <div className="px-5 py-6 space-y-4">
      <p className="text-xs font-semibold text-primary tracking-widest uppercase">C-18</p>
      <h1 className="font-display text-3xl text-cocoa">Detail &amp; Tracking</h1>
      <p className="text-sm text-cocoa/60">
        Pesanan: <code className="font-mono">{orderNumber}</code>
      </p>
      <p className="text-sm text-cocoa/60">
        Timeline status, detail item, tombol Batalkan (sebelum Sedang Disiapkan), hubungi via WhatsApp
      </p>
      <p className="text-xs text-cocoa/40">(FR-17, FR-20, BR-08 — diimplementasi di Step 5.4)</p>
    </div>
  );
}
