// services/orderCreate.service.js
// FR-12 – FR-16 · BR-01 – BR-07 · BR-09 · BR-10 · BR-12 · TF-12 · C-14 — POST /api/orders (pesanan dari Checkout).
// Port server dari client/src/services/mock/orderWrites.js createMockOrder dengan aturan & pesan yang sama.
// Semua harga, diskon, ongkir, dan total dihitung ulang dari database (cart.service + checkoutRules.service);
// nilai finansial dari klien tidak pernah dipakai. Efek saat pesanan DIBUAT (SPEC §5 TF-12 & mock): stok ready
// hari ini berkurang, klaim voucher ditandai terpakai + kuota −1, poin yang ditukar dicatat `redeem`, status awal
// dicatat di order_status_histories. Notifikasi status (SPEC §4) ditulis di Step 6.5; /me/notifications (baca) sudah ada (6.3).

const prisma = require('../lib/prisma');
const {
  AVAILABILITY_TYPE, FULFILLMENT_TYPE, ORDER_STATUS, PAYMENT_STATUS, PAYMENT_OPTION, PAYMENT_TRANSACTION_STATUS,
  POINT_TX_TYPE, TIME_SLOTS, CHECKOUT_DATE_WINDOW_DAYS, PAY_AT_STORE_METHOD, PAY_AT_STORE_DISABLED_TEXT,
  VOUCHER_INVALID_TEXT,
} = require('../utils/businessConstants');
const { getJakartaDateKey, addDaysToDateKey, dateKeyToDbDate } = require('../utils/jakartaDate');
const { getCartView } = require('./cart.service');
const { distanceKm, buildCheckoutQuote, isPayAtStoreAllowed, resolvePaymentMethod, PAYMENT_METHOD_ERROR } =
  require('./checkoutRules.service');
const { getOperatingHoursFor, findSelectableSlot } = require('./operatingHours.service');
const { nextOrderNumber, formatOrderNumber, paymentCodeFor, gatewayRefFor, generatePickupCode, getPaymentDeadline } =
  require('./orderRules.service');
const { mapStoreSetting, mapAddress, mapPaymentMethod, mapOperatingHour, mapVoucher, mapClaim } =
  require('./checkout.service');

const ORDER_NUMBER_ATTEMPTS = 3; // nomor pesanan bentrok dengan pesanan bersamaan (UNIQUE) → hitung ulang

const MESSAGES = Object.freeze({
  UNAVAILABLE: 'Ada produk yang sudah tidak tersedia. Hapus dari keranjang.',
  STOCK: 'Stok produk ready tidak mencukupi. Periksa keranjang.',
  DATE: 'Tanggal ambil/antar tidak valid.',
  SLOT: 'Pilih slot waktu dalam jam operasional.',
  ADDRESS: 'Pilih alamat pengiriman.',
  METHOD: 'Pilih metode pembayaran.',
  DESIGN_USED: 'Desain kue sudah dipakai pada pesanan lain. Buat desain baru.',
});

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

/** BR-01/BR-03 + jendela tanggal Checkout (client useCheckoutForm): ready → hari ini; lainnya earliest..maks. */
function isAllowedReadyDate(readyDate, { allReady, earliest, todayKey }) {
  if (allReady) return readyDate === todayKey;
  const windowEnd = addDaysToDateKey(todayKey, CHECKOUT_DATE_WINDOW_DAYS - 1);
  return readyDate >= earliest && readyDate <= (earliest > windowEnd ? earliest : windowEnd);
}

/** Jumlah per produk ready (beberapa baris varian bisa memakai stok produk yang sama) */
function readyQuantities(lines) {
  const totals = new Map();
  lines
    .filter((line) => line.availability_type === AVAILABILITY_TYPE.READY)
    .forEach((line) => totals.set(line.product_id, (totals.get(line.product_id) ?? 0) + line.quantity));
  return [...totals.entries()].sort(([a], [b]) => (BigInt(a) < BigInt(b) ? -1 : 1));
}

