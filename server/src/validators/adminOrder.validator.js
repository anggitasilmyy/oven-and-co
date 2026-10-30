// validators/adminOrder.validator.js
// FR-28 · AD-03 — validasi query GET /api/admin/orders dengan zod.
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

/** @returns {{tab: string, search?: string, dateFrom?: string, dateTo?: string, fulfillment?: string, methodCode?: string, page: number}} */
function validateAdminOrderQuery(query) {
  return parseOrThrow(querySchema, query ?? {});
}

module.exports = {
  validateAdminOrderQuery,
};
