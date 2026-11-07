// utils/date.js
// Step 4 · Helper tanggal lokal (tanpa zona waktu UTC) — fungsi murni
// Kunci tanggal "YYYY-MM-DD" sesuai tipe DATE di SPEC §8 (stock_date, ready_date).

import { STORE_TIME_ZONE } from '../constants/storeConfig';
import { IS_MOCK_MODE } from '../constants/dataMode';

const pad = (n) => String(n).padStart(2, '0');

/**
 * Step 6.6 (CP4 · G15): instan waktu → Date LOKAL yang tanggal & jamnya sama dengan jam dinding `timeZone` (default WIB),
 * sehingga fungsi yang membaca getHours()/toDateKey() menghitung menurut waktu toko, apa pun zona waktu perangkat.
 * Hanya untuk perbandingan jam/tanggal (bukan untuk dikirim ke server sebagai instan).
 * @param {string|number|Date} value — ISO string / epoch ms / Date
 * @param {string} [timeZone]
 * @returns {Date}
 */
export function toZonedWallClock(value, timeZone = STORE_TIME_ZONE) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(value)).map((part) => [part.type, part.value])
  );
  return new Date(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
}

/** Date → "YYYY-MM-DD" (waktu lokal) */
export function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "YYYY-MM-DD" → Date lokal pukul 00.00 (hindari new Date(string) yang dibaca sebagai UTC) */
export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Tambah n hari ke kunci tanggal */
export function addDaysToKey(key, days) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/**
 * Kunci tanggal dari ISO datetime. Mock: waktu lokal (timestamp mock = jam dinding perangkat).
 * Step 6.6 (CP7 · G12) mode API: tanggal WIB, sama dengan `today_key` server (mis. grup "Hari ini" notifikasi C-24).
 */
export function dateKeyOf(isoString) {
  return toDateKey(IS_MOCK_MODE ? new Date(isoString) : toZonedWallClock(isoString));
}

/** Daftar n kunci tanggal berurutan yang berakhir di endKey (inklusif) */
export function lastNDateKeys(endKey, n) {
  return Array.from({ length: n }, (_, i) => addDaysToKey(endKey, i - (n - 1)));
}
