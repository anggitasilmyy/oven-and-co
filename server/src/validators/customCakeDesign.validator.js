// validators/customCakeDesign.validator.js
// FR-10 · UC-06 · C-11 — validasi body POST /api/custom-cake-designs dengan zod.
// Semua langkah wajib; tulisan maks. 30 karakter (SPEC §6). Harga & tanggal siap dicek ulang di service.

const { isValidDateKey } = require('../utils/jakartaDate');
const { z, parseOrThrow } = require('./zodHelpers');

const OPTION_GROUPS = ['ukuran', 'bentuk', 'rasa', 'krim_topping'];
const WRITING_COLORS = ['Cokelat', 'Putih', 'Pink', 'Emas']; // client constants/customCake.js WRITING_COLORS
const WRITING_TEXT_MAX_LENGTH = 30;
const REFERENCE_PHOTO_URL_MAX_LENGTH = 255; // custom_cake_designs.reference_photo_url VARCHAR(255)

const optionId = (group) =>
  z.preprocess(
    (value) => (typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value),
    z
      .number({ error: `Pilihan ${group} wajib diisi dengan ID opsi yang valid.` })
      .int({ error: `Pilihan ${group} wajib diisi dengan ID opsi yang valid.` })
      .min(1, { error: `Pilihan ${group} wajib diisi dengan ID opsi yang valid.` })
      .max(Number.MAX_SAFE_INTEGER, { error: `ID opsi ${group} tidak valid.` })
  );

const selectionsSchema = z.object(
  Object.fromEntries(OPTION_GROUPS.map((group) => [group, optionId(group)])),
  { error: 'Pilihan custom cake wajib diisi.' }
);

/** Foto referensi lewat JSON hanya boleh berupa URL/path (unggahan file memakai multipart, bukan data URL) */
const referencePhotoUrl = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() || null : value ?? null),
  z
    .string({ error: 'Foto referensi tidak valid.' })
    .refine((value) => !/^data:/i.test(value), {
      error: 'Foto referensi harus diunggah sebagai file, bukan data URL.',
    })
    .refine((value) => /^https?:\/\/\S+$/i.test(value) || /^\/(?!\/)[^\s]*$/.test(value), {
      error: 'Foto referensi harus berupa URL HTTP(S) atau path relatif yang valid.',
    })
    .max(REFERENCE_PHOTO_URL_MAX_LENGTH, { error: 'URL foto referensi maksimal 255 karakter.' })
    .nullable()
);

const designSchema = z
  .object(
    {
      selections: selectionsSchema,
      writingText: z.preprocess(
        (value) => (value == null ? '' : value),
        z
          .string({ error: 'Tulisan kue harus berupa teks.' })
          .trim()
          .max(WRITING_TEXT_MAX_LENGTH, { error: 'Tulisan pada kue maksimal 30 karakter.' })
      ),
      writingColor: z.unknown(),
      referencePhoto: referencePhotoUrl,
      readyDate: z
        .string({ error: 'Tanggal siap harus menggunakan format YYYY-MM-DD.' })
        .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Tanggal siap harus menggunakan format YYYY-MM-DD.' })
        .refine(isValidDateKey, { error: 'Tanggal siap tidak valid.' }),
    },
    { error: 'Data desain custom cake tidak valid.' }
  )
  .superRefine((design, ctx) => {
    if (design.writingText && !WRITING_COLORS.includes(design.writingColor)) {
      ctx.addIssue({ code: 'custom', message: 'Pilih warna tulisan yang tersedia.' });
    }
  })
  .transform((design) => ({
    selections: design.selections,
    selectedIds: OPTION_GROUPS.map((group) => design.selections[group]),
    writingText: design.writingText || null,
    writingColor: design.writingText ? design.writingColor : null,
    referencePhotoUrl: design.referencePhoto,
    readyDateKey: design.readyDate,
  }));

/**
 * @param {unknown} payload
 * @returns {{selections, selectedIds: number[], writingText, writingColor, referencePhotoUrl, readyDateKey}}
 */
function validateCustomCakeDesign(payload) {
  return parseOrThrow(designSchema, payload);
}

/** Body multipart: data desain dikirim sebagai string JSON di field `design` */
function parseMultipartDesign(body) {
  const raw = body?.design;

  if (typeof raw !== 'string') {
    throw Object.assign(new Error('Data desain custom cake tidak valid.'), { statusCode: 400 });
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('Data desain custom cake tidak valid.'), { statusCode: 400 });
  }
}

module.exports = {
  OPTION_GROUPS,
  validateCustomCakeDesign,
  parseMultipartDesign,
};
