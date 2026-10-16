// utils/image.js
// FR-05 · FR-06 · FR-08 — helper srcset foto produk lokal

import { PRODUCT_PHOTO_WIDTHS } from '../constants/media';

const LOCAL_PRODUCT_PHOTO = /^\/images\/products\/[\w-]+\.webp$/;

/**
 * srcset untuk foto produk lokal yang punya versi `-sm.webp`; URL lain (mis. upload API) tanpa srcset.
 * @param {string|null} src
 * @returns {string|undefined}
 */
export function productImageSrcSet(src) {
  if (!src || !LOCAL_PRODUCT_PHOTO.test(src) || src.endsWith('-sm.webp')) return undefined;
  const small = src.replace(/\.webp$/, '-sm.webp');
  return `${small} ${PRODUCT_PHOTO_WIDTHS.SMALL}w, ${src} ${PRODUCT_PHOTO_WIDTHS.LARGE}w`;
}

/**
 * Step 5.2 · C-11 — perkecil foto (sisi terpanjang ≤ maxSide) menjadi data URL JPEG.
 * Dipakai mode mock untuk foto referensi custom cake (pengganti upload multer Step 6).
 * @param {File} file
 * @returns {Promise<string>}
 */
export function compressImageToDataUrl(file, { maxSide, quality }) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * ratio);
      canvas.height = Math.round(img.naturalHeight * ratio);
      const ctx = canvas.getContext('2d');
      // JPEG tanpa transparansi: latar putih agar PNG transparan tidak menjadi hitam
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Foto tidak bisa dibaca'));
    };
    img.src = url;
  });
}
