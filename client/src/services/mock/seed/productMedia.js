// services/mock/seed/productMedia.js
// Step 4 → Step 5.1 · product_images (galeri maks. 5 foto, FR-30) — dipindah dari catalog.js
// Foto produk = fotografi stok berlisensi Unsplash (foto ilustrasi, bukan foto produk Oven & Co.).
// Sumber & lisensi tiap file: docs/IMAGE_SOURCES.md. File WebP lokal di client/public/images/products
// (`<slug>-<n>.webp` 1280 px + `<slug>-<n>-sm.webp` 640 px untuk srcset).

import { PRODUCTS } from './catalog';

/**
 * Daftar foto per produk (urutan = sort_order). Galeri hanya berisi foto dari sesi pemotretan yang sama;
 * bila hanya ada satu foto yang sesuai, produk cukup punya satu foto.
 */
const PRODUCT_PHOTOS = {
  1: ['butter-croissant-1', 'butter-croissant-2'],
  2: ['cinnamon-roll-1', 'cinnamon-roll-2'],
  3: ['lava-cake-1'],
  4: ['cookies-box-1'],
  5: ['birthday-cake-1'],
  6: ['custom-cake-1'],
  7: ['almond-croissant-1', 'almond-croissant-2'],
  8: ['pain-au-chocolat-1'],
  9: ['sourdough-1'],
  10: ['milk-bun-1'],
  11: ['red-velvet-1'],
  12: ['cookies-jar-1'],
};

const photoUrl = (file) => `/images/products/${file}.webp`;

// product_images — foto utama tetap image_id = product_id (Step 4); foto galeri tambahan memakai id lanjutan.
export const PRODUCT_IMAGES = [
  ...PRODUCTS.map((p) => ({
    image_id: p.product_id,
    product_id: p.product_id,
    image_url: photoUrl(PRODUCT_PHOTOS[p.product_id][0]),
    sort_order: 1,
  })),
  ...Object.entries(PRODUCT_PHOTOS).flatMap(([pid, files]) =>
    files.slice(1).map((file, i) => ({
      product_id: Number(pid),
      image_url: photoUrl(file),
      sort_order: i + 2,
    }))
  ).map((img, i) => ({ image_id: PRODUCTS.length + i + 1, ...img })),
];
