// pages/customer/CheckoutPage.jsx
// C-13 · Checkout (pickup/delivery, voucher, poin)
// Step 2 · Placeholder

export default function CheckoutPage() {
  return (
    <div className="px-5 py-6 space-y-4">
      <p className="text-xs font-semibold text-primary tracking-widest uppercase">C-13</p>
      <h1 className="font-display text-3xl text-cocoa">Checkout</h1>
      <p className="text-sm text-cocoa/60">
        Pilihan pickup/delivery, alamat, slot waktu, voucher, tukar poin, ringkasan biaya
      </p>
      <p className="text-xs text-cocoa/40">(FR-12, FR-13, BR-03, BR-05 — diimplementasi di Step 5.3)</p>
    </div>
  );
}
