
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

  const message =
    statusCode >= 500
      ? 'Terjadi kesalahan pada server.'
      : err.message || 'Permintaan tidak dapat diproses.';

  return res.status(statusCode).json({
    status: 'error',
    message,
  });
}

module.exports = errorHandler;
