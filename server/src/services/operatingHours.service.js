// services/operatingHours.service.js
// Jam operasional & slot waktu — FR-12 · BR-07 · TF-10 · validation rule Checkout (SPEC §6) (fungsi murni)
// Port server dari client/src/utils/rules/settings.js (getOperatingHoursFor) dan utils/rules/checkout.js
// (getTimeSlotOptions, formatTimeSlot). Perbedaan yang disengaja: "sekarang" dihitung dalam WIB (bukan jam lokal
// browser), dan hari buka tanpa jam buka/tutup dianggap tanpa slot (client akan error pada data tersebut).

const { OPERATING_HOURS_DEFAULT } = require('../utils/businessConstants');
const { getJakartaDateKey, getJakartaMinutes, timeToMinutes } = require('../utils/jakartaDate');

/** operating_hours.day_of_week (1 Senin – 7 Minggu) dari kunci tanggal "YYYY-MM-DD" */
function dayOfWeekOf(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay() || 7;
}

/**
 * Jam operasional pada tanggal tertentu. Tabel kosong / hari tidak terdaftar → asumsi TF-10 (07.00–20.00).
 * @param {Array<{day_of_week, open_time, close_time, is_open}>} hours — open/close: "HH:mm" atau nilai @db.Time
 * @returns {{open_time, close_time, is_open: boolean}}
 */
function getOperatingHoursFor(hours, dateKey) {
  const row = (hours ?? []).find((h) => Number(h.day_of_week) === dayOfWeekOf(dateKey));
  if (!row) return { ...OPERATING_HOURS_DEFAULT, is_open: true };
  return { open_time: row.open_time, close_time: row.close_time, is_open: Boolean(row.is_open) };
}

/** Label slot "09.00–11.00" (orders.time_slot) */
const formatTimeSlot = (slot) => `${slot.start.replace(':', '.')}–${slot.end.replace(':', '.')}`;

/**
 * Slot di dalam jam operasional; untuk hari ini (WIB) slot yang sudah dimulai dinonaktifkan.
 * @param {Array<{start: string, end: string}>} slots
 * @param {string} dateKey
 * @param {Date} now
 * @param {{open_time, close_time, is_open}} hours — hasil getOperatingHoursFor
 * @returns {Array<{start, end, label, disabled}>}
 */
function getTimeSlotOptions(slots, dateKey, now, hours) {
  const open = timeToMinutes(hours?.open_time);
  const close = timeToMinutes(hours?.close_time);
  if (hours?.is_open === false || open == null || close == null) return [];

  const isToday = dateKey === getJakartaDateKey(now);
  const nowMinutes = getJakartaMinutes(now);

  return slots
    .filter((s) => timeToMinutes(s.start) >= open && timeToMinutes(s.end) <= close)
    .map((s) => ({
      ...s,
      label: formatTimeSlot(s),
      disabled: isToday && timeToMinutes(s.start) <= nowMinutes,
    }));
}

/** Slot dengan label tertentu yang masih bisa dipilih; null bila tidak ada / nonaktif */
function findSelectableSlot(slots, dateKey, now, hours, label) {
  return getTimeSlotOptions(slots, dateKey, now, hours).find((s) => s.label === label && !s.disabled) ?? null;
}

/**
 * BR-07: batas Bayar di Toko = jam tutup toko pada tanggal siap (WIB).
 * @returns {Date|null} null bila toko tutup / jam tutup tidak diatur pada tanggal itu
 */
function getClosingDateTime(hours, dateKey) {
  const close = timeToMinutes(hours?.close_time);
  if (hours?.is_open === false || close == null) return null;

  const hh = String(Math.floor(close / 60)).padStart(2, '0');
  const mm = String(close % 60).padStart(2, '0');
  return new Date(`${dateKey}T${hh}:${mm}:00+07:00`);
}

module.exports = {
  dayOfWeekOf,
  getOperatingHoursFor,
  formatTimeSlot,
  getTimeSlotOptions,
  findSelectableSlot,
  getClosingDateTime,
};
