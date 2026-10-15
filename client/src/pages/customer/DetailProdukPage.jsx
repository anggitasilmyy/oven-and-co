// pages/customer/DetailProdukPage.jsx
// C-09 · Detail Produk & Tambah ke Keranjang
// Step 2 · Placeholder

import { useParams } from 'react-router-dom';

export default function DetailProdukPage() {
  const { id } = useParams();

  return (
    <div className="px-5 py-6 space-y-4">
      <p className="text-xs font-semibold text-primary tracking-widest uppercase">C-09</p>
      <h1 className="font-display text-3xl text-cocoa">Detail Produk</h1>
      <p className="text-sm text-cocoa/60">ID produk: <code className="font-mono">{id}</code></p>
      <p className="text-sm text-cocoa/60">
        Foto, nama, harga, badge ketersediaan, deskripsi, pilihan varian,
        jumlah, tanggal pre-order, ulasan ringkasan, tombol Tambah ke Keranjang
      </p>
    </div>
  );
}
