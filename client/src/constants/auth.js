// constants/auth.js
// Step 3 · Authentication
// Sumber: SPEC.md bagian 6 (Validation Rules) & bagian 10 (Asumsi Prototype, TF-15)

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
