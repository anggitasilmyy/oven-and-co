// validators/adminOrder.validator.js
// FR-28 · FR-29 · AD-03 · AD-04 · AD-05 — validasi query GET /api/admin/orders, body aksi pesanan (Step 6.4.2), dan
// query kalender produksi (Step 6.4.3) dengan zod.
// Kontrak = client services/adminOrderService.js getAdminOrders: { tab, search, dateFrom, dateTo, fulfillment,
// methodCode, page } (parameter kosong tidak dikirim client). Parameter lain diabaikan.

const { ADMIN_ORDER_TABS, FULFILLMENT_TYPE } = require('../utils/businessConstants');
const { isValidDateKey } = require('../utils/jakartaDate');
const { z, parseOrThrow } = require('./zodHelpers');

const ORDER_NUMBER_MAX_LENGTH = 20; // orders.order_number VARCHAR(20)
const METHOD_CODE_MAX_LENGTH = 20; // payment_methods.method_code VARCHAR(20)

const dateKey = (label) =>
  z.string({ error: `${label} tidak valid.` }).refine(isValidDateKey, { error: `${label} tidak valid.` }).optional();

const querySchema = z.object({
  tab: z
    .enum(ADMIN_ORDER_TABS.map((tab) => tab.key), { error: 'Tab status pesanan tidak valid.' })
    .default(ADMIN_ORDER_TABS[0].key),
  search: z
    .string({ error: 'Pencarian tidak valid.' })
    .transform((value) => value.trim())
    .pipe(z.string().max(ORDER_NUMBER_MAX_LENGTH, { error: 'Pencarian nomor pesanan terlalu panjang.' }))
    .optional(),
  dateFrom: dateKey('Tanggal awal'),
  dateTo: dateKey('Tanggal akhir'),
  fulfillment: z.enum(Object.values(FULFILLMENT_TYPE), { error: 'Filter pickup/delivery tidak valid.' }).optional(),
  methodCode: z
    .string({ error: 'Filter metode pembayaran tidak valid.' })
    .min(1, { error: 'Filter metode pembayaran tidak valid.' })
    .max(METHOD_CODE_MAX_LENGTH, { error: 'Filter metode pembayaran tidak valid.' })
    .optional(),
  page: z
    .string({ error: 'Halaman tidak valid.' })
    .regex(/^[1-9]\d{0,5}$/, { error: 'Halaman tidak valid.' })
    .transform(Number)
    .default(1),
});

const BODY_INVALID_TEXT = 'Data permintaan tidak valid.';

// Teks bebas opsional: string atau kosong (null/tidak dikirim). Isi (wajib, panjang, cocok) diperiksa aturan bisnis
// adminOrderRules.service.js agar pesannya sama dengan mock.
const optionalText = (message) => z.string({ error: message }).nullish();

// PATCH /api/admin/orders/:orderNumber/status — client updateAdminOrderStatus: { from, to, pickup_code?, courier_name? }
const statusChangeSchema = z.object(
  {
    from: z.string({ error: 'Status asal tidak valid.' }).nullish(),
    to: z.string({ error: 'Pilih status tujuan.' }).min(1, { error: 'Pilih status tujuan.' }),
    pickup_code: optionalText('Kode pickup tidak valid.'),
    courier_name: optionalText('Nama kurir tidak valid.'),
  },
  { error: BODY_INVALID_TEXT }
);

// POST /api/admin/orders/:orderNumber/verify-pickup — client verifyPickupCode: { pickup_code }
const verifyPickupSchema = z.object({ pickup_code: optionalText('Kode pickup tidak valid.') }, { error: BODY_INVALID_TEXT });

/** @returns {{from?: string|null, to: string, pickup_code?: string|null, courier_name?: string|null}} */
function validateStatusChangeBody(body) {
  return parseOrThrow(statusChangeSchema, body);
}

/** @returns {{pickup_code?: string|null}} */
function validateVerifyPickupBody(body) {
  return parseOrThrow(verifyPickupSchema, body ?? {});
}

// Tahun 1000–9999 = rentang kolom DATE MySQL (orders.ready_date); bulan 01–12
const MONTH_KEY_PATTERN = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/;
const DATE_KEY_YEAR_PATTERN = /^[1-9]\d{3}-/;

// GET /api/admin/calendar — client getProductionCalendar: month "YYYY-MM", date "YYYY-MM-DD"; kosong = hari ini
const calendarQuerySchema = z.object({
  month: z
    .string({ error: 'Bulan tidak valid.' })
    .regex(MONTH_KEY_PATTERN, { error: 'Bulan tidak valid.' })
    .refine((value) => isValidDateKey(`${value}-01`), { error: 'Bulan tidak valid.' })
    .optional(),
  date: z
    .string({ error: 'Tanggal tidak valid.' })
    .refine((value) => DATE_KEY_YEAR_PATTERN.test(value) && isValidDateKey(value), { error: 'Tanggal tidak valid.' })
    .optional(),
});

/** @returns {{month?: string, date?: string}} parameter lain diabaikan */
function validateCalendarQuery(query) {
  return parseOrThrow(calendarQuerySchema, query ?? {});
}

/** @returns {{tab: string, search?: string, dateFrom?: string, dateTo?: string, fulfillment?: string, methodCode?: string, page: number}} */
function validateAdminOrderQuery(query) {
  return parseOrThrow(querySchema, query ?? {});
}

module.exports = {
  validateAdminOrderQuery,
  validateStatusChangeBody,
  validateVerifyPickupBody,
  validateCalendarQuery,
};
