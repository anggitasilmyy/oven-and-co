// services/mock/seed/customers.js
// Step 4 · Pelanggan contoh (tabel users, role customer) untuk pesanan contoh AD-02/AD-03.
// Nama & kontak fiktif; tanpa kata sandi sehingga tidak bisa dipakai login.

const customer = (user_id, name, slug) => ({
  user_id,
  name,
  email: `${slug}@example.com`,
  phone: `+62800000${String(user_id).padStart(4, '0')}`,
  password: null,
  role: 'customer',
  is_active: true,
  created_at: '2026-01-10T09:00:00.000Z',
});

// data contoh
export const SAMPLE_CUSTOMERS = [
  customer(101, 'Rina Wulandari', 'rina.w'),
  customer(102, 'Dimas Pratama', 'dimas.p'),
  customer(103, 'Sari Kusuma', 'sari.k'),
  customer(104, 'Ahmad Fauzi', 'ahmad.f'),
  customer(105, 'Maya Lestari', 'maya.l'),
  customer(106, 'Yoga Saputra', 'yoga.s'),
  customer(107, 'Nadia Putri', 'nadia.p'),
  customer(108, 'Fajar Nugroho', 'fajar.n'),
  customer(109, 'Intan Permata', 'intan.p'),
  customer(110, 'Bayu Setiawan', 'bayu.s'),
];

/** user_id akun demo pelanggan (services/mock/users.js) — saldo 1.250 poin · Gold (SPEC §9) */
export const DEMO_CUSTOMER_ID = 1;

/** Target saldo poin akun demo sesuai SPEC §9 */
export const DEMO_CUSTOMER_POINT_BALANCE = 1250;
