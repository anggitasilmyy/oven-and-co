// services/checkout.service.js
// FR-12 · FR-13 · BR-09 · BR-10 · BR-12 · C-13 Checkout — konteks checkout pelanggan login

const prisma = require('../lib/prisma');
// Kolom @db.Date / @db.Time dibaca dengan helper bersama (sama dengan product & cart service)
const {
  getJakartaDateKey,
  dbDateToKey: toDateKey,
  formatTime: toTimeString,
} = require('../utils/jakartaDate');

function createError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function numberOrNull(value) {
  return value == null ? null : Number(value);
}

function toIsoString(value) {
  if (value == null) return null;

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapStoreSetting(row) {
  return {
    setting_id: row.settingId,
    store_name: row.storeName,
    address: row.address,
    latitude: numberOrNull(row.latitude),
    longitude: numberOrNull(row.longitude),
    whatsapp_number: row.whatsappNumber,
    preorder_cutoff_time: toTimeString(row.preorderCutoffTime),
    delivery_radius_km: numberOrNull(row.deliveryRadiusKm),
    delivery_fee_per_km: numberOrNull(row.deliveryFeePerKm),
    payment_timeout_minutes: row.paymentTimeoutMinutes,
    earn_amount_per_point: Number(row.earnAmountPerPoint),
    redeem_points_unit: row.redeemPointsUnit,
    redeem_value: Number(row.redeemValue),
    gold_min_points: row.goldMinPoints,
    platinum_min_points: row.platinumMinPoints,
    review_bonus_points: row.reviewBonusPoints,
  };
}

function mapAddress(row) {
  return {
    address_id: String(row.addressId),
    user_id: String(row.userId),
    label: row.label,
    recipient_name: row.recipientName,
    recipient_phone: row.recipientPhone,
    full_address: row.fullAddress,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    courier_note: row.courierNote,
    is_primary: row.isPrimary,
  };
}

function mapVoucher(row) {
  return {
    voucher_id: String(row.voucherId),
    code: row.code,
    title: row.title,
    discount_type: row.discountType,
    discount_value: Number(row.discountValue),
    product_id: row.productId == null ? null : String(row.productId),
    quota: row.quota,
    valid_from: toDateKey(row.validFrom),
    valid_to: toDateKey(row.validTo),
    is_active: row.isActive,
  };
}

function mapClaim(row) {
  return {
    user_id: String(row.userId),
    voucher_id: String(row.voucherId),
    claimed_at: toIsoString(row.claimedAt),
    used_at: toIsoString(row.usedAt),
  };
}

function mapPaymentMethod(row) {
  return {
    method_code: row.methodCode,
    name: row.name,
    method_group: row.methodGroup,
    is_active: row.isActive,
  };
}

function mapOperatingHour(row) {
  return {
    hour_id: row.hourId,
    day_of_week: row.dayOfWeek,
    open_time: toTimeString(row.openTime),
    close_time: toTimeString(row.closeTime),
    is_open: row.isOpen,
  };
}

function distanceKm(a, b) {
  if (
    a.latitude == null ||
    a.longitude == null ||
    b.latitude == null ||
    b.longitude == null
  ) {
    return null;
  }

  const values = [
    Number(a.latitude),
    Number(a.longitude),
    Number(b.latitude),
    Number(b.longitude),
  ];

  if (!values.every(Number.isFinite)) return null;

  const rad = (degree) => (degree * Math.PI) / 180;

  const dLat = rad(values[2] - values[0]);
  const dLng = rad(values[3] - values[1]);

  const h = Math.min(
    1,
    Math.max(
      0,
      Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(values[0])) *
          Math.cos(rad(values[2])) *
          Math.sin(dLng / 2) ** 2
    )
  );

  return Math.round(
    2 * 6371 * Math.asin(Math.sqrt(h)) * 100
  ) / 100;
}

function getDeliveryQuote(distance, settings) {
  const withinRadius =
    distance !== null &&
    settings.delivery_radius_km != null &&
    distance <= Number(settings.delivery_radius_km);

  const fee = withinRadius
    ? Math.ceil(distance) * Number(settings.delivery_fee_per_km ?? 0)
    : 0;

  return {
    distance,
    withinRadius,
    fee,
  };
}

function isVoucherActiveOn(voucher, todayKey) {
  return Boolean(
    voucher.is_active &&
      voucher.quota > 0 &&
      voucher.valid_from &&
      voucher.valid_to &&
      voucher.valid_from <= todayKey &&
      todayKey <= voucher.valid_to
  );
}

async function getCheckoutContext(userId) {
  const userIdString = String(userId ?? '');

  if (!/^\d+$/.test(userIdString)) {
    throw createError('Identitas pengguna tidak valid.', 401);
  }

  const userIdBigInt = BigInt(userIdString);
  const now = new Date();
  const todayKey = getJakartaDateKey(now);

  const [
    storeRow,
    addressRows,
    userVoucherRows,
    pointRows,
    paymentRows,
    operatingRows,
  ] = await Promise.all([
    prisma.storeSetting.findFirst({
      orderBy: { settingId: 'asc' },
    }),

    prisma.address.findMany({
      where: { userId: userIdBigInt },
      orderBy: [
        { isPrimary: 'desc' },
        { addressId: 'asc' },
      ],
    }),

    prisma.userVoucher.findMany({
      where: { userId: userIdBigInt },
      include: { voucher: true },
      orderBy: { claimedAt: 'desc' },
    }),

    prisma.pointTransaction.findMany({
      where: { userId: userIdBigInt },
      select: { points: true },
    }),

    prisma.paymentMethod.findMany({
      where: { isActive: true },
      orderBy: [
        { methodGroup: 'asc' },
        { name: 'asc' },
      ],
    }),

    prisma.operatingHour.findMany({
      orderBy: { dayOfWeek: 'asc' },
    }),
  ]);

  if (!storeRow) {
    throw createError('Pengaturan toko belum tersedia.', 500);
  }

  const settings = mapStoreSetting(storeRow);

  const addresses = addressRows.map((row) => {
    const address = mapAddress(row);
    const distance = distanceKm(settings, address);

    return {
      ...address,
      ...getDeliveryQuote(distance, settings),
    };
  });

  const vouchers = userVoucherRows
    .filter((row) => row.voucher)
    .map((row) => {
      const claim = mapClaim(row);
      const voucher = mapVoucher(row.voucher);

      return {
        claim,
        voucher,
        usable:
          !claim.used_at &&
          isVoucherActiveOn(voucher, todayKey),
      };
    });

  const pointBalance = pointRows.reduce(
    (sum, transaction) => sum + transaction.points,
    0
  );

  return {
    store: {
      name: settings.store_name,
      address: settings.address,
      latitude: settings.latitude,
      longitude: settings.longitude,
    },
    settings,
    addresses,
    vouchers,
    point_balance: pointBalance,
    payment_methods: paymentRows.map(mapPaymentMethod),
    operating_hours: operatingRows.map(mapOperatingHour),
    today_key: todayKey,
    now: now.toISOString(),
  };
}

module.exports = {
  getCheckoutContext,
};
