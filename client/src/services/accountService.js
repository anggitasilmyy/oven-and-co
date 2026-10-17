// services/accountService.js
// Step 5.5 · FR-24 · UC-16 · C-20 Ubah Profil — ubah nama, email, HP, dan kata sandi pelanggan login.
// Aturan sama dengan Registrasi (SPEC §6): email valid & unik, HP diawali +62 & unik, sandi ≥ 8 karakter.

import { apiClient } from './apiClient';
import { requireMockRole } from './mock/mockSession';
import { findUserById, getMockUsers, updateMockUser, sanitizeUser } from './mock/users';
import { validateProfileInput } from '../utils/businessRules';
import { validatePassword } from '../utils/authValidation';
import { ROLES } from '../constants/roles';

const normalizePhone = (phone) => String(phone ?? '').replace(/\s/g, '');

/** @returns {Promise<object>} profil pelanggan login (tanpa kata sandi) */
export function getMyProfile() {
  return apiClient('/me/profile', {
    mockHandler: () => {
      const user = findUserById(requireMockRole(ROLES.CUSTOMER).user_id);
      if (!user) throw new Error('Akun tidak ditemukan');
      return sanitizeUser(user);
    },
  });
}

/**
 * @param {{name, email, phone}} input
 * @returns {Promise<object>} profil terbaru (dipakai memperbarui sesi di useAuthStore)
 */
export function updateMyProfile(input) {
  return apiClient('/me/profile', {
    method: 'PATCH',
    body: input,
    mockHandler: () => {
      const user = requireMockRole(ROLES.CUSTOMER);
      const errors = validateProfileInput(input);
      const first = Object.values(errors)[0];
      if (first) throw new Error(first);
      const email = input.email.trim();
      const phone = normalizePhone(input.phone);
      const others = getMockUsers().filter((u) => u.user_id !== user.user_id);
      if (others.some((u) => u.email.toLowerCase() === email.toLowerCase())) throw new Error('Email sudah terdaftar');
      if (others.some((u) => normalizePhone(u.phone) === phone)) throw new Error('Nomor HP sudah terdaftar');
      const updated = updateMockUser(user.user_id, { name: input.name.trim(), email, phone });
      if (!updated) throw new Error('Akun tidak ditemukan');
      return sanitizeUser(updated);
    },
  });
}

/**
 * @param {{currentPassword, newPassword}} input
 */
export function changeMyPassword({ currentPassword, newPassword }) {
  return apiClient('/me/password', {
    method: 'PATCH',
    body: { currentPassword, newPassword },
    mockHandler: () => {
      const user = findUserById(requireMockRole(ROLES.CUSTOMER).user_id);
      // Akun Google tanpa kata sandi tidak bisa mengubah sandi di sini
      if (!user?.password || user.password !== currentPassword) throw new Error('Kata sandi saat ini salah');
      const error = validatePassword(newPassword ?? '');
      if (error) throw new Error(error);
      if (newPassword === currentPassword) throw new Error('Kata sandi baru harus berbeda dari kata sandi saat ini');
      updateMockUser(user.user_id, { password: newPassword });
      return { message: 'Kata sandi berhasil diubah' };
    },
  });
}
