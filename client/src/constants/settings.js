// constants/settings.js
// FR-36 · UC-30 · BR-05 · BR-12 · AD-11 Pengaturan — batas kolom, hari operasional, peran akun admin
// Batas panjang mengikuti SPEC §8 (store_settings, users). Nilai awal ada di constants/storeConfig.js.

import { ROLES } from './roles';

export const STORE_FIELD_MAX = {
  storeName: 100, // store_settings.store_name VARCHAR(100)
  address: 255, // asumsi prototype (kolom TEXT) agar alamat ringkas di struk
  whatsapp: 20, // store_settings.whatsapp_number VARCHAR(20)
  userName: 100, // users.name VARCHAR(100)
  email: 150, // users.email VARCHAR(150)
};

/** Batas DECIMAL(5,2) delivery_radius_km & asumsi prototype tarif ongkir maks. per km */
export const MAX_DELIVERY_RADIUS_KM = 999.99;
export const MAX_DELIVERY_FEE_PER_KM = 1_000_000;

/** operating_hours.day_of_week: 1 Senin – 7 Minggu (SPEC §8) */
export const DAY_OF_WEEK_LABEL = {
  1: 'Senin', 2: 'Selasa', 3: 'Rabu', 4: 'Kamis', 5: 'Jumat', 6: 'Sabtu', 7: 'Minggu',
};

/** Peran akun admin yang dapat dibuat Owner (UI/UX Spec Batch 7: "staff accounts with roles (Owner, Staf)") */
export const ADMIN_ACCOUNT_ROLES = [ROLES.STAF, ROLES.OWNER];
