// constants/customCake.js
// FR-10 · UC-06 · C-11 Custom Cake Builder — langkah, kelompok opsi, tulisan, foto referensi, preview
// Nilai yang tidak diatur dokumen adalah asumsi prototype (ditandai) dan mudah diganti.

/** Kelompok opsi (SPEC §8 custom_options.option_group) */
export const CUSTOM_OPTION_GROUP = {
  UKURAN: 'ukuran',
  BENTUK: 'bentuk',
  RASA: 'rasa',
  KRIM_TOPPING: 'krim_topping',
};

/** Urutan kelompok opsi di builder (satu pilihan per kelompok, asumsi TF-08) */
export const CUSTOM_OPTION_GROUPS = [
  CUSTOM_OPTION_GROUP.UKURAN,
  CUSTOM_OPTION_GROUP.BENTUK,
  CUSTOM_OPTION_GROUP.RASA,
  CUSTOM_OPTION_GROUP.KRIM_TOPPING,
];

/** Kunci langkah selain kelompok opsi */
export const CUSTOM_CAKE_STEP = { TULISAN: 'tulisan', TANGGAL: 'tanggal' };

/** 6 langkah builder (PRD 7.3): Ukuran → Bentuk → Rasa → Krim & Topping → Tulisan → Tanggal */
export const CUSTOM_CAKE_STEPS = [
  { key: CUSTOM_OPTION_GROUP.UKURAN, label: 'Ukuran', title: 'Pilih ukuran kue', group: CUSTOM_OPTION_GROUP.UKURAN },
  { key: CUSTOM_OPTION_GROUP.BENTUK, label: 'Bentuk', title: 'Pilih bentuk kue', group: CUSTOM_OPTION_GROUP.BENTUK },
  { key: CUSTOM_OPTION_GROUP.RASA, label: 'Rasa', title: 'Pilih rasa kue', group: CUSTOM_OPTION_GROUP.RASA },
  { key: CUSTOM_OPTION_GROUP.KRIM_TOPPING, label: 'Krim & Topping', title: 'Pilih krim & topping', group: CUSTOM_OPTION_GROUP.KRIM_TOPPING },
  { key: CUSTOM_CAKE_STEP.TULISAN, label: 'Tulisan', title: 'Tulisan di kue', group: null },
  { key: CUSTOM_CAKE_STEP.TANGGAL, label: 'Tanggal', title: 'Tanggal ambil/antar', group: null },
];

/** Tulisan di kue maks. 30 karakter (validation rule Custom cake; custom_cake_designs.writing_text VARCHAR(30)) */
export const WRITING_TEXT_MAX_LENGTH = 30;

/**
 * Pilihan warna tulisan (custom_cake_designs.writing_color VARCHAR(20) menyimpan `name`).
 * Asumsi prototype: daftar warna tidak diatur dokumen; sama dengan data contoh pesanan.
 */
export const WRITING_COLORS = [
  { name: 'Cokelat', hex: '#5C3D2E' },
  { name: 'Putih', hex: '#FFFFFF' },
  { name: 'Pink', hex: '#D9798A' },
  { name: 'Emas', hex: '#B8892B' },
];

/** Foto referensi opsional (PRD F-11) — asumsi prototype: hanya gambar, maks. 5 MB */
export const REFERENCE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const REFERENCE_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * Mode mock: foto referensi diperkecil lalu disimpan sebagai data URL di localStorage
 * (pengganti upload multer Step 6) agar kuota penyimpanan peramban tidak cepat habis.
 */
export const REFERENCE_PHOTO_PREVIEW = { MAX_SIDE: 640, QUALITY: 0.75 };

/** Rentang tanggal yang ditampilkan pada langkah Tanggal (hari, termasuk hari ini) — asumsi prototype */
export const CUSTOM_CAKE_DATE_WINDOW_DAYS = 30;

/** Teks bantuan langkah Tanggal (UI/UX Spec Batch 3) */
export const CUSTOM_CAKE_DATE_HELPER = 'Custom cake butuh minimal 3 hari untuk dibuat with care.';

/**
 * Tampilan preview & ikon opsi. Opsi dikelola admin (AD-06), jadi dicocokkan lewat kata kunci nama;
 * opsi baru tanpa kata kunci memakai tampilan bawaan.
 */
export const CAKE_SHAPE_VISUALS = [
  { keyword: 'kotak', shape: 'square' },
  { keyword: 'hati', shape: 'heart' },
];
export const DEFAULT_CAKE_SHAPE = 'round';

export const CAKE_FLAVOR_COLORS = [
  { keyword: 'vanilla', color: '#EBCB8B' },
  { keyword: 'cokelat', color: '#6B4231' },
  { keyword: 'red velvet', color: '#9E2B32' },
  { keyword: 'pandan', color: '#8FB46A' },
];
export const DEFAULT_CAKE_FLAVOR_COLOR = '#E3C08F';

export const CAKE_CREAM_VISUALS = [
  { keyword: 'whipped', top: '#FFFFFF', accent: '#E0565B', decor: 'fruit' },
  { keyword: 'ganache', top: '#4A2C20', accent: '#C9A227', decor: 'drip' },
  { keyword: 'buttercream', top: '#FFF1DC', accent: '#E9C9A0', decor: 'piping' },
];
export const DEFAULT_CAKE_CREAM = { top: '#FFF1DC', accent: '#E9C9A0', decor: 'piping' };
