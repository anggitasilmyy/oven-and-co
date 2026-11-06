// services/adminPromoRules.service.js
// Step 6.4.9 · FR-34 · UC-29 · BR-09 · BR-10 · AD-09 — aturan murni voucher & loyalty, port dari client
// utils/rules/adminPromo.js (pesan sama). "Memvalidasi dan menyimpan" (FR-34). Kuota (vouchers.quota) = SISA pemakaian:
// berkurang saat voucher dipakai di checkout dan kembali saat pesanan dibatalkan (Step 6.3), jadi "terpakai" dihitung
// dari pesanan yang memakai voucher (tidak dibatalkan).
// Tidak ada syarat jumlah minimal / diskon bertingkat (bukan bagian SPEC — diajukan sebagai CR-02).

const {
  DISCOUNT_TYPE, VOUCHER_FIELD_MAX, VOUCHER_CODE_PATTERN, VOUCHER_MAX_QUOTA, VOUCHER_MAX_PERCENT, MAX_PRICE,
  ADMIN_VOUCHER_STATUS, LOYALTY_FIELDS, LOYALTY_MAX,
} = require('../utils/businessConstants');
const { isValidDateKey } = require('../utils/jakartaDate');

// Tahun 1000–9999 = rentang kolom DATE MySQL
const DATE_KEY = /^[1-9]\d{3}-\d{2}-\d{2}$/;
const isDateKey = (v) => typeof v === 'string' && DATE_KEY.test(v) && isValidDateKey(v);
const isBlank = (v) => v === '' || v == null;
// BIGINT signed MySQL (products.product_id). Dibandingkan sebagai BigInt dari string — tanpa Number (presisi aman).
const BIGINT_MAX = 9223372036854775807n;
const BIGINT_ID = /^[1-9]\d{0,18}$/;

/** ID BIGINT positif sebagai string digit tanpa nol di depan, ≤ BIGINT_MAX */
function isBigIntIdString(value) {
  return typeof value === 'string' && BIGINT_ID.test(value) && BigInt(value) <= BIGINT_MAX;
}

/**
 * product_id form → string ID atau null (kosong = semua produk). Angka JSON yang bukan safe integer sudah kehilangan
 * presisi saat di-parse (mis. 9007199254740993 → …992) sehingga bisa menunjuk produk lain → dianggap tidak sah.
 */
function normalizeProductId(value) {
  if (isBlank(value)) return null;
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return String(value) + '?';
  return String(value).trim();
}
const isInt = (v) => !isBlank(v) && Number.isInteger(Number(v));
const toNumber = (v) => (isBlank(v) ? null : Number(v));

const QUOTA_CHANGED = 'Kuota voucher sudah berubah (ada pemakaian atau pembatalan pesanan). Muat ulang data lalu ulangi perubahan kuota.';
const EXPECTED_QUOTA_REQUIRED = 'Perubahan kuota wajib menyertakan kuota awal form (expected_quota). Muat ulang data lalu ulangi perubahan kuota.';
const EXPECTED_QUOTA_INVALID = 'Kuota awal form tidak valid. Muat ulang data.';

/** Rapikan input form voucher (kode huruf besar tanpa spasi tepi; produk kosong = semua produk) */
function normalizeVoucherInput(input = {}) {
  return {
    code: String(input.code ?? '').trim().toUpperCase(),
    title: String(input.title ?? '').trim(),
    discount_type: input.discount_type ?? '',
    discount_value: toNumber(input.discount_value),
    product_id: normalizeProductId(input.product_id),
    quota: toNumber(input.quota),
    valid_from: input.valid_from ?? '',
    valid_to: input.valid_to ?? '',
    is_active: Boolean(input.is_active),
  };
}

/**
 * Validasi isi voucher (pesan sama dengan client validateVoucher).
 * @param {object} v — hasil normalizeVoucherInput
 * @param {{codeTaken: boolean, productExists: boolean}} ctx — hasil cek basis data
 * @returns {Record<string,string>} error per field (kosong = sah)
 */
