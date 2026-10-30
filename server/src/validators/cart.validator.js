// validators/cart.validator.js
// FR-11 · C-12 — validasi body POST /api/cart (item useCartStore dari frontend) dengan zod.
// Jumlah > 99 dan keranjang > 50 baris TIDAK ditolak di sini: baris/keranjang ditandai oleh cart.service
// agar keranjang hasil gabung tetap tampil dan bisa diperbaiki pelanggan.

const { CART_REQUEST_MAX_ITEMS } = require('../utils/businessConstants');
const { isValidDateKey } = require('../utils/jakartaDate');
const { z, parseOrThrow, bigIntIdString } = require('./zodHelpers');

const NOTE_MAX_LENGTH = 255; // order_items.note VARCHAR(255)
const TEXT_FALLBACK_MAX_LENGTH = 255;
const DESIGN_TOKEN_MAX_LENGTH = 128; // token asli 43 karakter; isi lain diverifikasi (dan gagal) di service

const empty = (value) => value === undefined || value === null || value === '';

/** Teks opsional: kosong → null */
const optionalText = (label, maxLength) =>
  z.preprocess(
    (value) => (empty(value) ? null : value),
    z.string({ error: `${label} tidak valid.` }).max(maxLength, { error: `${label} tidak valid.` }).nullable()
  );

const optionalId = (label) =>
  z.preprocess((value) => (value == null ? null : value), bigIntIdString(`${label} tidak valid.`).nullable());

const quantity = z.preprocess(
  (value) => (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value),
  z
    .number({ error: 'jumlah harus bilangan bulat positif.' })
    .int({ error: 'jumlah harus bilangan bulat positif.' })
    .min(1, { error: 'jumlah harus bilangan bulat positif.' })
    .max(Number.MAX_SAFE_INTEGER, { error: 'jumlah harus bilangan bulat positif.' })
);

const preferredDate = z.preprocess(
  (value) => (empty(value) ? null : value),
  z
    .string({ error: 'tanggal harus berformat YYYY-MM-DD dan merupakan tanggal yang valid.' })
    .refine(isValidDateKey, { error: 'tanggal harus berformat YYYY-MM-DD dan merupakan tanggal yang valid.' })
    .nullable()
);

const cartItemId = z.preprocess(
  (value) => value ?? null,
  z
    .union([z.string().max(64), z.number().int().refine(Number.isSafeInteger)], { error: 'cart_item_id tidak valid.' })
    .nullable()
);

const cartItemSchema = z.object(
  {
    cart_item_id: cartItemId,
    product_id: z.preprocess(
      (value) => (value == null ? undefined : value),
      bigIntIdString('product_id tidak valid.').optional()
    ).refine((value) => value !== undefined, { error: 'product_id wajib diisi.' }),
    variant_id: optionalId('variant_id'),
    design_id: optionalId('design_id'),
    design_token: optionalText('design_token', DESIGN_TOKEN_MAX_LENGTH),
    quantity,
    preferred_date: preferredDate,
    note: optionalText('catatan', NOTE_MAX_LENGTH),
    // Nilai cadangan tampilan saja (bila produk sudah tidak ada) — tidak pernah masuk subtotal
    name: optionalText('nama', TEXT_FALLBACK_MAX_LENGTH),
    image_url: optionalText('image_url', TEXT_FALLBACK_MAX_LENGTH),
    price: z.preprocess((value) => {
      const price = Number(value);
      return Number.isFinite(price) && price >= 0 ? price : 0;
    }, z.number()),
  },
  { error: 'format tidak valid.' }
);

const cartBodySchema = z.object(
  {
    items: z
      .array(z.unknown(), { error: 'Format data keranjang tidak valid.' })
      .max(CART_REQUEST_MAX_ITEMS, { error: `Permintaan keranjang maksimal berisi ${CART_REQUEST_MAX_ITEMS} item.` }),
  },
  { error: 'Format data keranjang tidak valid.' }
);

/**
 * @param {unknown} body
 * @returns {Array<object>} item yang sudah dinormalisasi
 * @throws {Error} statusCode 400 bila format tidak valid
 */
function validateCartBody(body) {
  const { items } = parseOrThrow(cartBodySchema, body);

  // Item divalidasi satu per satu agar pesan error menyebut posisi item
  return items.map((item, index) =>
    parseOrThrow(cartItemSchema, item, (issue) => `Item ${index + 1}: ${issue.message}`)
  );
}

module.exports = {
  validateCartBody,
};
