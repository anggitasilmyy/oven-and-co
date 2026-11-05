// services/adminStaffStatus.service.js
// Step 6.4.10 · FR-36 · FR-26 · UC-30 · A-11 · AD-11 tabel "Akun staf" — C3c PATCH /api/admin/staff/:id/active (Owner).
// Kontrak = client services/settingsService.js setAdminAccountStatus (mock settingsAdmin.js setAdminAccountActive):
// body { is_active } → akun (toAdminAccount). Dipisah dari adminStaff.service.js (GET & POST) agar tiap file ±150 baris.
// PATCH aktif/nonaktif — urutan wajib (perbaikan F-1 integrasi MySQL 8):
//   1. validasi target DI LUAR transaksi (consistent read, tanpa kunci): tidak ada / bukan Owner-Staf → 404, sehingga
//      baris pelanggan TIDAK PERNAH dikunci (checkout mengunci baris pelanggan);
//   2. kunci baris akun target `SELECT … users … FOR UPDATE` — operasi pertama transaksi (setelah SET lock wait);
//   3. kunci store_settings (lockAdminMasterData — kunci yang sama dengan C2 & AD-06/07/09): semua perubahan status
//      akun tetap diserialkan; read view InnoDB baru dibuat pada pembacaan biasa SETELAH kedua kunci;
//   4. cek ulang pelaku setelah kunci: nonaktif → 401 SESSION_INVALID (keputusan C3 D2), bukan Owner → 403;
//   5. baca target (select whitelist; peran dicek ulang → 404) lalu invariant: akun sendiri 400, Owner aktif terakhir 409;
//      status sudah sama dengan tujuan → 200 tanpa UPDATE (idempoten);
//   6. UPDATE bersyarat (id + peran admin + status awal) hanya kolom is_active; count harus 1;
//   7. baca ulang (select whitelist) harus = status tujuan; selain itu 409 + rollback.
// Alasan urutan (F-1, terbukti di MySQL 8): urutan lama store_settings → UPDATE baris admin membentuk siklus dengan
// AD-04 Selesai (kunci S baris admin lewat FK changed_by → kunci S baris pelanggan lewat FK point_transactions) dan
// checkout (baris pelanggan X → store_settings X) → deadlock nyata. Dengan baris target dikunci LEBIH DULU, PATCH yang
// menunggu AD-04 belum memegang store_settings, sehingga checkout tidak pernah menunggu PATCH dan siklus tidak terbentuk.
// Dua PATCH bersamaan mengunci baris target masing-masing lalu antre di store_settings (satu sumber serialisasi);
// baris pelaku tidak pernah dikunci. Penonaktifan langsung berlaku: middleware auth membaca is_active setiap request
// (token lama → 401 SESSION_INVALID), login menolak akun nonaktif. Peran akun tidak bisa diubah lewat aplikasi, jadi cek
// peran di langkah 1 tetap berlaku setelah kunci (dicek ulang di langkah 5 sebagai pengaman).

const prisma = require('../lib/prisma');
const { ADMIN_ACCOUNT_ROLES, OWNER_ROLE } = require('../utils/businessConstants');
const { lockAdminMasterData } = require('./adminMasterDataLock.service');
const {
  adminAccountStatusError, actorStatusError, toAdminAccount, STAFF_MESSAGES,
} = require('./adminStaffRules.service');
const { ADMIN_ACCOUNT_SELECT } = require('./adminStaff.service');

const ACCOUNT_NOT_UPDATED = 'Status akun gagal diperbarui karena data berubah. Muat ulang halaman lalu coba lagi.';

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

/** Error aturan ({statusCode, message, apiCode?}) → Error untuk errorHandler */
function ruleError(rule) {
  return Object.assign(new Error(rule.message), { statusCode: rule.statusCode }, rule.apiCode ? { apiCode: rule.apiCode } : {});
}

/** Kunci baris akun target (PK, satu baris) — dipanggil hanya untuk akun yang sudah dipastikan Owner/Staf */
async function lockAdminAccount(tx, userId) {
  const rows = await tx.$queryRaw`SELECT user_id FROM users WHERE user_id = ${userId} FOR UPDATE`;
  if (rows.length === 0) throw httpError(404, STAFF_MESSAGES.NOT_FOUND);
}

/**
 * PATCH /api/admin/staff/:id/active
 * @param {string} actorId — req.user.userId (Owner yang meminta)
 * @param {string} targetId — hasil validateStaffId
 * @param {boolean} isActive — status tujuan
 * @returns {Promise<object>} akun (toAdminAccount) setelah perubahan
 */
async function setAdminAccountActive(actorId, targetId, isActive) {
  const actorKey = BigInt(actorId);
  const targetKey = BigInt(targetId);
  const ruleContext = { currentUserId: String(actorKey), activeOwnerIds: [] };

  // 1. Di luar transaksi: akun pelanggan / tidak ada → 404 tanpa transaksi & tanpa kunci
  const candidate = await prisma.user.findUnique({ where: { userId: targetKey }, select: { role: true } });
  if (!candidate || !ADMIN_ACCOUNT_ROLES.includes(candidate.role)) {
    throw ruleError(adminAccountStatusError(null, isActive, ruleContext));
  }

  return prisma.$transaction(async (tx) => {
    await lockAdminAccount(tx, targetKey); // 2.
    await lockAdminMasterData(tx); // 3.

    const actor = await tx.user.findUnique({ where: { userId: actorKey }, select: { role: true, isActive: true } });
    const actorError = actorStatusError(actor && { role: actor.role, is_active: actor.isActive });
    if (actorError) throw ruleError(actorError);

    const targetRow = await tx.user.findUnique({ where: { userId: targetKey }, select: ADMIN_ACCOUNT_SELECT });
    const target = targetRow && toAdminAccount(targetRow);
    const needsOwnerCount = target && !isActive && target.is_active && target.role === OWNER_ROLE && target.user_id !== String(actorKey);
    const activeOwnerIds = needsOwnerCount
      ? (await tx.user.findMany({ where: { role: OWNER_ROLE, isActive: true }, select: { userId: true } })).map((u) => String(u.userId))
      : [];
    const statusError = adminAccountStatusError(target, isActive, { ...ruleContext, activeOwnerIds });
    if (statusError) throw ruleError(statusError);

    if (target.is_active === isActive) return target; // idempoten — tanpa UPDATE

    const updated = await tx.user.updateMany({
      where: { userId: targetKey, role: { in: [...ADMIN_ACCOUNT_ROLES] }, isActive: !isActive },
      data: { isActive },
    });
    if (updated.count !== 1) throw httpError(409, ACCOUNT_NOT_UPDATED);

    const saved = await tx.user.findUnique({ where: { userId: targetKey }, select: ADMIN_ACCOUNT_SELECT });
    if (!saved || saved.isActive !== isActive) throw httpError(409, ACCOUNT_NOT_UPDATED);
    return toAdminAccount(saved);
  });
}

module.exports = {
  setAdminAccountActive,
};
