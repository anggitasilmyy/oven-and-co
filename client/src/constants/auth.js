// constants/auth.js
// Step 3 · Authentication
// Sumber: SPEC.md bagian 6 (Validation Rules) & bagian 10 (Asumsi Prototype, TF-15)

/**
 * Key persist Zustand untuk sesi — SUMBER KANONIS sesi ({ state: { user, token }, version }), dibagi semua tab dan
 * disinkronkan lewat event `storage` (services/sessionSync.js). Nilai JANGAN diubah (sesi tersimpan & uji e2e).
 */
export const AUTH_PERSIST_KEY = 'ovenco_auth';

/**
 * Salinan JWT lama (kompatibilitas, hanya DITULIS oleh stores/useAuthStore). Tidak lagi dibaca untuk menentukan
 * token request — token request selalu dari useAuthStore. Nilai JANGAN diubah.
 */
export const AUTH_TOKEN_STORAGE_KEY = 'ovenco_auth_token';

/** Panjang minimal kata sandi (asumsi prototype TF-15) */
export const PASSWORD_MIN_LENGTH = 8;

/** Hitung mundur kirim ulang OTP (detik) */
export const OTP_RESEND_COOLDOWN = 60;

/** Jumlah digit OTP reset sandi (FR-03) */
export const OTP_LENGTH = 6;

/**
 * Tingkat kekuatan kata sandi untuk indikator di C-03.
 * Asumsi: dokumen hanya menyebut "indikator kekuatan" tanpa kriteria rinci.
 */
export const PASSWORD_STRENGTH = {
  WEAK: { level: 1, label: 'Lemah' },
  MEDIUM: { level: 2, label: 'Sedang' },
  STRONG: { level: 3, label: 'Kuat' },
};
