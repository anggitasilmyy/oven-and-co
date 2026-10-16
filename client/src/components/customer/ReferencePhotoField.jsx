// components/customer/ReferencePhotoField.jsx
// FR-10 · F-11 · C-11 — foto referensi opsional (kotak putus-putus "Unggah foto referensi")

import { useId, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import FormError from '../ui/FormError';
import { compressImageToDataUrl } from '../../utils/image';
import {
  REFERENCE_PHOTO_ACCEPT, REFERENCE_PHOTO_MAX_BYTES, REFERENCE_PHOTO_PREVIEW,
} from '../../constants/customCake';

const MAX_MB = REFERENCE_PHOTO_MAX_BYTES / (1024 * 1024);

/** @param {string|null} value — data URL foto; null = belum ada */
export default function ReferencePhotoField({ value, onChange }) {
  const inputId = useId();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // file yang sama bisa dipilih lagi
    if (!file) return;
    if (!REFERENCE_PHOTO_ACCEPT.split(',').includes(file.type)) {
      setError('Format foto harus JPG, PNG, atau WebP.');
      return;
    }
    if (file.size > REFERENCE_PHOTO_MAX_BYTES) {
      setError(`Ukuran foto maksimal ${MAX_MB} MB.`);
      return;
    }
    setLoading(true);
    try {
      onChange(await compressImageToDataUrl(file, {
        maxSide: REFERENCE_PHOTO_PREVIEW.MAX_SIDE, quality: REFERENCE_PHOTO_PREVIEW.QUALITY,
      }));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <p className="text-sm font-bold text-cocoa mb-1.5">
        Foto referensi <span className="font-normal text-cocoa/60">(opsional)</span>
      </p>
      {value ? (
        <div className="flex items-center gap-4 rounded-card border border-beige bg-surface p-3">
          <img src={value} alt="Foto referensi yang diunggah" className="w-20 h-20 rounded-btn object-cover shrink-0" />
          <div className="min-w-0 flex-1 text-sm text-cocoa/70">Foto referensi siap dikirim bersama desain.</div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full text-error hover:bg-red-50
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/40"
            aria-label="Hapus foto referensi"
          >
            <Trash2 size={18} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className="flex flex-col items-center justify-center gap-1.5 min-h-[112px] rounded-card border-2 border-dashed
                     border-beige bg-beige/30 px-4 py-5 text-center cursor-pointer hover:border-primary/40
                     focus-within:ring-2 focus-within:ring-primary/50"
        >
          <ImagePlus size={24} className="text-primary" aria-hidden="true" />
          <span className="text-sm font-semibold text-cocoa">{loading ? 'Memproses foto…' : 'Unggah foto referensi'}</span>
          <span className="text-xs text-cocoa/60">JPG, PNG, atau WebP · maks. {MAX_MB} MB</span>
          <input
            id={inputId}
            type="file"
            accept={REFERENCE_PHOTO_ACCEPT}
            onChange={handleFile}
            disabled={loading}
            className="sr-only"
          />
        </label>
      )}
      <FormError message={error} className="text-sm mt-2" />
    </div>
  );
}
