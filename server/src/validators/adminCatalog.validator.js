// validators/adminCatalog.validator.js
// Step 6.4 · FR-30 · FR-31 · FR-32 · AD-06 · AD-07 — validasi BENTUK request produk, opsi custom cake, stok harian, dan
// bahan baku dengan zod. Isi (wajib, panjang, rentang, unik) diperiksa aturan bisnis (adminCatalogRules.service.js,
// stockRules.service.js) agar pesan & `fieldErrors` sama dengan mock client. Bentuk salah → 400 tanpa fieldErrors.

const { API_ERROR_CODE } = require('../utils/businessConstants');
const { z, createError, parseOrThrow } = require('./zodHelpers');

const BODY_INVALID_TEXT = 'Data permintaan tidak valid.';
const INT_MAX = 2147483647; // custom_options.option_id INT

const text = z.string().nullish();
const numberLike = z.union([z.string(), z.number()]).nullish();
const idLike = z.union([z.string(), z.number()]).nullish();

const variantSchema = z.object({
  variant_id: idLike,
  name: text,
  extra_price: numberLike,
  is_active: z.boolean().optional(),
});

// Foto: { image_id } = foto tersimpan milik produk; { file_index } = file ke-n pada field multipart `photos`.
// image_url hanya diterima untuk kompatibilitas form saat ini (diabaikan; data URL ditolak di service).
const photoSchema = z.object({
  image_id: idLike,
  file_index: z.number().int().nullish(),
  image_url: text,
});

const productSchema = z.object(
  {
    name: text,
    category_id: idLike,
    description: text,
    ingredients: text,
    allergens: text,
    price: numberLike,
    availability_type: text,
    lead_time_days: numberLike,
    is_active: z.boolean().optional(),
    variants: z.array(variantSchema).optional(),
    photos: z.array(photoSchema).optional(),
  },
  { error: BODY_INVALID_TEXT }
);

const activeSchema = z.object({ is_active: z.boolean({ error: 'Status aktif tidak valid.' }) }, { error: BODY_INVALID_TEXT });

const customOptionSchema = z.object(
  {
    option_group: text,
    name: text,
    description: text,
    extra_price: numberLike,
    is_active: z.boolean().optional(),
  },
  { error: BODY_INVALID_TEXT }
);

const dailyPlansSchema = z.object(
  { plans: z.array(z.object({ product_id: idLike, qty_planned: numberLike }), { error: BODY_INVALID_TEXT }).optional() },
  { error: BODY_INVALID_TEXT }
);

// expected_stock (opsional, PUT): stok yang dilihat admin saat form dibuka — mencegah stok masuk bersamaan tertimpa
const materialSchema = z.object(
  { name: text, unit: text, stock: numberLike, min_stock: numberLike, expected_stock: numberLike },
  { error: BODY_INVALID_TEXT }
);

const stockInSchema = z.object({ qty: numberLike }, { error: BODY_INVALID_TEXT });

const issueMessage = (issue) => (issue.path.length === 0 ? issue.message : BODY_INVALID_TEXT);

/** :id BIGINT positif (produk, bahan baku) atau INT (opsi) → string; tidak sah → 400 INVALID_ID */
function validateIdParam(value, message, { max = 9223372036854775807n } = {}) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > max) {
    throw Object.assign(createError(message), { apiCode: API_ERROR_CODE.INVALID_ID });
  }
  return value;
}

const validateProductId = (value) => validateIdParam(value, 'ID produk tidak valid.');
const validateOptionId = (value) => validateIdParam(value, 'ID opsi tidak valid.', { max: BigInt(INT_MAX) });
const validateMaterialId = (value) => validateIdParam(value, 'ID bahan baku tidak valid.');

/** Field `product` multipart berisi JSON → objek; rusak/hilang → 400 */
function parseMultipartProduct(body) {
  const raw = body?.product;
  if (typeof raw !== 'string') throw createError(BODY_INVALID_TEXT);
  try {
    return JSON.parse(raw);
  } catch {
    throw createError(BODY_INVALID_TEXT);
  }
}

module.exports = {
  validateProductId,
  validateOptionId,
  validateMaterialId,
  parseMultipartProduct,
  validateProductBody: (body) => parseOrThrow(productSchema, body, issueMessage),
  validateActiveBody: (body) => parseOrThrow(activeSchema, body, issueMessage),
  validateCustomOptionBody: (body) => parseOrThrow(customOptionSchema, body, issueMessage),
  validateDailyPlansBody: (body) => parseOrThrow(dailyPlansSchema, body, issueMessage),
  validateMaterialBody: (body) => parseOrThrow(materialSchema, body, issueMessage),
  validateStockInBody: (body) => parseOrThrow(stockInSchema, body, issueMessage),
};
