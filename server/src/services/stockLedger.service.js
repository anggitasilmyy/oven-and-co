// services/stockLedger.service.js
// CR-04a CP4 · FR-44 · BR-23, BR-24 (Draft 0.8.3 §2.2 – §2.4, §10.1 langkah 8 – 9) — SATU-SATUNYA jalur tulis stok bahan
// untuk dokumen stok AD-07 (saldo awal lewat openingBalance.service). Dipanggil di dalam transaksi runOperation setelah
// kunci yang lebih awal; mengunci baris raw_materials (FOR UPDATE, urut material_id naik), menghitung saldo akhir
// dengan aturan murni CP3 (applyStockDeltas: [0, 99.999.999,99] → 409 STOCK_OUT_OF_RANGE), lalu menulis mutasi (≠ 0)
// dan stok eksak (teks DECIMAL, tanpa float). Urutan tulis: dokumen (oleh pemanggil) → mutasi → UPDATE stok.

const { LEDGER_ERROR_CODE } = require('../utils/businessConstants');
const { applyStockDeltas } = require('./stockLedgerRules.service');

function httpError(statusCode, message, extra = {}) {
  return Object.assign(new Error(message), { statusCode, ...extra });
}

const MATERIAL_NOT_FOUND = 'Bahan baku tidak ditemukan.';

/** Kunci baris bahan (FOR UPDATE) urut material_id naik → Map(material_id → stok teks). 404 bila ada yang tidak ada. */
async function lockMaterials(tx, materialIds) {
  const ids = [...new Set(materialIds.map(String))].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
  const stocks = new Map();
  for (const id of ids) {
    const [row] = await tx.$queryRaw`SELECT stock FROM raw_materials WHERE material_id = ${BigInt(id)} FOR UPDATE`;
    if (!row) throw httpError(404, MATERIAL_NOT_FOUND);
    stocks.set(id, String(row.stock));
  }
  return stocks;
}

/**
 * Tulis mutasi bersih + stok baru untuk rencana dampak (sudah tanpa Δ = 0).
 * @param {object} tx
 * @param {Map<string, string>} lockedStocks — dari lockMaterials
 * @param {{material_id: string, delta: bigint, type: string}[]} plan
 * @param {(row) => {adjustmentId?: bigint, receiptId?: bigint, poItemId?: bigint}} referenceOf — dokumen yang dirujuk
 * @param {string|number|bigint} actorId
 * @returns {Promise<object[]>} mutasi yang ditulis (qty_change, stock_before, stock_after sebagai teks)
 */
async function writeMovements(tx, lockedStocks, plan, referenceOf, actorId) {
  const result = applyStockDeltas(lockedStocks, plan);
  if (result.status !== 200) {
    throw httpError(409, result.message, { apiCode: LEDGER_ERROR_CODE.STOCK_OUT_OF_RANGE, fieldErrors: { materials: result.materials.join(', ') } });
  }
  const written = [];
  for (const m of result.movements) {
    const movement = await tx.materialMovement.create({
      data: {
        materialId: BigInt(m.material_id), type: m.type, qtyChange: m.qty_change, stockBefore: m.stock_before,
        stockAfter: m.stock_after, createdBy: BigInt(actorId), ...referenceOf(m),
      },
      select: { movementId: true },
    });
    written.push({ ...m, movement_id: String(movement.movementId) });
  }
  const changed = new Set(plan.map((row) => String(row.material_id)));
  for (const [id, stock] of result.stocks) {
    if (changed.has(id)) {
      await tx.$executeRaw`UPDATE raw_materials SET stock = CAST(${stock} AS DECIMAL(10,2)) WHERE material_id = ${BigInt(id)}`;
    }
  }
  return written;
}

const movementView = (m) => (m ? {
  movement_id: m.movement_id, type: m.type, qty_change: m.qty_change, stock_before: m.stock_before, stock_after: m.stock_after,
} : null);

module.exports = { MATERIAL_NOT_FOUND, lockMaterials, writeMovements, movementView };
