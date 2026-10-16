// pages/customer/CustomCakePage.jsx
// C-11 · Custom Cake Builder (6 langkah)
// Step 2 · Placeholder — Stepper ditampilkan sebagai preview komponen
// Step 2.5 (PR B): kerangka responsif — preview & langkah di kiri, harga berjalan + aksi di ActionBar

import Stepper from '../../components/ui/Stepper';
import FocusPageGrid from '../../components/layout/FocusPageGrid';
import ActionBar from '../../components/layout/ActionBar';
import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

const STEPS = ['Ukuran', 'Bentuk', 'Rasa', 'Krim & Topping', 'Tulisan', 'Tanggal'];

export default function CustomCakePage() {
  return (
    <FocusPageGrid
      aside={
        <ActionBar label="Ringkasan & aksi">
          <PlaceholderPanel step="Step 5.2" compact>
            Harga berjalan dan tombol Lanjut / Tambah ke Keranjang.
          </PlaceholderPanel>
        </ActionBar>
      }
    >
      <div className="space-y-6">
        <PageHeader screenCode="C-11" title="Custom Cake Builder" description="6 langkah · Tanggal ≥ H+3 (BR-02)" />

        {/* Preview Stepper */}
        <div className="card p-4 md:p-6">
          <Stepper steps={STEPS} currentStep={2} />
        </div>

        <PlaceholderPanel step="Step 5.2" refs="FR-10 · BR-02">
          Preview kue dan konten tiap langkah: ukuran, bentuk, rasa, krim &amp; topping, tulisan (maks. 30 karakter), tanggal.
        </PlaceholderPanel>
      </div>
    </FocusPageGrid>
  );
}
