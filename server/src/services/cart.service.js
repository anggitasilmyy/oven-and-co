// services/cart.service.js
// FR-11 · FR-04 · BR-01 · BR-02 · BR-03 · C-12 Keranjang — item dari frontend diperkaya dengan data terbaru
// (harga, stok hari ini, tanggal siap). Harga selalu dihitung ulang dari database.
// Desain custom cake hanya boleh dipakai pemiliknya (desain tamu: pemegang design_token yang valid),
// belum pernah dipakai pesanan (sekali pakai, termasuk bila pesanan dibatalkan), dan tanggal siapnya
// masih memenuhi H+3. Baris > 99 unit dan keranjang > 50 baris ditandai, bukan ditolak.

const prisma = require('../lib/prisma');
const {
  AVAILABILITY_TYPE,
  CART_ITEM_MAX_QUANTITY,
  CART_MAX_LINES,
} = require('../utils/businessConstants');
const { canAccessDesign, isDesignAlreadyOrdered } = require('./designAccess.service');
const {
  getJakartaDateKey,
  dateKeyToDbDate,
  dbDateToKey,
} = require('../utils/jakartaDate');
const {
  getEarliestReadyDate,
  getLatestSelectableDate,
  isWithinDateRange,
} = require('./readyDate.service');

/** Alasan baris tidak bisa dipesan (dipakai frontend bila perlu pesan yang lebih jelas) */
const UNAVAILABLE_REASON = Object.freeze({
  PRODUCT_UNAVAILABLE: 'product_unavailable',
  VARIANT_UNAVAILABLE: 'variant_unavailable',
  DESIGN_REQUIRED: 'design_required',
  DESIGN_NOT_FOUND: 'design_not_found',
  DESIGN_MISMATCH: 'design_mismatch',
  DESIGN_ALREADY_ORDERED: 'design_already_ordered',
  DESIGN_EXPIRED: 'design_expired',
  DATE_OUT_OF_RANGE: 'date_out_of_range',
  QUANTITY_EXCEEDS_LIMIT: 'quantity_exceeds_limit',
});

function uniqueBigInts(values) {
  return [...new Set(values.filter(Boolean))].map((value) => BigInt(value));
}

async function loadProducts(items, todayDate) {
  const ids = uniqueBigInts(items.map((item) => item.product_id));

  if (ids.length === 0) return new Map();

  const rows = await prisma.product.findMany({
    where: { productId: { in: ids } },
    include: {
      images: {
        orderBy: [{ sortOrder: 'asc' }, { imageId: 'asc' }],
        take: 1,
      },
      variants: true,
      dailyStocks: {
        where: { stockDate: todayDate },
        take: 1,
      },
    },
  });

  return new Map(rows.map((row) => [String(row.productId), row]));
}

async function loadDesigns(items) {
  const ids = uniqueBigInts(items.map((item) => item.design_id));

  if (ids.length === 0) return new Map();

  const rows = await prisma.customCakeDesign.findMany({
    where: { designId: { in: ids } },
    include: {
      options: {
        include: { option: true },
        orderBy: { optionId: 'asc' },
      },
      // Desain yang sudah masuk pesanan tidak boleh dipakai lagi (Pesan Lagi wajib desain ulang)
      orderItems: {
        select: { orderItemId: true },
        take: 1,
      },
    },
  });

  return new Map(rows.map((row) => [String(row.designId), row]));
}

function buildDesignSummary(design) {
  if (!design) return null;

  return {
    options: design.options
      .map((entry) => entry.option?.name)
      .filter(Boolean)
      .join(' · '),
    writing: design.writingText
      ? `"${design.writingText}" · ${design.writingColor ?? ''}`.trim()
      : null,
    has_reference_photo: Boolean(design.referencePhotoUrl),
  };
}

/** Pemeriksaan desain custom cake; mengembalikan { design, reason } */
function checkDesign(item, product, design, context) {
  const isCustom = product.availabilityType === AVAILABILITY_TYPE.CUSTOM;

  if (!isCustom) {
    return {
      design: null,
      reason: item.design_id ? UNAVAILABLE_REASON.DESIGN_MISMATCH : null,
    };
  }

  if (!item.design_id) {
    return { design: null, reason: UNAVAILABLE_REASON.DESIGN_REQUIRED };
  }

  // Desain milik pelanggan lain / desain tamu tanpa token valid diperlakukan seperti tidak ada
  // (isinya tidak dikirim), agar design_id yang berurutan tidak bisa ditebak untuk membaca desain orang lain.
  const requester = { userId: context.userId, designToken: item.design_token };

  if (!design || !canAccessDesign(design, requester)) {
    return { design: null, reason: UNAVAILABLE_REASON.DESIGN_NOT_FOUND };
  }

  if (design.productId !== product.productId) {
    return { design: null, reason: UNAVAILABLE_REASON.DESIGN_MISMATCH };
  }

  if (isDesignAlreadyOrdered(design)) {
    return { design, reason: UNAVAILABLE_REASON.DESIGN_ALREADY_ORDERED };
  }

  const earliest = getEarliestReadyDate(product, context.now, context.settings);

  if (!isWithinDateRange(dbDateToKey(design.readyDate), earliest, null)) {
    return { design, reason: UNAVAILABLE_REASON.DESIGN_EXPIRED };
  }

  return { design, reason: null };
}

