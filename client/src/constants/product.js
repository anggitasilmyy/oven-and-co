// constants/product.js
// Step 4 · FR-05 · C-05 — tipe ketersediaan produk (SPEC §8 products.availability_type)

/** Nilai enum availability_type */
export const AVAILABILITY_TYPE = {
  READY: 'ready',
  PREORDER: 'preorder',
  CUSTOM: 'custom',
};

/** Badge ketersediaan di kartu produk (SPEC §9: "Ready · Bisa diambil hari ini", "Pre-order H-1") */
export const AVAILABILITY_BADGE = {
  [AVAILABILITY_TYPE.READY]: { label: 'Ready', longLabel: 'Ready · Bisa diambil hari ini', variant: 'ready' },
  [AVAILABILITY_TYPE.PREORDER]: { label: 'Pre-order H-1', longLabel: 'Pre-order H-1', variant: 'preorder' },
  [AVAILABILITY_TYPE.CUSTOM]: { label: 'Custom H-3', longLabel: 'Custom · minimal H-3', variant: 'custom' },
};

/** Badge untuk produk ready yang stok hari ini habis */
export const SOLD_OUT_BADGE = { label: 'Habis hari ini', variant: 'error' };

/** Nama kategori khusus yang diarahkan ke Custom Cake Builder (C-11) */
export const CUSTOM_CAKE_CATEGORY_NAME = 'Custom Cake';
