// services/mock/stockAdmin.js
// Step 5.7 · FR-32 · UC-24 · TF-12 · AD-07 — stok produk harian & bahan baku di mode mock
// Pengganti /api/admin/stocks & /api/admin/raw-materials (Step 6.4).
// Stok ready berkurang saat pesanan dibuat dan kembali saat dibatalkan (orderEffects/orderCancellation);
// di sini admin hanya mengisi rencana (qty_planned). qty_sold tidak pernah diubah dari layar Stok.

import { getTables, updateTable, nextUserRowId, USER_ROW_ID_START } from './db';
import { getMockTodayKey } from './mockClock';
import { getRemainingStock, getDailyStockStatus, validateDailyPlan, getMaterialStatus, validateMaterial, validateStockIn } from '../../utils/businessRules';
import { decimalToCents, centsToDecimalString } from '../../utils/rules/decimalInput';
import { loadLedgerTables, openingRows, applyMovements, runMockOperation, nextId, nowIso, toDecimalText } from './ledgerMock';
import { AVAILABILITY_TYPE } from '../../constants/product';
import { PRODUCT_FIELD_MAX, MAX_MATERIAL_QTY, MATERIAL_STOCK_MESSAGE } from '../../constants/adminCatalog';
import { resolveExpectedUpdate } from '../../utils/rules/expectedValue';
import { createApiError } from '../../utils/apiErrors';

const fail = (message) => { throw new Error(message); };
const isBlank = (v) => v == null || String(v).trim() === ''; // = adminRawMaterial.service server
const EXPECTED_STOCK_INVALID = 'Stok awal form tidak valid. Muat ulang data.'; // = adminRawMaterial.service server
// CR-04a CP7: status HTTP = server (adminRawMaterial.service / stockLedger.lockMaterials) untuk jalur buku mutasi AD-07
const notFound = () => { throw createApiError('Bahan baku tidak ditemukan.', 404); };
const badRequest = (message, fieldErrors) => { throw createApiError(message, 400, undefined, fieldErrors ? { fieldErrors } : undefined); };
const MATERIAL_LIMITS = { nameMax: PRODUCT_FIELD_MAX.materialName, unitMax: PRODUCT_FIELD_MAX.materialUnit, qtyMax: MAX_MATERIAL_QTY };

/** Produk yang stok hariannya dikelola: ready & aktif (BR-01) */
const isStockedProduct = (p) => p.is_active && p.availability_type === AVAILABILITY_TYPE.READY;

/** Tab "Stok Produk Harian" hari ini: rencana, terjual, sisa, status per produk ready aktif */
export function buildDailyStockBoard() {
  const todayKey = getMockTodayKey();
  const t = getTables('products', 'categories', 'product_images', 'daily_stocks');
  const categories = new Map(t.categories.map((c) => [c.category_id, c.name]));
  const rows = t.products.filter(isStockedProduct).map((p) => {
    const stock = t.daily_stocks.find((s) => s.product_id === p.product_id && s.stock_date === todayKey) ?? null;
    const image = t.product_images.filter((img) => img.product_id === p.product_id).sort((a, b) => a.sort_order - b.sort_order)[0];
    return {
      product_id: p.product_id,
      name: p.name,
      category_name: categories.get(p.category_id) ?? '',
      image_url: image?.image_url ?? null,
      qty_planned: stock?.qty_planned ?? 0,
      qty_sold: stock?.qty_sold ?? 0,
      remaining: getRemainingStock(stock),
      status: getDailyStockStatus(stock),
    };
  });
  return { date: todayKey, rows };
}

/**
 * Simpan rencana stok hari ini untuk beberapa produk sekaligus (semua sah atau tidak ada yang disimpan).
 * @param {Array<{product_id, qty_planned}>} plans
 */
