// services/adminSettingsRules.service.js
// Step 6.4.10 · FR-36 · UC-30 · A-11 · BR-022 · BR-02 · BR-05 · BR-12 · TF-10 · AD-11 — aturan murni pengaturan toko.
// Port server dari client utils/rules/settings.js (pesan & kunci fieldErrors sama dengan mock settingsAdmin.js):
// profil & operasional toko, jam operasional per hari, dan sakelar metode bayar. Pemetaan baris ⇄ respons/data tulis ada
// di adminSettingsView.service.js (diekspor ulang di sini agar API C1 tetap).
// Perbedaan yang disengaja (lebih ketat / lebih tepat dari mock, didokumentasikan di ROADMAP):
//   - angka berupa teks hanya desimal biasa ("10", "2.5"); hex/eksponen/tanda ("0x10", "1e3", "-1") → tidak sah;
//   - TANPA pembulatan diam-diam (hasil final review C1): radius & tarif dinormalisasi menjadi teks desimal kanonik
//     (tanpa Number), presisi dicek dari teks — radius maks. 2 desimal, tarif bilangan bulat; nol di belakang koma boleh
//     ("1.150", "2500.00"). Number() hanya dipakai membandingkan rentang SETELAH presisi sah, karena Number() membuang
//     digit di luar presisi float ("10.0000000000000001" → 10, "2500.0000000000000001" → 2500). Teks kanonik juga
//     ditulis apa adanya ke kolom DECIMAL (C2), jadi nilai tersimpan = nilai yang divalidasi;
//   - batas 2 desimal radius dicek dari teks, bukan `x * 100` (mock menolak 1,15 karena galat float);
//   - jam operasional wajib tepat 7 hari (dicek validator); hari tutup selalu menyimpan jam null;
//   - menonaktifkan metode yang sudah nonaktif = idempoten (tanpa cek "metode online terakhir").

const {
  STORE_FIELD_MAX, MAX_DELIVERY_RADIUS_KM, MAX_DELIVERY_FEE_PER_KM, PAYMENT_GROUP,
} = require('../utils/businessConstants');
const { toStoreProfile, toOperatingHourView, toPaymentMethodView } = require('./adminSettingsView.service');

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DECIMAL_TEXT = /^(\d+)(?:\.(\d+))?$/;
const RADIUS_MAX_DECIMALS = 2; // delivery_radius_km DECIMAL(5,2)

const isBlank = (v) => v == null || (typeof v === 'string' && v.trim() === '');

/**
 * Angka form (teks atau number JSON) → teks desimal kanonik tanpa konversi Number: nol di depan & nol di belakang
 * koma dibuang ("010.50" → "10.5", "2500.00" → "2500"). Kosong → null; bukan desimal biasa (hex, eksponen, tanda,
 * Infinity, boolean) → NaN. Number JSON memakai String(n) — angka JSON sudah di-parse sebelum sampai ke sini, jadi
 * presisi yang hilang saat JSON.parse tidak bisa dideteksi (keterbatasan sama dengan AD-09).
 * @returns {string|null|number} teks kanonik, null, atau NaN
 */
function toDecimalText(value) {
  if (isBlank(value)) return null;
  let text;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return NaN;
    text = String(value);
  } else if (typeof value === 'string') {
    text = value.trim();
  } else {
    return NaN;
  }
  const match = text.match(DECIMAL_TEXT);
  if (!match) return NaN;
  const integer = match[1].replace(/^0+(?=\d)/, '');
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  return fraction ? `${integer}.${fraction}` : integer;
}

const isDecimalText = (v) => typeof v === 'string';
/** Jumlah digit desimal bermakna dari teks kanonik ("1.15" → 2, "2500" → 0) */
const fractionDigits = (text) => (text.includes('.') ? text.length - text.indexOf('.') - 1 : 0);

/**
 * Rapikan input profil & operasional toko (mock normalizeStoreProfile). Radius & tarif = teks desimal kanonik
 * (lihat toDecimalText) — bukan number seperti mock — agar presisi divalidasi dari teks dan ditulis tanpa pembulatan.
 */
function normalizeStoreProfile(input = {}) {
  return {
    store_name: String(input.store_name ?? '').trim(),
    address: String(input.address ?? '').trim(),
    whatsapp_number: String(input.whatsapp_number ?? '').replace(/\s/g, ''),
    preorder_cutoff_time: input.preorder_cutoff_time ?? '',
    delivery_radius_km: toDecimalText(input.delivery_radius_km),
    delivery_fee_per_km: toDecimalText(input.delivery_fee_per_km),
  };
}

/** Nomor WhatsApp toko — kontrak mock (client validatePhone): diawali +62, 9–13 digit, maks. 20 karakter */
function whatsappError(value) {
  if (!value) return 'Isi nomor WhatsApp toko (tombol hubungi toko di tracking)';
  if (value.length > STORE_FIELD_MAX.whatsapp) return `Nomor maksimal ${STORE_FIELD_MAX.whatsapp} karakter`;
  if (!value.startsWith('+62')) return 'Nomor WhatsApp harus diawali +62';
  const digits = value.replace(/\D/g, '').length;
  return digits < 9 || digits > 13 ? 'Nomor WhatsApp tidak valid' : '';
}

