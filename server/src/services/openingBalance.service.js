// services/openingBalance.service.js
// FR-44 · BR-23 · CR-04a CP2 — satu-satunya cara membuat saldo awal bahan di aplikasi (Errata E1 B.1).
// Dipanggil DI DALAM transaksi yang sama dengan pembuatan bahan (seed, dan API buat bahan pada CP4):
//   1. INSERT stock_adjustments kind saldo_awal, qty = stok, opening_material_id = material_id;
//   2. bila stok > 0: INSERT material_movements saldo_awal (stock_before 0, qty_change = stock_after = stok);
//   3. raw_materials.stock TIDAK diubah.
// UNIQUE uq_sa_opening menjamin paling banyak satu saldo awal per bahan; percobaan kedua gagal → transaksi rollback.
// Stok diteruskan sebagai string DECIMAL (dibaca dari baris bahan yang sama) — tanpa konversi ke number.

const { decimalToMilli } = require('./recipeRules.service');
const { isValidStock } = require('./ledgerRules.service');

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {{materialId: bigint|string|number, stock: string, actorId?: bigint|null, requestId?: string|null}} input
 * @returns {Promise<{adjustmentId: bigint, movementId: bigint|null}>}
 */
async function createOpeningBalance(tx, { materialId, stock, actorId = null, requestId = null }) {
  const qty = String(stock).trim();
  if (!isValidStock(qty)) throw new Error(`Saldo awal bahan ${materialId}: stok tidak sah (${stock}).`);
  const id = BigInt(materialId);
  const createdBy = actorId === null || actorId === undefined ? null : BigInt(actorId);
  const doc = await tx.stockAdjustment.create({
    data: {
      materialId: id, kind: 'saldo_awal', qty, openingMaterialId: id, createdBy, operationRequestId: requestId,
    },
    select: { adjustmentId: true, createdAt: true },
  });
  if (decimalToMilli(qty) === 0n) return { adjustmentId: doc.adjustmentId, movementId: null };
  const movement = await tx.materialMovement.create({
    data: {
      materialId: id, type: 'saldo_awal', qtyChange: qty, stockBefore: '0', stockAfter: qty,
      adjustmentId: doc.adjustmentId, createdBy, createdAt: doc.createdAt,
    },
    select: { movementId: true },
  });
  return { adjustmentId: doc.adjustmentId, movementId: movement.movementId };
}

module.exports = { createOpeningBalance };
