// components/admin/ProductVariantsField.jsx
// Step 5.7 · FR-30 · AD-06 — varian produk dengan harga tambahan (product_variants: name, extra_price, is_active)
// Varian tersimpan tidak dihapus (bisa dirujuk keranjang/pesanan) — cukup dinonaktifkan; varian baru boleh dihapus.

import { Plus, Trash2 } from 'lucide-react';
import Button from '../ui/Button';
import Switch from '../ui/Switch';
import FormError from '../ui/FormError';
import { fieldClass } from './fieldClass';
import { PRODUCT_FIELD_MAX } from '../../constants/adminCatalog';

/**
 * @param {Array<{key, variant_id, name, extra_price, is_active}>} variants
 * @param {{add, update, remove, touch}} actions — dari useProductForm
 * @param {Function} errorOf — (index, field) → pesan
 * @param {string} [generalError]
 * @param {boolean} isCustom — custom cake memakai Opsi Custom Cake, bukan varian
 */
export default function ProductVariantsField({ variants, actions, errorOf, generalError, isCustom }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-cocoa">
        Varian <span className="font-normal text-cocoa/60">(opsional)</span>
      </legend>
      <p className="text-xs text-cocoa/65">
        {isCustom
          ? 'Custom cake memakai pilihan di tab Opsi Custom Cake, jadi tidak memerlukan varian.'
          : 'Contoh: Original +Rp 0, Almond +Rp 6.000. Varian nonaktif tidak tampil di halaman produk.'}
      </p>
      {variants.length > 0 && (
        <ul className="space-y-3">
          {variants.map((v, i) => {
            const nameError = errorOf(i, 'name');
            const priceError = errorOf(i, 'extra_price');
            return (
              <li key={v.key} className={`rounded-btn border border-beige p-3 ${v.is_active ? 'bg-white' : 'bg-beige/30'}`}>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
                  <div>
                    <label htmlFor={`variant-name-${v.key}`} className="mb-1 block text-xs font-semibold text-cocoa/80">Nama varian {i + 1}</label>
                    <input
                      id={`variant-name-${v.key}`}
                      className={fieldClass(nameError)}
                      value={v.name}
                      maxLength={PRODUCT_FIELD_MAX.variantName}
                      onChange={(e) => actions.update(v.key, { name: e.target.value })}
                      onBlur={() => actions.touch(i)}
                      aria-invalid={Boolean(nameError)}
                    />
                    <FormError message={nameError} className="mt-1 text-xs" />
                  </div>
                  <div>
                    <label htmlFor={`variant-price-${v.key}`} className="mb-1 block text-xs font-semibold text-cocoa/80">Harga tambahan (Rp)</label>
                    <input
                      id={`variant-price-${v.key}`}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="500"
                      className={fieldClass(priceError)}
                      value={v.extra_price}
                      onChange={(e) => actions.update(v.key, { extra_price: e.target.value })}
                      onBlur={() => actions.touch(i)}
                      aria-invalid={Boolean(priceError)}
                    />
                    <FormError message={priceError} className="mt-1 text-xs" />
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <Switch
                    checked={v.is_active}
                    onChange={(checked) => actions.update(v.key, { is_active: checked })}
                    label={v.is_active ? 'Aktif' : 'Nonaktif'}
                    showLabel
                  />
                  {v.variant_id == null && (
                    <button
                      type="button"
                      onClick={() => actions.remove(v.key)}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-error hover:bg-red-50
                                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/40"
                      aria-label={`Hapus varian ${i + 1}`}
                    >
                      <Trash2 size={18} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <FormError message={generalError} className="text-xs" />
      <Button variant="secondary" size="sm" onClick={actions.add} leftIcon={<Plus size={16} aria-hidden="true" />}>
        Tambah varian
      </Button>
    </fieldset>
  );
}
