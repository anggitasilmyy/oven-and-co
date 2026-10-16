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
