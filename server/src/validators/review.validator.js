// validators/review.validator.js
// FR-21 · BR-11 · C-19 — validasi POST /api/orders/:orderNumber/reviews dengan zod.
// Aturan sama dengan client utils/rules/orderTracking.js validateReviewInput: rating bilangan bulat 1–5, tag dari
// REVIEW_TAGS, maks. 3 foto. Komentar di-trim (kosong → null) seperti mock reviewWrites; batasnya kolom
// reviews.comment TEXT (65.535 byte) karena dokumen tidak menetapkan batas lain. Tag ganda digabung agar
// reviews.tags VARCHAR(255) tidak terlampaui. Foto hanya diterima sebagai file multipart (bukan data URL di JSON).

const { z, parseOrThrow, bigIntIdString } = require('./zodHelpers');

// Sama dengan client constants/orderHistory.js REVIEW_TAGS & REVIEW_RATING_MAX
const REVIEW_TAGS = Object.freeze(['Fresh', 'Lembut', 'Packaging Rapi', 'Tepat Waktu']);
const REVIEW_RATING_MAX = 5;
const COMMENT_MAX_BYTES = 65535;

const RATING_MESSAGE = `Pilih rating 1–${REVIEW_RATING_MAX} bintang`;
const BODY_INVALID_TEXT = 'Data ulasan tidak valid.';

const reviewSchema = z.object(
  {
    order_item_id: bigIntIdString('Produk tidak ada di pesanan ini'),
    rating: z
      .number({ error: RATING_MESSAGE })
      .int({ error: RATING_MESSAGE })
      .min(1, { error: RATING_MESSAGE })
      .max(REVIEW_RATING_MAX, { error: RATING_MESSAGE }),
    tags: z.preprocess(
      (value) => value ?? [],
      z
        .array(z.enum(REVIEW_TAGS, { error: 'Tag ulasan tidak valid' }), { error: 'Tag ulasan tidak valid' })
        .transform((tags) => [...new Set(tags)])
    ),
    comment: z.preprocess(
      (value) => {
        const text = typeof value === 'string' ? value.trim() : value;
        return text === '' || text == null ? null : text;
      },
      z
        .string({ error: 'Komentar ulasan tidak valid.' })
        .refine((text) => Buffer.byteLength(text, 'utf8') <= COMMENT_MAX_BYTES, { error: 'Komentar ulasan terlalu panjang.' })
        .nullable()
    ),
    // Mode API: foto WAJIB file multipart `photos`; data URL/URL di JSON ditolak (tidak pernah disimpan ke DB)
    photos: z.preprocess(
      (value) => value ?? [],
      z.array(z.unknown()).max(0, { error: 'Foto ulasan harus dikirim sebagai file.' })
    ),
  },
  { error: BODY_INVALID_TEXT }
);

/** Field `review` multipart berisi JSON → objek; rusak/hilang → 400 */
function parseMultipartReview(body) {
  const raw = body?.review;

  if (typeof raw !== 'string') {
    throw Object.assign(new Error(BODY_INVALID_TEXT), { statusCode: 400 });
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error(BODY_INVALID_TEXT), { statusCode: 400 });
  }
}

/** @returns {{order_item_id: string, rating: number, tags: string[], comment: string|null}} */
function validateReviewBody(body) {
  const { photos: _photos, ...review } = parseOrThrow(reviewSchema, body ?? {});
  return review;
}

module.exports = {
  REVIEW_TAGS,
  parseMultipartReview,
  validateReviewBody,
};
