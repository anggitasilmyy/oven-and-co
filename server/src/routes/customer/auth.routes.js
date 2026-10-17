
const express = require('express');
const authService = require('../../services/auth.service');
const auth = require('../../middlewares/auth');

const router = express.Router();

// Meneruskan error dari handler async ke errorHandler Express.
function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// GET /api/auth/me
// Mengambil identitas pengguna yang sudah terautentikasi.
router.get('/me', auth, (req, res) => {
  return res.status(200).json({
    status: 'success',
    data: {
      user: req.user,
    },
  });
});

// POST /api/auth/register
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const result = await authService.register(req.body || {});

    return res.status(201).json({
      status: 'success',
      message: 'Akun berhasil dibuat.',
      data: result,
    });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body || {});

    return res.status(200).json({
      status: 'success',
      message: 'Login berhasil.',
      data: result,
    });
  })
);

// POST /api/auth/forgot-password
router.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const result = await authService.requestPasswordReset(
      req.body || {}
    );

    return res.status(200).json({
      status: 'success',
      message: result.message,
    });
  })
);

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const result = await authService.resetPassword(
      req.body || {}
    );

    return res.status(200).json({
      status: 'success',
      message: result.message,
    });
  })
);

module.exports = router;