/** Validasi yang tidak bergantung pada data yang bisa berubah oleh pesanan lain */
async function loadAndValidate(userId, input, now) {
  const todayKey = getJakartaDateKey(now);
  const [cart, storeRow, methodRows, hourRows, addressRow] = await Promise.all([
    getCartView(input.items, { userId, now }),
    prisma.storeSetting.findFirst({ orderBy: { settingId: 'asc' } }),
    prisma.paymentMethod.findMany({ where: { isActive: true } }),
    prisma.operatingHour.findMany({ orderBy: { dayOfWeek: 'asc' } }),
    input.address_id
      ? prisma.address.findFirst({ where: { addressId: BigInt(input.address_id), userId: BigInt(userId) } })
      : null,
  ]);

  if (!storeRow) throw httpError(500, 'Pengaturan toko belum tersedia.');
  const settings = mapStoreSetting(storeRow);
  const { lines } = cart;

  if (lines.some((line) => !line.available)) throw httpError(400, MESSAGES.UNAVAILABLE);
  if (cart.stock_issues.length > 0) throw httpError(409, MESSAGES.STOCK);

  const allReady = lines.every((line) => line.availability_type === AVAILABILITY_TYPE.READY);
  if (!isAllowedReadyDate(input.ready_date, { allReady, earliest: cart.ready_date ?? todayKey, todayKey })) {
    throw httpError(400, MESSAGES.DATE);
  }

  const operatingHours = hourRows.map(mapOperatingHour);
  const hours = getOperatingHoursFor(operatingHours, input.ready_date);
  if (!findSelectableSlot(TIME_SLOTS, input.ready_date, now, hours, input.time_slot)) throw httpError(400, MESSAGES.SLOT);

  let address = null;
  let distance = null;
  if (input.fulfillment === FULFILLMENT_TYPE.DELIVERY) {
    if (!addressRow) throw httpError(400, MESSAGES.ADDRESS);
    address = mapAddress(addressRow);
    distance = distanceKm(settings, address);
    if (!(distance <= settings.delivery_radius_km)) {
      throw httpError(400, `Alamat di luar radius pengiriman ${settings.delivery_radius_km} km`);
    }
  }

  const payAtStoreAllowed = isPayAtStoreAllowed(input.fulfillment, lines.map((line) => line.availability_type));
  const { method, error } = resolvePaymentMethod(methodRows.map(mapPaymentMethod), input.method_code, { payAtStoreAllowed });
  if (error === PAYMENT_METHOD_ERROR.PAY_AT_STORE_NOT_ALLOWED) throw httpError(400, PAY_AT_STORE_DISABLED_TEXT);
  if (!method) throw httpError(400, MESSAGES.METHOD);

  const payAtStore = method.method_code === PAY_AT_STORE_METHOD;
  const expiredAt = getPaymentDeadline({ payAtStore, now, settings, operatingHours, readyDate: input.ready_date });
  if (!expiredAt) throw httpError(400, MESSAGES.SLOT);

  return { todayKey, settings, lines, address, distance, method, payAtStore, expiredAt };
}

/** Kunci baris pengguna: pesanan, klaim voucher, dan saldo poin pelanggan yang sama diproses berurutan */
async function lockRows(tx, owner, designIds) {
  await tx.$queryRaw`SELECT user_id FROM users WHERE user_id = ${owner} FOR UPDATE`;
  // Urutan tetap (id naik) agar dua transaksi tidak saling menunggu
  for (const designId of designIds) {
    await tx.$queryRaw`SELECT design_id FROM custom_cake_designs WHERE design_id = ${designId} FOR UPDATE`;
  }
}

async function loadVoucherInput(tx, owner, code) {
  if (!code) return null;
  const voucher = await tx.voucher.findUnique({ where: { code } });
  const claim = voucher
    ? await tx.userVoucher.findUnique({ where: { userId_voucherId: { userId: owner, voucherId: voucher.voucherId } } })
    : null;
  return { voucher: voucher ? mapVoucher(voucher) : null, claim: claim ? mapClaim(claim) : null };
}

/** Stok ready hari ini: qty_sold naik HANYA bila sisa mencukupi (satu UPDATE atomik per produk) */
async function takeReadyStock(tx, lines, todayKey) {
  const stockDate = dateKeyToDbDate(todayKey);
  for (const [productId, quantity] of readyQuantities(lines)) {
    const affected = await tx.$executeRaw`UPDATE daily_stocks SET qty_sold = qty_sold + ${quantity}
      WHERE product_id = ${BigInt(productId)} AND stock_date = ${stockDate} AND qty_planned - qty_sold >= ${quantity}`;
    if (affected !== 1) throw httpError(409, MESSAGES.STOCK);
  }
}

async function claimVoucher(tx, owner, voucherId, now) {
  const claimed = await tx.userVoucher.updateMany({
    where: { userId: owner, voucherId, usedAt: null },
    data: { usedAt: now },
  });
  const quota = await tx.voucher.updateMany({
    where: { voucherId, quota: { gt: 0 } },
    data: { quota: { decrement: 1 } },
  });
  if (claimed.count !== 1 || quota.count !== 1) throw httpError(409, VOUCHER_INVALID_TEXT);
}

