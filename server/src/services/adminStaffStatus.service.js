// services/adminStaffStatus.service.js
// Step 6.4.10 · FR-36 · FR-26 · UC-30 · A-11 · AD-11 tabel "Akun staf" — C3c PATCH /api/admin/staff/:id/active (Owner).
// Kontrak = client services/settingsService.js setAdminAccountStatus (mock settingsAdmin.js setAdminAccountActive):
// body { is_active } → akun (toAdminAccount). Dipisah dari adminStaff.service.js (GET & POST) agar tiap file ±150 baris.
// PATCH aktif/nonaktif (satu transaksi, urutan wajib):
//   1. lockAdminMasterData(tx) — SELECT … store_settings … FOR UPDATE sebagai operasi PERTAMA (kunci yang sama dengan C2
//      & AD-06/07/09). Satu-satunya penulis users.is_active adalah endpoint ini, jadi semua perubahan status akun
//      diserialkan; pembacaan biasa SETELAH kunci melihat commit sebelumnya (read view InnoDB dibuat setelah kunci).
//   2. cek ulang pelaku setelah kunci: nonaktif → 401 SESSION_INVALID (keputusan C3 D2), bukan Owner → 403;
//   3. baca target (select whitelist); bukan Owner/Staf / tidak ada → 404 — SEBELUM UPDATE, jadi baris pelanggan tidak
//      pernah dikunci (checkout mengunci users pelanggan → store_settings; tanpa urutan silang);
//   4. bila menonaktifkan Owner: hitung ulang Owner aktif → Owner aktif terakhir 409; akun sendiri 400;
//   5. status sudah sama dengan tujuan → 200 tanpa UPDATE (idempoten, baris dibaca setelah kunci);
//   6. UPDATE bersyarat (id + peran admin + status awal) hanya kolom is_active; count harus 1;
//   7. baca ulang (select whitelist) harus = status tujuan; selain itu 409 + rollback.
// Tanpa FOR UPDATE pada users: tidak perlu (semua penulis status diserialkan kunci store_settings) dan tidak menambah
// kunci baru. Transaksi lain yang menyentuh baris users admin (riwayat status AD-04 → kunci S lewat FK, reset sandi)
// tidak pernah menunggu store_settings → tidak membentuk siklus. Penonaktifan langsung berlaku: middleware auth membaca
// is_active setiap request (token lama → 401 SESSION_INVALID), login menolak akun nonaktif.

const prisma = require('../lib/prisma');
const { ADMIN_ACCOUNT_ROLES, OWNER_ROLE } = require('../utils/businessConstants');
const { lockAdminMasterData } = require('./adminMasterDataLock.service');
const { adminAccountStatusError, actorStatusError, toAdminAccount } = require('./adminStaffRules.service');
const { ADMIN_ACCOUNT_SELECT } = require('./adminStaff.service');

const ACCOUNT_NOT_UPDATED = 'Status akun gagal diperbarui karena data berubah. Muat ulang halaman lalu coba lagi.';

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

/** Error aturan ({statusCode, message, apiCode?}) → Error untuk errorHandler */
function ruleError(rule) {
  return Object.assign(new Error(rule.message), { statusCode: rule.statusCode }, rule.apiCode ? { apiCode: rule.apiCode } : {});
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

  return prisma.$transaction(async (tx) => {
    await lockAdminMasterData(tx);

    const actor = await tx.user.findUnique({ where: { userId: actorKey }, select: { role: true, isActive: true } });
    const actorError = actorStatusError(actor && { role: actor.role, is_active: actor.isActive });
    if (actorError) throw ruleError(actorError);

    const targetRow = await tx.user.findUnique({ where: { userId: targetKey }, select: ADMIN_ACCOUNT_SELECT });
    const target = targetRow && toAdminAccount(targetRow);
    const needsOwnerCount = target && !isActive && target.is_active && target.role === OWNER_ROLE && target.user_id !== String(actorKey);
    const activeOwnerIds = needsOwnerCount
      ? (await tx.user.findMany({ where: { role: OWNER_ROLE, isActive: true }, select: { userId: true } })).map((u) => String(u.userId))
      : [];
    const statusError = adminAccountStatusError(target, isActive, { currentUserId: String(actorKey), activeOwnerIds });
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
