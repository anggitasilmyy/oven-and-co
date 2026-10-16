// services/mock/mockSession.js
// Step 4 · Pengganti middleware auth/requireRole di mode mock (FR-26)
// Di mode API pemeriksaan ini dilakukan server (requireRole).

import useAuthStore from '../../stores/useAuthStore';

/** Kembalikan pengguna login bila perannya diizinkan; lempar error bila tidak */
export function requireMockRole(...roles) {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Silakan masuk terlebih dahulu');
  if (!roles.includes(user.role)) throw new Error('Akses ditolak untuk peran ini');
  return user;
}
