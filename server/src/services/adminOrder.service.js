
const prisma = require('../lib/prisma');

const ORDER_STATUSES = [
  'menunggu_pembayaran',
  'dikonfirmasi',
  'sedang_disiapkan',
  'siap_diambil',
  'dalam_pengiriman',
  'selesai',
  'dibatalkan',
];

const FULFILLMENT_TYPES = ['pickup', 'delivery'];

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parsePositiveInteger(value, name, fallback, max) {
  if (value === undefined) return fallback;

  if (
    typeof value !== 'string' ||
    !/^\d+$/.test(value)
  ) {
    throw createError(`${name} harus berupa bilangan bulat positif.`, 400);
  }

  const number = Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 1 ||
    number > max
  ) {
    throw createError(`${name} harus berada antara 1 dan ${max}.`, 400);
  }

  return number;
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

async function getOrders(query = {}) {
  const page = parsePositiveInteger(query.page, 'page', 1, 1000000);
  const limit = parsePositiveInteger(query.limit, 'limit', 20, 100);

  const where = {};

  if (query.status !== undefined) {
    if (
      typeof query.status !== 'string' ||
      !ORDER_STATUSES.includes(query.status)
    ) {
      throw createError('Filter status pesanan tidak valid.', 400);
    }

    where.orderStatus = query.status;
  }

  if (query.fulfillmentType !== undefined) {
    if (
      typeof query.fulfillmentType !== 'string' ||
      !FULFILLMENT_TYPES.includes(query.fulfillmentType)
    ) {
      throw createError('Filter jenis pemenuhan tidak valid.', 400);
    }

    where.fulfillmentType = query.fulfillmentType;
  }

  if (query.q !== undefined && typeof query.q !== 'string') {
    throw createError('Parameter pencarian tidak valid.', 400);
  }

  const search = typeof query.q === 'string' ? query.q.trim() : '';

  if (search.length > 100) {
    throw createError('Pencarian maksimal 100 karakter.', 400);
  }

  if (search) {
    where.OR = [
      { orderNumber: { contains: search } },
      {
        user: {
          is: { name: { contains: search } },
        },
      },
      {
        user: {
          is: { email: { contains: search } },
        },
      },
      {
        user: {
          is: { phone: { contains: search } },
        },
      },
    ];
  }

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        orderId: true,
        orderNumber: true,
        fulfillmentType: true,
        readyDate: true,
        timeSlot: true,
        subtotal: true,
        shippingFee: true,
        voucherDiscount: true,
        pointsDiscount: true,
        total: true,
        paymentOption: true,
        paymentStatus: true,
        orderStatus: true,
        pickupCode: true,
        courierName: true,
        createdAt: true,
        user: {
          select: {
            userId: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        _count: {
          select: {
            items: true,
            payments: true,
          },
        },
      },
    }),
    prisma.order.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    orders: toJsonSafe(orders),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
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
