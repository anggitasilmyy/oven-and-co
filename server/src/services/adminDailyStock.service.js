// services/adminDailyStock.service.js
// Step 6.4 · FR-32 · UC-24 · BR-01 · AD-07 tab "Stok Produk Harian" (Staf & Owner). Kontrak = client
// services/mock/stockAdmin.js (buildDailyStockBoard, saveDailyStockPlans). Hanya produk ready yang aktif; hanya hari
// ini (WIB). Admin mengisi rencana (qty_planned); qty_sold hanya diubah pesanan (dibuat −, batal +, TF-12).
//
// Konkurensi dengan checkout (orderCreate.service takeReadyStock: UPDATE bersyarat qty_planned − qty_sold ≥ qty, baris
// dikunci urut product_id naik):
//   1. kunci master data (pembacaan pertama transaksi; dua simpan admin berurutan);
//   2. per produk, urut product_id NAIK (sama dengan checkout → tidak saling menunggu silang):
//      INSERT … ON DUPLICATE KEY UPDATE memastikan baris hari ini ADA dan langsung terkunci (baris yang belum ada dibuat
//      0/0 lalu ikut rollback bila gagal) — tidak ada gap lock yang ditahan sambil menunggu insert;
//      SELECT … FOR UPDATE membaca qty_sold terbaru (pesanan yang sedang berjalan ditunggu sampai commit);
//   3. validasi rencana ≥ terjual terhadap nilai terkunci, lalu tulis. Checkout yang datang kemudian menunggu kunci
//      baris dan memakai rencana baru.

const prisma = require('../lib/prisma');
const { AVAILABILITY_TYPE, AUDIT_ACTION, AUDIT_ENTITY } = require('../utils/businessConstants');
const { getJakartaDateKey, dateKeyToDbDate } = require('../utils/jakartaDate');
const { getRemainingStock, getDailyStockStatus, validateDailyPlan } = require('./stockRules.service');
const { lockAdminMasterData } = require('./adminMasterDataLock.service');
const { lockAuditActor, recordAudit } = require('./auditLog.service');

const NOT_STOCKED = 'Produk ini bukan produk ready yang aktif';
// daily_stocks.qty_planned INT (SPEC §8): di atas batas kolom ditolak sebagai isian, bukan error database
const QTY_INT_MAX = 2147483647;
const QTY_TOO_LARGE = 'Jumlah terlalu besar';

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

/** Produk yang stok hariannya dikelola: ready & aktif (BR-01) */
const stockedWhere = { isActive: true, availabilityType: AVAILABILITY_TYPE.READY };

/** GET /api/admin/stocks/today — { date, rows } rencana, terjual, sisa, status per produk ready aktif (urut id) */
async function getDailyStockBoard(now = new Date()) {
  const todayKey = getJakartaDateKey(now);
  const products = await prisma.product.findMany({
    where: stockedWhere,
    orderBy: { productId: 'asc' },
    include: {
      category: { select: { name: true } },
      images: { orderBy: [{ sortOrder: 'asc' }, { imageId: 'asc' }], take: 1, select: { imageUrl: true } },
      dailyStocks: { where: { stockDate: dateKeyToDbDate(todayKey) }, take: 1 },
    },
  });
  const rows = products.map((p) => {
    const row = p.dailyStocks[0];
    const stock = row ? { qty_planned: row.qtyPlanned, qty_sold: row.qtySold } : null;
    return {
      product_id: String(p.productId),
      name: p.name,
      category_name: p.category?.name ?? '',
      image_url: p.images[0]?.imageUrl ?? null,
      qty_planned: stock?.qty_planned ?? 0,
      qty_sold: stock?.qty_sold ?? 0,
      remaining: getRemainingStock(stock),
      status: getDailyStockStatus(stock),
    };
  });
  return { date: todayKey, rows };
}

