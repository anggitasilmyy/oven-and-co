// services/myOrders.service.js
// FR-17 · FR-19 · FR-20 · BR-07 · BR-08 · BR-11 · C-17 Riwayat Pesanan · C-18 Detail & Tracking — pesanan milik
// pelanggan login. Bentuk sama dengan client services/mock/myOrderViews.js (toOrderCard, toOrderDetail).
// Item memakai data produk terbaru (nama, foto, varian, desain, ketersediaan) tetapi harga tetap salinan saat pesan
// (order_items.unit_price). Membaca tidak pernah mengubah status pesanan.

const prisma = require('../lib/prisma');
const { AVAILABILITY_TYPE, PAYMENT_OPTION, PAYMENT_STATUS, ORDER_STATUS, WHATSAPP_ORDER_MESSAGE } =
  require('../utils/businessConstants');
const { getJakartaDateKey, dateKeyToDbDate } = require('../utils/jakartaDate');
const { buildDesignSummary } = require('./cart.service');
const { getOperatingHoursFor } = require('./operatingHours.service');
const { mapStoreSetting, mapPaymentMethod, mapOperatingHour } = require('./checkout.service');
const { canCancelOrder, canReviewOrder, buildTrackingSteps, buildWhatsAppLink } = require('./orderTracking.service');
const { mapOrder } = require('./orderView.service');
const { NOT_FOUND_MESSAGE } = require('./order.service');

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

/** Relasi item yang dibutuhkan kartu & detail (stok hari ini untuk Pesan Lagi) */
function itemInclude(todayDate) {
  return {
    orderBy: { orderItemId: 'asc' },
    include: {
      product: {
        include: {
          images: { orderBy: [{ sortOrder: 'asc' }, { imageId: 'asc' }], take: 1 },
          dailyStocks: { where: { stockDate: todayDate }, take: 1 },
        },
      },
      variant: true,
      design: { include: { options: { include: { option: true }, orderBy: { optionId: 'asc' } } } },
      review: { select: { reviewId: true } },
    },
  };
}

/** Item pesanan siap tampil (bentuk client orderItemLines + reviewed) */
function toItemLine(item) {
  const { product, variant } = item;
  const isReady = product.availabilityType === AVAILABILITY_TYPE.READY;
  const stock = product.dailyStocks?.[0] ?? null;
  const unitPrice = Number(item.unitPrice);

  return {
    order_item_id: String(item.orderItemId),
    product_id: String(item.productId),
    variant_id: item.variantId == null ? null : String(item.variantId),
    design_id: item.designId == null ? null : String(item.designId),
    name: product.name,
    variant_name: variant?.name ?? null,
    design: buildDesignSummary(item.design),
    note: item.note ?? '',
    quantity: item.quantity,
    availability_type: product.availabilityType,
    image_url: product.images?.[0]?.imageUrl ?? null,
    unit_price: unitPrice,
    line_total: unitPrice * item.quantity,
    remaining_today: isReady ? (stock ? Math.max(0, stock.qtyPlanned - stock.qtySold) : 0) : null,
    available: Boolean(product.isActive) && (!variant || Boolean(variant.isActive)),
    reviewed: Boolean(item.review),
  };
}

/** GET /api/orders — semua pesanan pelanggan, terbaru dulu (tab Aktif/Selesai disaring di halaman) */
async function getMyOrders(userId, now = new Date()) {
  const rows = await prisma.order.findMany({
    where: { userId: BigInt(userId) },
    orderBy: [{ createdAt: 'desc' }, { orderId: 'desc' }],
    include: { items: itemInclude(dateKeyToDbDate(getJakartaDateKey(now))) },
  });

  return rows.map((row) => {
    const order = mapOrder(row);
    const lines = row.items.map(toItemLine);
    return {
      order_number: order.order_number,
      created_at: order.created_at,
      order_status: order.order_status,
      fulfillment_type: order.fulfillment_type,
      ready_date: order.ready_date,
      time_slot: order.time_slot,
      total: order.total,
      item_count: lines.reduce((sum, line) => sum + line.quantity, 0),
      items_summary: lines.map((line) => line.name),
      thumbnails: lines.slice(0, 3).map((line) => ({ name: line.name, image_url: line.image_url })),
      can_review: canReviewOrder(order) && lines.some((line) => !line.reviewed),
    };
  });
}

/** Pesanan milik pelanggan beserta item, pembayaran terbaru, dan riwayat status; 404 bila bukan miliknya */
async function findMyOrderDetailRow(client, userId, orderNumber, now) {
  const row = await client.order.findFirst({
    where: { orderNumber, userId: BigInt(userId) },
    include: {
      items: itemInclude(dateKeyToDbDate(getJakartaDateKey(now))),
      payments: { orderBy: { paymentId: 'desc' }, take: 1, include: { method: true } },
      statusHistories: { orderBy: [{ changedAt: 'asc' }, { historyId: 'asc' }] },
    },
  });

  if (!row) throw httpError(404, NOT_FOUND_MESSAGE);
  return row;
}

/** GET /api/orders/:orderNumber — data lengkap C-18 */
async function getMyOrderDetail(userId, orderNumber, now = new Date()) {
  const [row, storeRow, hourRows] = await Promise.all([
    findMyOrderDetailRow(prisma, userId, orderNumber, now),
    prisma.storeSetting.findFirst({ orderBy: { settingId: 'asc' } }),
    prisma.operatingHour.findMany({ orderBy: { dayOfWeek: 'asc' } }),
  ]);

  if (!storeRow) throw httpError(500, 'Pengaturan toko belum tersedia.');

  const settings = mapStoreSetting(storeRow);
  const order = mapOrder(row);
  const items = row.items.map(toItemLine);
  const method = row.payments[0]?.method ?? null;
  const settled = [ORDER_STATUS.SELESAI, ORDER_STATUS.DIBATALKAN].includes(order.order_status);
  const payAtStore = order.payment_option === PAYMENT_OPTION.PAY_AT_STORE;

  return {
    order,
    items,
    method_name: method ? mapPaymentMethod(method).name : null,
    steps: buildTrackingSteps(order, row.statusHistories.map((h) => ({
      status: h.status, changed_at: new Date(h.changedAt).toISOString(),
    }))),
    store: {
      address: settings.address ?? null,
      whatsapp_link: buildWhatsAppLink(settings.whatsapp_number, WHATSAPP_ORDER_MESSAGE(order.order_number)),
    },
    // BR-07: Bayar di Toko yang belum lunas harus diambil & dibayar sebelum jam tutup pada tanggal siap
    pay_before_time: payAtStore && order.payment_status === PAYMENT_STATUS.UNPAID && !settled
      ? getOperatingHoursFor(hourRows.map(mapOperatingHour), order.ready_date).close_time
      : null,
    can_cancel: canCancelOrder(order),
    can_review: canReviewOrder(order) && items.some((item) => !item.reviewed),
  };
}

module.exports = {
  toItemLine,
  getMyOrders,
  getMyOrderDetail,
};
