// utils/authValidation.js
// Step 3 · Authentication
// FR-01 · FR-03 · Validation rules SPEC §6 (registrasi & reset sandi) — fungsi murni

import { PASSWORD_MIN_LENGTH, PASSWORD_STRENGTH } from '../constants/auth';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateName(val) {
  return val.trim() ? '' : 'Nama wajib diisi';
}

export function validateEmail(val) {
  if (!val.trim()) return 'Email wajib diisi';
  if (!EMAIL_REGEX.test(val.trim())) return 'Format email tidak valid';
  return '';
}

export function validatePhone(val) {
  if (!val.trim()) return 'Nomor HP wajib diisi';
  if (!val.trim().startsWith('+62')) return 'Nomor HP harus diawali +62';
  const digitsOnly = val.replace(/\D/g, '');
  if (digitsOnly.length < 9 || digitsOnly.length > 13) return 'Nomor HP tidak valid';
  return '';
}

export function validatePassword(val) {
  if (!val) return 'Kata sandi wajib diisi';
  if (val.length < PASSWORD_MIN_LENGTH) return `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter`;
  return '';
}

/**
 * Nilai kekuatan kata sandi (hanya indikator, tidak memblokir pendaftaran).
 * Lemah: < 8 karakter atau hanya 1 jenis karakter;
 * Sedang: ≥ 8 karakter dengan 2 jenis; Kuat: ≥ 8 karakter dengan ≥ 3 jenis
 * (huruf kecil, huruf besar, angka, simbol).
 * @returns {{level:number,label:string}|null} null bila kosong
 */
export function getPasswordStrength(password) {
  if (!password) return null;
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (password.length < PASSWORD_MIN_LENGTH || variety <= 1) return PASSWORD_STRENGTH.WEAK;
  if (variety === 2) return PASSWORD_STRENGTH.MEDIUM;
  return PASSWORD_STRENGTH.STRONG;
}
