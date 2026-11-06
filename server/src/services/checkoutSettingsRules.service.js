// services/checkoutSettingsRules.service.js
// FR-12 – FR-16 · BR-03 · BR-06 · BR-09 · BR-12 · C-14 · AD-11 — T1 (ROADMAP 6.4.10): pengaturan toko basi saat checkout.
// Checkout memvalidasi & menghitung pesanan dari pengaturan yang dibaca SEBELUM transaksi (loadAndValidate). Bila Owner
// menyimpan pengaturan (AD-11 profil / jam operasional, AD-09 aturan poin) di antara pembacaan itu dan saat checkout
// memegang kunci store_settings, pesanan akan memakai nilai lama. Semua penulis pengaturan mengunci store_settings, jadi
// setelah checkout memegang kunci itu pengaturan tidak bisa berubah lagi sampai commit: cukup baca ulang sekali setelah
// kunci dan bandingkan. Berbeda → 409 + rollback (ROADMAP: "pengaturan basi saat checkout → 409 + rollback").
// Hanya field yang benar-benar dipakai pesanan ini yang dibandingkan, agar perubahan yang tidak relevan (nama toko,
// alamat teks, WhatsApp, poin perolehan) tidak menolak checkout:
//   - selalu: preorder_cutoff_time (tanggal siap) & jam operasional (slot, batas pembayaran);
//   - pembayaran online: payment_timeout_minutes (batas pembayaran BR-06);
//   - delivery: koordinat toko, radius, tarif per km (BR-12);
//   - tukar poin: redeem_points_unit & redeem_value (BR-09).

const ALWAYS = Object.freeze(['preorder_cutoff_time']);
const ONLINE_PAYMENT = Object.freeze(['payment_timeout_minutes']);
const DELIVERY = Object.freeze(['latitude', 'longitude', 'delivery_radius_km', 'delivery_fee_per_km']);
const POINTS = Object.freeze(['redeem_points_unit', 'redeem_value']);

/** Nilai pembanding yang stabil (angka DECIMAL dibandingkan sebagai angka, null tetap null) */
const comparable = (value) => (value == null ? null : typeof value === 'number' ? Number(value) : String(value));

/** Jam operasional sebagai daftar kanonik (urut hari) — hanya kolom yang dipakai checkout */
function canonicalHours(hours = []) {
  return [...hours]
    .map((h) => [Number(h.day_of_week), Boolean(h.is_open), h.open_time ?? null, h.close_time ?? null])
    .sort((a, b) => a[0] - b[0]);
}

/**
 * @param {{settings: object, operatingHours: Array<object>}} used — yang dipakai validasi & perhitungan checkout
 * @param {{settings: object, operatingHours: Array<object>}} current — dibaca ulang setelah kunci store_settings
 * @param {{delivery: boolean, usePoints: boolean, payAtStore: boolean}} order
 * @returns {string[]} nama field yang berubah (kosong = pengaturan masih sama)
 */
function changedCheckoutSettings(used, current, { delivery, usePoints, payAtStore }) {
  const fields = [...ALWAYS, ...(payAtStore ? [] : ONLINE_PAYMENT), ...(delivery ? DELIVERY : []), ...(usePoints ? POINTS : [])];
  const changed = fields.filter((field) => comparable(used.settings?.[field]) !== comparable(current.settings?.[field]));
  if (JSON.stringify(canonicalHours(used.operatingHours)) !== JSON.stringify(canonicalHours(current.operatingHours))) {
    changed.push('operating_hours');
  }
  return changed;
}

module.exports = {
  changedCheckoutSettings,
};
