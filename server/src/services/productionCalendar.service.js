// services/productionCalendar.service.js
// FR-29 · UC-22 · BR-03 · AD-05 Kalender Produksi (Staf & Owner) — GET /api/admin/calendar.
// Kontrak = client services/mock/productionViews.js buildProductionCalendar:
// { month_key, today_key, weeks, counts, selected: { date, groups } }. Data dibaca langsung dari orders & order_items
// (tanpa tabel terpisah), jadi perubahan status di AD-04 langsung tercermin. "Hari ini" menurut WIB.

const prisma = require('../lib/prisma');
const { AVAILABILITY_TYPE, PRODUCTION_STATUSES } = require('../utils/businessConstants');
const { getJakartaDateKey, isValidDateKey, dateKeyToDbDate, dbDateToKey } = require('../utils/jakartaDate');
const { validateCalendarQuery } = require('../validators/adminOrder.validator');
const {
  buildProductionEntries, countProductionByDate, groupProductionList, monthKeyOf, buildMonthGrid,
} = require('./productionRules.service');

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

/** Ringkasan desain custom cake untuk daftar produksi, mis. "Diameter 20 cm · Bulat · Cokelat · Buttercream" */
function designLabel(design) {
  if (!design) return null;
  const names = (design.options ?? []).map((entry) => entry.option?.name).filter(Boolean);
  return [names.join(' · '), design.writingText ? `Tulisan "${design.writingText}"` : null].filter(Boolean).join(' · ');
}

/** Item pesanan → baris datar untuk aturan produksi (snake_case seperti tabel mock) */
function toProductionItem(item) {
  return {
    date: dbDateToKey(item.order.readyDate),
    order_number: item.order.orderNumber,
    order_status: item.order.orderStatus,
    fulfillment_type: item.order.fulfillmentType,
    time_slot: item.order.timeSlot,
    product_id: String(item.productId),
    availability_type: item.product.availabilityType,
    quantity: item.quantity,
    design_id: item.designId == null ? null : String(item.designId),
  };
}

/**
 * Bulan & tanggal kosong → bulan/tanggal hari ini. Bulan tanpa tanggal → hari ini bila ada di bulan itu, selain itu
 * tanggal 1; tanggal di luar bulan yang diminta diperlakukan sama, sehingga panel daftar selalu berada di bulan yang
 * ditampilkan (sama dengan mock).
 */
async function getProductionCalendar(query = {}, now = new Date()) {
  const { month: monthParam, date: dateParam } = validateCalendarQuery(query);
  const todayKey = getJakartaDateKey(now);
  const month = monthParam || monthKeyOf(dateParam || todayKey);
  const fallbackDate = monthKeyOf(todayKey) === month ? todayKey : `${month}-01`;
  const date = dateParam && monthKeyOf(dateParam) === month ? dateParam : fallbackDate;

  const weeks = buildMonthGrid(month);
  const visible = weeks.flat().map((day) => day.date);
  // Grid Desember 9999 melewati batas kolom DATE MySQL
  if (!visible.every(isValidDateKey)) throw httpError(400, 'Bulan tidak valid.');

  const items = await prisma.orderItem.findMany({
    where: {
      order: {
        is: {
          orderStatus: { in: [...PRODUCTION_STATUSES] },
          readyDate: { gte: dateKeyToDbDate(visible[0]), lte: dateKeyToDbDate(visible[visible.length - 1]) },
        },
      },
      product: { is: { availabilityType: { in: [AVAILABILITY_TYPE.PREORDER, AVAILABILITY_TYPE.CUSTOM] } } },
    },
    orderBy: { orderItemId: 'asc' },
    select: {
      productId: true,
      designId: true,
      quantity: true,
      order: { select: { orderNumber: true, orderStatus: true, fulfillmentType: true, timeSlot: true, readyDate: true } },
      product: { select: { name: true, availabilityType: true } },
      design: {
        select: {
          writingText: true,
          options: { orderBy: { optionId: 'asc' }, select: { option: { select: { name: true } } } },
        },
      },
    },
  });

  const entries = buildProductionEntries(items.map(toProductionItem));
  const productName = new Map(items.map((item) => [String(item.productId), item.product.name]));
  const designs = new Map(items.filter((item) => item.designId != null).map((item) => [String(item.designId), item.design]));

  return {
    month_key: month,
    today_key: todayKey,
    weeks,
    counts: countProductionByDate(entries),
    selected: {
      date,
      groups: groupProductionList(entries, date).map((g) => ({
        ...g,
        name: productName.get(g.product_id) ?? 'Produk',
        design_label: g.design_id ? designLabel(designs.get(g.design_id)) : null,
      })),
    },
  };
}

module.exports = {
  getProductionCalendar,
};
