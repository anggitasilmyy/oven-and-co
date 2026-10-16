// components/ui/ProductImage.jsx
// FR-05 · FR-06 · FR-08 — foto produk responsif (srcset WebP) dengan fallback bila gagal dimuat.
// Ukuran tampilan diatur oleh kontainer (aspect ratio tetap) agar tidak ada layout shift.

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { productImageSrcSet } from '../../utils/image';

/**
 * @param {string|null} src
 * @param {string} [alt] — kosongkan untuk gambar dekoratif
 * @param {string} [sizes] — atribut sizes untuk memilih versi kecil/besar
 */
export default function ProductImage({ src, alt = '', sizes, className = '', ...rest }) {
  const [failedSrc, setFailedSrc] = useState(null);

  if (!src || failedSrc === src) {
    return (
      <span
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className={`flex items-center justify-center bg-beige text-cocoa/35 ${className}`}
      >
        <ImageOff size={24} aria-hidden="true" />
      </span>
    );
  }

  return (
    <img
      src={src}
      srcSet={productImageSrcSet(src)}
      sizes={sizes}
      alt={alt}
      width={1280}
      height={960}
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={className}
      {...rest}
    />
  );
}
