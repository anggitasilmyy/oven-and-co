// App.jsx — Halaman uji Design System Oven & Co.
// Step 1 · Setup Project

import {
  ShoppingBag,
  Heart,
  Star,
  Clock,
  MapPin,
  ChevronRight,
  Cake,
  Coffee,
  Package,
  CheckCircle,
  AlertCircle,
  Bell,
} from 'lucide-react';

// ── Data contoh untuk preview ────────────────────────────────────────────────
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

export default function App() {
  return (
    <div className="min-h-screen bg-cream py-10 px-4">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto mb-12 text-center">
        <p className="text-primary text-sm font-semibold tracking-widest uppercase mb-2">
          Design System · Step 1
        </p>
        <h1 className="font-display text-4xl md:text-5xl text-cocoa mb-3">
          Oven & Co.
        </h1>
        <p className="text-cocoa/60 font-sans text-base italic font-medium">
          Freshly Baked, Made With Care
        </p>
        <div className="mt-4 inline-flex items-center gap-2 bg-sage/60 text-cocoa px-4 py-2 rounded-pill text-sm font-semibold">
          <CheckCircle size={16} />
          Design tokens terpasang — siap mulai development
        </div>
      </div>

      <div className="max-w-3xl mx-auto space-y-10">

        {/* ── Palet Warna ──────────────────────────────────────────────── */}
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

        {/* ── Tipografi ────────────────────────────────────────────────── */}
        <Section title="✍️ Tipografi">
          <div className="space-y-4 bg-surface p-6 rounded-card border border-beige">
            <div>
              <p className="text-xs text-cocoa/40 uppercase tracking-widest mb-1 font-sans">
                Playfair Display — Display / Heading
              </p>
              <p className="font-display text-4xl text-cocoa leading-tight">
                Premium Birthday Cake
              </p>
              <p className="font-display text-2xl text-cocoa mt-1">
                Custom Celebration Cake
              </p>
              <p className="font-display italic text-xl text-primary mt-1">
                "Freshly Baked, Made With Care"
              </p>
            </div>
            <hr className="border-beige" />
            <div>
              <p className="text-xs text-cocoa/40 uppercase tracking-widest mb-2 font-sans">
                Plus Jakarta Sans — Body / UI
              </p>
              <p className="font-sans font-semibold text-lg text-cocoa">
                Harga: Rp 28.000
              </p>
              <p className="font-sans text-base text-cocoa/80 mt-1">
                Classic Butter Croissant — tersedia hari ini, siap diambil sesuai jam operasional.
              </p>
              <p className="font-sans text-sm text-cocoa/50 mt-1">
                Deskripsi: Dibuat dari mentega berkualitas, dipanggang tiap pagi untuk menjaga kesegaran.
              </p>
              <p className="font-sans text-xs text-cocoa/40 mt-1">
                Nomor pesanan: OVC-261012-018 · Selasa, 13 Okt 2026
              </p>
            </div>
          </div>
        </Section>

        {/* ── Tombol ───────────────────────────────────────────────────── */}
        <Section title="🔘 Tombol">
          <div className="bg-surface p-6 rounded-card border border-beige space-y-4">
            <div className="flex flex-wrap gap-3">
              <button className="btn-primary">
                <ShoppingBag size={18} /> Tambah ke Keranjang
              </button>
              <button className="btn-secondary">
                <Heart size={18} /> Simpan ke Wishlist
              </button>
              <button className="btn-ghost">
                <ChevronRight size={18} /> Lihat Semua
              </button>
              <button className="btn-danger">
                Batalkan Pesanan
              </button>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="btn-primary w-full">
                Pesan Sekarang
              </button>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="btn-primary" disabled>
                Nonaktif
              </button>
              <button className="btn-secondary" disabled>
                Nonaktif
              </button>
            </div>
          </div>
        </Section>

        {/* ── Input ────────────────────────────────────────────────────── */}
        <Section title="📝 Input">
          <div className="bg-surface p-6 rounded-card border border-beige space-y-3">
            <div>
              <label className="block text-sm font-semibold text-cocoa mb-1.5" htmlFor="demo-email">
                Email atau Nomor HP
              </label>
              <input
                id="demo-email"
                type="email"
                placeholder="contoh@email.com"
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-cocoa mb-1.5" htmlFor="demo-pass">
                Kata Sandi
              </label>
              <input
                id="demo-pass"
                type="password"
                placeholder="Minimal 8 karakter"
                className="input"
              />
              <p className="text-xs text-error mt-1.5 flex items-center gap-1">
                <AlertCircle size={12} /> Kata sandi minimal 8 karakter.
              </p>
            </div>
          </div>
        </Section>

        {/* ── Badge & Status ───────────────────────────────────────────── */}
        <Section title="🏷️ Badge & Status">
          <div className="bg-surface p-6 rounded-card border border-beige flex flex-wrap gap-3 items-center">
            <span className="badge-ready">✓ Ready · Bisa diambil hari ini</span>
            <span className="badge-preorder">🕐 Pre-order H-1</span>
            <span className="badge-custom">🎂 Custom H-3</span>
            <span className="badge-error">✕ Habis</span>
            <span className="badge bg-primary/10 text-primary">Gold Member</span>
            <span className="badge bg-yellow-100 text-yellow-700">
              <Star size={12} className="mr-1" fill="currentColor" /> 4.8 (124 ulasan)
            </span>
          </div>
        </Section>

        {/* ── Kartu Produk (preview) ───────────────────────────────────── */}
        <Section title="🃏 Kartu Produk">
          <div className="grid grid-cols-2 gap-4">
            {[
              {
                name: 'Classic Butter Croissant',
                price: 'Rp 28.000',
                badge: 'ready',
                badgeLabel: '✓ Ready',
                icon: <Coffee size={40} className="text-primary/40" />,
              },
              {
                name: 'Premium Birthday Cake',
                price: 'Rp 285.000',
                badge: 'preorder',
                badgeLabel: '🕐 Pre-order H-1',
                icon: <Cake size={40} className="text-primary/40" />,
              },
            ].map((product) => (
              <div key={product.name} className="card overflow-hidden group cursor-pointer">
                {/* Gambar placeholder */}
                <div className="aspect-square bg-beige flex items-center justify-center relative">
                  <div className="opacity-50 group-hover:opacity-70 transition-opacity">
                    {product.icon}
                  </div>
                  <button
                    className="absolute top-3 right-3 w-8 h-8 bg-white/80 rounded-full
                               flex items-center justify-center text-primary/40
                               hover:text-error transition-colors"
                    aria-label="Simpan ke wishlist"
                  >
                    <Heart size={16} />
                  </button>
                </div>
                {/* Info */}
                <div className="p-3 space-y-1.5">
                  <span className={`badge-${product.badge} text-[10px]`}>
                    {product.badgeLabel}
                  </span>
                  <p className="font-sans font-semibold text-cocoa text-sm leading-tight line-clamp-2">
                    {product.name}
                  </p>
                  <p className="font-sans font-bold text-primary text-sm">{product.price}</p>
                  <div className="flex items-center gap-1 text-cocoa/50 text-xs">
                    <Star size={11} fill="currentColor" className="text-yellow-400" />
                    <span>4.8</span>
                    <span>· 124 ulasan</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Status Pesanan ───────────────────────────────────────────── */}
        <Section title="📦 Status Pesanan">
          <div className="bg-surface rounded-card border border-beige overflow-hidden">
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
                  {s.icon}
                  <span className="ml-1">{s.status}</span>
                </span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Notifikasi Stack ─────────────────────────────────────────── */}
        <Section title="🔔 Toast / Notifikasi">
          <div className="space-y-3">
            {[
              { type: 'success', msg: 'Pesanan berhasil dibuat! Silakan lakukan pembayaran.', color: 'bg-sage border-sage text-cocoa' },
              { type: 'error', msg: 'Voucher tidak berlaku untuk pesanan ini.', color: 'bg-red-50 border-error/30 text-error' },
              { type: 'info', msg: 'Stok hampir habis — tersisa 3 porsi untuk hari ini.', color: 'bg-peach/50 border-peach text-cocoa' },
            ].map((t) => (
              <div key={t.type} className={`flex items-center gap-3 px-4 py-3 rounded-btn border ${t.color}`}>
                <Bell size={16} className="shrink-0" />
                <p className="text-sm font-medium">{t.msg}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="text-center text-xs text-cocoa/40 pb-4">
          <p>Oven & Co. Design System · Step 1 selesai ✅</p>
          <p className="mt-1">Selanjutnya: Step 2 — Layout Utama & Komponen Dasar</p>
        </div>
      </div>
    </div>
  );
}

// ── Helper component ─────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <section>
      <h2 className="font-display text-xl text-cocoa mb-4">{title}</h2>
      {children}
    </section>
  );
}
