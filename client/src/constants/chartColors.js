// constants/chartColors.js
// Step 8 · F-09 — palet grafik Recharts. SVG Recharts butuh nilai warna langsung (kelas Tailwind tidak berlaku), jadi
// nilainya disatukan di sini, bukan ditulis ulang per komponen. Nilai = token tailwind.config.js (primary, cocoa,
// beige, cocoa-light, caramel); ubah bersamaan bila token berubah.

export const CHART_COLOR = {
  primary: '#8B5E3C', // garis/batang utama (Soft Brown)
  cocoa: '#5C3D2E', // warna seri cadangan
  grid: '#F1E6D6', // garis grid & kursor batang (beige)
  axis: '#7a5240', // label sumbu (cocoa-light; ≥ 4.5:1 di putih)
  caramel: '#D9A441', // area grafik omzet (PRD Batch 6 "Caramel") & bintang rating
  sageDark: '#9DB496', // kelompok Bayar di Toko pada donut metode bayar (lebih gelap dari token sage #C9D8C5)
  white: '#FFFFFF', // tepi titik data
};
