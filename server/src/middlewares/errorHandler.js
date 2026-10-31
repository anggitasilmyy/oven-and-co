
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const candidateStatus = err.statusCode || err.status;

  const statusCode =
    Number.isInteger(candidateStatus) &&
    candidateStatus >= 400 &&
    candidateStatus <= 599
      ? candidateStatus
      : 500;

  if (statusCode >= 500) {
    console.error('[API Error]', err);
  }

  // Error body-parser (express.json) memakai pesan bahasa Inggris → ganti dengan pesan Indonesia
  const BODY_PARSER_MESSAGES = {
    'entity.parse.failed': 'Format data JSON tidak valid.',
    'entity.too.large': 'Ukuran data permintaan terlalu besar.',
  };

  const message =
    statusCode >= 500
      ? 'Terjadi kesalahan pada server.'
      : BODY_PARSER_MESSAGES[err.type] || err.message || 'Permintaan tidak dapat diproses.';

  // Kode error aplikasi (utils/businessConstants API_ERROR_CODE) hanya untuk 4xx; kode internal
  // (mis. kode Prisma pada error 500) tidak pernah dikirim ke klien.
  const code =
    statusCode < 500 && typeof err.apiCode === 'string' ? err.apiCode : undefined;

  // Step 6.4 · form admin (AD-06, AD-07): error validasi per field, kunci sama dengan mock client (`fieldErrors`).
  // Hanya untuk 4xx dan hanya bila error membawanya — respons endpoint lain tidak berubah.
  const fieldErrors =
    statusCode < 500 && err.fieldErrors && typeof err.fieldErrors === 'object' ? err.fieldErrors : undefined;

  return res.status(statusCode).json({
    status: 'error',
    ...(code ? { code } : {}),
    message,
    ...(fieldErrors ? { fieldErrors } : {}),
  });
}

module.exports = errorHandler;
