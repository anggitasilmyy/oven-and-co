// services/adminSettings.service.js
// Step 6.4.10 · FR-36 · UC-30 · A-11 · BR-02 · BR-05 · BR-12 · TF-10 · AD-11 Pengaturan (Owner).
// Kontrak = client services/settingsService.js (mock settingsAdmin.js):
//   C1 GET  /api/admin/settings                         → { profile, hours, paymentMethods }        (buildSettingsBoard)
//   C2 PUT  /api/admin/settings                         → profile (6 field)                          (saveStoreProfile)
//   C2 PUT  /api/admin/settings/operating-hours {hours} → 7 baris jam, urut hari                     (saveOperatingHours)
//   C2 PATCH /api/admin/payment-methods/:code/active    → { method_code, is_active }                 (setPaymentMethodActive)
//
// Baca (GET): satu snapshot REPEATABLE READ (readSnapshot.service.js), query berurutan lewat `tx`, tanpa locking read.
//
// Tulis (C2): validasi bentuk (zod, route) + isi (rules) yang tidak bergantung pada data DILAKUKAN SEBELUM transaksi
// dibuka — input tidak sah tidak pernah membuka transaksi maupun menulis. Di dalam transaksi:
//   1. lockAdminMasterData(tx) = SELECT … store_settings … FOR UPDATE sebagai pembacaan PERTAMA (pola AD-06/07/09).
//      Locking read tidak membuat read view InnoDB; read view baru dibuat pada SELECT biasa pertama SETELAH kunci
//      diperoleh, jadi semua pembacaan berikutnya melihat commit transaksi pengaturan sebelumnya (tidak basi).
//   2. Semua penulis profil, jam operasional, metode bayar, dan aturan loyalty (AD-09) mengambil kunci yang sama →
//      diserialkan. Khusus metode bayar: dua Owner yang menonaktifkan dua metode online terakhir bersamaan → yang
//      kedua menunggu kunci, lalu membaca metode yang sudah dinonaktifkan yang pertama → 409 (BR-05).
//   3. Query berurutan (await satu per satu, tanpa Promise.all); UPDATE hanya kolom milik AD-11.
//   4. Respons dibaca ulang lewat `tx` setelah menulis (profil, jam, metode bayar). Metode bayar: UPDATE wajib mengenai
//      tepat satu baris dan hasil baca ulang wajib = status tujuan; selain itu 409 + rollback (tanpa sukses palsu).
// Jam operasional: hanya hari 1–7 yang dikirim (GET & PUT); baris lama di luar rentang tidak dikirim, tidak dihapus,
// tidak diubah. Konflik hour_id data lama (hari belum ada, hour_id = day_of_week sudah dipakai hari lain) → 409.
// Urutan kunci: store_settings → baris operating_hours / payment_methods. Checkout: users → store_settings → …
// (baris payment_methods hanya dibaca/dikunci-bersama lewat FK setelah store_settings) → tanpa urutan silang.
// Pesanan yang sudah ada tidak berubah (ongkir, jam, metode disimpan sebagai salinan di pesanan/pembayaran).

const prisma = require('../lib/prisma');
const { runInReadSnapshot } = require('./readSnapshot.service');
const { lockAdminMasterData } = require('./adminMasterDataLock.service');
const {
  normalizeStoreProfile, validateStoreProfile, normalizeOperatingHours, validateOperatingHours, paymentMethodToggleError,
} = require('./adminSettingsRules.service');
const {
  toStoreProfile, toOperatingHourView, toPaymentMethodView, toStoreProfileData, toOperatingHourData, onlyValidDays,
  planOperatingHourWrites,
} = require('./adminSettingsView.service');

function httpError(statusCode, message, fieldErrors) {
  return Object.assign(new Error(message), { statusCode }, fieldErrors ? { fieldErrors } : {});
}

const PROFILE_SELECT = Object.freeze({
  storeName: true, address: true, whatsappNumber: true, preorderCutoffTime: true, deliveryRadiusKm: true, deliveryFeePerKm: true,
});
const HOURS_ORDER = Object.freeze({ dayOfWeek: 'asc' });
const METHOD_NOT_UPDATED = 'Metode bayar gagal diperbarui karena data berubah. Muat ulang halaman lalu coba lagi.';
// Urutan sama dengan GET /api/payment-methods (filter AD-03): kelompok (urutan enum) lalu nama
const METHODS_ORDER = Object.freeze([{ methodGroup: 'asc' }, { name: 'asc' }]);

/** Error validasi isi → 400 dengan pesan pertama + fieldErrors (bentuk sama dengan mock `invalid(errors)`) */
function assertValid(errors) {
  if (Object.keys(errors).length) throw httpError(400, Object.values(errors)[0], errors);
}

/** GET /api/admin/settings */
async function getStoreSettings() {
  return runInReadSnapshot(async (tx) => {
    const store = await tx.storeSetting.findFirst({ orderBy: { settingId: 'asc' }, select: PROFILE_SELECT });
    if (!store) throw httpError(500, 'Pengaturan toko belum tersedia.');
    const hours = await tx.operatingHour.findMany({ orderBy: HOURS_ORDER });
    const methods = await tx.paymentMethod.findMany({ orderBy: METHODS_ORDER });
    return {
      profile: toStoreProfile(store),
      hours: onlyValidDays(hours).map(toOperatingHourView),
      paymentMethods: methods.map(toPaymentMethodView),
    };
  });
}

