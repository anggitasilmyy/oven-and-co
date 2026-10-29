// validators/address.validator.js
// FR-24 · BR-12 · C-22 — validasi /api/me/addresses dengan zod. Aturan sama dengan client
// utils/rules/account.js validateAddressInput + addressService toRow (trim, HP tanpa spasi, catatan kosong → null);
// panjang kolom dari SPEC §8 (client constants/account.js ADDRESS_LIMITS).
// Field di luar form (user_id, address_id, ...) dibuang — pemilik selalu dari req.user.

const { API_ERROR_CODE } = require('../utils/businessConstants');
const { z, parseOrThrow, bigIntIdString } = require('./zodHelpers');

const ADDRESS_LIMITS = Object.freeze({
  label: 30, // VARCHAR(30)
  recipient_name: 100, // VARCHAR(100)
  recipient_phone: 20, // VARCHAR(20)
  courier_note: 255, // VARCHAR(255)
});
const TEXT_MAX_BYTES = 65535; // full_address TEXT

const addressIdParam = bigIntIdString('ID alamat tidak valid.');

const trimmed = (value) => (typeof value === 'string' ? value.trim() : value);

const requiredText = (requiredMessage, field, max) =>
  z.preprocess(
    trimmed,
    z
      .string({ error: requiredMessage })
      .min(1, { error: requiredMessage })
      .max(max, { error: `${field} maksimal ${max} karakter.` })
  );

// Sama dengan client validatePhone: diawali +62, 9–13 digit; spasi dihapus sebelum disimpan
const recipientPhone = z.preprocess(
  (value) => (typeof value === 'string' ? value.replace(/\s/g, '') : value),
  z
    .string({ error: 'Nomor HP wajib diisi.' })
    .min(1, { error: 'Nomor HP wajib diisi.' })
    .refine((value) => value.startsWith('+62'), { error: 'Nomor HP harus diawali +62.' })
    .refine((value) => {
      const digits = value.replace(/\D/g, '').length;
      return digits >= 9 && digits <= 13;
    }, { error: 'Nomor HP tidak valid.' })
    .max(ADDRESS_LIMITS.recipient_phone, { error: `Nomor HP maksimal ${ADDRESS_LIMITS.recipient_phone} karakter.` })
);

const fullAddress = z.preprocess(
  trimmed,
  z
    .string({ error: 'Alamat lengkap wajib diisi.' })
    .min(1, { error: 'Alamat lengkap wajib diisi.' })
    .refine((value) => Buffer.byteLength(value, 'utf8') <= TEXT_MAX_BYTES, { error: 'Alamat lengkap terlalu panjang.' })
);

// Titik peta wajib (ongkir dari jarak, BR-12); DECIMAL(10,7) → dibulatkan 7 desimal
const PIN_MESSAGE = 'Tentukan titik lokasi di peta.';
const coordinate = (limit) =>
  z.preprocess(
    (value) => (value === '' || value == null ? undefined : typeof value === 'string' ? Number(value) : value),
    z
      .number({ error: PIN_MESSAGE })
      .refine(Number.isFinite, { error: PIN_MESSAGE })
      .min(-limit, { error: PIN_MESSAGE })
      .max(limit, { error: PIN_MESSAGE })
      .transform((value) => Math.round(value * 1e7) / 1e7)
  );

const courierNote = z.preprocess(
  (value) => {
    const text = trimmed(value);
    return text === '' || text == null ? null : text;
  },
  z
    .string({ error: 'Catatan kurir tidak valid.' })
    .max(ADDRESS_LIMITS.courier_note, { error: `Catatan kurir maksimal ${ADDRESS_LIMITS.courier_note} karakter.` })
    .nullable()
);

const addressSchema = z.object(
  {
    label: requiredText('Label alamat wajib diisi.', 'Label', ADDRESS_LIMITS.label),
    recipient_name: requiredText('Nama penerima wajib diisi.', 'Nama penerima', ADDRESS_LIMITS.recipient_name),
    recipient_phone: recipientPhone,
    full_address: fullAddress,
    latitude: coordinate(90),
    longitude: coordinate(180),
    courier_note: courierNote,
    is_primary: z.preprocess((value) => value ?? false, z.boolean({ error: 'is_primary tidak valid.' })),
  },
  { error: 'Data alamat tidak valid.' }
);

/** @returns {string} addressId sebagai string digit BIGINT positif */
function validateAddressIdParam(value) {
  try {
    return parseOrThrow(addressIdParam, value);
  } catch (error) {
    throw Object.assign(error, { apiCode: API_ERROR_CODE.INVALID_ID });
  }
}

/** @returns {{label, recipient_name, recipient_phone, full_address, latitude, longitude, courier_note, is_primary}} */
function validateAddressBody(body) {
  return parseOrThrow(addressSchema, body ?? {});
}

module.exports = {
  ADDRESS_LIMITS,
  validateAddressIdParam,
  validateAddressBody,
};