export function saveDailyStockPlans(plans) {
  if (!Array.isArray(plans) || plans.length === 0) fail('Tidak ada perubahan stok untuk disimpan');
  const todayKey = getMockTodayKey();
  const t = getTables('products', 'daily_stocks');
  const errors = {};
  for (const plan of plans) {
    const product = t.products.find((p) => p.product_id === Number(plan.product_id));
    if (!product || !isStockedProduct(product)) { errors[plan.product_id] = 'Produk ini bukan produk ready yang aktif'; continue; }
    const stock = t.daily_stocks.find((s) => s.product_id === product.product_id && s.stock_date === todayKey);
    const error = validateDailyPlan(plan.qty_planned, stock?.qty_sold ?? 0);
    if (error) errors[plan.product_id] = error;
  }
  if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fieldErrors: errors });

  updateTable('daily_stocks', (rows) => {
    let next = [...rows];
    for (const plan of plans) {
      const productId = Number(plan.product_id);
      const qty = Number(plan.qty_planned);
      const index = next.findIndex((s) => s.product_id === productId && s.stock_date === todayKey);
      // Baris yang diisi admin diberi id ≥ USER_ROW_ID_START agar dipertahankan saat data contoh dibuat ulang
      if (index === -1) {
        next = [...next, { stock_id: nextUserRowId(next, 'stock_id'), product_id: productId, stock_date: todayKey, qty_planned: qty, qty_sold: 0 }];
      } else {
        const row = next[index];
        const stock_id = row.stock_id >= USER_ROW_ID_START ? row.stock_id : nextUserRowId(next, 'stock_id');
        next[index] = { ...row, stock_id, qty_planned: qty };
      }
    }
    return next;
  });
  return buildDailyStockBoard();
}

/** Tab "Bahan Baku": bahan + status (Aman/Menipis/Habis) + ringkasan jumlah per status */
export function buildRawMaterialBoard() {
  const rows = loadLedgerTables().raw_materials // CR-04a: saldo awal dipastikan ada (Errata E1.1 §4)
    .map((m) => ({ ...m, status: getMaterialStatus(m) }))
    .sort((a, b) => a.material_id - b.material_id);
  const summary = { aman: 0, menipis: 0, habis: 0 };
  rows.forEach((r) => { summary[r.status] += 1; });
  return { rows, summary };
}

// CR-04a CP6 · FR-44 · BR-23 · Errata E1 B.4: setiap perubahan stok = dokumen + mutasi buku mutasi (ledgerMock), sama
// dengan server CP4 (adminRawMaterial.service): tambah → saldo awal; koreksi stok → stock_opname; stok masuk → stok_masuk.
// request_id opsional (kontrak idempotensi penuh bila dikirim). Validasi & pesan lama AD-07 tetap.
const isDecimal = (v) => /^\d+(\.\d{1,2})?$/.test(String(v ?? '').trim());
const normalizeDecimal = (v) => (isDecimal(v) ? centsToDecimalString(decimalToCents(String(v).trim())) : (v == null || String(v).trim() === '' ? null : String(v).trim()));
const materialPayload = (input) => ({
  name: String(input.name ?? '').trim(), unit: String(input.unit ?? '').trim(), stock: normalizeDecimal(input.stock),
  min_stock: normalizeDecimal(input.min_stock), expected_stock: normalizeDecimal(input.expected_stock),
});
const view = (row) => ({ ...row, status: getMaterialStatus(row) });

