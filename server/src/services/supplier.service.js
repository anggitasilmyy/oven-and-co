// services/supplier.service.js
// CR-04a CP5 · FR-41 · UC-33 · BR-17, BR-18, BR-31, BR-34 · K02 + T-01, K03 · AD-12 tab Supplier (Staf & Owner).
// Supplier tidak dihapus, hanya dinonaktifkan; daftar bahan per supplier dari master AD-07 (boleh kosong saat dibuat).
// Validasi: aturan murni CP3 purchasingRules.validateSupplier. Tulis lewat runOperation (request_id: buat WAJIB, ubah &
// aktif/nonaktif opsional). Urutan kunci (Draft 0.8.3 §10.1): users S → operation_requests → store_settings X (ubah
// master; juga menyerialkan cek nama unik) → suppliers FOR UPDATE → supplier_materials FOR UPDATE.
// Perubahan daftar bahan/status supplier tidak mengubah PO yang sudah Dipesan.

const prisma = require('../lib/prisma');
const { AUDIT_ACTION, AUDIT_ENTITY } = require('../utils/businessConstants');
const { lockAdminMasterData } = require('./adminMasterDataLock.service');
const { recordAudit } = require('./auditLog.service');
const { runOperation } = require('./operationRequest.service');
const { validateSupplier } = require('./purchasingRules.service');
const { materialIds } = require('./purchasePayload.service');

const SUPPLIER_NOT_FOUND = 'Supplier tidak ditemukan.';
const NAME_TAKEN = 'Nama supplier sudah dipakai.';

function httpError(statusCode, message, fieldErrors) {
  return Object.assign(new Error(message), { statusCode, ...(fieldErrors ? { fieldErrors } : {}) });
}

const view = (s, materials) => ({
  supplier_id: String(s.supplierId), name: s.name, phone: s.phone, email: s.email, address: s.address,
  contact_person: s.contactPerson, note: s.note, is_active: s.isActive,
  materials: materials.map((m) => ({ material_id: String(m.materialId), name: m.name, unit: m.unit })),
});

async function supplierView(client, supplierId) {
  const s = await client.supplier.findUnique({
    where: { supplierId: BigInt(supplierId) },
    include: { materials: { include: { material: { select: { materialId: true, name: true, unit: true } } }, orderBy: { materialId: 'asc' } } },
  });
  return s ? view(s, s.materials.map((x) => x.material)) : null;
}

/** GET /api/admin/suppliers → seluruh supplier (urut nama) dengan daftar bahannya */
async function listSuppliers() {
  const rows = await prisma.supplier.findMany({
    orderBy: [{ name: 'asc' }, { supplierId: 'asc' }],
    include: { materials: { include: { material: { select: { materialId: true, name: true, unit: true } } }, orderBy: { materialId: 'asc' } } },
  });
  return rows.map((s) => view(s, s.materials.map((x) => x.material)));
}

async function validateInput(tx, input, supplierId) {
  const materials = await tx.rawMaterial.findMany({ select: { materialId: true } });
  const { errors, value } = validateSupplier(input, new Set(materials.map((m) => String(m.materialId))));
  if (Object.keys(errors).length) throw httpError(400, Object.values(errors)[0], errors);
  const sameName = await tx.supplier.findFirst({
    where: { name: value.name, ...(supplierId ? { NOT: { supplierId: BigInt(supplierId) } } : {}) }, select: { supplierId: true },
  });
  if (sameName) throw httpError(400, NAME_TAKEN, { name: NAME_TAKEN }); // kolasi utf8mb4_unicode_ci: tanpa beda huruf besar/kecil
  return value;
}

const supplierPayload = (input) => ({
  name: input.name ?? null, phone: input.phone ?? null, address: input.address ?? null, email: input.email ?? null,
  contact_person: input.contact_person ?? null, note: input.note ?? null,
  material_ids: materialIds(input.material_ids),
});
const fields = (v) => ({ name: v.name, phone: v.phone, address: v.address, email: v.email, contactPerson: v.contact_person, note: v.note });

