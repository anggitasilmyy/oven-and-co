// pages/dev/DesignSystemPage.jsx
// /dev/design — Halaman uji Design System (dipindahkan dari App.jsx Step 1)
// Step 2 · Hanya untuk development
// Step 2.5 (PR A): contoh komponen layout responsif (LayoutShowcase, OverlayShowcase)
// Step 2.5 (PR B): pola halaman per layar & PlaceholderPanel (PagePatternShowcase)

import {
  ShoppingBag,
  Heart,
  Clock,
  MapPin,
  ChevronRight,
  Package,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton, { ProductGridSkeleton } from '../../components/ui/Skeleton';
import Stepper from '../../components/ui/Stepper';
import { useToast } from '../../components/ui/Toast';
import Toast from '../../components/ui/Toast';
import { formatRupiah, formatDate } from '../../utils/format';
import PageContainer from '../../components/layout/PageContainer';
import Section from './ShowcaseSection';
import LayoutShowcase from './LayoutShowcase';
import OverlayShowcase from './OverlayShowcase';
import PagePatternShowcase from './PagePatternShowcase';

/** Tanggal contoh (dihitung sekali saat modul dimuat agar render tetap murni) */
const SAMPLE_DATE = new Date();

const COLORS = [
  { name: 'cream', hex: '#FBF6EE', label: 'Background', textDark: true },
  { name: 'surface', hex: '#FFFDF9', label: 'Surface', textDark: true },
  { name: 'beige', hex: '#F1E6D6', label: 'Beige', textDark: true },
  { name: 'primary', hex: '#8B5E3C', label: 'Primary', textDark: false },
  { name: 'cocoa', hex: '#5C3D2E', label: 'Cocoa', textDark: false },
  { name: 'peach', hex: '#F4C7AB', label: 'Peach / Pre-order', textDark: true },
  { name: 'pink', hex: '#F2D4D7', label: 'Pink / Custom', textDark: true },
  { name: 'sage', hex: '#C9D8C5', label: 'Sage / Ready', textDark: true },
  { name: 'error', hex: '#C0564B', label: 'Error', textDark: false },
];

const CAKE_STEPS = ['Ukuran', 'Bentuk', 'Rasa', 'Krim & Topping', 'Tulisan', 'Tanggal'];

export default function DesignSystemPage() {
  const { toast, showToast, hideToast } = useToast();

  return (
    <div className="min-h-screen bg-cream py-10">
      <PageContainer className="mb-12 text-center">
        <p className="text-primary text-sm font-semibold tracking-widest uppercase mb-2">
          Design System · Step 1 → /dev/design
        </p>
        <h1 className="font-display text-4xl md:text-5xl text-cocoa mb-3">Oven &amp; Co.</h1>
        <p className="text-cocoa/60 font-sans text-base italic font-medium">
          Freshly Baked, Made With Care
        </p>
        <div className="mt-4 inline-flex items-center gap-2 bg-sage/60 text-cocoa px-4 py-2 rounded-pill text-sm font-semibold">
          <CheckCircle size={16} />
          Step 2.5 — responsive UI (PR A + PR B)
        </div>
      </PageContainer>

      <PageContainer className="space-y-10">

        {/* Palet Warna */}
        <Section title="🎨 Palet Warna">
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {COLORS.map((c) => (
              <div key={c.name} className="flex flex-col items-center gap-2">
                <div
                  className="w-full aspect-square rounded-card border border-black/10 shadow-sm"
                  style={{ backgroundColor: c.hex }}
                />
                <div className="text-center">
                  <p className="text-xs font-semibold text-cocoa">{c.label}</p>
                  <p className="text-xs text-cocoa/50 font-mono">{c.hex}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Tipografi */}
        <Section title="✍️ Tipografi">
          <Card>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-cocoa/40 uppercase tracking-widest mb-1 font-sans">
                  Playfair Display — Display / Heading
                </p>
                <p className="font-display text-4xl text-cocoa leading-tight">Premium Birthday Cake</p>
                <p className="font-display text-2xl text-cocoa mt-1">Custom Celebration Cake</p>
                <p className="font-display italic text-xl text-primary mt-1">"Freshly Baked, Made With Care"</p>
              </div>
              <hr className="border-beige" />
              <div>
                <p className="text-xs text-cocoa/40 uppercase tracking-widest mb-2 font-sans">
                  Plus Jakarta Sans — Body / UI
                </p>
                <p className="font-sans font-semibold text-lg text-cocoa">
                  {formatRupiah(28000)} · {formatDate(SAMPLE_DATE)}
                </p>
                <p className="font-sans text-base text-cocoa/80 mt-1">
                  Classic Butter Croissant — tersedia hari ini.
                </p>
                <p className="font-sans text-xs text-cocoa/40 mt-1">OVC-261012-018</p>
              </div>
            </div>
          </Card>
        </Section>

        {/* Tombol */}
        <Section title="🔘 Tombol (Button)">
          <Card className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button leftIcon={<ShoppingBag size={18} />}>Tambah ke Keranjang</Button>
              <Button variant="secondary" leftIcon={<Heart size={18} />}>Wishlist</Button>
              <Button variant="ghost" leftIcon={<ChevronRight size={18} />}>Lihat Semua</Button>
              <Button variant="danger">Batalkan Pesanan</Button>
            </div>
            <div><Button fullWidth>Pesan Sekarang</Button></div>
            <div className="flex flex-wrap gap-3">
              <Button size="sm">Kecil (sm)</Button>
              <Button size="md">Sedang (md)</Button>
              <Button size="lg">Besar (lg)</Button>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button disabled>Nonaktif</Button>
              <Button loading>Memproses...</Button>
            </div>
          </Card>
        </Section>

        {/* Input */}
        <Section title="📝 Input">
          <Card className="space-y-3">
            <Input label="Email atau Nomor HP" type="email" placeholder="contoh@email.com" />
            <Input
              label="Kata Sandi"
              type="password"
              placeholder="Minimal 8 karakter"
              error="Kata sandi minimal 8 karakter."
            />
            <Input label="Nama Lengkap" placeholder="Nama Anda" hint="Nama sesuai KTP" />
          </Card>
        </Section>

        {/* Badge */}
        <Section title="🏷️ Badge">
          <Card className="flex flex-wrap gap-3 items-center">
            <Badge variant="ready">✓ Ready · Bisa diambil hari ini</Badge>
            <Badge variant="preorder">🕐 Pre-order H-1</Badge>
            <Badge variant="custom">🎂 Custom H-3</Badge>
            <Badge variant="error">✕ Habis</Badge>
            <Badge variant="gold">Gold Member</Badge>
            <Badge variant="silver">Silver Member</Badge>
            <Badge variant="platinum">Platinum Member</Badge>
          </Card>
        </Section>

        {/* Stepper */}
        <Section title="📶 Stepper (Custom Cake Builder)">
          <Card className="space-y-4">
            <p className="text-xs text-cocoa/40">Langkah 3 dari 6</p>
            <Stepper steps={CAKE_STEPS} currentStep={2} />
          </Card>
        </Section>

        {/* Skeleton */}
        <Section title="⏳ Skeleton Loading">
          <div className="space-y-4">
            <Card className="space-y-3">
              <Skeleton variant="text" count={3} />
              <div className="flex gap-3">
                <Skeleton variant="circle" className="w-12 h-12" />
                <div className="flex-1 space-y-2">
                  <Skeleton variant="text" />
                  <Skeleton variant="text" className="w-2/3" />
                </div>
              </div>
            </Card>
            <ProductGridSkeleton count={4} />
          </div>
        </Section>

        {/* EmptyState */}
        <Section title="📭 Empty State">
          <Card>
            <EmptyState
              icon={<ShoppingBag size={36} />}
              title="Keranjang Kosong"
              description="Belum ada produk di keranjangmu. Yuk mulai belanja!"
              actionLabel="Lihat Katalog"
              onAction={() => {}}
            />
          </Card>
        </Section>

        {/* Toast */}
        <Section title="🔔 Toast">
          <Card className="flex flex-wrap gap-3">
            <Button size="sm" variant="secondary" onClick={() => showToast('success', 'Pesanan berhasil dibuat!')}>
              Toast Sukses
            </Button>
            <Button size="sm" variant="secondary" onClick={() => showToast('error', 'Voucher tidak berlaku untuk pesanan ini.')}>
              Toast Error
            </Button>
            <Button size="sm" variant="secondary" onClick={() => showToast('info', 'Stok hampir habis — tersisa 3 porsi.')}>
              Toast Info
            </Button>
          </Card>
          <Toast {...toast} onClose={hideToast} />
        </Section>

        {/* Status Pesanan */}
        <Section title="📦 Status Pesanan">
          <Card padding="p-0" className="overflow-hidden">
            {[
              { status: 'Menunggu Pembayaran', color: 'bg-yellow-100 text-yellow-700', icon: <Clock size={14} /> },
              { status: 'Dikonfirmasi', color: 'bg-blue-100 text-blue-700', icon: <CheckCircle size={14} /> },
              { status: 'Sedang Disiapkan', color: 'bg-orange-100 text-orange-700', icon: <Package size={14} /> },
              { status: 'Siap Diambil', color: 'bg-sage text-cocoa', icon: <MapPin size={14} /> },
              { status: 'Selesai', color: 'bg-sage text-cocoa', icon: <CheckCircle size={14} /> },
              { status: 'Dibatalkan', color: 'bg-red-100 text-error', icon: <AlertCircle size={14} /> },
            ].map((s, i) => (
              <div
                key={s.status}
                className={`flex items-center justify-between px-4 py-3 ${i % 2 === 0 ? 'bg-surface' : 'bg-cream/40'}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <ShoppingBag size={14} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-cocoa/50">OVC-261012-{String(i + 1).padStart(3, '0')}</p>
                    <p className="text-sm font-semibold text-cocoa">Classic Butter Croissant</p>
                  </div>
                </div>
                <span className={`badge text-[10px] ${s.color}`}>
                  {s.icon}<span className="ml-1">{s.status}</span>
                </span>
              </div>
            ))}
          </Card>
        </Section>

        {/* Overlay responsif */}
        <Section title="🪟 Modal & BottomSheet">
          <OverlayShowcase />
        </Section>

        {/* Komponen layout responsif */}
        <LayoutShowcase />

        {/* Pola halaman yang diterapkan (PR B) */}
        <PagePatternShowcase />

        <div className="text-center text-xs text-cocoa/60 pb-4">
          <p>Oven &amp; Co. Design System · Step 2.5 (PR A + PR B)</p>
        </div>
      </PageContainer>
    </div>
  );
}
