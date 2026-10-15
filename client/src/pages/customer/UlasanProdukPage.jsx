// pages/customer/UlasanProdukPage.jsx
// C-10 · Ulasan Produk
// Step 2 · Placeholder

import { useParams } from 'react-router-dom';

export default function UlasanProdukPage() {
  const { id } = useParams();

  return (
    <div className="px-5 py-6 space-y-4">
      <p className="text-xs font-semibold text-primary tracking-widest uppercase">C-10</p>
      <h1 className="font-display text-3xl text-cocoa">Ulasan Produk</h1>
      <p className="text-sm text-cocoa/60">ID produk: <code className="font-mono">{id}</code></p>
      <p className="text-sm text-cocoa/60">
        Ringkasan rating, daftar ulasan (bintang, komentar, foto, tag)
      </p>
    </div>
  );
}
