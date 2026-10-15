// pages/admin/StokPage.jsx
// AD-07 · Stok Harian & Bahan Baku
// Step 2 · Placeholder

export default function StokPage() {
  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-primary tracking-widest uppercase">AD-07</p>
      <h1 className="font-display text-3xl text-cocoa">Stok</h1>
      <p className="text-sm text-cocoa/60">
        Stok harian produk (qty_planned, qty_sold), bahan baku + peringatan stok minimum (FR-32)
      </p>
      <p className="text-xs text-cocoa/40">(diimplementasi di Step 5.7)</p>
    </div>
  );
}