async function writeOrder(tx, { owner, input, context, quote, voucherId, now }) {
  const { todayKey, lines, address, distance, method, payAtStore, expiredAt } = context;
  const existing = await tx.order.findMany({
    where: { orderNumber: { startsWith: formatOrderNumber(todayKey, 0).slice(0, -3) } },
    select: { orderNumber: true },
  });
  const orderNumber = nextOrderNumber(existing.map((row) => row.orderNumber), todayKey);
  const status = payAtStore ? ORDER_STATUS.DIKONFIRMASI : ORDER_STATUS.MENUNGGU_PEMBAYARAN;

  const created = await tx.order.create({
    select: { orderId: true },
    data: {
      orderNumber,
      userId: owner,
      fulfillmentType: input.fulfillment,
      addressId: address ? BigInt(address.address_id) : null,
      deliveryAddressSnapshot: address
        ? `${address.label} · ${address.recipient_name} (${address.recipient_phone}) · ${address.full_address}`
        : null,
      distanceKm: distance == null ? null : Math.round(distance * 100) / 100,
      readyDate: dateKeyToDbDate(input.ready_date),
      timeSlot: input.time_slot,
      subtotal: quote.subtotal,
      shippingFee: quote.shippingFee,
      voucherId,
      voucherDiscount: quote.voucherDiscount,
      pointsUsed: quote.pointsUsed,
      pointsDiscount: quote.pointsDiscount,
      total: quote.total,
      // Online → menunggu pembayaran; Bayar di Toko → langsung dikonfirmasi (SPEC §4)
      paymentOption: payAtStore ? PAYMENT_OPTION.PAY_AT_STORE : PAYMENT_OPTION.ONLINE,
      paymentStatus: PAYMENT_STATUS.UNPAID,
      orderStatus: status,
      pickupCode: input.fulfillment === FULFILLMENT_TYPE.PICKUP ? generatePickupCode() : null,
      createdAt: now,
      items: {
        create: lines.map((line) => ({
          productId: BigInt(line.product_id),
          variantId: line.variant_id ? BigInt(line.variant_id) : null,
          designId: line.design_id ? BigInt(line.design_id) : null,
          quantity: line.quantity,
          unitPrice: line.unit_price,
          note: line.note || null,
        })),
      },
      payments: {
        create: {
          methodCode: method.method_code,
          amount: quote.total,
          gatewayRef: gatewayRefFor(method, orderNumber),
          paymentCode: paymentCodeFor(method, orderNumber),
          status: PAYMENT_TRANSACTION_STATUS.PENDING,
          expiredAt,
        },
      },
      statusHistories: { create: { status, changedBy: owner, changedAt: now } },
    },
  });

  return { orderId: created.orderId, orderNumber, paymentOption: payAtStore ? PAYMENT_OPTION.PAY_AT_STORE : PAYMENT_OPTION.ONLINE };
}

/**
 * @param {string} userId — dari req.user
 * @param {object} input — hasil validators/order.validator.js validateOrderBody
 * @returns {Promise<{order_number: string, payment_option: string}>}
 */
async function createOrder(userId, input, now = new Date()) {
  const owner = BigInt(userId);
  const context = await loadAndValidate(userId, input, now);
  const designIds = [...new Set(context.lines.map((line) => line.design_id).filter(Boolean))]
    .map((id) => BigInt(id))
    .sort((a, b) => (a < b ? -1 : 1));

  for (let attempt = 1; ; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        await lockRows(tx, owner, designIds);

        // Sekali pakai: desain yang sudah masuk pesanan (termasuk oleh request bersamaan) ditolak
        if (designIds.length && (await tx.orderItem.count({ where: { designId: { in: designIds } } })) > 0) {
          throw httpError(409, MESSAGES.DESIGN_USED);
        }

        const voucherInput = await loadVoucherInput(tx, owner, input.voucher_code);
        const pointRows = await tx.pointTransaction.findMany({ where: { userId: owner }, select: { points: true } });
        const quote = buildCheckoutQuote({
          lines: context.lines,
          fulfillment: input.fulfillment,
          distance: context.distance,
          voucherInput,
          todayKey: context.todayKey,
          pointBalance: pointRows.reduce((sum, row) => sum + row.points, 0),
          usePoints: input.use_points,
          settings: context.settings,
        });
        if (quote.voucher && !quote.voucher.valid) throw httpError(400, VOUCHER_INVALID_TEXT);

        await takeReadyStock(tx, context.lines, context.todayKey);
        const voucherId = quote.voucher?.valid ? BigInt(voucherInput.voucher.voucher_id) : null;
        if (voucherId) await claimVoucher(tx, owner, voucherId, now);

        const order = await writeOrder(tx, { owner, input, context, quote, voucherId, now });

        if (quote.pointsUsed > 0) {
          await tx.pointTransaction.create({
            data: { userId: owner, type: POINT_TX_TYPE.REDEEM, points: -quote.pointsUsed, orderId: order.orderId, createdAt: now },
          });
        }

        return order;
      });

      return { order_number: result.orderNumber, payment_option: result.paymentOption };
    } catch (error) {
      if (error.code === 'P2002' && attempt < ORDER_NUMBER_ATTEMPTS) continue;
      throw error;
    }
  }
}

module.exports = {
  createOrder,
  isAllowedReadyDate,
};
