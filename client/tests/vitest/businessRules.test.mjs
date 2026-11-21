// Uji Step 7b (Vitest) · Gap G-03 docs/TEST_CASES.md · BR-08 · BR-09 · BR-11 · SPEC §6 (Voucher & poin, Ulasan, Stok)
// TC-BR-08-02 canCancelOrder · TC-BR-11-02 canReviewOrder · TC-VR-10-02 validateReviewInput · TC-BR-09-02 pointsEarnedFor
// TC-VR-13-02 isLowStock · TC-VR-07-02 isVoucherActiveOn — fungsi murni client lewat barrel utils/businessRules.js.
// Hanya enam fungsi ini (keputusan Final Review Step 7a); fungsi lain sudah diuji di e2e/server dan tidak diulang.
// Data deterministik: tanpa jam sistem, tanggal berupa dateKey `YYYY-MM-DD` tetap.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  canCancelOrder, canReviewOrder, validateReviewInput, pointsEarnedFor, isLowStock, isVoucherActiveOn,
} from '../../src/utils/businessRules.js';
import { ORDER_STATUS } from '../../src/constants/orderStatus.js';
import { REVIEW_TAGS } from '../../src/constants/orderHistory.js';
import { STORE_SETTINGS_DEFAULT } from '../../src/constants/storeConfig.js';

const ALL_STATUSES = Object.values(ORDER_STATUS);
const statusMap = (fn) => Object.fromEntries(ALL_STATUSES.map((s) => [s, fn({ order_status: s })]));

// ── BR-08 · TC-BR-08-02 ────────────────────────────────────────────────────────────────────────────────────────────
test('TC-BR-08-02 canCancelOrder: 7 status SPEC §4 → true hanya Menunggu Pembayaran & Dikonfirmasi', () => {
  assert.deepEqual(ALL_STATUSES, [
    'menunggu_pembayaran', 'dikonfirmasi', 'sedang_disiapkan', 'siap_diambil', 'dalam_pengiriman', 'selesai', 'dibatalkan',
  ]);
  assert.deepEqual(statusMap(canCancelOrder), {
    menunggu_pembayaran: true, dikonfirmasi: true, sedang_disiapkan: false, siap_diambil: false,
    dalam_pengiriman: false, selesai: false, dibatalkan: false,
  });
});

test('TC-BR-08-02 canCancelOrder: transisi Dikonfirmasi → Sedang Disiapkan menutup pembatalan; pesanan/status kosong → false', () => {
  const order = { order_status: ORDER_STATUS.MENUNGGU_PEMBAYARAN };
  assert.equal(canCancelOrder(order), true);
  order.order_status = ORDER_STATUS.DIKONFIRMASI;
  assert.equal(canCancelOrder(order), true);
  order.order_status = ORDER_STATUS.SEDANG_DISIAPKAN;
  assert.equal(canCancelOrder(order), false);
  for (const empty of [null, undefined, {}, { order_status: '' }, { order_status: 'Dikonfirmasi' }]) {
    assert.equal(canCancelOrder(empty), false, JSON.stringify(empty));
  }
});

// ── BR-11 · TC-BR-11-02 ────────────────────────────────────────────────────────────────────────────────────────────
test('TC-BR-11-02 canReviewOrder: 7 status → true hanya Selesai', () => {
  assert.deepEqual(statusMap(canReviewOrder), {
    menunggu_pembayaran: false, dikonfirmasi: false, sedang_disiapkan: false, siap_diambil: false,
    dalam_pengiriman: false, selesai: true, dibatalkan: false,
  });
});

test('TC-BR-11-02 canReviewOrder: Siap Diambil / Dalam Pengiriman → Selesai membuka ulasan; pesanan/status kosong → false', () => {
  for (const before of [ORDER_STATUS.SIAP_DIAMBIL, ORDER_STATUS.DALAM_PENGIRIMAN]) {
    const order = { order_status: before };
    assert.equal(canReviewOrder(order), false, before);
    order.order_status = ORDER_STATUS.SELESAI;
    assert.equal(canReviewOrder(order), true, `${before} → selesai`);
  }
  for (const empty of [null, undefined, {}, { order_status: 'Selesai' }]) {
    assert.equal(canReviewOrder(empty), false, JSON.stringify(empty));
  }
});

// ── SPEC §6 Ulasan · TC-VR-10-02 ───────────────────────────────────────────────────────────────────────────────────
const RATING_ERROR = 'Pilih rating 1–5 bintang';
const TAG_ERROR = 'Tag ulasan tidak valid';
const PHOTO_ERROR = 'Maksimal 3 foto';
const photos = (n) => Array.from({ length: n }, (_, i) => `foto-${i + 1}.jpg`);

test('TC-VR-10-02 validateReviewInput: input sah (rating batas 1 & 5, semua tag, 0 & 3 foto, tag/foto tidak dikirim) → null', () => {
  assert.equal(validateReviewInput({ rating: 1 }), null);
  assert.equal(validateReviewInput({ rating: 5, tags: [], photos: [] }), null);
  assert.equal(validateReviewInput({ rating: 3, tags: [...REVIEW_TAGS], photos: photos(3) }), null);
  assert.deepEqual(REVIEW_TAGS, ['Fresh', 'Lembut', 'Packaging Rapi', 'Tepat Waktu']);
});

