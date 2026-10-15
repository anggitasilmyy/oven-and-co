// pages/customer/PesananBerhasilPage.jsx
// C-16 · Pesanan Berhasil
// Step 2 · Placeholder

import { useParams } from 'react-router-dom';

export default function PesananBerhasilPage() {
  const { orderNumber } = useParams();

  return (
    <div className="px-5 py-6 space-y-4">
      <p className="text-xs font-semibold text-primary tracking-widest uppercase">C-16</p>
      <h1 className="font-display text-3xl text-cocoa">Pesanan Berhasil</h1>
      <p className="text-sm text-cocoa/60">
        Nomor pesanan: <code className="font-mono">{orderNumber}</code>
      </p>
      <p className="text-sm text-cocoa/60">
        Konfirmasi, nomor pesanan, kode pickup (jika Bayar di Toko), ringkasan, link ke Riwayat
      </p>
    </div>
  );
}
