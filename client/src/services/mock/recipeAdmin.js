// services/mock/recipeAdmin.js
// CR-03 CP6 · FR-39 · UC-31 · BR-13 · AD-06 — komposisi bahan per produk di mode mock (pengganti
// GET|PUT /api/admin/products/:id/materials, CR-03 §B7.1 – §B7.2). Bentuk respons, pesan, dan fieldErrors sama dengan
// server; validasi memakai aturan murni utils/rules/recipe.js (port server). Takaran disimpan sebagai string desimal
// 3 angka (setara DECIMAL(10,3)) dan dikirim balik sebagai number lewat fail-safe presisi. Mock tidak mencatat audit
// (audit log tanpa layar, B7.4).

import { getTables, updateTable } from './db';
import { createApiError } from '../../utils/apiErrors';
import {
  validateRecipeItems, isRecipeChanged, decimalToMilli, milliToDecimalString, milliToNumber,
} from '../../utils/rules/recipe';

const ID_PATTERN = /^[1-9]\d*$/;

function findProduct(products, productId) {
  if (!ID_PATTERN.test(String(productId))) throw createApiError('ID produk tidak valid.', 400, 'INVALID_ID');
  return products.find((p) => String(p.product_id) === String(productId)) ?? (() => {
    throw createApiError('Produk tidak ditemukan.', 404);
  })();
}

/** Bentuk B7.1: ID string, qty_per_unit number, satuan = raw_materials.unit saat ini (AC-39.5); urut material_id */
function toRecipeView(product, recipeRows, materials) {
  const byId = new Map(materials.map((m) => [String(m.material_id), m]));
  const items = recipeRows
    .filter((r) => String(r.product_id) === String(product.product_id))
    .sort((a, b) => Number(a.material_id) - Number(b.material_id))
    .map((r) => {
      const m = byId.get(String(r.material_id));
      return { material_id: String(r.material_id), name: m?.name ?? '', unit: m?.unit ?? '', qty_per_unit: milliToNumber(decimalToMilli(r.qty_per_unit)) };
    });
  return { product_id: String(product.product_id), product_name: product.name, availability_type: product.availability_type, items };
}

/** GET /api/admin/products/:id/materials — produk aktif maupun nonaktif */
export function buildProductRecipe(productId) {
  const { products, product_materials: recipes, raw_materials: materials } = getTables('products', 'product_materials', 'raw_materials');
  return toRecipeView(findProduct(products, productId), recipes, materials);
}

/** PUT — ganti seluruh komposisi (daftar kosong = kosongkan); isi identik / beda urutan → tanpa tulis (AC-39.8) */
export function saveProductRecipe(productId, body) {
  const { products, product_materials: recipes, raw_materials: materials } = getTables('products', 'product_materials', 'raw_materials');
  const product = findProduct(products, productId);
  const items = body && typeof body === 'object' && !Array.isArray(body) ? body.items : undefined;
  const { errors, items: valid } = validateRecipeItems(items, materials);
  if (Object.keys(errors).length) {
    throw createApiError(Object.values(errors)[0], 400, undefined, { fieldErrors: errors }); // pesan = error pertama (sama server)
  }
  const own = recipes.filter((r) => String(r.product_id) === String(product.product_id));
  if (isRecipeChanged(own, valid)) {
    const rows = valid.map((r) => ({
      product_id: product.product_id, material_id: Number(r.material_id), qty_per_unit: milliToDecimalString(r.qty_per_unit_milli),
    }));
    updateTable('product_materials', (all) => [...all.filter((r) => String(r.product_id) !== String(product.product_id)), ...rows]);
  }
  return buildProductRecipe(productId);
}
