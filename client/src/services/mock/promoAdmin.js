// services/mock/promoAdmin.js
// Step 5.8 · FR-34 · UC-29 · BR-09 · BR-10 · AD-09 — voucher & aturan loyalty di mode mock
// Pengganti /api/admin/vouchers & /api/admin/loyalty (Step 6.4). Voucher tidak dihapus (dirujuk pesanan &
// user_vouchers), hanya dinonaktifkan. Aturan loyalty disimpan di store_settings dan langsung dipakai checkout,
// poin pesanan Selesai, dan level member pelanggan.

import { getTables, updateTable, nextUserRowId } from './db';
import { getMockTodayKey } from './mockClock';
import {
  normalizeVoucherInput, validateVoucher, getAdminVoucherStatus, countVoucherUsage,
  normalizeLoyaltyInput, validateLoyaltyRules,
} from '../../utils/businessRules';
import { LOYALTY_FIELDS } from '../../constants/adminPromo';

const fail = (message) => { throw new Error(message); };
const invalid = (errors) => Object.assign(new Error(Object.values(errors)[0]), { fieldErrors: errors });

/** Tabel voucher AD-09: data voucher + produk berlaku + terpakai + status hari ini */
export function buildAdminVoucherBoard() {
  const todayKey = getMockTodayKey();
  const t = getTables('vouchers', 'orders', 'products');
  const names = new Map(t.products.map((p) => [p.product_id, p.name]));
  const rows = t.vouchers
    .map((v) => ({
      ...v,
      product_name: v.product_id == null ? null : names.get(v.product_id) ?? `Produk #${v.product_id}`,
      used: countVoucherUsage(t.orders, v.voucher_id),
      status: getAdminVoucherStatus(v, todayKey),
    }))
    .sort((a, b) => b.valid_to.localeCompare(a.valid_to) || a.code.localeCompare(b.code));
  const products = t.products
    .map((p) => ({ product_id: p.product_id, name: p.name, is_active: p.is_active }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { todayKey, rows, products };
}

/** Tambah (voucherId = null) atau ubah voucher */
export function saveAdminVoucher(voucherId, input) {
  const t = getTables('vouchers', 'products');
  const existing = voucherId == null ? null : (t.vouchers.find((v) => v.voucher_id === Number(voucherId)) ?? fail('Voucher tidak ditemukan'));
  const v = normalizeVoucherInput(input);
  const errors = validateVoucher(v, { vouchers: t.vouchers, voucherId: existing?.voucher_id ?? null, products: t.products });
  if (Object.keys(errors).length) throw invalid(errors);
  const row = { voucher_id: existing?.voucher_id ?? nextUserRowId(t.vouchers, 'voucher_id'), ...v };
  updateTable('vouchers', (rows) => (existing ? rows.map((x) => (x.voucher_id === row.voucher_id ? row : x)) : [...rows, row]));
  return row;
}

/** Aktifkan / nonaktifkan voucher dari tabel */
export function setAdminVoucherActive(voucherId, isActive) {
  const { vouchers } = getTables('vouchers');
  const existing = vouchers.find((v) => v.voucher_id === Number(voucherId)) ?? fail('Voucher tidak ditemukan');
  const row = { ...existing, is_active: Boolean(isActive) };
  updateTable('vouchers', (rows) => rows.map((x) => (x.voucher_id === row.voucher_id ? row : x)));
  return row;
}

/** Aturan poin & ambang level dari store_settings */
export function buildLoyaltyRules() {
  const { store_settings: s } = getTables('store_settings');
  return Object.fromEntries(LOYALTY_FIELDS.map((f) => [f, s[f]]));
}

/** Simpan aturan loyalty ke store_settings (field lain tidak tersentuh) */
export function saveLoyaltyRules(input) {
  const rules = normalizeLoyaltyInput(input);
  const errors = validateLoyaltyRules(rules);
  if (Object.keys(errors).length) throw invalid(errors);
  updateTable('store_settings', (s) => ({ ...s, ...rules }));
  return rules;
}
