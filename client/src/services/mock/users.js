// services/mock/users.js
// Step 3 · Authentication
// Data pengguna demo untuk mode mock (VITE_USE_MOCK=true)
// FR-01, FR-02, FR-26 · C-02, C-03, AD-01
//
// Semua data mock disimpan di localStorage dengan awalan "ovenco_mock_"
// Saldo poin, level, dll. ada di SPEC §9
// Step 4: pelanggan contoh (seed/customers.js) ikut ditambahkan untuk pesanan contoh admin

import { SAMPLE_CUSTOMERS } from './seed/customers';

/** Key localStorage untuk data pengguna mock */
export const MOCK_USERS_KEY = 'ovenco_mock_users';

/** Akun demo sesuai spesifikasi Step 3 */
const DEMO_USERS = [
  {
    user_id: 1,
    name: 'Anisa Pelanggan',
    email: 'pelanggan@demo.com',
    phone: '+6281234567890',
    // password: demo1234 — disimpan sebagai plaintext di mock (tidak ada bcrypt)
    password: 'demo1234',
    role: 'customer',
    is_active: true,
    points: 1250, // data contoh SPEC §9: saldo 1.250 poin · Gold Member
    created_at: '2024-01-15T08:00:00.000Z',
  },
  {
    user_id: 2,
    name: 'Budi Staf',
    email: 'staf@demo.com',
    phone: '+6281234567891',
    password: 'demo1234',
    role: 'staf',
    is_active: true,
    points: 0,
    created_at: '2024-03-01T08:00:00.000Z',
  },
  {
    user_id: 3,
    name: 'Citra Owner',
    email: 'owner@demo.com',
    phone: '+6281234567892',
    password: 'demo1234',
    role: 'owner',
    is_active: true,
    points: 0,
    created_at: '2023-06-01T08:00:00.000Z',
  },
];

/**
 * Kembalikan semua pengguna dari localStorage (atau seed default jika belum ada).
 * @returns {Array}
 */
export function getMockUsers() {
  const raw = localStorage.getItem(MOCK_USERS_KEY);
  if (raw) {
    try {
      return withSampleCustomers(JSON.parse(raw));
    } catch {
      // Data rusak — reset ke seed
    }
  }
  // Inisialisasi pertama kali
  return withSampleCustomers(DEMO_USERS);
}

/**
 * Step 4: tambahkan pelanggan contoh yang belum ada (berdasarkan user_id) tanpa menghapus
 * akun yang sudah terdaftar di browser.
 */
function withSampleCustomers(users) {
  const missing = SAMPLE_CUSTOMERS.filter((c) => !users.some((u) => u.user_id === c.user_id));
  if (missing.length === 0 && localStorage.getItem(MOCK_USERS_KEY)) return users;
  const merged = [...users, ...missing];
  saveMockUsers(merged);
  return merged;
}

/**
 * Simpan array pengguna ke localStorage.
 * @param {Array} users
 */
export function saveMockUsers(users) {
  localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(users));
}

/**
 * Cari pengguna berdasarkan email ATAU nomor HP.
 * @param {string} identifier - email atau HP
 * @returns {object|undefined}
 */
export function findUserByIdentifier(identifier) {
  const users = getMockUsers();
  const lower = identifier.toLowerCase().trim();
  return users.find(
    (u) =>
      u.email.toLowerCase() === lower ||
      u.phone.replace(/\s/g, '') === identifier.replace(/\s/g, '')
  );
}

/**
 * Cari pengguna berdasarkan user_id.
 * @param {number} id
 * @returns {object|undefined}
 */
export function findUserById(id) {
  return getMockUsers().find((u) => u.user_id === id);
}

/**
 * Tambah pengguna baru ke localStorage.
 * @param {object} userData
 * @returns {object} pengguna yang disimpan (dengan user_id)
 */
export function addMockUser(userData) {
  const users = getMockUsers();
  const newUser = {
    ...userData,
    user_id: Date.now(), // ID sementara untuk mode mock
    is_active: true,
    points: 0,
    created_at: new Date().toISOString(),
  };
  saveMockUsers([...users, newUser]);
  return newUser;
}

/**
 * Perbarui data pengguna berdasarkan user_id.
 * @param {number} id
 * @param {object} updates
 * @returns {object|null}
 */
export function updateMockUser(id, updates) {
  const users = getMockUsers();
  const idx = users.findIndex((u) => u.user_id === id);
  if (idx === -1) return null;
  users[idx] = { ...users[idx], ...updates };
  saveMockUsers(users);
  return users[idx];
}

/** Keluarkan field sensitif sebelum dikirim ke store */
export function sanitizeUser(user) {
  const { password: _password, ...safe } = user;
  return safe;
}
