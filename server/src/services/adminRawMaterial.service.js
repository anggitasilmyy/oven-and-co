// services/adminRawMaterial.service.js
// Step 6.4 · FR-32 · UC-24 · AD-07 tab "Bahan Baku" (Staf & Owner). Kontrak = client services/mock/stockAdmin.js
// (buildRawMaterialBoard, saveRawMaterial, recordMaterialStockIn). Bahan tidak dihapus (tidak ada di mock/SPEC).
//   - Tambah/ubah: diserialkan dengan kunci master data agar nama bahan tetap unik walau dibuat bersamaan
//     (raw_materials.name tidak UNIQUE di SPEC §8 — lihat adminMasterDataLock.service.js).
//   - Stok masuk: baris bahan dikunci (pembacaan pertama transaksi) lalu stock = stock + qty dihitung DECIMAL di MySQL,
//     sehingga dua stok masuk bersamaan tidak saling menimpa.
//   - Ubah (PUT): field stok form adalah "Stok saat ini — untuk koreksi hasil hitung stok" (FR-32). Agar stok masuk
//     tidak pernah tertimpa, PUT mengunci baris bahan (FOR UPDATE, sama dengan stok masuk) lalu:
//       · edit informasi (nama, satuan, minimum) — `stock` tidak dikirim, sama dengan `expected_stock`, atau sama
//         dengan stok terkunci → kolom stock TIDAK ditulis (nilai terbaru database dipakai);
//       · koreksi stok absolut (`stock` berbeda) → `expected_stock` WAJIB (stok yang dilihat admin saat form dibuka,
//         pola `from` AD-04): tanpa expected → 400, expected ≠ stok terkunci → 409; keduanya `fieldErrors.stock`.
//     Urutan kunci PUT: master data → baris bahan; stok masuk: baris bahan saja (tidak bisa saling menunggu silang).

const prisma = require('../lib/prisma');
const { CATALOG_FIELD_MAX, MAX_MATERIAL_QTY } = require('../utils/businessConstants');
const { getMaterialStatus, validateMaterial, validateStockIn } = require('./stockRules.service');
const { lockAdminMasterData } = require('./adminMasterDataLock.service');

const NOT_FOUND_MESSAGE = 'Bahan baku tidak ditemukan.';
const STOCK_CHANGED = 'Stok bahan sudah berubah (ada stok masuk atau perubahan lain). Muat ulang data lalu ulangi koreksi stok.';
const EXPECTED_STOCK_REQUIRED = 'Koreksi stok wajib menyertakan stok awal form (expected_stock). Muat ulang data lalu ulangi koreksi stok.';
const EXPECTED_STOCK_INVALID = 'Stok awal form tidak valid. Muat ulang data.';
const isBlank = (v) => v == null || String(v).trim() === '';
const cents = (n) => Math.round(Number(n) * 100);
const isDecimal = (v) => /^\d+(\.\d{1,2})?$/.test(String(v ?? '').trim());
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
 * Stok yang ditulis PUT, dari stok terkunci (null = kolom stock tidak ditulis). Lihat aturan di kepala berkas.
 * @param {{stock?, expected_stock?}} input
 * @param {string} lockedStock — stok baris terkunci (DECIMAL sebagai string)
 */
function resolveStockUpdate(input, lockedStock) {
  if (isBlank(input.stock)) return null;
  const hasExpected = !isBlank(input.expected_stock);
  if (hasExpected && !isDecimal(input.expected_stock)) throw httpError(400, EXPECTED_STOCK_INVALID);
  // Edit informasi: stok kiriman = stok saat form dibuka, atau = stok database → stok tidak disentuh
  if ((hasExpected && cents(input.stock) === cents(input.expected_stock)) || cents(input.stock) === cents(lockedStock)) {
    return null;
  }
  // Koreksi absolut
  if (!hasExpected) throw Object.assign(httpError(400, EXPECTED_STOCK_REQUIRED), { fieldErrors: { stock: EXPECTED_STOCK_REQUIRED } });
  if (cents(lockedStock) !== cents(input.expected_stock)) {
    throw Object.assign(httpError(409, STOCK_CHANGED), { fieldErrors: { stock: STOCK_CHANGED } });
  }
  return String(input.stock).trim();
}

/**
 * POST /api/admin/raw-materials (materialId null) & PUT /api/admin/raw-materials/:id — nama, satuan, stok, minimum.
 * POST: stok awal wajib. PUT: `stock` opsional (lihat resolveStockUpdate). Error per field → 400 { message, fieldErrors }.
 */
async function saveRawMaterial(materialId, input) {
  return prisma.$transaction(async (tx) => {
    await lockAdminMasterData(tx);
    // PUT: kunci baris bahan sebelum membaca apa pun (sama dengan stok masuk) → stok terkunci = nilai terbaru
    const [locked] = materialId == null
      ? [null]
      : await tx.$queryRaw`SELECT stock FROM raw_materials WHERE material_id = ${BigInt(materialId)} FOR UPDATE`;
    if (materialId != null && !locked) throw httpError(404, NOT_FOUND_MESSAGE);

    const materials = (await tx.rawMaterial.findMany({ orderBy: { materialId: 'asc' } })).map(mapMaterial);
    const existing = materialId == null ? null : materials.find((m) => m.material_id === String(materialId));
    // Edit tanpa `stock` divalidasi dengan stok terkunci (nilai yang akan tetap tersimpan)
    const checked = existing && isBlank(input.stock) ? { ...input, stock: String(locked.stock) } : input;
    const errors = validateMaterial(checked, materials, existing?.material_id ?? null, MATERIAL_LIMITS);
    if (Object.keys(errors).length) {
      throw Object.assign(httpError(400, Object.values(errors)[0]), { fieldErrors: errors });
    }
    const stock = existing ? resolveStockUpdate(input, String(locked.stock)) : String(input.stock).trim();
    const data = {
      name: String(input.name).trim(),
      unit: String(input.unit).trim(),
      ...(stock == null ? {} : { stock }),
      minStock: String(input.min_stock).trim(),
    };
    const saved = existing
      ? await tx.rawMaterial.update({ where: { materialId: BigInt(existing.material_id) }, data })
      : await tx.rawMaterial.create({ data });
    return mapMaterial(saved);
  });
}

/** POST /api/admin/raw-materials/:id/stock-in { qty } — "Catat Stok Masuk": stok bertambah sejumlah barang diterima */
async function recordStockIn(materialId, qty) {
  return prisma.$transaction(async (tx) => {
    const id = BigInt(materialId);
    const [locked] = await tx.$queryRaw`SELECT stock FROM raw_materials WHERE material_id = ${id} FOR UPDATE`;
    if (!locked) throw httpError(404, NOT_FOUND_MESSAGE);
    const error = validateStockIn(qty, Number(locked.stock), MAX_MATERIAL_QTY);
    if (error) throw httpError(400, error);

    await tx.$executeRaw`UPDATE raw_materials SET stock = stock + CAST(${String(qty).trim()} AS DECIMAL(10,2))
      WHERE material_id = ${id}`;
    return mapMaterial(await tx.rawMaterial.findUnique({ where: { materialId: id } }));
  });
}

module.exports = {
  getRawMaterialBoard,
  saveRawMaterial,
  recordStockIn,
};
