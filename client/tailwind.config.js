// tailwind.config.js
// Step 1 — Design tokens dari AGENTS.md bagian 5

/** @type {import('tailwindcss').Config} */
export default {
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

      // Max-width konten pelanggan
      maxWidth: {
        mobile: '480px',
      },

      // ── Animasi halus ─────────────────────────────────────────────────────
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
