// services/salesReport.service.js
// Step 6.4.7 · FR-33 · UC-27 · BR-019 · AD-08 Laporan Penjualan (Owner). Kontrak = client services/reportService.js
// (mock services/mock/reportViews.js buildReportForFilter): { todayKey, store_name, period, from, to, kpi, daily,
// bestSellers, paymentMethods, transactions }. Ekspor Excel/PDF (UC-28) dibuat di peramban dari respons ini — tidak ada
// endpoint ekspor.
// Konsistensi: KPI, grafik per hari, produk terlaris, metode bayar, dan tabel transaksi dihitung dari SATU hasil query
// pesanan di dalam satu snapshot baca REPEATABLE READ (readSnapshot.service.js); nama toko, metode, dan produk dibaca di
// snapshot yang sama lewat `tx` (berurutan). Jadi omzet = Σ per hari = Σ metode = Σ tabel, dan isi file ekspor = layar.
// Produk terlaris laporan MENYERTAKAN produk yang kini nonaktif (penjualan historis; sama dengan mock, dan jumlahnya
// tetap cocok dengan "Produk Terjual") — berbeda dari Dashboard/Beranda yang menampilkan produk aktif saja.

const {
  ORDER_STATUS, PAYMENT_STATUS, REPORT_BEST_SELLER_LIMIT,
} = require('../utils/businessConstants');
const { getJakartaDateKey, getJakartaDayRange } = require('../utils/jakartaDate');
const { resolveReportRange, buildSalesReport } = require('./reportRules.service');
const { runInReadSnapshot } = require('./readSnapshot.service');

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

/** Pesanan penjualan (lunas & tidak dibatalkan) yang dibuat pada rentang tanggal WIB → baris snake_case */
async function getSalesOrders(tx, from, to) {
  const rows = await tx.order.findMany({
    where: {
      paymentStatus: PAYMENT_STATUS.PAID,
      orderStatus: { not: ORDER_STATUS.DIBATALKAN },
      createdAt: getJakartaDayRange(from, to),
    },
    orderBy: [{ createdAt: 'desc' }, { orderId: 'desc' }],
    select: {
      orderId: true,
      orderNumber: true,
      createdAt: true,
      total: true,
      paymentStatus: true,
      orderStatus: true,
      fulfillmentType: true,
      paymentOption: true,
      user: { select: { name: true } },
      // Metode = pembayaran terbaru (sama dengan AD-03 toAdminOrderRow)
      payments: { orderBy: { paymentId: 'desc' }, take: 1, select: { methodCode: true } },
      items: { select: { productId: true, quantity: true } },
    },
  });
  return rows.map((o) => ({
    order_id: String(o.orderId),
    order_number: o.orderNumber,
    created_at: o.createdAt,
    total: Number(o.total),
    payment_status: o.paymentStatus,
    order_status: o.orderStatus,
    fulfillment_type: o.fulfillmentType,
    payment_option: o.paymentOption,
    customer_name: o.user?.name ?? null,
    method_code: o.payments[0]?.methodCode ?? null,
    items: o.items.map((i) => ({ product_id: String(i.productId), quantity: i.quantity })),
  }));
}

/** Nama produk yang terjual (termasuk produk nonaktif) */
async function getProductNames(tx, orders) {
  const ids = [...new Set(orders.flatMap((o) => o.items.map((i) => i.product_id)))];
  if (ids.length === 0) return new Map();
  const rows = await tx.product.findMany({ where: { productId: { in: ids.map(BigInt) } }, select: { productId: true, name: true } });
  return new Map(rows.map((p) => [String(p.productId), p.name]));
}

/**
 * GET /api/admin/reports/sales
 * @param {{period, from?, to?}} filter — hasil validators/adminReport.validator.js
 */
async function getSalesReport(filter, now = new Date()) {
  const todayKey = getJakartaDateKey(now);
  const range = resolveReportRange(filter, todayKey);
  if (range.error) throw httpError(400, range.error);

  return runInReadSnapshot(async (tx) => {
    const settings = await tx.storeSetting.findFirst({ orderBy: { settingId: 'asc' }, select: { storeName: true } });
    const methodRows = await tx.paymentMethod.findMany({ select: { methodCode: true, name: true, methodGroup: true } });
    const orders = await getSalesOrders(tx, range.from, range.to);
    const productNames = await getProductNames(tx, orders);

    const methods = new Map(methodRows.map((m) => [m.methodCode, { name: m.name, method_group: m.methodGroup }]));
    const report = buildSalesReport({ orders, methods, productNames }, { ...range, bestSellerLimit: REPORT_BEST_SELLER_LIMIT });
    return {
      todayKey,
      store_name: settings?.storeName ?? '',
      period: filter.period,
      from: range.from,
      to: range.to,
      ...report,
    };
  });
}

module.exports = {
  getSalesReport,
};
