// constants/adminCatalog.js
// FR-30 · FR-31 · FR-32 · UC-23 · UC-24 · AD-06 Produk & Opsi Custom Cake · AD-07 Stok
// Batas panjang mengikuti tipe kolom SPEC §8. Nilai yang tidak diatur dokumen ditandai "asumsi prototype".

import { AVAILABILITY_TYPE } from './product';
import { CUSTOM_OPTION_GROUP } from './customCake';
import { CUSTOM_CAKE_MIN_LEAD_DAYS } from './storeConfig';
import { PREORDER_DATE_WINDOW_DAYS } from './productDetail';

/** Tab AD-06 (UI/UX Spec Batch 7: tabel produk + tab "Opsi Custom Cake") — disimpan di URL ?tab= */
export const PRODUCT_ADMIN_TAB = { PRODUK: 'produk', OPSI: 'opsi' };
export const PRODUCT_ADMIN_TABS = [
  { key: PRODUCT_ADMIN_TAB.PRODUK, label: 'Produk' },
  { key: PRODUCT_ADMIN_TAB.OPSI, label: 'Opsi Custom Cake' },
];

/** Tab AD-07 (UI/UX Spec Batch 7: "Stok Produk Harian" & "Bahan Baku") */
export const STOCK_TAB = { HARIAN: 'harian', BAHAN: 'bahan' };
export const STOCK_TABS = [
  { key: STOCK_TAB.HARIAN, label: 'Stok Produk Harian' },
  { key: STOCK_TAB.BAHAN, label: 'Bahan Baku' },
];

/** Panjang maksimum kolom (SPEC §8) */
export const PRODUCT_FIELD_MAX = {
  name: 100, // products.name VARCHAR(100)
  allergens: 255, // products.allergens VARCHAR(255)
  variantName: 50, // product_variants.name VARCHAR(50)
  optionName: 50, // custom_options.name VARCHAR(50)
  optionDescription: 100, // custom_options.description VARCHAR(100)
  materialName: 100, // raw_materials.name VARCHAR(100)
  materialUnit: 20, // raw_materials.unit VARCHAR(20)
};

/** Batas harga & angka DECIMAL(12,2) / DECIMAL(10,2) */
export const MAX_PRICE = 9_999_999_999.99;
export const MAX_MATERIAL_QTY = 99_999_999.99;

/** Label tipe produk di tabel & form (UI/UX Spec Batch 7: Ready / Pre-order H-1 / Custom H-3) */
export const AVAILABILITY_TYPE_LABEL = {
  [AVAILABILITY_TYPE.READY]: 'Ready',
  [AVAILABILITY_TYPE.PREORDER]: 'Pre-order',
  [AVAILABILITY_TYPE.CUSTOM]: 'Custom cake',
};

/**
 * Lead time per tipe (SPEC §8 lead_time_days: 0 ready, 1 pre-order, 3 custom · BR-02 minimal H-1 / H-3).
 * Maksimum = asumsi prototype: tanggal siap tercepat (lead time + 1 hari bila lewat batas jam pre-order)
 * harus tetap berada di jendela tanggal Detail Produk & Checkout (14 hari) agar produk tetap bisa dipesan.
 */
export const LEAD_TIME_MAX_DAYS = PREORDER_DATE_WINDOW_DAYS - 2;
export const LEAD_TIME_RULE = {
  [AVAILABILITY_TYPE.READY]: { min: 0, max: 0, default: 0 },
  [AVAILABILITY_TYPE.PREORDER]: { min: 1, max: LEAD_TIME_MAX_DAYS, default: 1 },
  [AVAILABILITY_TYPE.CUSTOM]: { min: CUSTOM_CAKE_MIN_LEAD_DAYS, max: LEAD_TIME_MAX_DAYS, default: CUSTOM_CAKE_MIN_LEAD_DAYS },
};

/** Foto produk: maks. 5 (FR-30). Mode mock: diperkecil lalu disimpan sebagai data URL (pengganti multer Step 6). */
export const PRODUCT_PHOTO_MAX = 5;
export const PRODUCT_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';
export const PRODUCT_PHOTO_MAX_BYTES = 5 * 1024 * 1024; // asumsi prototype (sama dengan foto referensi C-11)
export const PRODUCT_PHOTO_UPLOAD = { MAX_SIDE: 1024, QUALITY: 0.8 };

/** Label kelompok opsi custom cake (SPEC §8 custom_options.option_group) */
export const CUSTOM_OPTION_GROUP_LABEL = {
  [CUSTOM_OPTION_GROUP.UKURAN]: 'Ukuran',
  [CUSTOM_OPTION_GROUP.BENTUK]: 'Bentuk',
  [CUSTOM_OPTION_GROUP.RASA]: 'Rasa',
  [CUSTOM_OPTION_GROUP.KRIM_TOPPING]: 'Krim & Topping',
};

/** Status stok produk harian (sisa = qty_planned − qty_sold, SPEC §8) */
export const DAILY_STOCK_STATUS = {
  TERSEDIA: { key: 'tersedia', label: 'Tersedia', variant: 'ready' },
  HABIS: { key: 'habis', label: 'Habis', variant: 'error' },
  BELUM_DIISI: { key: 'belum_diisi', label: 'Belum diisi', variant: 'neutral' },
};

/** Status bahan baku (UI/UX Spec Batch 7: Aman = sage, Menipis = peach, Habis = merah) — FR-32: menipis bila ≤ minimum */
export const MATERIAL_STATUS = {
  AMAN: { key: 'aman', label: 'Aman', variant: 'ready' },
  MENIPIS: { key: 'menipis', label: 'Menipis', variant: 'preorder' },
  HABIS: { key: 'habis', label: 'Habis', variant: 'error' },
};

/** Saran satuan bahan baku (SPEC §8 raw_materials.unit: "gram, ml, pcs") + satuan data contoh */
export const MATERIAL_UNIT_SUGGESTIONS = ['gram', 'kg', 'ml', 'liter', 'pcs', 'butir'];
