// services/adminRawMaterial.service.js
// Step 6.4 · FR-32 · UC-24 · AD-07 tab "Bahan Baku" (Staf & Owner). Kontrak = client services/mock/stockAdmin.js
// (buildRawMaterialBoard, saveRawMaterial, recordMaterialStockIn). Bahan tidak dihapus (tidak ada di mock/SPEC).
// CR-04a CP4 · FR-44 · BR-23, BR-31 · Draft 0.8.3 §2.7, §5.1, §5.3; Errata E1 B.4: kontrak respons & validasi lama TETAP,
// tetapi setiap perubahan stok kini lewat dokumen + mutasi buku mutasi dalam transaksi yang sama, dengan `request_id`
// opsional (kontrak idempotensi penuh bila dikirim):
//   - Tambah (POST): bahan + saldo awal (createOpeningBalance) dalam satu transaksi; gagal → tidak ada bahan maupun dokumen.
//   - Ubah (PUT): edit informasi tanpa menulis stok; koreksi stok absolut (expected_stock wajib, ≠ stok terkunci → 409)
//     kini dicatat sebagai dokumen stock_opname (sistem = stok terkunci, fisik = stok baru) + mutasi.
//   - Stok masuk: dokumen stok_masuk + mutasi (+qty) + stok baru eksak.
// Urutan kunci (Draft §10.1): pelaku users S → operation_requests → store_settings X (tambah/ubah) → baris bahan X.

const prisma = require('../lib/prisma');
const { CATALOG_FIELD_MAX, MAX_MATERIAL_QTY, AUDIT_ACTION, AUDIT_ENTITY } = require('../utils/businessConstants');
const { getMaterialStatus, validateMaterial, validateStockIn } = require('./stockRules.service');
const { lockAdminMasterData } = require('./adminMasterDataLock.service');
const { recordAudit } = require('./auditLog.service');
const { decimalToCents, centsToDecimalString } = require('./decimalInputRules.service');
const { createOpeningBalance } = require('./openingBalance.service');
const { runOperation } = require('./operationRequest.service');
const { MATERIAL_NOT_FOUND, lockMaterials, writeMovements } = require('./stockLedger.service');

const STOCK_CHANGED = 'Stok bahan sudah berubah (ada stok masuk atau perubahan lain). Muat ulang data lalu ulangi koreksi stok.';
const EXPECTED_STOCK_REQUIRED = 'Koreksi stok wajib menyertakan stok awal form (expected_stock). Muat ulang data lalu ulangi koreksi stok.';
const EXPECTED_STOCK_INVALID = 'Stok awal form tidak valid. Muat ulang data.';
const isBlank = (v) => v == null || String(v).trim() === '';
const isDecimal = (v) => /^\d+(\.\d{1,2})?$/.test(String(v ?? '').trim());
// Nilai yang sudah lolos validasi lama (≤ 2 desimal) → teks 2 desimal eksak; selain itu teks apa adanya (payload kanonik)
const normalizeDecimal = (v) => (isDecimal(v) ? centsToDecimalString(decimalToCents(String(v).trim())) : (isBlank(v) ? null : String(v).trim()));
const MATERIAL_LIMITS = { nameMax: CATALOG_FIELD_MAX.materialName, unitMax: CATALOG_FIELD_MAX.materialUnit, qtyMax: MAX_MATERIAL_QTY };

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

const mapMaterial = (m) => {
  const row = { material_id: String(m.materialId), name: m.name, unit: m.unit, stock: Number(m.stock), min_stock: Number(m.minStock) };
  return { ...row, status: getMaterialStatus(row) };
};

/** GET /api/admin/raw-materials — { rows, summary } bahan + status Aman/Menipis/Habis (urut id) */
async function getRawMaterialBoard() {
  const rows = (await prisma.rawMaterial.findMany({ orderBy: { materialId: 'asc' } })).map(mapMaterial);
  const summary = { aman: 0, menipis: 0, habis: 0 };
  rows.forEach((r) => { summary[r.status] += 1; });
  return { rows, summary };
}

/**
 * Stok yang ditulis PUT, dari stok terkunci (null = kolom stock tidak ditulis). Perbandingan eksak dalam sen (BigInt).
 * @param {{stock?, expected_stock?}} input — stock sudah lolos validasi lama (≤ 2 desimal)
 * @param {string} lockedStock — stok baris terkunci (DECIMAL sebagai teks)
 */
function resolveStockUpdate(input, lockedStock) {
  if (isBlank(input.stock)) return null;
  const hasExpected = !isBlank(input.expected_stock);
  if (hasExpected && !isDecimal(input.expected_stock)) throw httpError(400, EXPECTED_STOCK_INVALID);
  const stock = decimalToCents(String(input.stock).trim());
  const expected = hasExpected ? decimalToCents(String(input.expected_stock).trim()) : null;
  // Edit informasi: stok kiriman = stok saat form dibuka, atau = stok database → stok tidak disentuh
  if ((hasExpected && stock === expected) || stock === decimalToCents(lockedStock)) return null;
  // Koreksi absolut
  if (!hasExpected) throw Object.assign(httpError(400, EXPECTED_STOCK_REQUIRED), { fieldErrors: { stock: EXPECTED_STOCK_REQUIRED } });
  if (decimalToCents(lockedStock) !== expected) throw Object.assign(httpError(409, STOCK_CHANGED), { fieldErrors: { stock: STOCK_CHANGED } });
  return centsToDecimalString(stock);
}

