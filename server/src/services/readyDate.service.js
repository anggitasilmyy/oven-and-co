// services/readyDate.service.js
// Tanggal siap — BR-01 · BR-02 · BR-03 (fungsi murni, sama dengan client/src/utils/rules/readyDate.js)
//   - Ready     : hari ini (BR-01)
//   - Pre-order : hari ini + max(lead_time_days, 1); lewat batas jam pemesanan → +1 hari (BR-02)
//   - Custom    : hari ini + max(lead_time_days, 3) (BR-02, minimal H+3)
// Semua tanggal memakai kunci "YYYY-MM-DD" menurut WIB (utils/jakartaDate.js).

const {
  AVAILABILITY_TYPE,
  PREORDER_MIN_LEAD_DAYS,
  CUSTOM_CAKE_MIN_LEAD_DAYS,
  PREORDER_DATE_WINDOW_DAYS,
  CUSTOM_CAKE_DATE_WINDOW_DAYS,
} = require('../utils/businessConstants');
const {
  getJakartaDateKey,
  getJakartaMinutes,
  addDaysToDateKey,
  timeToMinutes,
} = require('../utils/jakartaDate');

/** true bila `now` sudah melewati batas jam pre-order (tepat di batas masih boleh) */
function isPastPreorderCutoff(now, cutoffTime) {
  const cutoffMinutes = timeToMinutes(cutoffTime);

  if (cutoffMinutes == null) return false;

  return getJakartaMinutes(now) > cutoffMinutes;
}

/**
 * Tanggal siap paling cepat untuk satu produk.
 * @param {{availabilityType: string, leadTimeDays?: number}} product
 * @param {Date} now
 * @param {{preorderCutoffTime?: Date|string|null}} [settings]
 * @returns {string} kunci tanggal WIB
 */
function getEarliestReadyDate(product, now = new Date(), settings = null) {
  const todayKey = getJakartaDateKey(now);
  const leadTimeDays = Number(product.leadTimeDays ?? 0);

  if (product.availabilityType === AVAILABILITY_TYPE.CUSTOM) {
    return addDaysToDateKey(
      todayKey,
      Math.max(CUSTOM_CAKE_MIN_LEAD_DAYS, leadTimeDays)
    );
  }

  if (product.availabilityType === AVAILABILITY_TYPE.PREORDER) {
    const extraDay = isPastPreorderCutoff(now, settings?.preorderCutoffTime) ? 1 : 0;

    return addDaysToDateKey(
      todayKey,
      Math.max(PREORDER_MIN_LEAD_DAYS, leadTimeDays) + extraDay
    );
  }

  return todayKey;
}

/** Tanggal terakhir yang bisa dipilih di date picker (null untuk produk ready) */
function getLatestSelectableDate(availabilityType, now = new Date()) {
  const todayKey = getJakartaDateKey(now);

  if (availabilityType === AVAILABILITY_TYPE.CUSTOM) {
    return addDaysToDateKey(todayKey, CUSTOM_CAKE_DATE_WINDOW_DAYS - 1);
  }

  if (availabilityType === AVAILABILITY_TYPE.PREORDER) {
    return addDaysToDateKey(todayKey, PREORDER_DATE_WINDOW_DAYS - 1);
  }

  return null;
}

/** true bila dateKey berada di [earliest, latest] (latest null = tanpa batas atas) */
function isWithinDateRange(dateKey, earliestKey, latestKey) {
  return Boolean(dateKey) &&
    dateKey >= earliestKey &&
    (latestKey == null || dateKey <= latestKey);
}

module.exports = {
  isPastPreorderCutoff,
  getEarliestReadyDate,
  getLatestSelectableDate,
  isWithinDateRange,
};