test('TC-VR-10-02 validateReviewInput: rating di luar 1–5 atau bukan bilangan bulat → pesan rating', () => {
  for (const rating of [0, 6, -1, 2.5, '5', null, undefined, Number.NaN]) {
    assert.equal(validateReviewInput({ rating }), RATING_ERROR, String(rating));
  }
});

test('TC-VR-10-02 validateReviewInput: tag di luar daftar (termasuk beda huruf) → pesan tag', () => {
  for (const tags of [['Enak'], ['fresh'], ['Fresh', 'Mahal']]) {
    assert.equal(validateReviewInput({ rating: 4, tags }), TAG_ERROR, tags.join(','));
  }
});

test('TC-VR-10-02 validateReviewInput: 4 foto → pesan foto; urutan pemeriksaan rating → tag → foto', () => {
  assert.equal(validateReviewInput({ rating: 4, photos: photos(4) }), PHOTO_ERROR);
  assert.equal(validateReviewInput({ rating: 0, tags: ['Enak'], photos: photos(4) }), RATING_ERROR);
  assert.equal(validateReviewInput({ rating: 4, tags: ['Enak'], photos: photos(4) }), TAG_ERROR);
});

// ── BR-09 · TC-BR-09-02 ────────────────────────────────────────────────────────────────────────────────────────────
test('TC-BR-09-02 pointsEarnedFor: 1 poin per Rp 1.000 (pengaturan bawaan), dibulatkan ke bawah', () => {
  assert.equal(STORE_SETTINGS_DEFAULT.earn_amount_per_point, 1000);
  const cases = [[102500, 102], [0, 0], [999, 0], [1000, 1], [1999, 1], [2000, 2]];
  assert.deepEqual(cases.map(([total]) => pointsEarnedFor(total)), cases.map(([, points]) => points));
});

test('TC-BR-09-02 pointsEarnedFor: memakai earn_amount_per_point dari pengaturan toko yang diberikan', () => {
  const settings = { ...STORE_SETTINGS_DEFAULT, earn_amount_per_point: 500 };
  assert.deepEqual([499, 500, 102500].map((total) => pointsEarnedFor(total, settings)), [0, 1, 205]);
});

// ── SPEC §6 Stok · TC-VR-13-02 ─────────────────────────────────────────────────────────────────────────────────────
test('TC-VR-13-02 isLowStock: menipis bila stok ≤ minimum (batas inklusif)', () => {
  const cases = [
    [{ stock: 10, min_stock: 10 }, true], // tepat minimum
    [{ stock: 9.99, min_stock: 10 }, true],
    [{ stock: 0, min_stock: 10 }, true], // habis
    [{ stock: 0, min_stock: 0 }, true],
    [{ stock: 10.01, min_stock: 10 }, false], // satu sen di atas minimum
    [{ stock: 25, min_stock: 10 }, false],
  ];
  for (const [material, expected] of cases) assert.equal(isLowStock(material), expected, JSON.stringify(material));
});

test('TC-VR-13-02 isLowStock: nilai DECIMAL(10,2) sebagai teks dibandingkan sebagai angka', () => {
  assert.equal(isLowStock({ stock: '10.00', min_stock: '10' }), true);
  assert.equal(isLowStock({ stock: '10.01', min_stock: '10.00' }), false);
  assert.equal(isLowStock({ stock: '9.5', min_stock: '10' }), true); // bukan perbandingan teks ('9.5' > '10')
});

// ── SPEC §6 Voucher & poin · TC-VR-07-02 ───────────────────────────────────────────────────────────────────────────
const voucher = (patch = {}) => ({ is_active: true, quota: 5, valid_from: '2026-10-01', valid_to: '2026-10-31', ...patch });

test('TC-VR-07-02 isVoucherActiveOn: batas periode inklusif (valid_from & valid_to)', () => {
  const cases = [['2026-09-30', false], ['2026-10-01', true], ['2026-10-15', true], ['2026-10-31', true], ['2026-11-01', false]];
  for (const [dateKey, expected] of cases) assert.equal(isVoucherActiveOn(voucher(), dateKey), expected, dateKey);
});

test('TC-VR-07-02 isVoucherActiveOn: nonaktif atau kuota habis → tidak aktif walau dalam periode', () => {
  assert.equal(isVoucherActiveOn(voucher({ quota: 1 }), '2026-10-15'), true);
  assert.equal(isVoucherActiveOn(voucher({ quota: 0 }), '2026-10-15'), false);
  assert.equal(isVoucherActiveOn(voucher({ is_active: false }), '2026-10-15'), false);
  assert.equal(isVoucherActiveOn(voucher({ is_active: false, quota: 0 }), '2026-10-01'), false);
});

test('TC-VR-07-02 isVoucherActiveOn: voucher satu hari (valid_from = valid_to)', () => {
  const oneDay = voucher({ valid_from: '2026-10-23', valid_to: '2026-10-23' });
  assert.deepEqual(['2026-10-22', '2026-10-23', '2026-10-24'].map((d) => isVoucherActiveOn(oneDay, d)), [false, true, false]);
});
