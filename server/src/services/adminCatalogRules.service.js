// services/adminCatalogRules.service.js
// FR-30 · FR-31 · UC-23 · AD-06 — validasi produk & opsi custom cake (fungsi murni).
// Port server dari client/src/utils/rules/adminCatalog.js (normalizeProductInput, validateProduct,
// normalizeCustomOptionInput, validateCustomOption, checkOptionDeactivation) dengan perilaku & pesan sama.
//   - Produk: nama, kategori, harga > 0, tipe & lead time wajib; maks. 5 foto (validation rule Produk)
//   - Lead time: ready 0, pre-order ≥ 1 (BR-02 H-1), custom ≥ 3 (BR-02 H-3), maks. LEAD_TIME_MAX_DAYS
//   - Kategori Custom Cake ↔ tipe custom; hanya satu produk custom aktif (dasar Custom Cake Builder C-11)
// Data memakai bentuk snake_case seperti tabel mock; id dibandingkan sebagai string (BIGINT).

const {
  AVAILABILITY_TYPE, CUSTOM_CAKE_CATEGORY_NAME, CATALOG_FIELD_MAX, MAX_PRICE, LEAD_TIME_RULE, PRODUCT_PHOTO_MAX,
  CUSTOM_OPTION_GROUP_LABEL,
} = require('../utils/businessConstants');
const { OPTION_GROUPS } = require('../validators/customCakeDesign.validator');

const text = (v) => String(v ?? '').trim();
const optionalText = (v) => text(v) || null;
const sameName = (a, b) => text(a).toLowerCase() === text(b).toLowerCase();
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/** Angka dari input form ('' / spasi / null → NaN agar terdeteksi kosong) */
function toNumber(value) {
  if (value === '' || value == null || (typeof value === 'string' && !value.trim())) return NaN;
  return Number(value);
}

/** Rapikan input produk sebelum divalidasi/disimpan (foto ditangani terpisah oleh service) */
function normalizeProductInput(input) {
  return {
    name: text(input.name),
    category_id: input.category_id === '' || input.category_id == null ? null : Number(input.category_id),
    description: text(input.description),
    ingredients: optionalText(input.ingredients),
    allergens: optionalText(input.allergens),
    price: toNumber(input.price),
    availability_type: input.availability_type || null,
    lead_time_days: input.availability_type === AVAILABILITY_TYPE.READY ? 0 : toNumber(input.lead_time_days),
    is_active: Boolean(input.is_active),
    variants: (input.variants ?? []).map((v) => ({
      variant_id: v.variant_id ?? null,
      name: text(v.name),
      extra_price: toNumber(v.extra_price),
      is_active: Boolean(v.is_active),
    })),
  };
}

/** Pesan lead time di luar rentang tipe */
function leadTimeError(type, days) {
  const rule = LEAD_TIME_RULE[type];
  if (!rule) return null;
  if (!Number.isInteger(days)) return 'Isi lead time dalam hari (bilangan bulat)';
  if (type === AVAILABILITY_TYPE.READY) return days === 0 ? null : 'Produk ready memiliki lead time 0 hari';
  if (days < rule.min) {
    return type === AVAILABILITY_TYPE.CUSTOM
      ? `Custom cake minimal ${rule.min} hari (H-${rule.min})`
      : `Pre-order minimal ${rule.min} hari (H-${rule.min})`;
  }
  if (days > rule.max) return `Lead time maksimal ${rule.max} hari`;
  return null;
}

/** Validasi baris varian: nama wajib & unik, harga tambahan ≥ 0 → array error per baris (null = sah) */
function variantErrors(variants) {
  return variants.map((v, i) => {
    const err = {};
    if (!v.name) err.name = 'Isi nama varian';
    else if (v.name.length > CATALOG_FIELD_MAX.variantName) err.name = `Maksimal ${CATALOG_FIELD_MAX.variantName} karakter`;
    else if (variants.some((o, j) => j < i && sameName(o.name, v.name))) err.name = 'Nama varian sudah dipakai';
    if (!Number.isFinite(v.extra_price) || v.extra_price < 0) err.extra_price = 'Harga tambahan minimal Rp 0';
    else if (v.extra_price > MAX_PRICE) err.extra_price = 'Harga tambahan terlalu besar';
    return Object.keys(err).length ? err : null;
  });
}

/**
 * Validasi produk (validation rule Produk + aturan konsistensi katalog).
 * @param {object} product — hasil normalizeProductInput (+ photoCount bila foto dikirim)
 * @param {{categories: Array<{category_id, name}>, products: Array<{product_id, is_active, availability_type}>, productId?: string|null}} ctx
 * @returns {object} { field: pesan } — kosong bila sah; `variants` berisi array error per baris
 */