/** Tanggal siap baris non-custom; { readyDate, reason } */
function resolveReadyDate(item, product, context) {
  const earliest = getEarliestReadyDate(product, context.now, context.settings);

  if (product.availabilityType !== AVAILABILITY_TYPE.PREORDER || !item.preferred_date) {
    return { readyDate: earliest, reason: null };
  }

  const latest = getLatestSelectableDate(product.availabilityType, context.now);

  if (item.preferred_date > latest) {
    return { readyDate: earliest, reason: UNAVAILABLE_REASON.DATE_OUT_OF_RANGE };
  }

  // Sama dengan frontend: tanggal yang sudah terlewat digeser ke tanggal siap tercepat
  return {
    readyDate: item.preferred_date > earliest ? item.preferred_date : earliest,
    reason: null,
  };
}

function buildCartLine(item, context) {
  const product = context.products.get(item.product_id) ?? null;
  const rawDesign = item.design_id ? context.designs.get(item.design_id) ?? null : null;

  let reason = null;
  let design = null;
  let variant = null;
  let readyDate = context.todayKey;

  if (!product || !product.isActive) {
    reason = UNAVAILABLE_REASON.PRODUCT_UNAVAILABLE;
  } else {
    if (item.variant_id) {
      variant = product.variants.find((entry) => String(entry.variantId) === item.variant_id) ?? null;

      if (!variant || !variant.isActive) {
        reason = UNAVAILABLE_REASON.VARIANT_UNAVAILABLE;
      }
    }

    const designCheck = checkDesign(item, product, rawDesign, context);
    design = designCheck.design;
    reason = reason ?? designCheck.reason;

    if (product.availabilityType === AVAILABILITY_TYPE.CUSTOM) {
      readyDate = design ? dbDateToKey(design.readyDate) : getEarliestReadyDate(product, context.now, context.settings);
    } else {
      const dateCheck = resolveReadyDate(item, product, context);
      readyDate = dateCheck.readyDate;
      reason = reason ?? dateCheck.reason;
    }

    // Jumlah tidak dipotong diam-diam: baris ditandai agar pelanggan menyesuaikan sebelum checkout
    if (item.quantity > CART_ITEM_MAX_QUANTITY) {
      reason = reason ?? UNAVAILABLE_REASON.QUANTITY_EXCEEDS_LIMIT;
    }
  }

  const isCustom = product?.availabilityType === AVAILABILITY_TYPE.CUSTOM;
  const unitPrice = isCustom
    ? design ? Number(design.price) : item.price
    : product
      ? Number(product.price) + Number(variant?.extraPrice ?? 0)
      : item.price;

  const stock = product?.dailyStocks?.[0] ?? null;
  const isReady = product?.availabilityType === AVAILABILITY_TYPE.READY;

  return {
    cart_item_id: item.cart_item_id,
    product_id: item.product_id,
    variant_id: item.variant_id,
    design_id: item.design_id,
    name: product?.name ?? item.name ?? 'Produk tidak tersedia',
    variant_name: variant?.name ?? null,
    design: buildDesignSummary(design),
    note: item.note,
    quantity: item.quantity,
    availability_type: product?.availabilityType ?? AVAILABILITY_TYPE.READY,
    image_url: product?.images?.[0]?.imageUrl ?? item.image_url ?? null,
    unit_price: unitPrice,
    line_total: unitPrice * item.quantity,
    remaining_today: isReady
      ? stock ? Math.max(0, stock.qtyPlanned - stock.qtySold) : 0
      : null,
    ready_date: readyDate,
    available: reason === null,
    unavailable_reason: reason,
  };
}

/** Produk ready di keranjang melebihi sisa stok hari ini → daftar product_id bermasalah */
function findStockIssues(lines) {
  const totals = new Map();

  for (const line of lines) {
    if (line.availability_type !== AVAILABILITY_TYPE.READY) continue;

    const current = totals.get(line.product_id) ?? {
      product_id: line.product_id,
      quantity: 0,
      remaining: line.remaining_today ?? 0,
    };

    current.quantity += line.quantity;
    totals.set(line.product_id, current);
  }

  return [...totals.values()]
    .filter((entry) => entry.quantity > entry.remaining)
    .map(({ product_id, remaining }) => ({ product_id, remaining }));
}

/** BR-03: pesanan campuran siap pada tanggal item dengan persiapan terlama */
function getCombinedReadyDate(dateKeys) {
  return dateKeys.reduce((latest, date) => (date > latest ? date : latest), dateKeys[0] ?? null);
}

/**
 * @param {Array<object>} items — hasil validators/cart.validator.js
 * @param {{userId?: string|null, now?: Date}} [options]
 */
async function getCartView(items, { userId = null, now = new Date() } = {}) {
  const todayKey = getJakartaDateKey(now);
  const todayDate = dateKeyToDbDate(todayKey);

  const [settings, products, designs] = await Promise.all([
    prisma.storeSetting.findFirst({
      orderBy: { settingId: 'asc' },
      select: { preorderCutoffTime: true },
    }),
    loadProducts(items, todayDate),
    loadDesigns(items),
  ]);

  const context = { now, todayKey, settings, products, designs, userId };
  const lines = items.map((item) => buildCartLine(item, context));
  const validLines = lines.filter((line) => line.available);

  return {
    lines,
    subtotal: validLines.reduce((sum, line) => sum + line.line_total, 0),
    ready_date: getCombinedReadyDate(validLines.map((line) => line.ready_date).filter(Boolean)),
    today_key: todayKey,
    stock_issues: findStockIssues(validLines),
    line_limit: CART_MAX_LINES,
    exceeds_line_limit: lines.length > CART_MAX_LINES,
  };
}

module.exports = {
  UNAVAILABLE_REASON,
  getCartView,
};
