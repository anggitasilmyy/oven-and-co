// utils/date.js
// Step 4 · Helper tanggal lokal (tanpa zona waktu UTC) — fungsi murni
// Kunci tanggal "YYYY-MM-DD" sesuai tipe DATE di SPEC §8 (stock_date, ready_date).

const pad = (n) => String(n).padStart(2, '0');

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

/** Kunci tanggal dari ISO datetime yang disimpan mock (waktu lokal) */
export function dateKeyOf(isoString) {
  return toDateKey(new Date(isoString));
}

/** Daftar n kunci tanggal berurutan yang berakhir di endKey (inklusif) */
export function lastNDateKeys(endKey, n) {
  return Array.from({ length: n }, (_, i) => addDaysToKey(endKey, i - (n - 1)));
}
