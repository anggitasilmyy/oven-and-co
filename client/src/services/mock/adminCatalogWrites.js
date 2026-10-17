// services/mock/adminCatalogWrites.js
// Step 5.7 · FR-30 · FR-31 · UC-23 · AD-06 — simpan produk (foto, varian) & opsi custom cake di mode mock
// Pengganti POST/PUT /api/admin/products & /api/admin/custom-options (Step 6.4). Semua aturan divalidasi ulang
// dari data terbaru. Produk, varian, dan opsi tidak dihapus — hanya dinonaktifkan (A-05: tambah, ubah, nonaktifkan)
// karena bisa dirujuk keranjang, pesanan, dan desain custom cake.

import { getTables, updateTable, nextUserRowId } from './db';
import {
  normalizeProductInput, validateProduct, normalizeCustomOptionInput, validateCustomOption, checkOptionDeactivation,
} from '../../utils/businessRules';

const fail = (message) => { throw new Error(message); };

/** Error validasi berisi pesan pertama + semua error per field (dipakai form untuk menandai field) */
function validationError(errors) {
  const first = Object.values(errors).flat().find((v) => typeof v === 'string')
    ?? Object.values(errors.variants?.find(Boolean) ?? {})[0]
    ?? 'Periksa kembali data yang diisi';
  return Object.assign(new Error(first), { fieldErrors: errors });
}

const STORAGE_FULL = 'Penyimpanan perangkat penuh. Kurangi jumlah foto atau gunakan foto yang lebih kecil.';

/** Foto lama hanya boleh dari produk ini; foto baru wajib punya URL (data URL mode mock / URL upload Step 6) */
function buildImageRows(photos, productId, ownImages, allImages) {
  const ownIds = new Set(ownImages.map((img) => img.image_id));
  let nextId = nextUserRowId(allImages, 'image_id');
  return photos.map((photo, i) => {
    if (photo.image_id != null && !ownIds.has(photo.image_id)) fail('Foto tidak ditemukan. Muat ulang halaman.');
    const image_id = photo.image_id ?? nextId++;
    return { image_id, product_id: productId, image_url: photo.image_url, sort_order: i + 1 };
  });
}

/** Varian tersimpan yang tidak dikirim form tetap ada (tidak dihapus, ditaruh di akhir agar indeks error = indeks form) */
function buildVariantRows(variants, productId, ownVariants, allVariants) {
  const ownIds = new Set(ownVariants.map((v) => v.variant_id));
  let nextId = nextUserRowId(allVariants, 'variant_id');
  const sent = variants.map((v) => {
    if (v.variant_id != null && !ownIds.has(v.variant_id)) fail('Varian tidak ditemukan. Muat ulang halaman.');
    return {
      variant_id: v.variant_id ?? nextId++, product_id: productId, name: v.name, extra_price: v.extra_price, is_active: v.is_active,
    };
  });
  const sentIds = new Set(sent.map((v) => v.variant_id));
  return [...sent, ...ownVariants.filter((v) => !sentIds.has(v.variant_id))];
}

/**
 * Tambah (productId = null) atau ubah produk beserta foto (maks. 5) dan varian.
 * @returns {{product_id}}
 */
