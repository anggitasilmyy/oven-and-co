// constants/adminPromo.js
// FR-34 · UC-29 · BR-09 · BR-10 · AD-09 Promo & Loyalty — tab, batas kolom voucher, label status
// Batas panjang mengikuti SPEC §8 (vouchers.code VARCHAR(20), title VARCHAR(100)).

/** Tab AD-09 (UI/UX Spec Batch 7: tabel voucher + pengaturan loyalty) — disimpan di URL ?tab= */
export const PROMO_TAB = { VOUCHER: 'voucher', LOYALTY: 'loyalty' };
export const PROMO_TABS = [
  { key: PROMO_TAB.VOUCHER, label: 'Voucher' },
  { key: PROMO_TAB.LOYALTY, label: 'Aturan Loyalty' },
];

export const VOUCHER_FIELD_MAX = { code: 20, title: 100 };
/** Kode voucher: huruf besar & angka tanpa spasi (contoh SPEC §9: WEEKEND15) */
export const VOUCHER_CODE_PATTERN = /^[A-Z0-9]+$/;
/** Asumsi prototype: batas kuota & nilai agar input tetap wajar (INT / DECIMAL(12,2)) */
export const VOUCHER_MAX_QUOTA = 100_000;
export const VOUCHER_MAX_PERCENT = 100;

/** vouchers.discount_type (SPEC §8) */
export const DISCOUNT_TYPE = { PERCENT: 'percent', AMOUNT: 'amount' };
export const DISCOUNT_TYPE_LABEL = {
  [DISCOUNT_TYPE.PERCENT]: 'Persen (%)',
  [DISCOUNT_TYPE.AMOUNT]: 'Nominal (Rp)',
};

/** Status voucher di tabel admin (dihitung dari is_active, periode, dan sisa kuota) */
export const ADMIN_VOUCHER_STATUS = {
  AKTIF: { key: 'aktif', label: 'Aktif', variant: 'ready' },
  TERJADWAL: { key: 'terjadwal', label: 'Terjadwal', variant: 'preorder' },
  KUOTA_HABIS: { key: 'kuota_habis', label: 'Kuota habis', variant: 'error' },
  BERAKHIR: { key: 'berakhir', label: 'Berakhir', variant: 'neutral' },
  NONAKTIF: { key: 'nonaktif', label: 'Nonaktif', variant: 'neutral' },
};

/**
 * Field aturan loyalty di store_settings (SPEC §8) yang diatur Owner (FR-34: aturan poin & ambang level).
 * review_bonus_points tidak ditampilkan: UI/UX Spec AD-09 hanya memuat aturan dapat/tukar poin dan ambang level.
 */
export const LOYALTY_FIELDS = ['earn_amount_per_point', 'redeem_points_unit', 'redeem_value', 'gold_min_points', 'platinum_min_points'];
/** Asumsi prototype: batas atas input aturan loyalty */
export const LOYALTY_MAX = { amount: 10_000_000, points: 1_000_000 };
