// pages/customer/FormUlasanPage.jsx
// C-19 · Form Ulasan Produk
// Step 2 · Placeholder

import { useParams } from 'react-router-dom';

export default function FormUlasanPage() {
  const { orderNumber } = useParams();

  return (
    <div className="px-5 py-6 space-y-4">
      <p className="text-xs font-semibold text-primary tracking-widest uppercase">C-19</p>
      <h1 className="font-display text-3xl text-cocoa">Beri Ulasan</h1>
      <p className="text-sm text-cocoa/60">
        Pesanan: <code className="font-mono">{orderNumber}</code>
      </p>
      <p className="text-sm text-cocoa/60">
        Rating bintang 1–5, tag, komentar, upload maks. 3 foto, +20 poin (BR-11)
      </p>
      <p className="text-xs text-cocoa/40">(FR-21 — diimplementasi di Step 5.4)</p>
    </div>
  );
}
