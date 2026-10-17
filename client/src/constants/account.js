// constants/account.js
// Step 5.5 · FR-22 – FR-25 · C-20 – C-23 — batas kolom (SPEC §8) & label menu akun.
// Nilai yang tidak diatur dokumen adalah asumsi prototype (ditandai) dan mudah diganti.

/** users.name VARCHAR(100) */
export const PROFILE_NAME_MAX = 100;

/** addresses (SPEC §8) */
export const ADDRESS_LIMITS = {
  label: 30,
  recipient_name: 100,
  recipient_phone: 20,
  courier_note: 255,
};

/** Pilihan cepat label alamat (PRD Batch 5: chip "Rumah", "Kantor"); label lain boleh diketik */
export const ADDRESS_LABEL_SUGGESTIONS = ['Rumah', 'Kantor'];

/**
 * Asumsi prototype: pin peta disimulasikan (tanpa layanan peta) — peta kotak berpusat di toko
 * dengan jangkauan ± MAP_SPAN_KM ke setiap arah. 1° lintang ≈ 111 km.
 */
export const MAP_SPAN_KM = 15;
export const KM_PER_DEGREE = 111;

/** Tab C-21 (PRD Batch 5: "Voucher" dan "Riwayat Poin") — disimpan di URL ?tab= */
export const VOUCHER_POINT_TAB = { VOUCHER: 'voucher', POIN: 'poin' };
export const VOUCHER_POINT_TABS = [
  { key: VOUCHER_POINT_TAB.VOUCHER, label: 'Voucher' },
  { key: VOUCHER_POINT_TAB.POIN, label: 'Riwayat Poin' },
];

/** point_transactions.type → keterangan riwayat poin C-21 */
export const POINT_TX_TYPE = {
  EARN: 'earn',
  REDEEM: 'redeem',
  REVIEW_BONUS: 'review_bonus',
  REFUND: 'refund',
};
export const POINT_TX_LABEL = {
  [POINT_TX_TYPE.EARN]: 'Pesanan selesai',
  [POINT_TX_TYPE.REDEEM]: 'Ditukar saat checkout',
  [POINT_TX_TYPE.REVIEW_BONUS]: 'Bonus ulasan',
  [POINT_TX_TYPE.REFUND]: 'Dikembalikan (pesanan batal)',
};

/** Status voucher milik pelanggan di C-21 */
export const VOUCHER_STATE = { USABLE: 'usable', USED: 'used', EXPIRED: 'expired' };
export const VOUCHER_STATE_LABEL = {
  [VOUCHER_STATE.USABLE]: 'Bisa dipakai',
  [VOUCHER_STATE.USED]: 'Sudah dipakai',
  [VOUCHER_STATE.EXPIRED]: 'Tidak berlaku',
};
