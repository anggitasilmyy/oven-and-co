// validators/zodHelpers.js
// Validasi request dengan zod (AGENTS §2). Kegagalan menjadi error 400 berpesan Bahasa Indonesia
// sehingga errorHandler mengirimkannya apa adanya.

const { z } = require('zod');

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * @param {import('zod').ZodType} schema
 * @param {unknown} data
 * @param {(issue: import('zod').core.$ZodIssue) => string} [formatIssue] — bentuk pesan dari issue pertama
 */
function parseOrThrow(schema, data, formatIssue = (issue) => issue.message) {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw createError(formatIssue(result.error.issues[0]));
  }

  return result.data;
}

/** ID BIGINT positif (angka aman atau string digit) → string */
const bigIntIdString = (message) =>
  z
    .union([z.string(), z.number()], { error: message })
    .transform((value) => (typeof value === 'number' ? (Number.isSafeInteger(value) ? String(value) : '') : value))
    .refine((value) => /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n, { error: message });

module.exports = {
  z,
  createError,
  parseOrThrow,
  bigIntIdString,
};
