// pages/admin/DetailPesananAdminPage.jsx
// AD-04 · Detail & Verifikasi Pesanan
// Step 2 · Placeholder

import { useParams } from 'react-router-dom';

export default function DetailPesananAdminPage() {
  const { orderNumber } = useParams();

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-primary tracking-widest uppercase">AD-04</p>
      <h1 className="font-display text-3xl text-cocoa">Detail Pesanan</h1>
      <p className="text-sm text-cocoa/60">
        Pesanan: <code className="font-mono">{orderNumber}</code>
      </p>
      <p className="text-sm text-cocoa/60">
        Ubah status, verifikasi kode pickup, tandai lunas, cetak struk (FR-28)
      </p>
      <p className="text-xs text-cocoa/40">(diimplementasi di Step 5.6)</p>
    </div>
  );
}
