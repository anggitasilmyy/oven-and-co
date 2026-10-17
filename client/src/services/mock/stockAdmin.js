// services/mock/stockAdmin.js
// Step 5.7 · FR-32 · UC-24 · TF-12 · AD-07 — stok produk harian & bahan baku di mode mock
// Pengganti /api/admin/stocks & /api/admin/raw-materials (Step 6.4).
// Stok ready berkurang saat pesanan dibuat dan kembali saat dibatalkan (orderEffects/orderCancellation);
// di sini admin hanya mengisi rencana (qty_planned). qty_sold tidak pernah diubah dari layar Stok.

import { getTables, updateTable, nextUserRowId, USER_ROW_ID_START } from './db';
import { getMockTodayKey } from './mockClock';
import { getRemainingStock, getDailyStockStatus, validateDailyPlan, getMaterialStatus, validateMaterial, validateStockIn, addDecimal } from '../../utils/businessRules';
import { AVAILABILITY_TYPE } from '../../constants/product';
import { PRODUCT_FIELD_MAX, MAX_MATERIAL_QTY } from '../../constants/adminCatalog';

const fail = (message) => { throw new Error(message); };
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
  const rows = getTables('raw_materials').raw_materials
    .map((m) => ({ ...m, status: getMaterialStatus(m) }))
    .sort((a, b) => a.material_id - b.material_id);
  const summary = { aman: 0, menipis: 0, habis: 0 };
  rows.forEach((r) => { summary[r.status] += 1; });
  return { rows, summary };
}

/** Tambah (materialId = null) atau ubah bahan baku: nama, satuan, stok, batas minimum */
export function saveRawMaterial(materialId, input) {
  const { raw_materials: materials } = getTables('raw_materials');
  const existing = materialId == null ? null : (materials.find((m) => m.material_id === Number(materialId)) ?? fail('Bahan baku tidak ditemukan'));
  const errors = validateMaterial(input, materials, existing?.material_id ?? null, MATERIAL_LIMITS);
  if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { fieldErrors: errors });
  const row = {
    material_id: existing?.material_id ?? nextUserRowId(materials, 'material_id'),
    name: String(input.name).trim(),
    unit: String(input.unit).trim(),
    stock: Number(input.stock),
    min_stock: Number(input.min_stock),
  };
  updateTable('raw_materials', (rows) => (existing ? rows.map((m) => (m.material_id === row.material_id ? row : m)) : [...rows, row]));
  return { ...row, status: getMaterialStatus(row) };
}

/** "Catat Stok Masuk": stok bahan bertambah sejumlah barang yang diterima */
export function recordMaterialStockIn(materialId, qty) {
  const { raw_materials: materials } = getTables('raw_materials');
  const existing = materials.find((m) => m.material_id === Number(materialId)) ?? fail('Bahan baku tidak ditemukan');
  const error = validateStockIn(qty, existing.stock, MAX_MATERIAL_QTY);
  if (error) fail(error);
  const row = { ...existing, stock: addDecimal(existing.stock, qty) };
  updateTable('raw_materials', (rows) => rows.map((m) => (m.material_id === row.material_id ? row : m)));
  return { ...row, status: getMaterialStatus(row) };
}
