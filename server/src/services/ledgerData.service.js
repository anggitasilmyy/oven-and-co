// services/ledgerData.service.js
// FR-44 · BR-23 · CR-04a CP2 — memuat data buku mutasi per bahan untuk pemeriksa (db:check-ledger) dan preflight seed.
// Hanya membaca. DECIMAL dibaca sebagai string lewat CAST(... AS CHAR) — tidak pernah lewat Number(). `client` boleh
// PrismaClient atau transaksi interaktif (`tx`); untuk konsistensi antar-query panggil di dalam satu snapshot.

const idList = (ids) => ids.map((id) => BigInt(id));

async function query(client, sql, ids) {
  return ids ? client.$queryRawUnsafe(sql, ...idList(ids)) : client.$queryRawUnsafe(sql);
}

const where = (column, ids) => (ids ? `WHERE ${column} IN (${ids.map(() => '?').join(', ')})` : '');
const str = (value) => (value === null || value === undefined ? null : String(value));

/**
 * @param {object} client — PrismaClient / Prisma.TransactionClient
 * @param {Array<string|number|bigint>|null} materialIds — null = semua bahan
 * @returns {Promise<Array<{materialId, name, stock, adjustments, movements, receiptLines}>>}
 */
async function loadLedgerMaterials(client, materialIds = null) {
  if (Array.isArray(materialIds) && materialIds.length === 0) return [];
  const ids = materialIds;
  const materials = await query(client, `SELECT material_id, name, CAST(stock AS CHAR) AS stock
    FROM raw_materials ${where('material_id', ids)} ORDER BY material_id`, ids);
  const adjustments = await query(client, `SELECT adjustment_id, material_id, kind, CAST(qty AS CHAR) AS qty,
    CAST(counted_stock AS CHAR) AS counted_stock, CAST(system_stock AS CHAR) AS system_stock, reverses_id, replaces_id,
    opening_material_id, operation_request_id, created_at FROM stock_adjustments ${where('material_id', ids)}
    ORDER BY adjustment_id`, ids);
  const movements = await query(client, `SELECT movement_id, material_id, type, CAST(qty_change AS CHAR) AS qty_change,
    CAST(stock_before AS CHAR) AS stock_before, CAST(stock_after AS CHAR) AS stock_after, adjustment_id, receipt_id,
    po_item_id, created_at FROM material_movements ${where('material_id', ids)} ORDER BY movement_id`, ids);
  const lines = await query(client, `SELECT l.receipt_id, l.po_item_id, CAST(l.qty AS CHAR) AS qty, r.kind,
    r.operation_request_id, r.created_at, i.material_id FROM goods_receipt_lines l
    JOIN goods_receipts r ON r.receipt_id = l.receipt_id JOIN purchase_order_items i ON i.po_item_id = l.po_item_id
    ${where('i.material_id', ids)} ORDER BY l.line_id`, ids);

  const byMaterial = new Map(materials.map((m) => [String(m.material_id), {
    materialId: String(m.material_id), name: m.name, stock: m.stock, adjustments: [], movements: [], receiptLines: [],
  }]));
  for (const a of adjustments) {
    byMaterial.get(String(a.material_id))?.adjustments.push({
      adjustmentId: String(a.adjustment_id), kind: a.kind, qty: a.qty, countedStock: a.counted_stock,
      systemStock: a.system_stock, reversesId: str(a.reverses_id), replacesId: str(a.replaces_id),
      openingMaterialId: str(a.opening_material_id), operationRequestId: a.operation_request_id, createdAt: a.created_at,
    });
  }
  for (const mv of movements) {
    byMaterial.get(String(mv.material_id))?.movements.push({
      movementId: String(mv.movement_id), materialId: String(mv.material_id), type: mv.type, qtyChange: mv.qty_change,
      stockBefore: mv.stock_before, stockAfter: mv.stock_after, adjustmentId: str(mv.adjustment_id),
      receiptId: str(mv.receipt_id), poItemId: str(mv.po_item_id), createdAt: mv.created_at,
    });
  }
  for (const l of lines) {
    byMaterial.get(String(l.material_id))?.receiptLines.push({
      receiptId: String(l.receipt_id), poItemId: String(l.po_item_id), qty: l.qty, kind: l.kind,
      operationRequestId: l.operation_request_id, createdAt: l.created_at,
    });
  }
  return [...byMaterial.values()];
}

module.exports = { loadLedgerMaterials };
