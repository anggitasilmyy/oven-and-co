// validators/cart.validator.js
// FR-11 · C-12 — validasi body POST /api/cart (item useCartStore dari frontend).
// Ditulis manual karena zod belum terpasang di server (lihat ringkasan Step 6.3).

// Jumlah > 99 dan keranjang > 50 baris TIDAK ditolak di sini: baris/keranjang ditandai oleh cart.service
// agar keranjang hasil gabung tetap tampil dan bisa diperbaiki pelanggan.

const { CART_REQUEST_MAX_ITEMS } = require('../utils/businessConstants');
const { isValidDateKey } = require('../utils/jakartaDate');

const ID_PATTERN = /^[1-9]\d{0,18}$/;
const NOTE_MAX_LENGTH = 255; // order_items.note VARCHAR(255)
const TEXT_FALLBACK_MAX_LENGTH = 255;
const DESIGN_TOKEN_MAX_LENGTH = 128; // token asli 43 karakter; isi lain diverifikasi (dan gagal) di service

function createError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** ID BIGINT positif dalam bentuk angka aman atau string digit → string; null bila kosong */
function normalizeId(value, label, position, { required = false } = {}) {
  if (value == null) {
    if (required) throw createError(`Item ${position}: ${label} wajib diisi.`);
    return null;
  }

  const text =
    typeof value === 'number' && Number.isSafeInteger(value)
      ? String(value)
      : typeof value === 'string'
        ? value
        : null;

  if (text === null || !ID_PATTERN.test(text) || BigInt(text) > 9223372036854775807n) {
    throw createError(`Item ${position}: ${label} tidak valid.`);
  }

  return text;
}

function normalizeQuantity(value, position) {
  const quantity =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : NaN;

  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw createError(`Item ${position}: jumlah harus bilangan bulat positif.`);
  }

  return quantity;
}

function normalizeOptionalText(value, label, position, maxLength) {
  if (value == null || value === '') return null;

  if (typeof value !== 'string' || value.length > maxLength) {
    throw createError(`Item ${position}: ${label} tidak valid.`);
  }

  return value;
}

function normalizePreferredDate(value, position) {
  if (value == null || value === '') return null;

  if (!isValidDateKey(value)) {
    throw createError(
      `Item ${position}: tanggal harus berformat YYYY-MM-DD dan merupakan tanggal yang valid.`
    );
  }

  return value;
}

function normalizeFallbackPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : 0;
}

/**
 * @param {unknown} body
 * @returns {Array<object>} item yang sudah dinormalisasi
 * @throws {Error} statusCode 400 bila format tidak valid
 */
function validateCartBody(body) {
  if (!isPlainObject(body) || !Array.isArray(body.items)) {
    throw createError('Format data keranjang tidak valid.');
  }

  if (body.items.length > CART_REQUEST_MAX_ITEMS) {
    throw createError(`Permintaan keranjang maksimal berisi ${CART_REQUEST_MAX_ITEMS} item.`);
  }

  return body.items.map((item, index) => {
    const position = index + 1;

    if (!isPlainObject(item)) {
      throw createError(`Item ${position}: format tidak valid.`);
    }

    const cartItemId = item.cart_item_id;

    if (
      cartItemId != null &&
      !(typeof cartItemId === 'string' && cartItemId.length <= 64) &&
      !Number.isSafeInteger(cartItemId)
    ) {
      throw createError(`Item ${position}: cart_item_id tidak valid.`);
    }

    return {
      cart_item_id: cartItemId ?? null,
      product_id: normalizeId(item.product_id, 'product_id', position, { required: true }),
      variant_id: normalizeId(item.variant_id, 'variant_id', position),
      design_id: normalizeId(item.design_id, 'design_id', position),
      design_token: normalizeOptionalText(item.design_token, 'design_token', position, DESIGN_TOKEN_MAX_LENGTH),
      quantity: normalizeQuantity(item.quantity, position),
      preferred_date: normalizePreferredDate(item.preferred_date, position),
      note: normalizeOptionalText(item.note, 'catatan', position, NOTE_MAX_LENGTH),
      // Nilai cadangan tampilan saja (bila produk sudah tidak ada) — tidak pernah masuk subtotal
      name: normalizeOptionalText(item.name, 'nama', position, TEXT_FALLBACK_MAX_LENGTH),
      image_url: normalizeOptionalText(item.image_url, 'image_url', position, TEXT_FALLBACK_MAX_LENGTH),
      price: normalizeFallbackPrice(item.price),
    };
  });
}

module.exports = {
  validateCartBody,
};
