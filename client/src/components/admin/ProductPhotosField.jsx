// components/admin/ProductPhotosField.jsx
// Step 5.7 · FR-30 · AD-06 — foto produk maks. 5 (urutan = sort_order; foto pertama = foto utama katalog)
// Foto lama tetap memakai berkas WebP lokal (sistem media Step 5.1); foto baru di mode mock diperkecil lalu
// disimpan sebagai data URL (pengganti upload multer Step 6), sama seperti foto referensi C-11.

import { useId, useState } from 'react';
import { ImagePlus, Star, Trash2 } from 'lucide-react';
import ProductImage from '../ui/ProductImage';
import FormError from '../ui/FormError';
import { compressImageToDataUrl } from '../../utils/image';
import {
  PRODUCT_PHOTO_MAX, PRODUCT_PHOTO_ACCEPT, PRODUCT_PHOTO_MAX_BYTES, PRODUCT_PHOTO_UPLOAD,
} from '../../constants/adminCatalog';

const MAX_MB = PRODUCT_PHOTO_MAX_BYTES / (1024 * 1024);
const iconButton =
  'flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-cocoa shadow transition hover:bg-white ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';

/**
 * @param {Array<{key, image_id?, image_url}>} photos
 * @param {Function} onChange — (photos) → void
 * @param {Function} newKey — pembuat kunci baris lokal
 * @param {string} productName — teks alternatif foto
 * @param {string} [error]
 */
export default function ProductPhotosField({ photos, onChange, newKey, productName, error }) {
  const inputId = useId();
  const [uploadError, setUploadError] = useState('');
  const [loading, setLoading] = useState(false);
  const slots = PRODUCT_PHOTO_MAX - photos.length;

  const handleFiles = async (event) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (files.length === 0) return;
    const accepted = PRODUCT_PHOTO_ACCEPT.split(',');
    const problems = [];
    const valid = files.filter((f) => {
      if (!accepted.includes(f.type)) { problems.push(`${f.name}: format harus JPG, PNG, atau WebP`); return false; }
      if (f.size > PRODUCT_PHOTO_MAX_BYTES) { problems.push(`${f.name}: ukuran maksimal ${MAX_MB} MB`); return false; }
      return true;
    });
    if (valid.length > slots) problems.push(`Maksimal ${PRODUCT_PHOTO_MAX} foto. ${valid.length - slots} foto tidak ditambahkan.`);
    setLoading(true);
    try {
      const added = [];
      for (const file of valid.slice(0, slots)) {
        const url = await compressImageToDataUrl(file, { maxSide: PRODUCT_PHOTO_UPLOAD.MAX_SIDE, quality: PRODUCT_PHOTO_UPLOAD.QUALITY });
        added.push({ key: newKey(), image_id: null, image_url: url });
      }
      if (added.length) onChange([...photos, ...added]);
    } catch (err) {
      problems.push(err.message);
    } finally {
      setLoading(false);
      setUploadError(problems.join(' · '));
    }
  };

  const makePrimary = (key) => onChange([photos.find((p) => p.key === key), ...photos.filter((p) => p.key !== key)]);
  const remove = (key) => { onChange(photos.filter((p) => p.key !== key)); setUploadError(''); };

  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-semibold text-cocoa">
        Foto produk <span className="font-normal text-cocoa/60">({photos.length}/{PRODUCT_PHOTO_MAX})</span>
      </legend>
      <p className="mb-3 text-xs text-cocoa/65">Foto pertama menjadi foto utama di katalog. JPG, PNG, atau WebP · maks. {MAX_MB} MB.</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo, i) => (
          <li key={photo.key} className="relative overflow-hidden rounded-btn border border-beige bg-beige/30">
            <ProductImage
              src={photo.image_url}
              alt={`Foto ${i + 1} ${productName || 'produk'}`}
              sizes="200px"
              className="aspect-[4/3] w-full object-cover"
            />
            {i === 0 && <span className="badge absolute left-2 top-2 bg-primary text-white">Utama</span>}
            <div className="absolute bottom-1.5 right-1.5 flex gap-1.5">
              {i > 0 && (
                <button type="button" className={iconButton} onClick={() => makePrimary(photo.key)} aria-label={`Jadikan foto ${i + 1} foto utama`}>
                  <Star size={16} aria-hidden="true" />
                </button>
              )}
              <button type="button" className={`${iconButton} text-error`} onClick={() => remove(photo.key)} aria-label={`Hapus foto ${i + 1}`}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
        {slots > 0 && (
          <li>
            <label
              htmlFor={inputId}
              className="flex aspect-[4/3] h-full w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-btn border-2 border-dashed
                         border-beige bg-beige/30 px-3 text-center hover:border-primary/40 focus-within:ring-2 focus-within:ring-primary/50"
            >
              <ImagePlus size={22} className="text-primary" aria-hidden="true" />
              <span className="text-sm font-semibold text-cocoa">{loading ? 'Memproses…' : 'Tambah foto'}</span>
              <span className="text-xs text-cocoa/60">sisa {slots} foto</span>
              <input id={inputId} type="file" accept={PRODUCT_PHOTO_ACCEPT} multiple onChange={handleFiles} disabled={loading} className="sr-only" />
            </label>
          </li>
        )}
      </ul>
      <FormError message={uploadError || error} className="mt-2 text-xs" />
    </fieldset>
  );
}
