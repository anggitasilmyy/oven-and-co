// pages/customer/BayarPage.jsx
// C-15 · Halaman Bayar (timer 30 menit)
// Step 2 · Placeholder

import { useParams } from 'react-router-dom';

export default function BayarPage() {
  const { orderNumber } = useParams();

  return (
    <div className="px-5 py-6 space-y-4">
      <p className="text-xs font-semibold text-primary tracking-widest uppercase">C-15</p>
      <h1 className="font-display text-3xl text-cocoa">Halaman Bayar</h1>
      <p className="text-sm text-cocoa/60">
        Nomor pesanan: <code className="font-mono">{orderNumber}</code>
      </p>
      <p className="text-sm text-cocoa/60">
        QR/VA/kode bayar, hitung mundur 30 menit (BR-06), tombol "Simulasikan Lunas" (dev)
      </p>
    </div>
  );
}
