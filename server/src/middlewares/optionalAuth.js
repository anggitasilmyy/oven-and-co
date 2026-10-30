// middlewares/optionalAuth.js
// FR-04 · BR-04 — endpoint yang boleh dipakai tamu (keranjang, desain custom cake).
// Tanpa header Authorization: lanjut sebagai tamu (req.user kosong).
// Dengan header: token tetap wajib valid (memakai middleware auth).

const auth = require('./auth');

function optionalAuth(req, res, next) {
  if (!req.headers.authorization) {
    return next();
  }

  return auth(req, res, next);
}

module.exports = optionalAuth;
