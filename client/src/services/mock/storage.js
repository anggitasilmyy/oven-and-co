// services/mock/storage.js
// Step 4 · Akses localStorage untuk data mock — HANYA dipakai di services/mock/
// Semua key memakai awalan "ovenco_mock_" (lihat AGENTS.md §2)

export const MOCK_KEY_PREFIX = 'ovenco_mock_';

/** Baca JSON dari localStorage; kembalikan fallback bila tidak ada/rusak */
export function readMock(name, fallback = null) {
  try {
    const raw = localStorage.getItem(MOCK_KEY_PREFIX + name);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/** Simpan JSON ke localStorage */
export function writeMock(name, value) {
  localStorage.setItem(MOCK_KEY_PREFIX + name, JSON.stringify(value));
}

/** true bila tabel mock sudah pernah dibuat di perangkat ini (Step 5.1) */
export function hasMock(name) {
  return localStorage.getItem(MOCK_KEY_PREFIX + name) !== null;
}
