// pages/customer/AkunPage.jsx
// C-20 · Akun (profil, poin, menu sub-akun)
// Step 2 · Placeholder

export default function AkunPage() {
  return (
    <div className="px-5 py-6 space-y-4">
      <p className="text-xs font-semibold text-primary tracking-widest uppercase">C-20</p>
      <h1 className="font-display text-3xl text-cocoa">Akun</h1>
      <p className="text-sm text-cocoa/60">
        Foto profil, nama, level member (Silver/Gold/Platinum), saldo poin,
        menu: Ubah Profil, Voucher &amp; Poin, Alamat, Wishlist, Keluar
      </p>
      <p className="text-xs text-cocoa/40">(FR-22, FR-24 — diimplementasi di Step 5.5)</p>
    </div>
  );
}
