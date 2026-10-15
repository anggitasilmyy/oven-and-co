// constants/roles.js
// Step 2 · Layout & Komponen Dasar
// Sumber: SPEC.md bagian 2

/** Peran pengguna */
export const ROLES = {
  CUSTOMER: 'customer',
  STAF: 'staf',
  OWNER: 'owner',
};

/** Halaman awal (landing) per peran setelah login */
export const ROLE_LANDING = {
  [ROLES.CUSTOMER]: '/',
  [ROLES.STAF]: '/admin/pesanan',
  [ROLES.OWNER]: '/admin/dashboard',
};

/** Label tampilan peran */
export const ROLE_LABEL = {
  [ROLES.CUSTOMER]: 'Pelanggan',
  [ROLES.STAF]: 'Staf',
  [ROLES.OWNER]: 'Owner',
};
