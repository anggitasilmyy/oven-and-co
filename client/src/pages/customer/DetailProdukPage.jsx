// pages/customer/DetailProdukPage.jsx
// C-09 · Detail Produk & Tambah ke Keranjang
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import { useParams } from 'react-router-dom';
import FocusPageGrid from '../../components/layout/FocusPageGrid';
import ActionBar from '../../components/layout/ActionBar';
import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function DetailProdukPage() {
  const { id } = useParams();

  return (
    <FocusPageGrid
      aside={
        <ActionBar label="Ringkasan & aksi">
          <PlaceholderPanel step="Step 5.1" compact>
            Harga, jumlah, dan tombol Tambah ke Keranjang.
          </PlaceholderPanel>
        </ActionBar>
      }
    >
      <div className="space-y-6">
        <PageHeader
          screenCode="C-09"
          title="Detail Produk"
          description={<>ID produk: <code className="font-mono">{id}</code></>}
        />
        <PlaceholderPanel step="Step 5.1" refs="FR-08">
          Foto, nama, harga, badge ketersediaan, deskripsi, pilihan varian, jumlah, tanggal pre-order, ulasan ringkasan.
        </PlaceholderPanel>
      </div>
    </FocusPageGrid>
  );
}
