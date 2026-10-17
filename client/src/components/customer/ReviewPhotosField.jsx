// components/customer/ReviewPhotosField.jsx
// Step 5.4 · FR-21 · C-19 — unggah foto ulasan (maks. 3, validation rule Ulasan). Mode mock: diperkecil jadi data URL.

import { useId, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import FormError from '../ui/FormError';
import { compressImageToDataUrl } from '../../utils/image';
import {
  REVIEW_MAX_PHOTOS, REVIEW_PHOTO_ACCEPT, REVIEW_PHOTO_MAX_BYTES, REVIEW_PHOTO_PREVIEW,
} from '../../constants/orderHistory';

const MAX_MB = REVIEW_PHOTO_MAX_BYTES / (1024 * 1024);

/**
 * @param {string[]} value — data URL foto
 * @param {Function} onChange — (photos) → void
 */
export default function ReviewPhotosField({ value, onChange }) {
  const inputId = useId();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const remaining = REVIEW_MAX_PHOTOS - value.length;

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ''; // file yang sama bisa dipilih lagi
    if (files.length === 0) return;
    if (files.some((f) => !REVIEW_PHOTO_ACCEPT.split(',').includes(f.type))) return setError('Format foto harus JPG, PNG, atau WebP.');
    if (files.some((f) => f.size > REVIEW_PHOTO_MAX_BYTES)) return setError(`Ukuran foto maksimal ${MAX_MB} MB.`);
    setLoading(true);
    try {
      const urls = await Promise.all(files.slice(0, remaining).map((f) => compressImageToDataUrl(f, {
        maxSide: REVIEW_PHOTO_PREVIEW.MAX_SIDE, quality: REVIEW_PHOTO_PREVIEW.QUALITY,
      })));
      onChange([...value, ...urls]);
      setError(files.length > remaining ? `Maksimal ${REVIEW_MAX_PHOTOS} foto; sebagian foto tidak ditambahkan.` : '');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <p className="text-sm font-bold text-cocoa mb-1.5">
        Foto <span className="font-normal text-cocoa/60">(opsional, maks. {REVIEW_MAX_PHOTOS})</span>
      </p>
      <ul className="flex flex-wrap gap-3">
        {value.map((url, i) => (
          <li key={i} className="relative">
            <img src={url} alt={`Foto ulasan ${i + 1}`} className="w-24 h-24 rounded-btn object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              className="absolute -top-3 -right-3 w-11 h-11 flex items-center justify-center rounded-full
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/40"
              aria-label={`Hapus foto ulasan ${i + 1}`}
            >
              <span className="w-7 h-7 flex items-center justify-center rounded-full bg-cocoa text-white shadow"><X size={14} aria-hidden="true" /></span>
            </button>
          </li>
        ))}
        {remaining > 0 && (
          <li>
            <label
              htmlFor={inputId}
              className="w-24 h-24 flex flex-col items-center justify-center gap-1 rounded-btn border-2 border-dashed border-beige
                         bg-beige/30 text-center cursor-pointer hover:border-primary/40 focus-within:ring-2 focus-within:ring-primary/50"
            >
              <ImagePlus size={22} className="text-primary" aria-hidden="true" />
              <span className="text-xs font-semibold text-cocoa">{loading ? 'Memproses…' : 'Tambah foto'}</span>
              <input id={inputId} type="file" accept={REVIEW_PHOTO_ACCEPT} multiple onChange={handleFiles} disabled={loading} className="sr-only" />
            </label>
          </li>
        )}
      </ul>
      <p className="mt-1.5 text-xs text-cocoa/60">JPG, PNG, atau WebP · maks. {MAX_MB} MB per foto</p>
      <FormError message={error} className="text-sm mt-2" />
    </div>
  );
}