/** Tambah (materialId = null) atau ubah bahan baku: nama, satuan, stok, batas minimum */
export function saveRawMaterial(actor, materialId, input, { requestId } = {}) {
  const create = materialId == null;
  return runMockOperation({
    requestId, actorId: actor.user_id, operation: create ? 'create_raw_material' : 'update_raw_material', targetType: create ? null : 'raw_material',
    targetId: create ? null : String(materialId), payload: materialPayload(input), successStatus: create ? 201 : 200,
  }, () => {
    const t = loadLedgerTables();
    const existing = create ? null : (t.raw_materials.find((m) => m.material_id === Number(materialId)) ?? notFound());
    // CP7: ubah tanpa `stock` divalidasi dengan stok saat ini (= server adminRawMaterial: stok terkunci tetap tersimpan)
    const checked = existing && isBlank(input.stock) ? { ...input, stock: existing.stock } : input;
    const errors = validateMaterial(checked, t.raw_materials, existing?.material_id ?? null, MATERIAL_LIMITS);
    if (Object.keys(errors).length) badRequest(Object.values(errors)[0], errors);
    const next = { raw_materials: t.raw_materials, stock_adjustments: t.stock_adjustments, material_movements: t.material_movements };
    if (create) {
      const stock = normalizeDecimal(input.stock);
      const row = { material_id: nextUserRowId(t.raw_materials, 'material_id'), name: String(input.name).trim(), unit: String(input.unit).trim(), stock: Number(stock), min_stock: Number(input.min_stock) };
      next.raw_materials = [...t.raw_materials, row];
      openingRows(next, row.material_id, stock, { actorId: actor.user_id, requestId: requestId ?? null });
      return { data: view(row), tables: next };
    }
    // Step 6.6 (CP6 · G7): aturan expected_stock sama dengan API (400/409 + fieldErrors.stock); stok tidak ditimpa bila tidak dikoreksi
    // CP7: expected_stock bukan desimal ≤ 2 angka → 400 sebelum perbandingan (= resolveStockUpdate server; tanpa ini
    // "7.001" dibulatkan menjadi 7.00 dan koreksi stok ditulis, padahal server menolak)
    if (!isBlank(input.stock) && !isBlank(input.expected_stock) && !isDecimal(input.expected_stock)) badRequest(EXPECTED_STOCK_INVALID);
    const check = resolveExpectedUpdate(input.stock, input.expected_stock, existing.stock, MATERIAL_STOCK_MESSAGE);
    if (check.status) throw createApiError(check.message, check.status, undefined, { fieldErrors: { stock: check.message } });
    const info = { name: String(input.name).trim(), unit: String(input.unit).trim(), min_stock: Number(input.min_stock) };
    next.raw_materials = t.raw_materials.map((m) => (m.material_id === existing.material_id ? { ...m, ...info } : m));
    if (check.write) {
      const counted = normalizeDecimal(input.stock);
      const system = toDecimalText(existing.stock);
      const docId = nextId(t.stock_adjustments, 'adjustment_id');
      next.stock_adjustments = [...t.stock_adjustments, {
        adjustment_id: docId, material_id: existing.material_id, kind: 'stock_opname', qty: null, counted_stock: counted, system_stock: system,
        reverses_id: null, replaces_id: null, reason: null, opening_material_id: null, operation_request_id: requestId ?? null, created_by: actor.user_id, created_at: nowIso(),
      }];
      applyMovements(next, [{ material_id: String(existing.material_id), delta: decimalToCents(counted) - decimalToCents(system), type: 'stock_opname' }],
        () => ({ adjustment_id: docId }), actor.user_id);
    }
    return { data: view(next.raw_materials.find((m) => m.material_id === existing.material_id)), tables: next };
  });
}

/** "Catat Stok Masuk": dokumen stok_masuk + mutasi (+qty); validasi lama tetap */
export function recordMaterialStockIn(actor, materialId, qty, { requestId } = {}) {
  return runMockOperation({
    requestId, actorId: actor.user_id, operation: 'raw_material_stock_in', targetType: 'raw_material', targetId: String(materialId),
    payload: { qty: normalizeDecimal(qty) }, successStatus: 200,
  }, () => {
    const t = loadLedgerTables();
    const existing = t.raw_materials.find((m) => m.material_id === Number(materialId)) ?? notFound();
    const error = validateStockIn(qty, existing.stock, MAX_MATERIAL_QTY);
    if (error) badRequest(error);
    const amount = normalizeDecimal(qty);
    const next = { raw_materials: t.raw_materials, stock_adjustments: t.stock_adjustments, material_movements: t.material_movements };
    const docId = nextId(t.stock_adjustments, 'adjustment_id');
    next.stock_adjustments = [...t.stock_adjustments, {
      adjustment_id: docId, material_id: existing.material_id, kind: 'stok_masuk', qty: amount, counted_stock: null, system_stock: null,
      reverses_id: null, replaces_id: null, reason: null, opening_material_id: null, operation_request_id: requestId ?? null, created_by: actor.user_id, created_at: nowIso(),
    }];
    applyMovements(next, [{ material_id: String(existing.material_id), delta: decimalToCents(amount), type: 'stok_masuk' }], () => ({ adjustment_id: docId }), actor.user_id);
    return { data: view(next.raw_materials.find((m) => m.material_id === existing.material_id)), tables: next };
  });
}
