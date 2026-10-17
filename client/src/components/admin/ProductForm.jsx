// components/admin/ProductForm.jsx
// Step 5.7 · FR-30 · UC-23 · AD-06 — drawer tambah/ubah produk (UI/UX Spec Batch 7):
// foto (maks. 5), nama, kategori, deskripsi, komposisi, alergen, varian + harga tambahan, tipe & lead time, harga, aktif.

import Drawer from '../ui/Drawer';
import Button from '../ui/Button';
import Switch from '../ui/Switch';
import FormError from '../ui/FormError';
import FormField from './FormField';
import ProductPhotosField from './ProductPhotosField';
import ProductVariantsField from './ProductVariantsField';
import { fieldClass } from './fieldClass';
import useProductForm from '../../hooks/useProductForm';
import { AVAILABILITY_TYPE } from '../../constants/product';
import { AVAILABILITY_TYPE_LABEL, LEAD_TIME_RULE, PRODUCT_FIELD_MAX } from '../../constants/adminCatalog';

const LEAD_HINT = {
  [AVAILABILITY_TYPE.READY]: 'Produk ready bisa diambil hari ini selama stok harian tersedia.',
  [AVAILABILITY_TYPE.PREORDER]: `Minimal ${LEAD_TIME_RULE.preorder.min} hari (H-1), maksimal ${LEAD_TIME_RULE.preorder.max} hari.`,
  [AVAILABILITY_TYPE.CUSTOM]: `Minimal ${LEAD_TIME_RULE.custom.min} hari (H-3), maksimal ${LEAD_TIME_RULE.custom.max} hari.`,
};

/**
 * @param {object|null} product — hasil getAdminProduct (null = produk baru)
 * @param {Array} categories
 * @param {Array} products — baris tabel AD-06 (cek produk custom aktif)
 * @param {Function} onClose
 * @param {Function} onSaved — ({product_id}) → void
 */
export default function ProductForm({ product, categories, products, onClose, onSaved }) {
  const form = useProductForm(product, { categories, products, onSaved });
  const { values, set, blur, errorOf } = form;
  const isReady = values.availability_type === AVAILABILITY_TYPE.READY;
  const text = (field) => ({ value: values[field], onChange: (e) => set(field, e.target.value), onBlur: () => blur(field) });

  return (
    <Drawer
      isOpen
      onClose={form.saving ? undefined : onClose}
      title={product ? 'Ubah produk' : 'Tambah produk'}
      description={product ? product.name : 'Produk baru tampil di katalog setelah disimpan dalam keadaan aktif.'}
      footer={(
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={form.saving}>Batal</Button>
          <Button type="submit" form="product-form" size="sm" loading={form.saving}>Simpan produk</Button>
        </>
      )}
    >
      <form id="product-form" noValidate className="space-y-6" onSubmit={(e) => { e.preventDefault(); form.submit(); }}>
        <ProductPhotosField
          photos={values.photos}
          onChange={(photos) => set('photos', photos)}
          newKey={form.newKey}
          productName={values.name}
          error={errorOf('photos')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="product-name" label="Nama produk" error={errorOf('name')} className="sm:col-span-2">
            <input className={fieldClass(errorOf('name'))} maxLength={PRODUCT_FIELD_MAX.name} {...text('name')} />
          </FormField>
          <FormField id="product-category" label="Kategori" error={errorOf('category_id')}>
            <select className={fieldClass(errorOf('category_id'))} {...text('category_id')}>
              <option value="">Pilih kategori</option>
              {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField id="product-price" label={values.availability_type === AVAILABILITY_TYPE.CUSTOM ? 'Harga dasar (Rp)' : 'Harga (Rp)'} error={errorOf('price')}>
            <input type="number" inputMode="numeric" min="1" step="500" className={fieldClass(errorOf('price'))} {...text('price')} />
          </FormField>
          <FormField id="product-type" label="Tipe produk" error={errorOf('availability_type')}>
            <select className={fieldClass(errorOf('availability_type'))} value={values.availability_type} onChange={(e) => form.setType(e.target.value)}>
              {Object.values(AVAILABILITY_TYPE).map((t) => <option key={t} value={t}>{AVAILABILITY_TYPE_LABEL[t]}</option>)}
            </select>
          </FormField>
          <FormField id="product-lead" label="Lead time (hari)" error={errorOf('lead_time_days')} hint={LEAD_HINT[values.availability_type]}>
            <input
              type="number"
              inputMode="numeric"
              min={LEAD_TIME_RULE[values.availability_type]?.min ?? 0}
              max={LEAD_TIME_RULE[values.availability_type]?.max ?? 0}
              disabled={isReady}
              className={fieldClass(errorOf('lead_time_days'))}
              {...text('lead_time_days')}
            />
          </FormField>
        </div>

        <FormField id="product-description" label="Deskripsi" optional>
          <textarea rows={3} className={fieldClass(null, 'textarea')} {...text('description')} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="product-ingredients" label="Komposisi" optional>
            <textarea rows={3} className={fieldClass(null, 'textarea')} {...text('ingredients')} />
          </FormField>
          <FormField id="product-allergens" label="Alergen" optional error={errorOf('allergens')} hint="Contoh: Gluten, susu, telur">
            <textarea rows={3} maxLength={PRODUCT_FIELD_MAX.allergens} className={fieldClass(errorOf('allergens'), 'textarea')} {...text('allergens')} />
          </FormField>
        </div>

        <ProductVariantsField
          variants={values.variants}
          actions={form.variants}
          errorOf={form.variantErrorOf}
          generalError={form.generalVariantError}
          isCustom={values.availability_type === AVAILABILITY_TYPE.CUSTOM}
        />

        <div className="rounded-btn border border-beige bg-white p-4">
          <Switch checked={values.is_active} onChange={(v) => { set('is_active', v); blur('is_active'); }} label="Tampilkan di katalog (aktif)" showLabel />
          <p className="mt-1 text-xs text-cocoa/65">Produk nonaktif disembunyikan dari web pelanggan dan tidak bisa dipesan.</p>
          <FormError message={errorOf('is_active')} className="mt-2 text-xs" />
        </div>

        <FormError message={form.formError} />
      </form>
    </Drawer>
  );
}
