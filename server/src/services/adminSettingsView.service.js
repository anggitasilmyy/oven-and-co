// services/adminSettingsView.service.js
// Step 6.4.10 · FR-36 · AD-11 Pengaturan — pemetaan murni baris Prisma ⇄ kontrak client (dipisah dari
// adminSettingsRules.service.js, temuan review C1 L-1; adminSettingsRules tetap mengekspor ulang mapper respons).
//   - Respons = whitelist field mock settingsAdmin.js: koordinat toko (OI-01), aturan loyalty, batas waktu bayar, dan
//     bonus ulasan tidak pernah ikut.
//   - Data tulis (C2) dibuat HANYA dari hasil normalisasi yang sudah lolos validasi: radius & tarif berupa teks desimal
//     kanonik (toDecimalText) yang diteruskan apa adanya ke kolom DECIMAL — Prisma menyimpannya tanpa konversi float;
//     jam "HH:mm" menjadi nilai @db.Time 1970-01-01THH:mm:00Z (pola seed `time()`, dibaca balik formatTime tanpa geser zona).

const { STORE_PROFILE_FIELDS, DAYS_OF_WEEK } = require('../utils/businessConstants');
const { formatTime } = require('../utils/jakartaDate');

const numberOrNull = (v) => (v == null ? null : Number(v));

/** "HH:mm" → nilai kolom @db.Time; null tetap null */
const toDbTime = (hhmm) => (hhmm == null ? null : new Date(`1970-01-01T${hhmm}:00.000Z`));

/** Baris store_settings → profil kontrak mock (6 field saja) */
function toStoreProfile(row) {
  const view = {
    store_name: row.storeName,
    address: row.address ?? null,
    whatsapp_number: row.whatsappNumber ?? null,
    preorder_cutoff_time: formatTime(row.preorderCutoffTime),
    delivery_radius_km: numberOrNull(row.deliveryRadiusKm),
    delivery_fee_per_km: numberOrNull(row.deliveryFeePerKm),
  };
  return Object.fromEntries(STORE_PROFILE_FIELDS.map((f) => [f, view[f]]));
}

/**
 * Baris operating_hours → respons. Hari tutup SELALU jam null (kontrak "hari tutup = jam null", hasil final review C1),
 * termasuk data lama yang masih menyimpan jam pada hari tutup — database tidak diubah, hanya respons.
 */
const toOperatingHourView = (row) => ({
  hour_id: row.hourId,
  day_of_week: row.dayOfWeek,
  open_time: row.isOpen ? formatTime(row.openTime) : null,
  close_time: row.isOpen ? formatTime(row.closeTime) : null,
  is_open: row.isOpen,
});

const toPaymentMethodView = (row) => ({
  method_code: row.methodCode,
  name: row.name,
  method_group: row.methodGroup,
  is_active: row.isActive,
});

/** Profil ternormalisasi & SAH → data UPDATE store_settings (6 kolom profil saja; kolom lain tidak disentuh) */
const toStoreProfileData = (profile) => ({
  storeName: profile.store_name,
  address: profile.address,
  whatsappNumber: profile.whatsapp_number,
  preorderCutoffTime: toDbTime(profile.preorder_cutoff_time),
  deliveryRadiusKm: profile.delivery_radius_km,
  deliveryFeePerKm: profile.delivery_fee_per_km,
});

/** Satu hari ternormalisasi & SAH → data upsert operating_hours (hari tutup → jam null) */
const toOperatingHourData = (row) => ({
  isOpen: row.is_open,
  openTime: row.is_open ? toDbTime(row.open_time) : null,
  closeTime: row.is_open ? toDbTime(row.close_time) : null,
});

/**
 * Respons jam operasional hanya hari sah 1–7 (SPEC §8: 1 Senin – 7 Minggu), urut hari. Baris lama dengan day_of_week
 * di luar rentang tidak dikirim (form AD-11 akan menolaknya saat disimpan) tetapi juga tidak dihapus/diubah (review C2 L-3).
 */
const onlyValidDays = (rows) => rows.filter((r) => DAYS_OF_WEEK.includes(r.dayOfWeek)).sort((a, b) => a.dayOfWeek - b.dayOfWeek);

/**
 * Rencana tulis 7 hari dari SEMUA baris operating_hours yang ada (dibaca setelah kunci; termasuk baris lama di luar 1–7).
 * Hari yang sudah ada → UPDATE berdasarkan day_of_week (hour_id tidak diubah). Hari yang belum ada → INSERT dengan
 * hour_id = day_of_week (pola seed; kolom PK TINYINT tanpa AUTO_INCREMENT) — KECUALI hour_id itu sudah dipakai baris
 * hari lain: itu konflik data lama yang tidak bisa diperbaiki aman tanpa mengganti ID → dilaporkan (review C2 L-2).
 * @param {Array<{hourId, dayOfWeek}>} existing
 * @param {Array<{day_of_week}>} hours — 7 hari ternormalisasi & sah
 * @returns {{updates: Array, creates: Array, conflicts: Array<{day_of_week, hour_id, used_by_day}>}}
 */
function planOperatingHourWrites(existing, hours) {
  const byDay = new Map(existing.map((r) => [r.dayOfWeek, r]));
  const byHourId = new Map(existing.map((r) => [r.hourId, r]));
  const plan = { updates: [], creates: [], conflicts: [] };
  for (const row of hours) {
    if (byDay.has(row.day_of_week)) plan.updates.push(row);
    else if (byHourId.has(row.day_of_week)) {
      plan.conflicts.push({ day_of_week: row.day_of_week, hour_id: row.day_of_week, used_by_day: byHourId.get(row.day_of_week).dayOfWeek });
    } else plan.creates.push(row);
  }
  return plan;
}

module.exports = {
  toDbTime,
  toStoreProfile,
  toOperatingHourView,
  toPaymentMethodView,
  toStoreProfileData,
  toOperatingHourData,
  onlyValidDays,
  planOperatingHourWrites,
};