export function saveAdminProduct(productId, input) {
  const t = getTables('categories', 'products', 'product_images', 'product_variants');
  const existing = productId == null ? null : (t.products.find((p) => p.product_id === Number(productId)) ?? fail('Produk tidak ditemukan'));
  const product = normalizeProductInput(input);
  const id = existing?.product_id ?? nextUserRowId(t.products, 'product_id');
  const ownVariants = t.product_variants.filter((v) => v.product_id === id);
  // Varian tersimpan yang tidak dikirim tetap dihitung saat memeriksa nama ganda / varian aktif custom cake
  const variants = buildVariantRows(product.variants, id, ownVariants, t.product_variants);
  const errors = validateProduct({ ...product, variants }, {
    categories: t.categories, products: t.products, productId: existing?.product_id ?? null,
  });
  if (Object.keys(errors).length) throw validationError(errors);

  const ownImages = t.product_images.filter((img) => img.product_id === id);
  const images = buildImageRows(product.photos, id, ownImages, t.product_images);
  const row = {
    product_id: id,
    category_id: product.category_id,
    name: product.name,
    description: product.description,
    ingredients: product.ingredients,
    allergens: product.allergens,
    price: product.price,
    availability_type: product.availability_type,
    lead_time_days: product.lead_time_days,
    is_active: product.is_active,
  };
  // Foto ditulis lebih dulu (paling besar): bila kuota penuh, belum ada tabel lain yang berubah
  try {
    updateTable('product_images', (rows) => [...rows.filter((img) => img.product_id !== id), ...images]);
  } catch {
    throw new Error(STORAGE_FULL);
  }
  updateTable('product_variants', (rows) => [...rows.filter((v) => v.product_id !== id), ...variants]);
  updateTable('products', (rows) => (existing ? rows.map((p) => (p.product_id === id ? row : p)) : [...rows, row]));
  return { product_id: id };
}

/** Toggle aktif dari tabel — aturan yang sama dengan form (mis. satu produk custom cake aktif) */
export function setAdminProductActive(productId, isActive) {
  const t = getTables('categories', 'products', 'product_variants');
  const existing = t.products.find((p) => p.product_id === Number(productId)) ?? fail('Produk tidak ditemukan');
  const errors = validateProduct(
    normalizeProductInput({ ...existing, is_active: isActive, variants: t.product_variants.filter((v) => v.product_id === existing.product_id), photos: [] }),
    { categories: t.categories, products: t.products, productId: existing.product_id },
  );
  if (Object.keys(errors).length) throw validationError(errors);
  updateTable('products', (rows) => rows.map((p) => (p.product_id === existing.product_id ? { ...p, is_active: Boolean(isActive) } : p)));
  return { product_id: existing.product_id, is_active: Boolean(isActive) };
}

/**
 * Tambah (optionId = null) atau ubah opsi custom cake. Kelompok opsi lama tidak bisa dipindah
 * karena desain custom cake menyimpan opsi per kelompok.
 * @returns {{option_id}}
 */
export function saveAdminCustomOption(optionId, input) {
  const { custom_options: options } = getTables('custom_options');
  const existing = optionId == null ? null : (options.find((o) => o.option_id === Number(optionId)) ?? fail('Opsi tidak ditemukan'));
  const option = normalizeCustomOptionInput({ ...input, option_group: existing?.option_group ?? input.option_group });
  const errors = validateCustomOption(option, options, existing?.option_id ?? null);
  if (existing && !option.is_active) {
    const last = checkOptionDeactivation(options, existing.option_id);
    if (last) errors.is_active = last;
  }
  if (Object.keys(errors).length) throw validationError(errors);
  const row = {
    option_id: existing?.option_id ?? nextUserRowId(options, 'option_id'),
    option_group: option.option_group,
    name: option.name,
    description: option.description,
    extra_price: option.extra_price,
    image_url: existing?.image_url ?? null,
    is_active: Boolean(option.is_active),
  };
  updateTable('custom_options', (rows) => (existing ? rows.map((o) => (o.option_id === row.option_id ? row : o)) : [...rows, row]));
  return { option_id: row.option_id };
}

/** Toggle aktif opsi; kelompok wajib menyisakan minimal satu opsi aktif */
export function setAdminCustomOptionActive(optionId, isActive) {
  const { custom_options: options } = getTables('custom_options');
  const existing = options.find((o) => o.option_id === Number(optionId)) ?? fail('Opsi tidak ditemukan');
  if (!isActive) {
    const last = checkOptionDeactivation(options, existing.option_id);
    if (last) fail(last);
  }
  updateTable('custom_options', (rows) => rows.map((o) => (o.option_id === existing.option_id ? { ...o, is_active: Boolean(isActive) } : o)));
  return { option_id: existing.option_id, is_active: Boolean(isActive) };
}
