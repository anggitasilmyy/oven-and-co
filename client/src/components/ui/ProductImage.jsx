// components/ui/ProductImage.jsx
// FR-05 · FR-06 · FR-08 — foto produk responsif (srcset WebP) dengan fallback bila gagal dimuat.
// Ukuran tampilan diatur oleh kontainer (aspect ratio tetap) agar tidak ada layout shift.
// Step 6.6 (CP5 · G6): path unggahan server diarahkan ke origin API lewat toUploadUrl.

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { productImageSrcSet } from '../../utils/image';
import { toUploadUrl } from '../../services/apiClient';

/**
 * @param {string|null} src
 * @param {string} [alt] — kosongkan untuk gambar dekoratif
 * @param {string} [sizes] — atribut sizes untuk memilih versi kecil/besar
 */
export default function ProductImage({ src, alt = '', sizes, className = '', ...rest }) {
  const [failedSrc, setFailedSrc] = useState(null);
  // Step 6.6 (CP5 · G6): foto unggahan server (/uploads/…) dimuat dari origin API; /images/… & data URL apa adanya
  const resolvedSrc = toUploadUrl(src);

  if (!resolvedSrc || failedSrc === resolvedSrc) {
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
      src={resolvedSrc}
      srcSet={productImageSrcSet(src)}
      sizes={sizes}
      alt={alt}
      width={1280}
      height={960}
      decoding="async"
      onError={() => setFailedSrc(resolvedSrc)}
      className={className}
      {...rest}
    />
  );
}
