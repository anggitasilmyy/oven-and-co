// utils/format.js
// Step 2 · Layout & Komponen Dasar
// Fungsi murni untuk format tampilan — tidak ada side effect

/**
 * Format angka ke format Rupiah Indonesia.
 * Contoh: 28000 → "Rp 28.000"
 * @param {number} amount
 * @returns {string}
 */
export function formatRupiah(amount) {
  if (amount == null || isNaN(amount)) return 'Rp 0';
  return (
    'Rp ' +
    Number(amount)
      .toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  );
}

/**
 * Format tanggal ke format Indonesia singkat.
 * Contoh: new Date('2026-10-13') → "Selasa, 13 Okt"
 * @param {Date|string} date
 * @returns {string}
 */
export function formatDate(date) {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Format tanggal ke format Indonesia lengkap dengan tahun.
 * Contoh: new Date('2026-10-13') → "Selasa, 13 Oktober 2026"
 * @param {Date|string} date
 * @returns {string}
 */
export function formatDateFull(date) {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Format waktu ke HH:mm.
 * Contoh: new Date() → "14:30"
 * @param {Date|string} date
 * @returns {string}
 */
export function formatTime(date) {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Sapaan sesuai jam (Step 4 · C-05).
 * @param {number} hour — 0–23
 * @returns {string} mis. "Selamat pagi"
 */
export function getGreeting(hour) {
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

/**
 * Format angka biasa dengan pemisah ribuan Indonesia. Contoh: 1250 → "1.250"
 * @param {number} value
 * @returns {string}
 */
export function formatNumber(value) {
  return Number(value ?? 0).toLocaleString('id-ID');
}

/**
 * Format tanggal ringkas untuk tabel (Step 4 · AD-03).
 * Contoh: new Date('2026-10-13') → "Sel, 13 Okt"
 * @param {Date|string} date
 * @returns {string}
 */
export function formatDateShort(date) {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
}