/**
 * PUT /api/admin/stocks/today — simpan rencana beberapa produk sekaligus (semua sah atau tidak ada yang disimpan).
 * Error per produk → 400 { message, fieldErrors: { [product_id]: pesan } } (sama dengan mock).
 * Step 6.5 C5 (FR-37): satu audit per produk yang qty_planned-nya berubah (nilai akhir bila produk dikirim lebih dari
 * sekali; entity daily_stocks, entity_id stock_id). Urutan kunci: pelaku users S → store_settings X → daily_stocks X.
 * @param {string|number|bigint} actorId — req.user.userId
 * @param {Array<{product_id, qty_planned}>|undefined} plans
 */
async function saveDailyStockPlans(actorId, plans, now = new Date()) {
  if (!Array.isArray(plans) || plans.length === 0) throw httpError(400, 'Tidak ada perubahan stok untuk disimpan');
  const todayKey = getJakartaDateKey(now);
  const stockDate = dateKeyToDbDate(todayKey);

  await prisma.$transaction(async (tx) => {
    await lockAuditActor(tx, actorId); // C5 (K5): pelaku S SEBELUM store_settings X
    await lockAdminMasterData(tx);
    const products = await tx.product.findMany({ where: stockedWhere, select: { productId: true } });
    const stocked = new Set(products.map((p) => String(p.productId)));

    const errors = {};
    const keyOf = (plan) => String(plan.product_id);
    const valid = [...new Set(plans.map(keyOf).filter((key) => stocked.has(key)))].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
    plans.filter((plan) => !stocked.has(keyOf(plan))).forEach((plan) => { errors[keyOf(plan)] = NOT_STOCKED; });

    // Kunci baris stok hari ini urut product_id naik; baris yang belum ada dibuat 0/0 (ikut rollback bila gagal)
    const sold = new Map();
    const lockedRows = new Map(); // C5: stock_id & qty_planned terkunci (audit bila berubah)
    for (const key of valid) {
      const productId = BigInt(key);
      await tx.$executeRaw`INSERT INTO daily_stocks (product_id, stock_date, qty_planned, qty_sold)
        VALUES (${productId}, ${stockDate}, 0, 0) ON DUPLICATE KEY UPDATE stock_id = stock_id`;
      const [row] = await tx.$queryRaw`SELECT stock_id, qty_planned, qty_sold FROM daily_stocks
        WHERE product_id = ${productId} AND stock_date = ${stockDate} FOR UPDATE`;
      sold.set(key, Number(row.qty_sold));
      lockedRows.set(key, { stockId: row.stock_id, planned: Number(row.qty_planned) });
    }
    for (const plan of plans.filter((p) => stocked.has(keyOf(p)))) {
      const error = validateDailyPlan(plan.qty_planned, sold.get(keyOf(plan)))
        ?? (Number(plan.qty_planned) > QTY_INT_MAX ? QTY_TOO_LARGE : null);
      if (error) errors[keyOf(plan)] = error;
    }
    if (Object.keys(errors).length) {
      throw Object.assign(httpError(400, Object.values(errors)[0]), { fieldErrors: errors });
    }

    // Rencana terakhir untuk produk yang sama yang dipakai (sama dengan mock)
    const finalPlan = new Map();
    for (const plan of plans) {
      await tx.dailyStock.update({
        where: { productId_stockDate: { productId: BigInt(keyOf(plan)), stockDate } },
        data: { qtyPlanned: Number(plan.qty_planned) },
      });
      finalPlan.set(keyOf(plan), Number(plan.qty_planned));
    }
    // Audit per produk (urut product_id naik, sama dengan urutan kunci) bila rencana akhir ≠ rencana terkunci
    for (const key of valid) {
      const locked = lockedRows.get(key);
      if (finalPlan.get(key) !== locked.planned) {
        await recordAudit(tx, {
          actorId, action: AUDIT_ACTION.UPDATE_DAILY_STOCK_PLAN, entity: AUDIT_ENTITY.DAILY_STOCKS, entityId: locked.stockId, now,
        });
      }
    }
  });

  return getDailyStockBoard(now);
}

module.exports = {
  getDailyStockBoard,
  saveDailyStockPlans,
};
