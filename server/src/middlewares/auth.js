
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

function auth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      status: 'error',
      message: 'Autentikasi diperlukan.',
    });
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      status: 'error',
      message: 'Token autentikasi tidak tersedia.',
    });
  }

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return next(new Error('JWT_SECRET belum dikonfigurasi.'));
  }

  let payload;

  try {
    payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
    });
  } catch (error) {
    if (
      error.name === 'JsonWebTokenError' ||
      error.name === 'TokenExpiredError' ||
      error.name === 'NotBeforeError'
    ) {
      return res.status(401).json({
        status: 'error',
        message: 'Token tidak valid atau kedaluwarsa.',
      });
    }

    return next(error);
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.sub !== 'string' ||
    !/^\d+$/.test(payload.sub)
  ) {
    return res.status(401).json({
      status: 'error',
      message: 'Token autentikasi tidak valid.',
    });
  }

  async function verifyUser() {
    try {
      const user = await prisma.user.findUnique({
        where: {
          userId: BigInt(payload.sub),
        },
        select: {
          userId: true,
          role: true,
          isActive: true,
        },
      });

      if (!user || !user.isActive) {
        return res.status(401).json({
          status: 'error',
          message: 'Akun tidak ditemukan atau tidak aktif.',
        });
      }

      // Gunakan role terbaru dari database, bukan hanya klaim JWT.
      req.user = {
        userId: String(user.userId),
        role: user.role,
      };

      return next();
    } catch (error) {
      return next(error);
    }
  }

  return verifyUser();
}

module.exports = auth;
