// validators/adminPromo.validator.js
// Step 6.4.9 · FR-34 · AD-09 — validasi BENTUK request voucher & aturan loyalty dengan zod (client
// services/adminPromoService.js). Isi (wajib, panjang, rentang, kode unik, produk ada, Platinum > Gold) diperiksa
// services/adminPromoRules.service.js agar pesan & `fieldErrors` sama dengan mock. Bentuk salah → 400 tanpa fieldErrors.
// expected_quota (opsional, PUT): sisa kuota saat form dibuka — mencegah pemakaian/pembatalan bersamaan tertimpa.

const { z, parseOrThrow } = require('./zodHelpers');
const { validateIdParam } = require('./adminCatalog.validator');
const { LOYALTY_FIELDS } = require('../utils/businessConstants');

const BODY_INVALID_TEXT = 'Data permintaan tidak valid.';
const text = z.string().nullish();
const numberLike = z.union([z.string(), z.number()]).nullish();

const voucherSchema = z.object(
  {
    code: text,
    title: text,
    discount_type: text,
    discount_value: numberLike,
    product_id: numberLike,
    quota: numberLike,
    expected_quota: numberLike,
    valid_from: text,
    valid_to: text,
    is_active: z.boolean().optional(),
  },
  { error: BODY_INVALID_TEXT }
);

const activeSchema = z.object({ is_active: z.boolean({ error: 'Status aktif tidak valid.' }) }, { error: BODY_INVALID_TEXT });

const loyaltySchema = z.object(Object.fromEntries(LOYALTY_FIELDS.map((f) => [f, numberLike])), { error: BODY_INVALID_TEXT });

const issueMessage = (issue) => (issue.path.length ? BODY_INVALID_TEXT : issue.message);

module.exports = {
  validateVoucherId: (value) => validateIdParam(value, 'ID voucher tidak valid.'),
  validateVoucherBody: (body) => parseOrThrow(voucherSchema, body ?? {}, issueMessage),
  validateVoucherActiveBody: (body) => parseOrThrow(activeSchema, body ?? {}),
  validateLoyaltyBody: (body) => parseOrThrow(loyaltySchema, body ?? {}, issueMessage),
};
