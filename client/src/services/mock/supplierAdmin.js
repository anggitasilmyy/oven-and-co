// services/mock/supplierAdmin.js
// CR-04a CP6 · FR-41 · UC-33 · BR-17, BR-18, BR-31 · AD-12 tab Supplier — pengganti supplier.service server (CP5) di mode
// mock: validasi aturan murni sama (utils/rules/purchasing.validateSupplier), nama unik tanpa beda huruf, daftar bahan
// pengganti penuh, aktif/nonaktif tanpa hapus; request_id lewat runMockOperation. Respons berbentuk sama dengan API.

import { getTables } from './db';
import { runMockOperation, nextId, nowIso, loadLedgerTables } from './ledgerMock';
import { validateSupplier } from '../../utils/rules/purchasing';
import { materialIds } from '../../utils/rules/purchasePayload';
import { createApiError } from '../../utils/apiErrors';

const NAME_TAKEN = 'Nama supplier sudah dipakai.';
const same = (a, b) => String(a) === String(b);

function view(t, s) {
  const materials = new Map(t.raw_materials.map((m) => [String(m.material_id), m]));
  return {
    supplier_id: String(s.supplier_id), name: s.name, phone: s.phone, email: s.email, address: s.address, contact_person: s.contact_person,
    note: s.note, is_active: s.is_active,
    materials: t.supplier_materials.filter((x) => same(x.supplier_id, s.supplier_id)).sort((a, b) => a.material_id - b.material_id)
      .map((x) => ({ material_id: String(x.material_id), name: materials.get(String(x.material_id))?.name ?? '', unit: materials.get(String(x.material_id))?.unit ?? '' })),
  };
}

const tables = () => getTables('suppliers', 'supplier_materials', 'raw_materials');

export function listSuppliers() {
  const t = tables();
  return [...t.suppliers].sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }) || a.supplier_id - b.supplier_id).map((s) => view(t, s));
}

function validated(t, input, supplierId) {
  const { errors, value } = validateSupplier(input, new Set(t.raw_materials.map((m) => String(m.material_id))));
  if (Object.keys(errors).length) throw createApiError(Object.values(errors)[0], 400, undefined, { fieldErrors: errors });
  if (t.suppliers.some((s) => !same(s.supplier_id, supplierId) && s.name.toLowerCase() === value.name.toLowerCase())) {
    throw createApiError(NAME_TAKEN, 400, undefined, { fieldErrors: { name: NAME_TAKEN } });
  }
  return value;
}

const payload = (input) => ({
  name: input.name ?? null, phone: input.phone ?? null, address: input.address ?? null, email: input.email ?? null,
  contact_person: input.contact_person ?? null, note: input.note ?? null, material_ids: materialIds(input.material_ids),
});
const fields = (v) => ({ name: v.name, phone: v.phone, address: v.address, email: v.email, contact_person: v.contact_person, note: v.note });
const links = (supplierId, ids) => ids.map((id) => ({ supplier_id: supplierId, material_id: Number(id) }));

export function createSupplier(actor, input, { requestId }) {
  return runMockOperation({ requestId, actorId: actor.user_id, operation: 'create_supplier', payload: payload(input), successStatus: 201 }, () => {
    const t = { ...tables(), raw_materials: loadLedgerTables().raw_materials };
    const value = validated(t, input, null);
    const row = { supplier_id: nextId(t.suppliers, 'supplier_id'), ...fields(value), is_active: true, created_by: actor.user_id, created_request_id: requestId, created_at: nowIso(), updated_at: nowIso() };
    const next = { suppliers: [...t.suppliers, row], supplier_materials: [...t.supplier_materials, ...links(row.supplier_id, value.material_ids)] };
    return { data: view({ ...t, ...next }, row), tables: next };
  });
}

function existing(t, supplierId) {
  const s = t.suppliers.find((x) => same(x.supplier_id, supplierId));
  if (!s) throw createApiError('Supplier tidak ditemukan.', 404);
  return s;
}

export function updateSupplier(actor, supplierId, input, { requestId } = {}) {
  return runMockOperation({
    requestId, actorId: actor.user_id, operation: 'update_supplier', targetType: 'supplier', targetId: String(supplierId), payload: payload(input), successStatus: 200,
  }, () => {
    const t = tables();
    const s = existing(t, supplierId);
    const value = validated(t, input, supplierId);
    const row = { ...s, ...fields(value), updated_at: nowIso() };
    const next = {
      suppliers: t.suppliers.map((x) => (same(x.supplier_id, supplierId) ? row : x)),
      supplier_materials: [...t.supplier_materials.filter((x) => !same(x.supplier_id, supplierId)), ...links(s.supplier_id, value.material_ids)],
    };
    return { data: view({ ...t, ...next }, row), tables: next };
  });
}

export function setSupplierActive(actor, supplierId, isActive, { requestId } = {}) {
  return runMockOperation({
    requestId, actorId: actor.user_id, operation: 'set_supplier_active', targetType: 'supplier', targetId: String(supplierId), payload: { is_active: isActive }, successStatus: 200,
  }, () => {
    const t = tables();
    const s = existing(t, supplierId);
    const row = s.is_active === isActive ? s : { ...s, is_active: isActive, updated_at: nowIso() };
    const next = { suppliers: t.suppliers.map((x) => (same(x.supplier_id, supplierId) ? row : x)) };
    return { data: view({ ...t, ...next }, row), tables: next };
  });
}
