// services/mock/mockClock.js
// Step 4 · Jam referensi data mock agar data contoh bisa dites konsisten
//
// - Tanggal "hari ini" = tanggal perangkat, atau VITE_MOCK_TODAY (format YYYY-MM-DD) bila diisi.
// - Waktu "sekarang" untuk menentukan status pesanan contoh hari ini = pukul MOCK_REFERENCE_TIME.
//   Dengan begitu data hari ini selalu sama, kapan pun halaman dibuka/di-refresh.

import { toDateKey, parseDateKey } from '../../utils/date';

/** Jam referensi status pesanan contoh hari ini (asumsi prototype) */
export const MOCK_REFERENCE_TIME = '14:00';

/** Kunci tanggal hari ini untuk data mock */
export function getMockTodayKey() {
  const override = import.meta.env?.VITE_MOCK_TODAY;
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  return toDateKey(new Date());
}

/** Date pada tanggal tertentu dan jam "HH:mm" (waktu lokal) */
export function atTime(dateKey, hhmm) {
  const d = parseDateKey(dateKey);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

/** "Sekarang" versi mock: hari ini pukul MOCK_REFERENCE_TIME */
export function getMockNow() {
  return atTime(getMockTodayKey(), MOCK_REFERENCE_TIME);
}

/**
 * Step 5.1: waktu sekarang pada tanggal mock — jam mengikuti jam perangkat.
 * Dipakai aturan batas jam pemesanan pre-order (BR-02) agar sesuai waktu nyata pengguna.
 */
export function getMockCurrentTime() {
  const real = new Date();
  const d = parseDateKey(getMockTodayKey());
  d.setHours(real.getHours(), real.getMinutes(), real.getSeconds(), 0);
  return d;
}
