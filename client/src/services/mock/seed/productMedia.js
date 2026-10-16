// services/mock/seed/productMedia.js
// Step 4 → Step 5.1 · product_images (galeri maks. 5 foto, FR-30) — dipindah dari catalog.js
// Ilustrasi lokal di client/public/images/products

import { PRODUCTS } from './catalog';

const IMAGE_SLUGS = {
  1: 'butter-croissant', 2: 'cinnamon-roll', 3: 'lava-cake', 4: 'cookies-box',
  5: 'birthday-cake', 6: 'custom-cake', 7: 'almond-croissant', 8: 'pain-au-chocolat',
  9: 'sourdough', 10: 'milk-bun', 11: 'red-velvet', 12: 'cookies-jar',
};

/** Step 5.1: jumlah foto galeri per produk (maks. 5 foto, FR-30) — data contoh */
const GALLERY_SIZE = { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 7: 2, 9: 2, 12: 2 };

// product_images — ilustrasi lokal di client/public/images/products
// Foto utama tetap image_id = product_id (Step 4); foto galeri tambahan memakai id lanjutan.
export const PRODUCT_IMAGES = [
  ...PRODUCTS.map((p) => ({
    image_id: p.product_id,
    product_id: p.product_id,
    image_url: `/images/products/${IMAGE_SLUGS[p.product_id]}.svg`,
    sort_order: 1,
  })),
  ...Object.entries(GALLERY_SIZE).flatMap(([pid, size]) =>
    Array.from({ length: size - 1 }, (_, i) => ({
      product_id: Number(pid),
      image_url: `/images/products/${IMAGE_SLUGS[pid]}-${i + 2}.svg`,
      sort_order: i + 2,
    }))
  ).map((img, i) => ({ image_id: PRODUCTS.length + i + 1, ...img })),
];