/**
 * PUT /api/admin/settings — profil toko, batas pre-order, radius & tarif ongkir (6 kolom; koordinat, aturan loyalty,
 * batas waktu bayar, bonus ulasan tidak disentuh). Radius & tarif ditulis sebagai teks desimal kanonik (M1).
 * @param {object} input — hasil validateStoreProfileBody
 * @returns {Promise<object>} profil tersimpan (dibaca ulang dalam transaksi yang sama)
 */
async function updateStoreProfile(input) {
  const profile = normalizeStoreProfile(input);
  assertValid(validateStoreProfile(profile));

  return prisma.$transaction(async (tx) => {
    await lockAdminMasterData(tx);
    await tx.storeSetting.updateMany({ data: toStoreProfileData(profile) });
    const saved = await tx.storeSetting.findFirst({ orderBy: { settingId: 'asc' }, select: PROFILE_SELECT });
    return toStoreProfile(saved);
  });
}

/** Pesan 409 konflik hour_id (data lama) — menyebut baris yang perlu diperbaiki di operating_hours */
function hourIdConflictMessage(conflicts) {
  const detail = conflicts.map((c) => `hari ${c.day_of_week} (hour_id ${c.hour_id} dipakai baris day_of_week ${c.used_by_day})`).join(', ');
  return `Data jam operasional tidak konsisten: ${detail}. Perbaiki tabel operating_hours (hour_id = day_of_week untuk hari 1–7), lalu simpan ulang.`;
}

/**
 * PUT /api/admin/settings/operating-hours — tepat 7 hari unik (validator); hari tutup menyimpan jam null.
 * Satu transaksi: semua hari tersimpan atau tidak sama sekali. Hari yang ada di-UPDATE (hour_id tetap); hari yang belum
 * ada dibuat dengan hour_id = day_of_week (pola seed; keputusan audit AD-11) — bentrok dengan baris lain → 409 tanpa tulis.
 * @param {Array<{day_of_week, is_open, open_time, close_time}>} rows — hasil validateOperatingHoursBody
 * @returns {Promise<Array>} 7 baris tersimpan, urut hari
 */
async function updateOperatingHours(rows) {
  const hours = normalizeOperatingHours(rows);
  assertValid(validateOperatingHours(hours));

  return prisma.$transaction(async (tx) => {
    await lockAdminMasterData(tx);
    // Semua baris (termasuk data lama di luar 1–7) dibaca setelah kunci → konflik hour_id dideteksi SEBELUM menulis
    const existing = await tx.operatingHour.findMany({ orderBy: HOURS_ORDER, select: { hourId: true, dayOfWeek: true } });
    const plan = planOperatingHourWrites(existing, hours);
    if (plan.conflicts.length) throw httpError(409, hourIdConflictMessage(plan.conflicts));

    for (const row of plan.updates) {
      await tx.operatingHour.update({ where: { dayOfWeek: row.day_of_week }, data: toOperatingHourData(row) });
    }
    for (const row of plan.creates) {
      await tx.operatingHour.create({ data: { hourId: row.day_of_week, dayOfWeek: row.day_of_week, ...toOperatingHourData(row) } });
    }
    const saved = await tx.operatingHour.findMany({ orderBy: HOURS_ORDER });
    return onlyValidDays(saved).map(toOperatingHourView);
  });
}

/**
 * PATCH /api/admin/payment-methods/:code/active — aktif/nonaktif. Metode tidak ada → 404; menonaktifkan metode online
 * aktif terakhir → 409 (BR-05); status sama dengan tujuan → 200 tanpa UPDATE (idempoten, dari baris yang dibaca setelah
 * kunci). UPDATE harus mengenai tepat 1 baris dan baca ulang harus = tujuan; selain itu 409 (rollback).
 * @returns {Promise<{method_code: string, is_active: boolean}>}
 */
async function setPaymentMethodActive(methodCode, isActive) {
  return prisma.$transaction(async (tx) => {
    await lockAdminMasterData(tx);
    // Dibaca SETELAH kunci → melihat perubahan metode yang di-commit transaksi pengaturan sebelumnya
    const methods = (await tx.paymentMethod.findMany({ orderBy: METHODS_ORDER })).map(toPaymentMethodView);
    const error = paymentMethodToggleError(methods, methodCode, isActive);
    if (error) throw httpError(error.statusCode, error.message);

    const target = methods.find((m) => m.method_code === methodCode);
    if (target.is_active === isActive) return { method_code: target.method_code, is_active: target.is_active }; // idempoten

    const updated = await tx.paymentMethod.updateMany({ where: { methodCode }, data: { isActive } });
    if (updated.count !== 1) throw httpError(409, METHOD_NOT_UPDATED);
    // Baca ulang lewat tx: respons = data tersimpan, bukan input request
    const saved = await tx.paymentMethod.findUnique({ where: { methodCode } });
    if (!saved || saved.isActive !== isActive) throw httpError(409, METHOD_NOT_UPDATED);
    const view = toPaymentMethodView(saved);
    return { method_code: view.method_code, is_active: view.is_active };
  });
}

module.exports = {
  getStoreSettings,
  updateStoreProfile,
  updateOperatingHours,
  setPaymentMethodActive,
};
