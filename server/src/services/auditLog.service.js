// services/auditLog.service.js
// Step 6.5 C5 · FR-37 — audit log aktivitas admin (tabel audit_logs, SPEC §8: user_id admin pelaku, action, entity =
// nama tabel, entity_id = primary key, created_at). Tanpa endpoint/halaman baca (FR-37: "tanpa layar").
//
// Aturan (keputusan K1–K5 & B1–B5, ROADMAP 6.5 C5):
//   - recordAudit SELALU dipanggil dengan `tx` transaksi bisnis yang sama → perubahan gagal/rollback = tanpa audit;
//     INSERT audit gagal = perubahan bisnis ikut di-rollback. Tidak ada transaksi terpisah untuk audit.
//   - lockAuditActor: `SELECT user_id, is_active FROM users … FOR SHARE` (locking read → versi commit TERBARU) diambil
//     SEBELUM penulisan apa pun & sebelum INSERT audit (FK user_id → kunci S baris pelaku). Pelaku tidak ada / nonaktif
//     → 401 SESSION_INVALID tanpa menulis apa pun. Middleware auth sudah memeriksa di awal request; kunci ini menutup
//     jeda sampai transaksi. Locking read tidak membuat read view InnoDB, jadi aturan "kunci store_settings / orders
//     adalah pembacaan pertama" (snapshot dibuat pada SELECT biasa pertama setelah kunci) tetap berlaku.
//   - Urutan kunci (K5): master data → actor S SEBELUM store_settings X; AD-04 → orders X lalu actor S. Alasan: satu-
//     satunya pemegang kunci X baris admin adalah AD-11 ubah status akun (users target X → store_settings X); actor S
//     sesudah store_settings membentuk siklus dengan transaksi itu (lihat tests-mysql/16 A7/A8).
//   - created_at = `now` dibulatkan KE BAWAH ke detik penuh: kolom DATETIME(0) — MySQL membulatkan pecahan detik ke
//     terdekat, jadi tanpa ini nilai tersimpan bisa +1 detik dari `now` (unit test & MySQL konsisten).

const { Prisma } = require('@prisma/client');
const { API_ERROR_CODE, AUDIT_ACTOR_INACTIVE_TEXT } = require('../utils/businessConstants');

/**
 * Nilai DECIMAL berubah? (Prisma.Decimal, bukan float: 56500 = 56500.00). Dipakai untuk memutuskan audit harga.
 * @param {any} before — nilai tersimpan (Prisma.Decimal / number / string)
 * @param {any} after — nilai baru yang akan ditulis
 */
function decimalChanged(before, after) {
  const toDecimal = (v) => new Prisma.Decimal(v instanceof Prisma.Decimal ? v : String(v));
  return !toDecimal(before).equals(toDecimal(after));
}

/** Detik penuh (DATETIME(0)) */
const toAuditTime = (now) => new Date(Math.floor(now.getTime() / 1000) * 1000);

/**
 * Kunci baris admin pelaku (S) dan pastikan masih aktif.
 * @param {object} tx
 * @param {string|number|bigint} actorId — req.user.userId
 * @throws 401 { apiCode: SESSION_INVALID } bila tidak ada / nonaktif
 */
async function lockAuditActor(tx, actorId) {
  const rows = await tx.$queryRaw`SELECT user_id, is_active FROM users WHERE user_id = ${BigInt(actorId)} FOR SHARE`;
  const active = rows.length > 0 && Boolean(Number(rows[0].is_active));
  if (!active) {
    throw Object.assign(new Error(AUDIT_ACTOR_INACTIVE_TEXT), { statusCode: 401, apiCode: API_ERROR_CODE.SESSION_INVALID });
  }
}

/**
 * Tulis satu baris audit di transaksi bisnis (pelaku sudah dikunci lockAuditActor).
 * @param {object} tx
 * @param {{actorId, action: string, entity: string, entityId: bigint|number|string, now: Date}} entry
 */
async function recordAudit(tx, { actorId, action, entity, entityId, now }) {
  await tx.auditLog.create({
    data: { userId: BigInt(actorId), action, entity, entityId: BigInt(entityId), createdAt: toAuditTime(now) },
  });
}

module.exports = {
  decimalChanged,
  toAuditTime,
  lockAuditActor,
  recordAudit,
};
