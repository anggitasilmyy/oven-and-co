
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

  return res.status(statusCode).json({
    status: 'error',
    message,
  });
}

module.exports = errorHandler;
