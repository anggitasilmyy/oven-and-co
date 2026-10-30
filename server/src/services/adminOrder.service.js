// services/adminOrder.service.js
// FR-28 · AD-03 Daftar Pesanan & AD-04 detail (Staf/Owner).

const prisma = require('../lib/prisma');
const { ADMIN_ORDER_TABS, ADMIN_ORDERS_PAGE_SIZE } = require('../utils/businessConstants');
const { getJakartaDayRange, dbDateToKey } = require('../utils/jakartaDate');
const { validateAdminOrderQuery } = require('../validators/adminOrder.validator');

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// Konversi BigInt, Decimal, dan Date agar aman dikirim sebagai JSON.
function toJsonSafe(value) {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    value &&
    typeof value.toNumber === 'function' &&
    typeof value.toFixed === 'function'
  ) {
    return value.toNumber();
  }

  if (Array.isArray(value)) {
    return value.map(toJsonSafe);
  }

  if (value && typeof value === 'object') {
    const result = {};

    for (const [key, child] of Object.entries(value)) {
      result[key] = toJsonSafe(child);
    }

    return result;
  }

  return value;
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

async function getOrderByNumber(orderNumber) {
  if (
    typeof orderNumber !== 'string' ||
    !orderNumber.trim() ||
    orderNumber.trim().length > 20
  ) {
    throw createError('Nomor pesanan tidak valid.', 400);
  }

  const order = await prisma.order.findUnique({
    where: {
      orderNumber: orderNumber.trim(),
    },
    include: {
      user: {
        select: {
          userId: true,
          name: true,
          email: true,
          phone: true,
        },
      },
      address: {
        select: {
          addressId: true,
          label: true,
          recipientName: true,
          recipientPhone: true,
          fullAddress: true,
          latitude: true,
          longitude: true,
          courierNote: true,
        },
      },
      voucher: {
        select: {
          voucherId: true,
          code: true,
          title: true,
          discountType: true,
          discountValue: true,
        },
      },
      items: {
        orderBy: { orderItemId: 'asc' },
        include: {
          product: {
            select: {
              productId: true,
              name: true,
              availabilityType: true,
              leadTimeDays: true,
            },
          },
          variant: {
            select: {
              variantId: true,
              name: true,
              extraPrice: true,
            },
          },
          design: {
            select: {
              designId: true,
              writingText: true,
              writingColor: true,
              referencePhotoUrl: true,
              readyDate: true,
              price: true,
            },
          },
        },
      },
      payments: {
        orderBy: { paymentId: 'desc' },
        include: {
          method: {
            select: {
              methodCode: true,
              name: true,
              methodGroup: true,
            },
          },
        },
      },
      statusHistories: {
        orderBy: { changedAt: 'asc' },
        include: {
          changer: {
            select: {
              userId: true,
              name: true,
              role: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    throw createError('Pesanan tidak ditemukan.', 404);
  }

  return toJsonSafe(order);
}

module.exports = {
  getOrders,
  getOrderByNumber,
};
