// constants/storeConfig.js
// Step 4 · Asumsi prototype SPEC §10 & nilai default store_settings (SPEC §8)
// Semua nilai di sini mudah diganti; mock store_settings memakai nilai yang sama.

/** Nilai default store_settings (setting_id = 1) */
export const STORE_SETTINGS_DEFAULT = {
  store_name: 'Oven & Co.',
  preorder_cutoff_time: '17:00', // OI-04
  delivery_radius_km: 10, // OI-02
  delivery_fee_per_km: 2500, // OI-02
  payment_timeout_minutes: 30, // BR-06
  earn_amount_per_point: 1000, // BR-09
  redeem_points_unit: 100,
  redeem_value: 5000,
  gold_min_points: 500,
  platinum_min_points: 2000,
  review_bonus_points: 20, // BR-11
};

/** Jam operasional contoh: 07.00–20.00 setiap hari (TF-10) */
export const OPERATING_HOURS_DEFAULT = { open_time: '07:00', close_time: '20:00' };

/** Lead time minimal custom cake (BR-02) */
export const CUSTOM_CAKE_MIN_LEAD_DAYS = 3;

/** Level member (BR-09) — dihitung dari poin yang diperoleh pada tahun kalender berjalan (TF-11) */
export const MEMBER_LEVEL = {
  SILVER: { key: 'silver', label: 'Silver Member', badge: 'silver' },
  GOLD: { key: 'gold', label: 'Gold Member', badge: 'gold' },
  PLATINUM: { key: 'platinum', label: 'Platinum Member', badge: 'platinum' },
};