function validateVoucher(v, { codeTaken, productExists }) {
  const e = {};
  if (!v.code) e.code = 'Isi kode voucher';
  else if (v.code.length > VOUCHER_FIELD_MAX.code) e.code = `Kode maksimal ${VOUCHER_FIELD_MAX.code} karakter`;
  else if (!VOUCHER_CODE_PATTERN.test(v.code)) e.code = 'Kode hanya huruf dan angka tanpa spasi';
  else if (codeTaken) e.code = 'Kode voucher sudah dipakai';

  if (!v.title) e.title = 'Isi judul promo';
  else if (v.title.length > VOUCHER_FIELD_MAX.title) e.title = `Judul maksimal ${VOUCHER_FIELD_MAX.title} karakter`;

  if (!Object.values(DISCOUNT_TYPE).includes(v.discount_type)) e.discount_type = 'Pilih jenis diskon';
  if (v.discount_value == null || Number.isNaN(v.discount_value) || v.discount_value <= 0) e.discount_value = 'Nilai diskon harus lebih dari 0';
  else if (v.discount_type === DISCOUNT_TYPE.PERCENT && (v.discount_value > VOUCHER_MAX_PERCENT || !Number.isInteger(v.discount_value))) e.discount_value = `Persen diskon berupa bilangan bulat 1–${VOUCHER_MAX_PERCENT}`;
  else if (v.discount_type === DISCOUNT_TYPE.AMOUNT && (v.discount_value > MAX_PRICE || !Number.isInteger(v.discount_value))) e.discount_value = 'Nominal diskon berupa bilangan bulat rupiah';

  // ID tidak sah (format / melewati batas BIGINT) diperlakukan sama dengan produk tidak ada (pesan mock)
  if (v.product_id != null && (!isBigIntIdString(v.product_id) || !productExists)) e.product_id = 'Produk tidak ditemukan';
  if (!isInt(v.quota) || v.quota < 0 || v.quota > VOUCHER_MAX_QUOTA) e.quota = `Kuota berupa bilangan bulat 0–${VOUCHER_MAX_QUOTA.toLocaleString('id-ID')}`;

  if (!isDateKey(v.valid_from)) e.valid_from = 'Pilih tanggal mulai';
  if (!isDateKey(v.valid_to)) e.valid_to = 'Pilih tanggal berakhir';
  else if (!e.valid_from && v.valid_to < v.valid_from) e.valid_to = 'Tanggal berakhir tidak boleh sebelum tanggal mulai';
  return e;
}

/**
 * Kuota yang ditulis PUT, dibanding kuota baris yang sudah DIKUNCI (null = kolom quota tidak ditulis).
 * Pola sama dengan stok bahan AD-07 (`expected_stock`): kuota form = sisa kuota saat form dibuka.
 *   - kuota form = expected_quota, atau = kuota terkunci → edit informasi; kuota TIDAK ditulis (pemakaian/pembatalan
 *     yang terjadi sejak form dibuka tetap utuh);
 *   - kuota berbeda → expected_quota wajib (tanpa → 400) dan harus sama dengan kuota terkunci (berbeda → 409).
 * @throws error ber-statusCode + fieldErrors.quota
 */
function resolveQuotaUpdate(quota, expectedQuota, lockedQuota) {
  const hasExpected = !isBlank(expectedQuota);
  if (hasExpected && (!isInt(expectedQuota) || Number(expectedQuota) < 0)) throw quotaError(400, EXPECTED_QUOTA_INVALID);
  if ((hasExpected && quota === Number(expectedQuota)) || quota === lockedQuota) return null;
  if (!hasExpected) throw quotaError(400, EXPECTED_QUOTA_REQUIRED);
  if (Number(expectedQuota) !== lockedQuota) throw quotaError(409, QUOTA_CHANGED);
  return quota;
}

function quotaError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode, fieldErrors: { quota: message } });
}

/** Status voucher di tabel AD-09 — urutan cek sama dengan isVoucherActiveOn (checkout) */
function getAdminVoucherStatus(voucher, todayKey) {
  if (!voucher.is_active) return ADMIN_VOUCHER_STATUS.NONAKTIF;
  if (voucher.valid_to < todayKey) return ADMIN_VOUCHER_STATUS.BERAKHIR;
  if (voucher.quota <= 0) return ADMIN_VOUCHER_STATUS.KUOTA_HABIS;
  if (voucher.valid_from > todayKey) return ADMIN_VOUCHER_STATUS.TERJADWAL;
  return ADMIN_VOUCHER_STATUS.AKTIF;
}

/** Rapikan input aturan loyalty → angka (null bila kosong) */
function normalizeLoyaltyInput(input = {}) {
  return Object.fromEntries(LOYALTY_FIELDS.map((f) => [f, toNumber(input[f])]));
}

/** Validasi aturan poin & ambang level (BR-09): bilangan bulat positif, batas atas, Platinum > Gold */
function validateLoyaltyRules(r) {
  const e = {};
  const positiveInt = (f, label, max) => {
    if (!isInt(r[f]) || r[f] <= 0) e[f] = `${label} berupa bilangan bulat lebih dari 0`;
    else if (r[f] > max) e[f] = `${label} maksimal ${max.toLocaleString('id-ID')}`;
  };
  positiveInt('earn_amount_per_point', 'Belanja per poin', LOYALTY_MAX.amount);
  positiveInt('redeem_points_unit', 'Poin per penukaran', LOYALTY_MAX.points);
  positiveInt('redeem_value', 'Nilai penukaran', LOYALTY_MAX.amount);
  positiveInt('gold_min_points', 'Ambang Gold', LOYALTY_MAX.points);
  positiveInt('platinum_min_points', 'Ambang Platinum', LOYALTY_MAX.points);
  if (!e.gold_min_points && !e.platinum_min_points && r.platinum_min_points <= r.gold_min_points) {
    e.platinum_min_points = 'Ambang Platinum harus lebih besar dari ambang Gold';
  }
  return e;
}

module.exports = {
  isBigIntIdString,
  normalizeVoucherInput,
  validateVoucher,
  resolveQuotaUpdate,
  getAdminVoucherStatus,
  normalizeLoyaltyInput,
  validateLoyaltyRules,
  QUOTA_MESSAGES: Object.freeze({ QUOTA_CHANGED, EXPECTED_QUOTA_REQUIRED, EXPECTED_QUOTA_INVALID }),
};
