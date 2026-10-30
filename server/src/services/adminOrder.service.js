// services/adminOrder.service.js
// FR-28 · AD-03 Daftar Pesanan & AD-04 detail (Staf/Owner).

const prisma = require('../lib/prisma');
const { ADMIN_ORDER_TABS, ADMIN_ORDERS_PAGE_SIZE, ORDER_STATUS_LABEL } = require('../utils/businessConstants');
const { getJakartaDayRange, dbDateToKey, getJakartaDateKey, dateKeyToDbDate } = require('../utils/jakartaDate');
const { validateAdminOrderQuery } = require('../validators/adminOrder.validator');
const { mapOrder } = require('./orderView.service');
const { itemInclude, toItemLine } = require('./myOrders.service');
const { buildAdminOrderActions } = require('./adminOrderRules.service');

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/** "Classic Butter Croissant ×2, +1 lainnya" (sama dengan client mock/orderViews.js summarizeItems) */
function summarizeItems(items) {
  if (items.length === 0) return '-';
  const [first, ...rest] = items;
  const head = `${first.product?.name ?? 'Produk'} ×${first.quantity}`;
  return rest.length ? `${head}, +${rest.length} lainnya` : head;
}

/** Filter selain tab status — jumlah per tab dihitung setelah filter ini (sama dengan mock matchesFilters) */
function buildFilterWhere({ search, dateFrom, dateTo, fulfillment, methodCode }) {
  const where = {};
  if (search) where.orderNumber = { contains: search };
  // Tanggal pesanan dibuat menurut WIB
  if (dateFrom) where.createdAt = { ...where.createdAt, gte: getJakartaDayRange(dateFrom).gte };
  if (dateTo) where.createdAt = { ...where.createdAt, lt: getJakartaDayRange(dateTo).lt };
  if (fulfillment) where.fulfillmentType = fulfillment;
  if (methodCode) where.payments = { some: { methodCode } };
  return where;
}

/** Baris tabel/kartu AD-03 (bentuk client mock/orderViews.js getAdminOrderRows) */
function toAdminOrderRow(order) {
  const payment = order.payments[0] ?? null;
  return {
    order_id: String(order.orderId),
    order_number: order.orderNumber,
    created_at: order.createdAt.toISOString(),
    customer_name: order.user?.name ?? 'Pelanggan',
    fulfillment_type: order.fulfillmentType,
    ready_date: dbDateToKey(order.readyDate),
    time_slot: order.timeSlot,
    total: Number(order.total),
    payment_option: order.paymentOption,
    payment_status: order.paymentStatus,
    method_code: payment?.methodCode ?? null,
    method_name: payment?.method?.name ?? '-',
    order_status: order.orderStatus,
    item_count: order.items.reduce((sum, item) => sum + item.quantity, 0),
    items_summary: summarizeItems(order.items),
  };
}

/**
 * GET /api/admin/orders — FR-28 · AD-03. Kontrak = client services/adminOrderService.js getAdminOrders:
 * { rows, tabCounts, totalFiltered, page, totalPages, pageSize }, terbaru dulu; halaman di luar rentang
 * disesuaikan ke halaman terakhir (sama dengan mock).
 */
async function getOrders(query = {}) {
  const filters = validateAdminOrderQuery(query);
  const where = buildFilterWhere(filters);

  const grouped = await prisma.order.groupBy({ by: ['orderStatus'], where, _count: { _all: true } });
  const countByStatus = new Map(grouped.map((group) => [group.orderStatus, group._count._all]));
  const countOf = (statuses) => statuses.reduce((sum, status) => sum + (countByStatus.get(status) ?? 0), 0);
  const total = [...countByStatus.values()].reduce((sum, count) => sum + count, 0);
  const tabCounts = Object.fromEntries(
    ADMIN_ORDER_TABS.map((tab) => [tab.key, tab.statuses.length ? countOf(tab.statuses) : total])
  );

  const tab = ADMIN_ORDER_TABS.find((entry) => entry.key === filters.tab);
  const totalFiltered = tabCounts[tab.key];
  const pageSize = ADMIN_ORDERS_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const page = Math.min(filters.page, totalPages);

  const orders = totalFiltered === 0 ? [] : await prisma.order.findMany({
    where: tab.statuses.length ? { ...where, orderStatus: { in: tab.statuses } } : where,
    orderBy: [{ createdAt: 'desc' }, { orderId: 'desc' }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      user: { select: { name: true } },
      payments: { orderBy: { paymentId: 'desc' }, take: 1, include: { method: { select: { name: true } } } },
      items: {
        orderBy: { orderItemId: 'asc' },
        select: { quantity: true, product: { select: { name: true } } },
      },
    },
  });

  return { rows: orders.map(toAdminOrderRow), tabCounts, totalFiltered, page, totalPages, pageSize };
}