function assertValid(input, materials, existingId) {
  const errors = validateMaterial(input, materials, existingId, MATERIAL_LIMITS);
  if (Object.keys(errors).length) throw Object.assign(httpError(400, Object.values(errors)[0]), { fieldErrors: errors });
}

const materialPayload = (input) => ({
  name: String(input.name ?? '').trim(), unit: String(input.unit ?? '').trim(), stock: normalizeDecimal(input.stock),
  min_stock: normalizeDecimal(input.min_stock), expected_stock: normalizeDecimal(input.expected_stock),
});

/**
 * POST (materialId null) & PUT /api/admin/raw-materials/:id — nama, satuan, stok, minimum. Lihat kepala berkas.
 * Audit `correct_raw_material_stock` HANYA bila stok bahan yang sudah ada benar-benar dikoreksi (Step 6.5 C5).
 * @returns {Promise<{statusCode, body, replay}>}
 */
async function saveRawMaterial(actorId, materialId, input, { requestId, now = new Date() } = {}) {
  const create = materialId == null;
  return runOperation({
    actorId, requestId, operation: create ? 'create_raw_material' : 'update_raw_material', targetType: create ? null : 'raw_material',
    targetId: create ? null : String(materialId), payload: materialPayload(input), successStatus: create ? 201 : 200,
  }, async (tx) => {
    await lockAdminMasterData(tx);
    const locked = create ? null : await lockMaterials(tx, [materialId]);
    const materials = (await tx.rawMaterial.findMany({ orderBy: { materialId: 'asc' } })).map(mapMaterial);
    if (create) {
      assertValid(input, materials, null);
      const saved = await tx.rawMaterial.create({
        data: { name: String(input.name).trim(), unit: String(input.unit).trim(), stock: normalizeDecimal(input.stock), minStock: normalizeDecimal(input.min_stock) },
      });
      const [{ stock }] = await tx.$queryRaw`SELECT CAST(stock AS CHAR) AS stock FROM raw_materials WHERE material_id = ${saved.materialId}`;
      await createOpeningBalance(tx, { materialId: saved.materialId, stock, actorId, requestId: requestId ?? null });
      return mapMaterial(saved);
    }
    const lockedStock = locked.get(String(materialId));
    const existing = materials.find((m) => m.material_id === String(materialId));
    // Edit tanpa `stock` divalidasi dengan stok terkunci (nilai yang akan tetap tersimpan)
    assertValid(isBlank(input.stock) ? { ...input, stock: lockedStock } : input, materials, existing.material_id);
    const stock = resolveStockUpdate(input, lockedStock);
    const saved = await tx.rawMaterial.update({
      where: { materialId: BigInt(materialId) },
      data: { name: String(input.name).trim(), unit: String(input.unit).trim(), minStock: normalizeDecimal(input.min_stock) },
    });
    if (stock == null) return mapMaterial(saved);
    const doc = await tx.stockAdjustment.create({
      data: { materialId: BigInt(materialId), kind: 'stock_opname', countedStock: stock, systemStock: lockedStock, createdBy: BigInt(actorId), operationRequestId: requestId ?? null },
      select: { adjustmentId: true },
    });
    const delta = decimalToCents(stock) - decimalToCents(lockedStock);
    await writeMovements(tx, locked, [{ material_id: String(materialId), delta, type: 'stock_opname' }], () => ({ adjustmentId: doc.adjustmentId }), actorId);
    await recordAudit(tx, { actorId, action: AUDIT_ACTION.CORRECT_RAW_MATERIAL_STOCK, entity: AUDIT_ENTITY.RAW_MATERIALS, entityId: materialId, now });
    return mapMaterial(await tx.rawMaterial.findUnique({ where: { materialId: BigInt(materialId) } }));
  });
}

/**
 * POST /api/admin/raw-materials/:id/stock-in { qty } — "Catat Stok Masuk" (validasi lama tetap). Dokumen stok_masuk +
 * mutasi + stok baru; audit `raw_material_stock_in`. Urutan kunci: pelaku S → operation_requests → baris bahan X.
 * @returns {Promise<{statusCode, body, replay}>}
 */
async function recordStockIn(actorId, materialId, qty, { requestId, now = new Date() } = {}) {
  return runOperation({
    actorId, requestId, operation: 'raw_material_stock_in', targetType: 'raw_material', targetId: String(materialId),
    payload: { qty: normalizeDecimal(qty) }, successStatus: 200,
  }, async (tx) => {
    const locked = await lockMaterials(tx, [materialId]);
    const lockedStock = locked.get(String(materialId));
    const error = validateStockIn(qty, Number(lockedStock), MAX_MATERIAL_QTY);
    if (error) throw httpError(400, error);
    const amount = normalizeDecimal(qty);
    const doc = await tx.stockAdjustment.create({
      data: { materialId: BigInt(materialId), kind: 'stok_masuk', qty: amount, createdBy: BigInt(actorId), operationRequestId: requestId ?? null },
      select: { adjustmentId: true },
    });
    await writeMovements(tx, locked, [{ material_id: String(materialId), delta: decimalToCents(amount), type: 'stok_masuk' }],
      () => ({ adjustmentId: doc.adjustmentId }), actorId);
    await recordAudit(tx, { actorId, action: AUDIT_ACTION.RAW_MATERIAL_STOCK_IN, entity: AUDIT_ENTITY.RAW_MATERIALS, entityId: materialId, now });
    return mapMaterial(await tx.rawMaterial.findUnique({ where: { materialId: BigInt(materialId) } }));
  });
}

module.exports = { MATERIAL_NOT_FOUND, mapMaterial, getRawMaterialBoard, saveRawMaterial, recordStockIn };
