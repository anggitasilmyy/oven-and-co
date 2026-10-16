// utils/rules/readyDate.js
// Tanggal siap tercepat — FR-08 · F-09 · BR-01 · BR-02 · validation rule Detail produk
//   - Ready     : hari ini (BR-01, selama stok tersedia)
//   - Pre-order : hari ini + lead_time_days (min. H-1); lewat batas jam pemesanan
//                 (store_settings.preorder_cutoff_time) → mundur satu hari (BR-02)
//   - Custom    : hari ini + max(lead_time_days, 3) (BR-02, minimal H-3)

import { AVAILABILITY_TYPE } from '../../constants/product';
import { STORE_SETTINGS_DEFAULT, CUSTOM_CAKE_MIN_LEAD_DAYS } from '../../constants/storeConfig';
import { addDaysToKey, toDateKey } from '../date';

/** "HH:mm" → menit sejak 00.00 */
function minutesOf(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** true bila waktu `now` sudah melewati batas jam pemesanan pre-order (tepat di batas masih boleh) */
export function isPastPreorderCutoff(now, cutoffTime = STORE_SETTINGS_DEFAULT.preorder_cutoff_time) {
  if (!cutoffTime) return false;
  return now.getHours() * 60 + now.getMinutes() > minutesOf(cutoffTime);
}

/**
 * Tanggal siap paling cepat untuk satu produk.
 * @param {{availability_type, lead_time_days}} product
 * @param {Date} now — waktu sekarang (tanggal lokal = hari ini)
 * @returns {string} kunci tanggal "YYYY-MM-DD"
 */
export function getEarliestReadyDate(product, now, settings = STORE_SETTINGS_DEFAULT) {
  const todayKey = toDateKey(now);
  switch (product.availability_type) {
    case AVAILABILITY_TYPE.PREORDER: {
      const lead = Math.max(1, product.lead_time_days ?? 1);
      const late = isPastPreorderCutoff(now, settings.preorder_cutoff_time) ? 1 : 0;
      return addDaysToKey(todayKey, lead + late);
    }
    case AVAILABILITY_TYPE.CUSTOM:
      return addDaysToKey(todayKey, Math.max(CUSTOM_CAKE_MIN_LEAD_DAYS, product.lead_time_days ?? 0));
    default:
      return todayKey;
  }
}

/** Tanggal ambil/antar sah bila tidak sebelum tanggal siap tercepat */
export function isSelectableDate(dateKey, earliestKey) {
  return Boolean(dateKey) && dateKey >= earliestKey;
}

/**
 * Pilihan tanggal untuk date picker: `days` hari mulai hari ini;
 * tanggal sebelum tanggal siap tercepat ditandai disabled.
 * @returns {Array<{dateKey, disabled}>}
 */
export function buildDateOptions(todayKey, earliestKey, days) {
  return Array.from({ length: days }, (_, i) => {
    const dateKey = addDaysToKey(todayKey, i);
    return { dateKey, disabled: !isSelectableDate(dateKey, earliestKey) };
  });
}