function validateProduct(product, { categories, products, productId = null }) {
  const errors = {};
  if (!product.name) errors.name = 'Isi nama produk';
  else if (product.name.length > CATALOG_FIELD_MAX.name) errors.name = `Maksimal ${CATALOG_FIELD_MAX.name} karakter`;

  const category = categories.find((c) => c.category_id === product.category_id);
  if (!category) errors.category_id = 'Pilih kategori';

  if (!Number.isFinite(product.price) || product.price <= 0) errors.price = 'Harga harus lebih dari Rp 0';
  else if (product.price > MAX_PRICE) errors.price = 'Harga terlalu besar';

  if (!LEAD_TIME_RULE[product.availability_type]) errors.availability_type = 'Pilih tipe produk';
  else {
    const lead = leadTimeError(product.availability_type, product.lead_time_days);
    if (lead) errors.lead_time_days = lead;
  }

  const isCustom = product.availability_type === AVAILABILITY_TYPE.CUSTOM;
  // Kategori Custom Cake diarahkan ke Custom Cake Builder (C-06/C-11), jadi tipe & kategori harus sejalan
  if (category && !errors.availability_type && (category.name === CUSTOM_CAKE_CATEGORY_NAME) !== isCustom) {
    errors.category_id = isCustom
      ? `Produk custom cake harus berada di kategori ${CUSTOM_CAKE_CATEGORY_NAME}`
      : `Kategori ${CUSTOM_CAKE_CATEGORY_NAME} hanya untuk produk bertipe custom cake`;
  }
  // Custom Cake Builder memakai satu produk dasar custom yang aktif
  if (isCustom && product.is_active && products.some((p) =>
    !sameId(p.product_id, productId) && p.is_active && p.availability_type === AVAILABILITY_TYPE.CUSTOM)) {
    errors.is_active = 'Sudah ada produk custom cake aktif. Nonaktifkan produk tersebut terlebih dahulu.';
  }

  if (product.allergens && product.allergens.length > CATALOG_FIELD_MAX.allergens) {
    errors.allergens = `Maksimal ${CATALOG_FIELD_MAX.allergens} karakter`;
  }
  if ((product.photoCount ?? 0) > PRODUCT_PHOTO_MAX) errors.photos = `Maksimal ${PRODUCT_PHOTO_MAX} foto`;

  if (isCustom && product.variants.some((v) => v.is_active)) {
    errors.variantsGeneral = 'Custom cake memakai Opsi Custom Cake, bukan varian. Nonaktifkan varian.';
  }
  const rows = variantErrors(product.variants);
  if (rows.some(Boolean)) errors.variants = rows;
  return errors;
}

/** Rapikan input opsi custom cake */
function normalizeCustomOptionInput(input) {
  return {
    option_group: input.option_group,
    name: text(input.name),
    description: optionalText(input.description),
    extra_price: toNumber(input.extra_price),
    is_active: input.is_active ?? true,
  };
}

/**
 * Validasi opsi custom cake (FR-31): kelompok sah, nama wajib & unik dalam kelompok, harga tambahan ≥ 0.
 * @param {object} option — hasil normalizeCustomOptionInput
 * @param {Array} options — semua opsi tersimpan
 * @param {number|null} optionId — opsi yang diubah
 */
function validateCustomOption(option, options, optionId = null) {
  const errors = {};
  if (!OPTION_GROUPS.includes(option.option_group)) errors.option_group = 'Pilih kelompok opsi';
  if (!option.name) errors.name = 'Isi nama opsi';
  else if (option.name.length > CATALOG_FIELD_MAX.optionName) errors.name = `Maksimal ${CATALOG_FIELD_MAX.optionName} karakter`;
  else if (options.some((o) => o.option_id !== optionId && o.option_group === option.option_group && sameName(o.name, option.name))) {
    errors.name = `Nama sudah dipakai di kelompok ${CUSTOM_OPTION_GROUP_LABEL[option.option_group] ?? ''}`.trim();
  }
  if (option.description && option.description.length > CATALOG_FIELD_MAX.optionDescription) {
    errors.description = `Maksimal ${CATALOG_FIELD_MAX.optionDescription} karakter`;
  }
  if (!Number.isFinite(option.extra_price) || option.extra_price < 0) errors.extra_price = 'Harga tambahan minimal Rp 0';
  else if (option.extra_price > MAX_PRICE) errors.extra_price = 'Harga tambahan terlalu besar';
  return errors;
}

/**
 * Semua langkah builder wajib (validation rule Custom cake), jadi setiap kelompok harus punya ≥ 1 opsi aktif.
 * @returns {string|null} pesan error bila opsi adalah opsi aktif terakhir di kelompoknya
 */
function checkOptionDeactivation(options, optionId) {
  const target = options.find((o) => o.option_id === optionId);
  if (!target || !target.is_active) return null;
  const activeInGroup = options.filter((o) => o.option_group === target.option_group && o.is_active);
  return activeInGroup.length <= 1
    ? `Kelompok ${CUSTOM_OPTION_GROUP_LABEL[target.option_group]} harus punya minimal satu opsi aktif`
    : null;
}

/**
 * Error validasi form: pesan pertama + semua error per field (client mock adminCatalogWrites.js validationError).
 * Dikirim errorHandler sebagai { message, fieldErrors } dengan status 400.
 */
function validationError(errors) {
  const first = Object.values(errors).flat().find((v) => typeof v === 'string')
    ?? Object.values(errors.variants?.find(Boolean) ?? {})[0]
    ?? 'Periksa kembali data yang diisi';
  return Object.assign(new Error(first), { statusCode: 400, fieldErrors: errors });
}

module.exports = {
  toNumber,
  normalizeProductInput,
  validateProduct,
  normalizeCustomOptionInput,
  validateCustomOption,
  checkOptionDeactivation,
  validationError,
};
