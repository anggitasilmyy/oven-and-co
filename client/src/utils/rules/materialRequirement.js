// utils/rules/materialRequirement.js
// CR-03 · FR-40 · BR-14 – BR-16 · SPEC §5 "Aturan estimasi kebutuhan bahan" — aturan murni estimasi kebutuhan bahan.
// Port dari server services/materialRequirementRules.service.js; hasil identik (diuji silang di tests/unit).
// Tidak menyimpan dan tidak mengubah stok (BR-15); seluruh angka dihitung dalam BigInt milli-satuan.

import { AVAILABILITY_TYPE } from '../../constants/product';
import {
  MATERIAL_DEMAND_STATUSES, MATERIAL_REQUIREMENT_WINDOW_DAYS, MATERIAL_DEMAND_STATUS,
} from '../../constants/recipe';
import { decimalToMilli, milliToNumber } from './recipe';

const DEMAND_TYPES = [AVAILABILITY_TYPE.PREORDER, AVAILABILITY_TYPE.CUSTOM];
const STATUS_ORDER = [MATERIAL_DEMAND_STATUS.KURANG, MATERIAL_DEMAND_STATUS.MENIPIS, MATERIAL_DEMAND_STATUS.CUKUP];
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Kunci tanggal kalender (UTC, tanpa zona waktu perangkat) — sama dengan server utils/jakartaDate.js
function isValidDateKey(value) {
  if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
function addDaysToDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Jendela tanggal target: hari ini s.d. hari ini + 29 */
export function getRequirementWindow(todayKey) {
  return { from: todayKey, to: addDaysToDateKey(todayKey, MATERIAL_REQUIREMENT_WINDOW_DAYS - 1) };
}

/** Parameter tanggal → { date } atau { error }; kosong = hari ini */
export function resolveRequirementDate(dateParam, todayKey) {
  if (dateParam === undefined || dateParam === null || dateParam === '') return { date: todayKey };
  if (!isValidDateKey(dateParam)) return { error: 'Tanggal tidak valid.' };
  const { from, to } = getRequirementWindow(todayKey);
  if (dateParam < from || dateParam > to) return { error: 'Tanggal di luar rentang.' };
  return { date: dateParam };
}

/** Status per bahan dari sisa (milli): kurang < 0 ≤ menipis ≤ min_stock < cukup */
export function getDemandStatus(remainingMilli, minStockMilli) {
  if (remainingMilli < 0n) return MATERIAL_DEMAND_STATUS.KURANG;
  return remainingMilli <= minStockMilli ? MATERIAL_DEMAND_STATUS.MENIPIS : MATERIAL_DEMAND_STATUS.CUKUP;
}

const add = (map, key, qty) => map.set(key, (map.get(key) ?? 0n) + qty);

/** Jumlah unit per produk (BR-14): daily (tanggal D), backlog (< hari ini), cumulative (tertunggak + hari ini s.d. D) */
export function collectProductQuantities({ todayKey, date, orderItems = [], readyPlans = [] }) {
  const daily = new Map(); const backlog = new Map(); const cumulative = new Map();
  for (const item of orderItems) {
    const qty = BigInt(item.quantity);
    if (qty <= 0n || !MATERIAL_DEMAND_STATUSES.includes(item.order_status)) continue;
    if (!DEMAND_TYPES.includes(item.availability_type) || item.ready_date > date) continue;
    const productId = String(item.product_id);
    if (item.ready_date < todayKey) add(backlog, productId, qty);
    if (item.ready_date === date) add(daily, productId, qty);
    add(cumulative, productId, qty);
  }
  for (const plan of readyPlans) {
    const qty = BigInt(plan.qty_planned);
    if (qty <= 0n || plan.availability_type !== AVAILABILITY_TYPE.READY || plan.stock_date !== todayKey) continue;
    const productId = String(plan.product_id);
    if (date === todayKey) add(daily, productId, qty);
    add(cumulative, productId, qty);
  }
  return { daily, backlog, cumulative };
}

/** Estimasi kebutuhan bahan (FR-40) — bentuk data sama dengan respons API CR-03 B7.3 */
export function computeMaterialRequirements({ todayKey, date, orderItems, readyPlans, recipes, materials, productNames = {} }) {
  if (!(date >= todayKey)) throw new Error('Tanggal target harus ≥ hari ini');
  const quantities = collectProductQuantities({ todayKey, date, orderItems, readyPlans });
  const recipeByProduct = new Map();
  for (const r of recipes) {
    const list = recipeByProduct.get(String(r.product_id)) ?? [];
    list.push({ materialId: String(r.material_id), milli: decimalToMilli(r.qty_per_unit) });
    recipeByProduct.set(String(r.product_id), list);
  }
  const need = { daily: new Map(), backlog: new Map(), cumulative: new Map() };
  const withoutRecipe = [];
  for (const [productId, cumulativeQty] of quantities.cumulative) {
    const recipe = recipeByProduct.get(productId);
    if (!recipe || recipe.length === 0) {
      withoutRecipe.push({
        product_id: productId, name: productNames[productId] ?? null,
        daily_quantity: milliToNumber((quantities.daily.get(productId) ?? 0n) * 1000n), // fail-safe yang sama
        cumulative_quantity: milliToNumber(cumulativeQty * 1000n),
      });
      continue;
    }
    for (const kind of ['daily', 'backlog', 'cumulative']) {
      const qty = quantities[kind].get(productId) ?? 0n;
      if (qty > 0n) recipe.forEach(({ materialId, milli }) => add(need[kind], materialId, qty * milli));
    }
  }
  const rows = materials.map((m) => {
    const id = String(m.material_id);
    const stock = decimalToMilli(m.stock); const minStock = decimalToMilli(m.min_stock);
    const cumulativeNeed = need.cumulative.get(id) ?? 0n;
    const remaining = stock - cumulativeNeed;
    return {
      material_id: id, name: m.name, unit: m.unit, stock: milliToNumber(stock), min_stock: milliToNumber(minStock),
      daily_need: milliToNumber(need.daily.get(id) ?? 0n), backlog_need: milliToNumber(need.backlog.get(id) ?? 0n),
      cumulative_need: milliToNumber(cumulativeNeed), remaining: milliToNumber(remaining),
      shortage: milliToNumber(remaining < 0n ? -remaining : 0n), status: getDemandStatus(remaining, minStock),
    };
  });
  rows.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
    || (BigInt(a.material_id) < BigInt(b.material_id) ? -1 : 1));
  const summary = Object.fromEntries(STATUS_ORDER.map((s) => [s, rows.filter((r) => r.status === s).length]));
  withoutRecipe.sort((a, b) => (BigInt(a.product_id) < BigInt(b.product_id) ? -1 : 1));
  return {
    date, today_key: todayKey, window: getRequirementWindow(todayKey), cumulative_range: { from: todayKey, to: date },
    includes_ready_plan: true, rows, summary, products_without_recipe: withoutRecipe,
  };
}