/** POST /api/admin/suppliers (request_id wajib) → 201 supplier */
async function createSupplier(actorId, input, { requestId, now = new Date() }) {
  return runOperation({
    actorId, requestId, operation: 'create_supplier', targetType: null, targetId: null, payload: supplierPayload(input), successStatus: 201,
  }, async (tx) => {
    await lockAdminMasterData(tx);
    const value = await validateInput(tx, input, null);
    const saved = await tx.supplier.create({ data: { ...fields(value), createdBy: BigInt(actorId), createdRequestId: requestId }, select: { supplierId: true } });
    if (value.material_ids.length) {
      await tx.supplierMaterial.createMany({ data: value.material_ids.map((id) => ({ supplierId: saved.supplierId, materialId: BigInt(id) })) });
    }
    await recordAudit(tx, { actorId, action: AUDIT_ACTION.CREATE_SUPPLIER, entity: AUDIT_ENTITY.SUPPLIERS, entityId: saved.supplierId, now });
    return supplierView(tx, saved.supplierId);
  });
}

async function lockSupplier(tx, supplierId) {
  const [row] = await tx.$queryRaw`SELECT supplier_id, is_active FROM suppliers WHERE supplier_id = ${BigInt(supplierId)} FOR UPDATE`;
  if (!row) throw httpError(404, SUPPLIER_NOT_FOUND);
  await tx.$queryRaw`SELECT supplier_id FROM supplier_materials WHERE supplier_id = ${BigInt(supplierId)} FOR UPDATE`;
  return row;
}

/** PUT /api/admin/suppliers/:id (request_id opsional) — data & daftar bahan (pengganti penuh) */
async function updateSupplier(actorId, supplierId, input, { requestId, now = new Date() } = {}) {
  return runOperation({
    actorId, requestId, operation: 'update_supplier', targetType: 'supplier', targetId: String(supplierId), payload: supplierPayload(input), successStatus: 200,
  }, async (tx) => {
    await lockAdminMasterData(tx);
    await lockSupplier(tx, supplierId);
    const value = await validateInput(tx, input, supplierId);
    const id = BigInt(supplierId);
    await tx.supplier.update({ where: { supplierId: id }, data: fields(value) });
    await tx.supplierMaterial.deleteMany({ where: { supplierId: id, materialId: { notIn: value.material_ids.map(BigInt) } } });
    const current = new Set((await tx.supplierMaterial.findMany({ where: { supplierId: id }, select: { materialId: true } })).map((m) => String(m.materialId)));
    const added = value.material_ids.filter((m) => !current.has(m));
    if (added.length) await tx.supplierMaterial.createMany({ data: added.map((m) => ({ supplierId: id, materialId: BigInt(m) })) });
    await recordAudit(tx, { actorId, action: AUDIT_ACTION.UPDATE_SUPPLIER, entity: AUDIT_ENTITY.SUPPLIERS, entityId: id, now });
    return supplierView(tx, id);
  });
}

/** PATCH /api/admin/suppliers/:id/active { is_active } (request_id opsional); nilai sama → tanpa tulis & tanpa audit */
async function setSupplierActive(actorId, supplierId, isActive, { requestId, now = new Date() } = {}) {
  return runOperation({
    actorId, requestId, operation: 'set_supplier_active', targetType: 'supplier', targetId: String(supplierId), payload: { is_active: isActive }, successStatus: 200,
  }, async (tx) => {
    await lockAdminMasterData(tx);
    const row = await lockSupplier(tx, supplierId);
    if (Boolean(Number(row.is_active)) !== isActive) {
      await tx.supplier.update({ where: { supplierId: BigInt(supplierId) }, data: { isActive } });
      await recordAudit(tx, { actorId, action: AUDIT_ACTION.SET_SUPPLIER_ACTIVE, entity: AUDIT_ENTITY.SUPPLIERS, entityId: supplierId, now });
    }
    return supplierView(tx, supplierId);
  });
}

module.exports = { SUPPLIER_NOT_FOUND, listSuppliers, createSupplier, updateSupplier, setSupplierActive };
