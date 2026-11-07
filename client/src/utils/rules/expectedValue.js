// utils/rules/expectedValue.js
// Step 6.6 (CP6 · G7 · G8) · FR-32 · FR-34 · AD-07 · AD-09 — aturan "nilai awal form" (optimistic check) untuk stok bahan
// baku (`expected_stock`) dan sisa kuota voucher (`expected_quota`). Port dari server adminRawMaterial.service.js
// resolveStockUpdate & adminPromoRules.service.js resolveQuotaUpdate, dipakai mock agar kontraknya sama dengan API:
//   - nilai kiriman kosong, = nilai awal form, atau = nilai database → edit informasi; nilai TIDAK ditulis (perubahan
//     dari stok masuk / checkout / pembatalan sejak form dibuka tetap utuh);
//   - nilai berbeda → nilai awal wajib (tanpa → 400) dan harus = nilai database (basi → 409).

import { HTTP_STATUS_BAD_REQUEST, HTTP_STATUS_CONFLICT } from '../../constants/apiErrors';

const isBlank = (v) => v == null || String(v).trim() === '';
const cents = (v) => Math.round(Number(v) * 100);

/**
 * @param {*} value — nilai kiriman form (stok / kuota)
 * @param {*} expected — nilai saat form dibuka (expected_stock / expected_quota)
 * @param {number} current — nilai database saat disimpan
 * @param {{requiredMessage: string, changedMessage: string}} messages
 * @returns {{write: boolean} | {status: number, message: string}} write=false → kolom tidak ditulis
 */
export function resolveExpectedUpdate(value, expected, current, { requiredMessage, changedMessage }) {
  if (isBlank(value)) return { write: false };
  const hasExpected = !isBlank(expected);
  if ((hasExpected && cents(value) === cents(expected)) || cents(value) === cents(current)) return { write: false };
  if (!hasExpected) return { status: HTTP_STATUS_BAD_REQUEST, message: requiredMessage };
  if (cents(expected) !== cents(current)) return { status: HTTP_STATUS_CONFLICT, message: changedMessage };
  return { write: true };
}

/**
 * Body simpan form ubah: nilai form + nilai awal field saat form dibuka (mis. expected_stock / expected_quota).
 * Form tambah (original null) dikirim apa adanya — POST tidak memakai nilai awal.
 * @param {object} values — nilai form
 * @param {object|null} original — data saat form dibuka
 * @param {string} field — 'stock' / 'quota'
 * @param {string} expectedKey — 'expected_stock' / 'expected_quota'
 */
export function withExpectedValue(values, original, field, expectedKey) {
  return original ? { ...values, [expectedKey]: String(original[field]) } : values;
}
