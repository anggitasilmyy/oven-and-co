// utils/rules/adminPromo.js
// Step 5.8 · FR-34 · UC-29 · BR-09 · BR-10 · AD-09 — validasi voucher & aturan loyalty (fungsi murni)
// "Memvalidasi dan menyimpan" (FR-34). Kuota (vouchers.quota) = sisa pemakaian: berkurang saat dipakai di checkout
// dan kembali saat pesanan dibatalkan (Step 5.3) — jadi "terpakai" dihitung dari pesanan yang memakai voucher.

import { ORDER_STATUS } from '../../constants/orderStatus';
import {
  DISCOUNT_TYPE, VOUCHER_FIELD_MAX, VOUCHER_CODE_PATTERN, VOUCHER_MAX_QUOTA, VOUCHER_MAX_PERCENT,
  ADMIN_VOUCHER_STATUS, LOYALTY_FIELDS, LOYALTY_MAX,
} from '../../constants/adminPromo';
import { MAX_PRICE } from '../../constants/adminCatalog';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const isInt = (v) => v !== '' && v != null && Number.isInteger(Number(v));

/** Rapikan input form voucher (kode huruf besar tanpa spasi; produk kosong = semua produk) */
export function normalizeVoucherInput(input = {}) {
  return {
    code: String(input.code ?? '').trim().toUpperCase(),
    title: String(input.title ?? '').trim(),
    discount_type: input.discount_type ?? '',
    discount_value: input.discount_value === '' || input.discount_value == null ? null : Number(input.discount_value),
    product_id: input.product_id === '' || input.product_id == null ? null : Number(input.product_id),
    quota: input.quota === '' || input.quota == null ? null : Number(input.quota),
    valid_from: input.valid_from ?? '',
    valid_to: input.valid_to ?? '',
    is_active: Boolean(input.is_active),
  };
}

/**
 * @param {object} v — hasil normalizeVoucherInput
 * @param {{vouchers, voucherId, products}} ctx — products: produk yang boleh dipilih
 * @returns {Record<string,string>} error per field (kosong = sah)
 */
export function validateVoucher(v, { vouchers, voucherId = null, products }) {
  const e = {};
  if (!v.code) e.code = 'Isi kode voucher';
  else if (v.code.length > VOUCHER_FIELD_MAX.code) e.code = `Kode maksimal ${VOUCHER_FIELD_MAX.code} karakter`;
  else if (!VOUCHER_CODE_PATTERN.test(v.code)) e.code = 'Kode hanya huruf dan angka tanpa spasi';
  else if (vouchers.some((x) => x.code === v.code && x.voucher_id !== voucherId)) e.code = 'Kode voucher sudah dipakai';

  if (!v.title) e.title = 'Isi judul promo';
  else if (v.title.length > VOUCHER_FIELD_MAX.title) e.title = `Judul maksimal ${VOUCHER_FIELD_MAX.title} karakter`;

  if (!Object.values(DISCOUNT_TYPE).includes(v.discount_type)) e.discount_type = 'Pilih jenis diskon';
  if (v.discount_value == null || Number.isNaN(v.discount_value) || v.discount_value <= 0) e.discount_value = 'Nilai diskon harus lebih dari 0';
  else if (v.discount_type === DISCOUNT_TYPE.PERCENT && (v.discount_value > VOUCHER_MAX_PERCENT || !Number.isInteger(v.discount_value))) e.discount_value = `Persen diskon berupa bilangan bulat 1–${VOUCHER_MAX_PERCENT}`;
  else if (v.discount_type === DISCOUNT_TYPE.AMOUNT && (v.discount_value > MAX_PRICE || !Number.isInteger(v.discount_value))) e.discount_value = 'Nominal diskon berupa bilangan bulat rupiah';

  if (v.product_id != null && !products.some((p) => p.product_id === v.product_id)) e.product_id = 'Produk tidak ditemukan';
  if (!isInt(v.quota) || v.quota < 0 || v.quota > VOUCHER_MAX_QUOTA) e.quota = `Kuota berupa bilangan bulat 0–${VOUCHER_MAX_QUOTA.toLocaleString('id-ID')}`;

  if (!DATE_KEY.test(v.valid_from)) e.valid_from = 'Pilih tanggal mulai';
  if (!DATE_KEY.test(v.valid_to)) e.valid_to = 'Pilih tanggal berakhir';
  else if (!e.valid_from && v.valid_to < v.valid_from) e.valid_to = 'Tanggal berakhir tidak boleh sebelum tanggal mulai';
  return e;
}

/** Jumlah pemakaian voucher = pesanan (tidak dibatalkan) yang memakai voucher ini */
export function countVoucherUsage(orders, voucherId) {
  return orders.filter((o) => o.voucher_id === voucherId && o.order_status !== ORDER_STATUS.DIBATALKAN).length;
}

/** Status voucher di tabel AD-09 — urutan cek sama dengan isVoucherActiveOn */
export function getAdminVoucherStatus(voucher, todayKey) {
  if (!voucher.is_active) return ADMIN_VOUCHER_STATUS.NONAKTIF.key;
  if (voucher.valid_to < todayKey) return ADMIN_VOUCHER_STATUS.BERAKHIR.key;
  if (voucher.quota <= 0) return ADMIN_VOUCHER_STATUS.KUOTA_HABIS.key;
  if (voucher.valid_from > todayKey) return ADMIN_VOUCHER_STATUS.TERJADWAL.key;
  return ADMIN_VOUCHER_STATUS.AKTIF.key;
}

/** Rapikan input aturan loyalty → angka (null bila kosong) */
export function normalizeLoyaltyInput(input = {}) {
  return Object.fromEntries(LOYALTY_FIELDS.map((f) => [f, input[f] === '' || input[f] == null ? null : Number(input[f])]));
}

/**
 * Validasi aturan poin & ambang level (BR-09). Semua bilangan bulat positif; Platinum > Gold.
 * @returns {Record<string,string>}
 */
export function validateLoyaltyRules(r) {
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
