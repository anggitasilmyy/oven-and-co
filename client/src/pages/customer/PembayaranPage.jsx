// pages/customer/PembayaranPage.jsx
// C-14 · Metode Pembayaran
// Step 2 · Placeholder

export default function PembayaranPage() {
  return (
    <div className="px-5 py-6 space-y-4">
      <p className="text-xs font-semibold text-primary tracking-widest uppercase">C-14</p>
      <h1 className="font-display text-3xl text-cocoa">Metode Pembayaran</h1>
      <p className="text-sm text-cocoa/60">
        QRIS, e-wallet (GoPay, OVO, Dana, ShopeePay), VA, Bayar di Toko (bersyarat BR-05)
      </p>
      <p className="text-xs text-cocoa/40">(FR-14, FR-15 — diimplementasi di Step 5.3)</p>
    </div>
  );
}
