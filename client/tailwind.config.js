// tailwind.config.js
// Step 1 — Design tokens dari AGENTS.md bagian 5
// Step 2.5 (PR A) — token max-width responsif, NFR-06 (CR-01)

/** @type {import('tailwindcss').Config} */
export default {
  // Hover hanya aktif di perangkat yang mendukung hover (hindari hover "lengket" di layar sentuh)
  future: {
    hoverOnlyWhenSupported: true,
  },
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // ── Warna brand ──────────────────────────────────────────────────────
      colors: {
        cream: '#FBF6EE',      // background utama pelanggan
        surface: '#FFFDF9',    // surface kartu
        beige: '#F1E6D6',      // separator, input fill
        primary: '#8B5E3C',    // warna utama (tombol, link aktif)
        cocoa: '#5C3D2E',      // judul / heading
        peach: '#F4C7AB',      // badge pre-order / promo
        pink: '#F2D4D7',       // badge custom cake
        sage: '#C9D8C5',       // badge ready / sukses
        error: '#C0564B',      // error / destruktif

        // Shade untuk kebutuhan hover / disabled
        'primary-dark': '#6f4a2f',
        'primary-light': '#a8754f',
        'cocoa-light': '#7a5240',
      },

      // ── Font ─────────────────────────────────────────────────────────────
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],   // judul
        sans: ['"Plus Jakarta Sans"', 'sans-serif'], // teks, tombol, harga
      },

      // ── Border radius ────────────────────────────────────────────────────
      borderRadius: {
        card: '20px',    // kartu pelanggan
        btn: '14px',     // tombol
        'card-admin': '16px', // kartu admin
        pill: '9999px',  // badge pill
      },

      // ── Ukuran / spacing ─────────────────────────────────────────────────
      // Grid dasar 8 px (Tailwind default sudah 4px; kita tambah alias eksplisit)
      spacing: {
        'side': '20px',  // margin samping halaman pelanggan
      },

      // Tinggi komponen
      height: {
        btn: '52px',    // tinggi tombol utama
        input: '48px',  // tinggi input
        'touch-min': '44px', // area sentuh minimum aksesibilitas
      },
      minHeight: {
        'touch-min': '44px',
      },
      minWidth: {
        'touch-min': '44px',
      },

      // Max-width kontainer responsif (CR-01) — dipakai PageContainer & AuthSplitLayout
      maxWidth: {
        content: '1280px', // kontainer halaman default (desktop)
        narrow: '720px',   // halaman fokus satu kolom (form, detail sempit)
        auth: '440px',     // form autentikasi
      },

      // ── Animasi ───────────────────────────────────────────────────────────
      // slide-up  : BottomSheet di mobile
      // fade-in-up: Toast (naik 12 px + fade). Toast diposisikan dengan inset/margin,
      //             bukan translateX, jadi keyframe ini tidak menggeser elemen.
      // modal-in  : Modal & BottomSheet versi dialog (≥ md) — fade + scale tanpa translate.
      //             (Bug lama: Modal memakai fade-in-up berisi translateX(-50%) milik Toast
      //             sehingga modal tergeser ke kiri.)
      keyframes: {
        'slide-up': {
          from: { transform: 'translateY(100%)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in-up': {
          from: { transform: 'translateY(12px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'modal-in': {
          from: { transform: 'scale(0.96)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
        // Step 5.7: Drawer form produk AD-06 masuk dari kanan
        'drawer-in': {
          from: { transform: 'translateX(24px)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.28s cubic-bezier(0.32, 0.72, 0, 1) both',
        'fade-in-up': 'fade-in-up 0.22s ease-out both',
        'modal-in': 'modal-in 0.2s ease-out both',
        'drawer-in': 'drawer-in 0.22s ease-out both',
      },

      // ── Transisi halus ────────────────────────────────────────────────────
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
    },
  },
  plugins: [
    // @tailwindcss/forms untuk styling input yang konsisten
    require('@tailwindcss/forms')({ strategy: 'class' }),
  ],
};