// Langkah builder custom cake yang punya kelompok opsi (client constants/customCake.js CUSTOM_CAKE_STEPS)
const CUSTOM_CAKE_OPTION_STEPS = Object.freeze([
  { label: 'Ukuran', group: 'ukuran' },
  { label: 'Bentuk', group: 'bentuk' },
  { label: 'Rasa', group: 'rasa' },
  { label: 'Krim & Topping', group: 'krim_topping' },
]);

/** Spesifikasi custom cake per langkah builder (sama dengan client mock/adminOrderViews.js designSpec) */
function toDesignSpec(design) {
  if (!design) return null;
  const options = (design.options ?? []).map((entry) => entry.option).filter(Boolean);
  return {
    options: CUSTOM_CAKE_OPTION_STEPS.map((step) => ({
      label: step.label,
      value: options.filter((option) => option.optionGroup === step.group).map((option) => option.name).join(', ') || '-',
    })),
    writing_text: design.writingText ?? null,
    writing_color: design.writingColor ?? null,
    reference_photo_url: design.referencePhotoUrl ?? null,
  };
}

/**
 * GET /api/admin/orders/:orderNumber — FR-28 · AD-04. Kontrak = client mock/adminOrderViews.js toAdminOrderDetail:
 * { order, customer, items, payment, status_log, store, actions }.
 * UC-21: kode pickup TIDAK PERNAH dikirim (Staf maupun Owner) — hanya `has_pickup_code`; staf mencocokkan kode
 * yang ditunjukkan pelanggan.
 */
async function getOrderByNumber(orderNumber, now = new Date()) {
  const [row, storeRow] = await Promise.all([
    prisma.order.findUnique({
      where: { orderNumber },
      include: {
        user: { select: { name: true, email: true, phone: true } },
        items: itemInclude(dateKeyToDbDate(getJakartaDateKey(now))),
        payments: { orderBy: { paymentId: 'desc' }, take: 1, include: { method: { select: { name: true } } } },
        statusHistories: {
          orderBy: [{ changedAt: 'desc' }, { historyId: 'desc' }],
          include: { changer: { select: { name: true, role: true } } },
        },
      },
    }),
    prisma.storeSetting.findFirst({
      orderBy: { settingId: 'asc' },
      select: { storeName: true, address: true, whatsappNumber: true },
    }),
  ]);

  if (!row) throw createError('Pesanan tidak ditemukan.', 404);
  if (!storeRow) throw createError('Pengaturan toko belum tersedia.', 500);

  const { pickup_code: pickupCode, ...safeOrder } = mapOrder(row);
  const order = { ...safeOrder, has_pickup_code: Boolean(pickupCode) };
  const payment = row.payments[0] ?? null;

  return {
    order,
    customer: { name: row.user?.name ?? 'Pelanggan', email: row.user?.email ?? null, phone: row.user?.phone ?? null },
    items: row.items.map((item) => ({ ...toItemLine(item), design_spec: toDesignSpec(item.design) })),
    payment: {
      method_name: payment?.method?.name ?? '-',
      status: payment?.status ?? null,
      paid_at: payment?.paidAt ? payment.paidAt.toISOString() : null,
      amount: payment ? Number(payment.amount) : order.total,
    },
    // Terbaru di atas, dengan nama pengubah — admin, pelanggan, atau sistem
    status_log: row.statusHistories.map((history) => ({
      history_id: String(history.historyId),
      status: history.status,
      label: ORDER_STATUS_LABEL[history.status],
      note: history.note ?? null,
      changed_at: history.changedAt.toISOString(),
      changed_by_name: history.changer?.name ?? 'Sistem',
      changed_by_role: history.changer?.role ?? null,
    })),
    store: { name: storeRow.storeName, address: storeRow.address ?? null, whatsapp: storeRow.whatsappNumber ?? null },
    actions: buildAdminOrderActions(order),
  };
}

module.exports = {
  getOrders,
  getOrderByNumber,
};
