// validators/adminSettings.validator.js
// Step 6.4.10 · FR-36 · UC-30 · AD-11 — validasi BENTUK request Pengaturan dengan zod (kontrak client
// services/settingsService.js). Isi (wajib, panjang, format, rentang, unik) diperiksa adminSettingsRules.service.js /
// adminStaffRules.service.js agar pesan & `fieldErrors` sama dengan mock. Bentuk salah → 400 tanpa fieldErrors.
// Field di luar kontrak (mis. latitude, longitude, payment_timeout_minutes, review_bonus_points) DIBUANG zod dan tidak
// pernah ditulis — koordinat toko tetap (OI-01), batas waktu bayar & bonus ulasan bukan isi AD-11.

const { z, parseOrThrow, createError } = require('./zodHelpers');
const { validateIdParam } = require('./adminCatalog.validator');
const { DAYS_OF_WEEK } = require('../utils/businessConstants');

const BODY_INVALID_TEXT = 'Data permintaan tidak valid.';
const HOURS_DAYS_TEXT = 'Jam operasional wajib berisi 7 hari berbeda (Senin–Minggu).';
const METHOD_CODE_TEXT = 'Kode metode bayar tidak valid.';
const ACTIVE_TEXT = 'Status aktif tidak valid.';

const text = z.string().nullish();
const numberLike = z.union([z.string(), z.number()]).nullish();

const profileSchema = z.object(
  {
    store_name: text,
    address: text,
    whatsapp_number: text,
    preorder_cutoff_time: text,
    delivery_radius_km: numberLike,
    delivery_fee_per_km: numberLike,
  },
  { error: BODY_INVALID_TEXT }
);

const hourRowSchema = z.object(
  {
    day_of_week: z.number({ error: HOURS_DAYS_TEXT }).int({ error: HOURS_DAYS_TEXT }).min(1, { error: HOURS_DAYS_TEXT }).max(7, { error: HOURS_DAYS_TEXT }),
    is_open: z.boolean({ error: BODY_INVALID_TEXT }),
    open_time: text,
    close_time: text,
  },
  { error: BODY_INVALID_TEXT }
);

// Keputusan audit: tepat 7 hari unik (1 Senin – 7 Minggu); form AD-11 selalu mengirim 7 baris
const hoursSchema = z.object(
  {
    hours: z
      .array(hourRowSchema, { error: HOURS_DAYS_TEXT })
      .length(DAYS_OF_WEEK.length, { error: HOURS_DAYS_TEXT })
      .refine((rows) => new Set(rows.map((r) => r.day_of_week)).size === DAYS_OF_WEEK.length, { error: HOURS_DAYS_TEXT }),
  },
  { error: BODY_INVALID_TEXT }
);

const activeSchema = z.object({ is_active: z.boolean({ error: ACTIVE_TEXT }) }, { error: BODY_INVALID_TEXT });

const staffSchema = z.object(
  { name: text, email: text, phone: text, password: text, role: text },
  { error: BODY_INVALID_TEXT }
);

// Pesan issue: pesan khusus (hari, status aktif) dipertahankan; selain itu pesan umum
const issueMessage = (issue) => (issue.message === HOURS_DAYS_TEXT || issue.message === ACTIVE_TEXT ? issue.message : BODY_INVALID_TEXT);

/** payment_methods.method_code VARCHAR(20): huruf kecil, angka, garis bawah (qris, va_bca, pay_at_store, …) */
function validatePaymentMethodCode(value) {
  if (typeof value !== 'string' || !/^[a-z0-9_]{1,20}$/.test(value)) throw createError(METHOD_CODE_TEXT);
  return value;
}

module.exports = {
  validateStoreProfileBody: (body) => parseOrThrow(profileSchema, body ?? {}, issueMessage),
  validateOperatingHoursBody: (body) => parseOrThrow(hoursSchema, body ?? {}, issueMessage).hours,
  validatePaymentMethodCode,
  validateActiveBody: (body) => parseOrThrow(activeSchema, body ?? {}, issueMessage).is_active,
  validateStaffBody: (body) => parseOrThrow(staffSchema, body ?? {}, issueMessage),
  validateStaffId: (value) => validateIdParam(value, 'ID akun tidak valid.'),
  SETTINGS_VALIDATION_TEXT: Object.freeze({ BODY_INVALID_TEXT, HOURS_DAYS_TEXT, METHOD_CODE_TEXT, ACTIVE_TEXT }),
};
