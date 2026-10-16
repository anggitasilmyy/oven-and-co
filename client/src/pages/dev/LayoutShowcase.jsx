// pages/dev/LayoutShowcase.jsx
// Step 2.5 (PR A) · Contoh pemakaian components/layout/ di /dev/design (hanya development)

import { Plus, ShoppingBag } from 'lucide-react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import PageContainer from '../../components/layout/PageContainer';
import PageHeader from '../../components/layout/PageHeader';
import ResponsiveGrid from '../../components/layout/ResponsiveGrid';
import FocusPageGrid from '../../components/layout/FocusPageGrid';
import ActionBar from '../../components/layout/ActionBar';
import TableScroll from '../../components/layout/TableScroll';
import AuthSplitLayout from '../../components/layout/AuthSplitLayout';
import BreakpointIndicator from './BreakpointIndicator';
import Section from './ShowcaseSection';
import { formatRupiah } from '../../utils/format';

const SAMPLE_PRODUCTS = ['Croissant', 'Cinnamon Roll', 'Lava Cake', 'Cookies Box', 'Birthday Cake', 'Custom Cake'];
const TABLE_COLUMNS = ['No. Pesanan', 'Pelanggan', 'Tanggal Siap', 'Metode', 'Status', 'Total'];

/** Kotak demo: `transform` membuat elemen `fixed` (ActionBar < lg) menempel di kotak ini, bukan di layar */
function DemoFrame({ children, className = '' }) {
  return (
    <div className={`relative [transform:translateZ(0)] overflow-hidden rounded-card border border-dashed border-primary/40 bg-cream ${className}`}>
      {children}
    </div>
  );
}

export default function LayoutShowcase() {
  return (
    <>
      <Section title="📐 Breakpoint aktif">
        <BreakpointIndicator />
      </Section>

      <Section title="📦 PageContainer (default · narrow)">
        <DemoFrame className="py-4 space-y-3">
          <PageContainer><div className="h-10 rounded-btn bg-peach/60 text-xs flex items-center px-3">default · max 1280 px</div></PageContainer>
          <PageContainer variant="narrow"><div className="h-10 rounded-btn bg-sage/70 text-xs flex items-center px-3">narrow · max 720 px</div></PageContainer>
        </DemoFrame>
      </Section>

      <Section title="🧭 PageHeader + ResponsiveGrid">
        <DemoFrame className="py-6">
          <PageContainer className="space-y-6">
            <PageHeader
              screenCode="C-06"
              title="Katalog"
              description="Contoh judul halaman dengan slot aksi; di HP tombol turun ke bawah judul."
              actions={<Button size="sm" variant="secondary" leftIcon={<Plus size={16} />}>Aksi</Button>}
            />
            <ResponsiveGrid cols={{ base: 2, md: 3, lg: 4 }}>
              {SAMPLE_PRODUCTS.map((name) => (
                <Card key={name} padding="p-3">
                  <div className="aspect-square rounded-btn bg-beige mb-2" />
                  <p className="text-sm font-semibold truncate">{name}</p>
                  <p className="text-sm text-primary font-semibold">{formatRupiah(28000)}</p>
                </Card>
              ))}
            </ResponsiveGrid>
          </PageContainer>
        </DemoFrame>
      </Section>

      <Section title="🧾 FocusPageGrid + ActionBar">
        <p className="text-xs text-cocoa/60 mb-3">&lt; 1024 px: bar di bawah kotak · ≥ 1024 px: kartu sticky di kolom kanan.</p>
        <DemoFrame className="min-h-[420px]">
          <FocusPageGrid
            aside={
              <ActionBar summary={<><p className="text-xs text-cocoa/60">Total</p><p className="font-semibold text-lg">{formatRupiah(84000)}</p></>}>
                <Button leftIcon={<ShoppingBag size={18} />}>Tambah ke Keranjang</Button>
              </ActionBar>
            }
          >
            <div className="space-y-4">
              <div className="aspect-[4/3] max-h-[320px] w-full rounded-card bg-beige" />
              <p className="font-display text-2xl">Classic Butter Croissant</p>
              <p className="text-sm text-cocoa/70">Konten utama halaman fokus berada di kolom kiri.</p>
            </div>
          </FocusPageGrid>
        </DemoFrame>
      </Section>

      <Section title="📊 TableScroll (tabel admin)">
        <div className="card-admin p-4">
          <TableScroll label="Contoh tabel pesanan">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-cocoa/60 border-b border-beige">
                <tr>{TABLE_COLUMNS.map((c) => <th key={c} className="py-2 px-3 font-semibold">{c}</th>)}</tr>
              </thead>
              <tbody>
                {[18, 19, 20].map((n) => (
                  <tr key={n} className="border-b border-beige/60 last:border-0">
                    <td className="py-2 px-3">OVC-261012-0{n}</td>
                    <td className="py-2 px-3">Anisa</td>
                    <td className="py-2 px-3">Selasa, 13 Okt</td>
                    <td className="py-2 px-3">Pickup</td>
                    <td className="py-2 px-3">Dikonfirmasi</td>
                    <td className="py-2 px-3 text-right">{formatRupiah(56000)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
      </Section>

      <Section title="🔐 AuthSplitLayout">
        <DemoFrame>
          <AuthSplitLayout subtitle="Admin Panel" className="min-h-[420px]">
            <p className="font-display text-2xl mb-2">Masuk Admin</p>
            <p className="text-sm text-cocoa/60">≥ 1024 px: panel brand kiri + form kanan · &lt; 1024 px: form saja.</p>
          </AuthSplitLayout>
        </DemoFrame>
      </Section>
    </>
  );
}
