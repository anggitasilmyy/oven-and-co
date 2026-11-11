// services/adminRecipe.service.js
// CR-03 CP4 · FR-39 · UC-31 · BR-13 · AD-06 — komposisi bahan per produk (Staf & Owner).
//   GET  → komposisi satu produk (aktif maupun nonaktif); item urut material_id naik.
//   PUT  → ganti SELURUH komposisi dalam satu transaksi (CR-03 §B7.2.1, CS-1 – CS-5):
//          pelaku users S (lockAuditActor) → store_settings X (lockAdminMasterData) sebagai locking read pertama →
//          baca produk & master bahan → validasi (aturan murni CP3) → baca komposisi lama → bandingkan →
//          bila berubah: hapus + sisip + 1 audit `update_product_recipe`; bila identik: tanpa tulis & tanpa audit.
//          Kegagalan apa pun → rollback penuh (komposisi lama utuh, tanpa audit). Last-write-wins mengikuti urutan
//          perolehan kunci store_settings & commit, bukan urutan kedatangan request.
// Angka respons: JSON number lewat milliToNumber (fail-safe MILLI_PRECISION_LOST, SPEC §5). Untuk takaran
// DECIMAL(10,3) (maks. 9.999.999,999) konversi selalu eksak, sehingga error tersebut tidak dapat terjadi di endpoint ini;
// bila terjadi, diteruskan ke errorHandler apa adanya (pemetaan khusus ditetapkan pada CP5).

const prisma = require('../lib/prisma');
const { AUDIT_ACTION, AUDIT_ENTITY } = require('../utils/businessConstants');
const { lockAdminMasterData } = require('./adminMasterDataLock.service');
const { lockAuditActor, recordAudit } = require('./auditLog.service');
const {
  validateRecipeItems, isRecipeChanged, decimalToMilli, milliToNumber, milliToDecimalString,
} = require('./recipeRules.service');

const NOT_FOUND_MESSAGE = 'Produk tidak ditemukan.';

function httpError(statusCode, message, extra = {}) {
  return Object.assign(new Error(message), { statusCode, ...extra });
}

/** Komposisi tersimpan → bentuk respons CR-03 §B7.1 */
async function readRecipe(client, product) {
  const rows = await client.productMaterial.findMany({
    where: { productId: product.productId },
    include: { material: { select: { name: true, unit: true } } },
    orderBy: { materialId: 'asc' },
  });
  return {
    product_id: String(product.productId),
    product_name: product.name,
    availability_type: product.availabilityType,
    items: rows.map((r) => ({
      material_id: String(r.materialId),
      name: r.material.name,
      unit: r.material.unit,
      qty_per_unit: milliToNumber(decimalToMilli(String(r.qtyPerUnit))),
    })),
  };
}

/** GET /api/admin/products/:id/materials */
async function getProductRecipe(productId) {
  const product = await prisma.product.findUnique({ where: { productId: BigInt(productId) } });
  if (!product) throw httpError(404, NOT_FOUND_MESSAGE);
  return readRecipe(prisma, product);
}

/**
 * PUT /api/admin/products/:id/materials — ganti seluruh komposisi.
 * @param {string|number|bigint} actorId — req.user.userId
 * @param {unknown} rawItems — `items` dari body (divalidasi di sini setelah master bahan dibaca)
 */
async function saveProductRecipe(actorId, productId, rawItems, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await lockAuditActor(tx, actorId); // CS-2: pelaku S lebih dulu (pola K5)
    await lockAdminMasterData(tx); // CS-2: store_settings X — locking read sebelum SELECT biasa apa pun

    const id = BigInt(productId);
    const product = await tx.product.findUnique({ where: { productId: id } });
    if (!product) throw httpError(404, NOT_FOUND_MESSAGE);
    const materials = await tx.rawMaterial.findMany({ orderBy: { materialId: 'asc' } });
    const { errors, items } = validateRecipeItems(rawItems, materials.map((m) => ({ material_id: String(m.materialId) })));
    if (Object.keys(errors).length) throw httpError(400, Object.values(errors)[0], { fieldErrors: errors });

    // CS-4: perbandingan setelah kunci diperoleh (identitas = pasangan material_id + qty_per_unit, urutan diabaikan)
    const stored = await tx.productMaterial.findMany({ where: { productId: id } });
    const before = stored.map((r) => ({ material_id: String(r.materialId), qty_per_unit: String(r.qtyPerUnit) }));
    if (isRecipeChanged(before, items)) {
      await tx.productMaterial.deleteMany({ where: { productId: id } });
      if (items.length) {
        await tx.productMaterial.createMany({
          data: items.map((r) => ({
            productId: id, materialId: BigInt(r.material_id), qtyPerUnit: milliToDecimalString(r.qty_per_unit_milli),
          })),
        });
      }
      await recordAudit(tx, {
        actorId, action: AUDIT_ACTION.UPDATE_PRODUCT_RECIPE, entity: AUDIT_ENTITY.PRODUCTS, entityId: id, now,
      });
    }
    return readRecipe(tx, product);
  });
}

module.exports = {
  getProductRecipe,
  saveProductRecipe,
};
