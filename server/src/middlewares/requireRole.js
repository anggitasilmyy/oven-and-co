
const VALID_ROLES = ['customer', 'staf', 'owner'];

function requireRole(...allowedRoles) {
  const invalidRoles = allowedRoles.filter(
    (role) => !VALID_ROLES.includes(role)
  );

  if (invalidRoles.length > 0) {
    throw new Error(
      `Role tidak dikenal: ${invalidRoles.join(', ')}`
    );
  }

  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Autentikasi diperlukan.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        message: 'Anda tidak memiliki izin untuk mengakses resource ini.',
      });
    }

    return next();
  };
}

module.exports = requireRole;
