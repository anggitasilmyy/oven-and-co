// hooks/useProductForm.js
// Step 5.7 · FR-30 · AD-06 — state form tambah/ubah produk + validasi inline (validation rule Produk)
// Error tampil setelah field disentuh atau setelah tombol Simpan ditekan; service memvalidasi ulang saat menyimpan.

import { useMemo, useState } from 'react';
import { normalizeProductInput, validateProduct, getLeadTimeRule } from '../utils/businessRules';
import { saveProduct } from '../services/adminProductService';
import { AVAILABILITY_TYPE } from '../constants/product';

// Kunci baris lokal (varian & foto) untuk React; bukan id tabel
let keySeed = 0;
const newKey = () => `row-${(keySeed += 1)}`;

/** Nilai awal form dari produk tersimpan (atau kosong untuk produk baru) */
function initialValues(product) {
  if (!product) {
    return {
      name: '', category_id: '', description: '', ingredients: '', allergens: '', price: '',
      availability_type: AVAILABILITY_TYPE.READY, lead_time_days: 0, is_active: true, variants: [], photos: [],
    };
  }
  return {
    name: product.name,
    category_id: String(product.category_id),
    description: product.description ?? '',
    ingredients: product.ingredients ?? '',
    allergens: product.allergens ?? '',
    price: String(product.price),
    availability_type: product.availability_type,
    lead_time_days: product.lead_time_days,
    is_active: product.is_active,
    variants: product.variants.map((v) => ({ ...v, key: newKey(), extra_price: String(v.extra_price) })),
    photos: product.photos.map((p) => ({ ...p, key: newKey() })),
  };
}

/**
 * @param {object|null} product — hasil getAdminProduct (null = produk baru)
 * @param {{categories: Array, products: Array, onSaved: Function}} ctx — products = baris tabel AD-06
 */
export default function useProductForm(product, { categories, products, onSaved }) {
  const [values, setValues] = useState(() => initialValues(product));
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const errors = useMemo(
    () => validateProduct(normalizeProductInput(values), { categories, products, productId: product?.product_id ?? null }),
    [values, categories, products, product]
  );

  const set = (field, value) => {
    setValues((v) => ({ ...v, [field]: value }));
    setServerErrors((e) => ({ ...e, [field]: undefined }));
    setFormError('');
  };

  /** Ganti tipe → lead time ikut aturan tipe (ready 0, pre-order ≥ 1, custom ≥ 3) */
  const setType = (type) => {
    const rule = getLeadTimeRule(type);
    setValues((v) => {
      const lead = Number(v.lead_time_days);
      const keep = rule && Number.isInteger(lead) && lead >= rule.min && lead <= rule.max;
      return { ...v, availability_type: type, lead_time_days: keep ? lead : (rule?.default ?? 0) };
    });
    setTouched((t) => ({ ...t, availability_type: true, lead_time_days: true }));
  };

  const blur = (field) => setTouched((t) => ({ ...t, [field]: true }));

  /** Error yang ditampilkan: dari service (terbaru) atau validasi lokal untuk field yang sudah disentuh */
  const errorOf = (field) => serverErrors[field] || ((submitted || touched[field]) ? errors[field] : undefined);
  const variantErrorOf = (index, field) => (submitted || touched[`variant-${index}`]) ? errors.variants?.[index]?.[field] : undefined;

  const variants = {
    add: () => set('variants', [...values.variants, { key: newKey(), variant_id: null, name: '', extra_price: '0', is_active: true }]),
    update: (key, patch) => set('variants', values.variants.map((v) => (v.key === key ? { ...v, ...patch } : v))),
    // Hanya varian yang belum disimpan yang bisa dihapus; varian tersimpan cukup dinonaktifkan
    remove: (key) => set('variants', values.variants.filter((v) => v.key !== key || v.variant_id != null)),
    touch: (index) => blur(`variant-${index}`),
  };

  const submit = async () => {
    setSubmitted(true);
    if (Object.keys(errors).length) {
      setFormError('Periksa kembali isian yang ditandai.');
      return false;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = normalizeProductInput(values);
      const result = await saveProduct(product?.product_id ?? null, {
        ...payload,
        photos: values.photos.map(({ image_id, image_url }) => ({ image_id: image_id ?? null, image_url })),
      });
      onSaved?.(result);
      return true;
    } catch (err) {
      setServerErrors(err.fieldErrors ?? {});
      setFormError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    values, set, setType, blur, errorOf, variantErrorOf, variants, newKey,
    generalVariantError: (submitted || touched.availability_type) ? errors.variantsGeneral : undefined,
    formError, saving, submit,
  };
}
