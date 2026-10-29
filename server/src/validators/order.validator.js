// validators/order.validator.js
// FR-12 – FR-15 · BR-04 · BR-10 · C-14 — validasi struktur body POST /api/orders (Phase 2 · Tahap 2).
// Kontrak = payload createOrder di client/src/pages/customer/PembayaranPage.jsx:
//   { items, fulfillment, address_id, ready_date, time_slot, voucher_code, use_points, method_code }
// `items` adalah isi useCartStore (bentuk sama dengan POST /api/cart) → divalidasi ulang dengan validateCartBody.
// Hanya struktur & tipe. Aturan yang butuh database atau waktu sekarang (stok, kepemilikan alamat/desain/voucher,
// metode aktif, tanggal siap BR-01–BR-03, slot yang sudah lewat, BR-05, BR-07) diperiksa di service pesanan.
// Nilai finansial dari klien (price, subtotal, total, diskon, ongkir) dibuang; server menghitung ulang semuanya.

const { CART_MAX_LINES, FULFILLMENT_TYPE, TIME_SLOTS } = require('../utils/businessConstants');
const { isValidDateKey } = require('../utils/jakartaDate');
const { formatTimeSlot } = require('../services/operatingHours.service');
const { validateCartBody } = require('./cart.validator');
const { z, createError, parseOrThrow, bigIntIdString } = require('./zodHelpers');

const BODY_INVALID_TEXT = 'Format data pesanan tidak valid.';
// Sama dengan client constants/cart.js CART_LINE_LIMIT_MESSAGE (mock orderWrites menolak dengan pesan ini)
const LINE_LIMIT_TEXT =
  `Keranjang maksimal berisi ${CART_MAX_LINES} item berbeda. Hapus item lain atau tambah jumlah item yang sudah ada.`;
const VOUCHER_CODE_MAX_LENGTH = 20; // vouchers.code VARCHAR(20)
const METHOD_CODE_MAX_LENGTH = 20; // payment_methods.method_code VARCHAR(20)

// Label slot yang dikenal ("09.00–11.00"); slot di luar jam operasional / sudah lewat diperiksa service
const TIME_SLOT_LABELS = TIME_SLOTS.map(formatTimeSlot);

const empty = (value) => value === undefined || value === null || value === '';

const orderBodySchema = z
  .object(
    {
      items: z
        .array(z.unknown(), { error: BODY_INVALID_TEXT })
        .min(1, { error: 'Keranjang masih kosong.' })
        .max(CART_MAX_LINES, { error: LINE_LIMIT_TEXT }),
      fulfillment: z.enum(Object.values(FULFILLMENT_TYPE), { error: 'Pilih cara pesanan: pickup atau delivery.' }),
      address_id: z.preprocess(
        (value) => (value == null ? null : value),
        bigIntIdString('Alamat pengiriman tidak valid.').nullable()
      ),
      ready_date: z
        .string({ error: 'Tanggal ambil/antar tidak valid.' })
        .refine(isValidDateKey, { error: 'Tanggal ambil/antar tidak valid.' }),
      time_slot: z
        .string({ error: 'Pilih slot waktu dalam jam operasional.' })
        .refine((label) => TIME_SLOT_LABELS.includes(label), { error: 'Pilih slot waktu dalam jam operasional.' }),
      // Dinormalisasi seperti applyVoucher di client (trim + huruf besar); kosong → tanpa voucher
      voucher_code: z.preprocess(
        (value) => {
          const code = typeof value === 'string' ? value.trim().toUpperCase() : value;
          return empty(code) ? null : code;
        },
        z
          .string({ error: 'Kode voucher tidak valid.' })
          .max(VOUCHER_CODE_MAX_LENGTH, { error: 'Kode voucher tidak valid.' })
          .nullable()
      ),
      use_points: z.boolean({ error: 'Pilihan tukar poin tidak valid.' }),
      method_code: z
        .string({ error: 'Pilih metode pembayaran.' })
        .min(1, { error: 'Pilih metode pembayaran.' })
        .max(METHOD_CODE_MAX_LENGTH, { error: 'Pilih metode pembayaran.' }),
    },
    { error: BODY_INVALID_TEXT }
  )
  .superRefine((body, ctx) => {
    if (body.fulfillment === FULFILLMENT_TYPE.DELIVERY && body.address_id == null) {
      ctx.addIssue({ code: 'custom', path: ['address_id'], message: 'Pilih alamat pengiriman.' });
    }
    if (body.fulfillment === FULFILLMENT_TYPE.PICKUP && body.address_id != null) {
      ctx.addIssue({ code: 'custom', path: ['address_id'], message: 'Alamat pengiriman hanya untuk pesanan delivery.' });
    }
  });

/** Field item yang dipakai service pesanan (name/image_url/price dari klien tidak diteruskan) */
function toOrderItem(item) {
  return {
    cart_item_id: item.cart_item_id,
    product_id: item.product_id,
    variant_id: item.variant_id,
    design_id: item.design_id,
    design_token: item.design_token,
    quantity: item.quantity,
    preferred_date: item.preferred_date,
    note: item.note,
  };
}

/**
 * @param {unknown} body
 * @returns {{items: Array<object>, fulfillment: string, address_id: string|null, ready_date: string,
 *   time_slot: string, voucher_code: string|null, use_points: boolean, method_code: string}}
 * @throws {Error} statusCode 400 bila struktur/tipe tidak valid
 */
function validateOrderBody(body) {
  const order = parseOrThrow(orderBodySchema, body);
  const items = validateCartBody({ items: order.items }).map(toOrderItem);

  // cart_item_id wajib & unik: keranjang pemilik dikurangi per cart_item_id setelah pesanan dibuat
  const seen = new Set();
  items.forEach((item, index) => {
    if (item.cart_item_id == null) throw createError(`Item ${index + 1}: cart_item_id wajib diisi.`);
    const key = String(item.cart_item_id);
    if (seen.has(key)) throw createError(`Item ${index + 1}: cart_item_id duplikat.`);
    seen.add(key);
  });

  return { ...order, items };
}

module.exports = {
  validateOrderBody,
};