/** @returns {Record<string,string>} error per field (kosong = sah) */
function validateStoreProfile(s) {
  const e = {};
  if (!s.store_name) e.store_name = 'Isi nama toko';
  else if (s.store_name.length > STORE_FIELD_MAX.storeName) e.store_name = `Nama toko maksimal ${STORE_FIELD_MAX.storeName} karakter`;
  if (!s.address) e.address = 'Isi alamat toko (ditampilkan untuk pickup dan struk)';
  else if (s.address.length > STORE_FIELD_MAX.address) e.address = `Alamat maksimal ${STORE_FIELD_MAX.address} karakter`;
  const wa = whatsappError(s.whatsapp_number);
  if (wa) e.whatsapp_number = wa;
  if (typeof s.preorder_cutoff_time !== 'string' || !TIME.test(s.preorder_cutoff_time)) e.preorder_cutoff_time = 'Pilih jam batas pre-order';

  // Presisi dicek dari teks lebih dulu; Number() hanya untuk rentang (teks ≤ 2 desimal / bulat → perbandingan tepat)
  const r = s.delivery_radius_km;
  if (!isDecimalText(r) || Number(r) <= 0) e.delivery_radius_km = 'Radius harus lebih dari 0 km';
  else if (fractionDigits(r) > RADIUS_MAX_DECIMALS || Number(r) > MAX_DELIVERY_RADIUS_KM) e.delivery_radius_km = `Radius maks. ${MAX_DELIVERY_RADIUS_KM} km dengan 2 desimal`;

  const f = s.delivery_fee_per_km;
  if (!isDecimalText(f) || fractionDigits(f) > 0) e.delivery_fee_per_km = 'Tarif berupa bilangan bulat rupiah ≥ 0';
  else if (Number(f) > MAX_DELIVERY_FEE_PER_KM) e.delivery_fee_per_km = `Tarif maksimal ${MAX_DELIVERY_FEE_PER_KM.toLocaleString('id-ID')} per km`;
  return e;
}

/** 7 baris (sudah dicek validator) → urut hari; hari tutup menyimpan jam null (kolom nullable, mock) */
function normalizeOperatingHours(rows) {
  return [...rows]
    .sort((a, b) => a.day_of_week - b.day_of_week)
    .map((r) => {
      const isOpen = r.is_open === true;
      return { day_of_week: r.day_of_week, is_open: isOpen, open_time: isOpen ? r.open_time ?? null : null, close_time: isOpen ? r.close_time ?? null : null };
    });
}

/** Hari buka wajib jam buka < jam tutup; minimal satu hari buka. @returns {Record<string,string>} per day_of_week (+ 'all') */
function validateOperatingHours(rows) {
  const e = {};
  for (const r of rows) {
    if (!r.is_open) continue;
    if (!TIME.test(r.open_time ?? '') || !TIME.test(r.close_time ?? '')) e[r.day_of_week] = 'Isi jam buka dan jam tutup';
    else if (r.open_time >= r.close_time) e[r.day_of_week] = 'Jam tutup harus setelah jam buka';
  }
  if (!rows.some((r) => r.is_open)) e.all = 'Minimal satu hari toko buka';
  return e;
}

const PAYMENT_METHOD_NOT_FOUND = 'Metode bayar tidak ditemukan';
const LAST_ONLINE_METHOD = 'Minimal satu metode bayar online harus aktif (BR-05: pre-order, custom cake, dan delivery wajib online)';

/**
 * Sakelar metode bayar (BR-05: pre-order, custom cake, delivery wajib online → minimal satu metode online aktif).
 * @param {Array<{method_code, method_group, is_active}>} methods — semua metode (dibaca setelah kunci, C2)
 * @returns {{statusCode: number, message: string}|null} null = boleh (termasuk tanpa perubahan / idempoten)
 */
function paymentMethodToggleError(methods, methodCode, isActive) {
  const target = methods.find((m) => m.method_code === methodCode);
  if (!target) return { statusCode: 404, message: PAYMENT_METHOD_NOT_FOUND };
  if (isActive || !target.is_active || target.method_group === PAYMENT_GROUP.STORE) return null;
  const otherOnline = methods.some((m) => m.is_active && m.method_group !== PAYMENT_GROUP.STORE && m.method_code !== methodCode);
  return otherOnline ? null : { statusCode: 409, message: LAST_ONLINE_METHOD };
}

module.exports = {
  toDecimalText,
  normalizeStoreProfile,
  validateStoreProfile,
  normalizeOperatingHours,
  validateOperatingHours,
  paymentMethodToggleError,
  // Ekspor ulang (API C1 tetap): mapper respons kini di adminSettingsView.service.js (review C1 L-1)
  toStoreProfile,
  toOperatingHourView,
  toPaymentMethodView,
  SETTINGS_MESSAGES: Object.freeze({ PAYMENT_METHOD_NOT_FOUND, LAST_ONLINE_METHOD }),
};
