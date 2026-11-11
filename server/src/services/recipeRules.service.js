// services/recipeRules.service.js
// CR-03 · FR-39 · BR-13 · SPEC §5, §6 — aturan murni komposisi bahan (resep ringan).
// Port setara di client: utils/rules/recipe.js (perilaku & pesan sama; diuji silang di client tests/unit).
// Semua takaran dihitung dalam bilangan bulat milli-satuan (BigInt), tidak pernah lewat float (SPEC §5 presisi):
// takaran DECIMAL(10,3); stok DECIMAL(10,2) diubah ke milli dengan × 10 (eksak).

const { RECIPE_MAX_ITEMS } = require('../utils/businessConstants');

// Takaran request: string desimal, titik sebagai pemisah, maks. 7 digit bulat & 3 desimal (≤ 9.999.999,999)
const QTY_PATTERN = /^\d{1,7}(\.\d{1,3})?$/;
// Nilai DECIMAL dari database / perhitungan (boleh negatif untuk sisa), maks. 3 desimal
const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d{1,3}))?$/;
const ID_PATTERN = /^[1-9]\d*$/;

/** String/angka desimal (maks. 3 desimal) → BigInt milli-satuan. Melempar Error bila format tidak sah. */
function decimalToMilli(value) {
  const match = String(value ?? '').trim().match(DECIMAL_PATTERN);
  if (!match) throw new Error(`Nilai desimal tidak valid: ${value}`);
  const [, sign, whole, fraction = ''] = match;
  const milli = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  return sign === '-' ? -milli : milli;
}

/** BigInt milli-satuan → string desimal 3 angka, mis. 15n → "0.015" */
function milliToDecimalString(milli) {
  const negative = milli < 0n;
  const abs = negative ? -milli : milli;
  return `${negative ? '-' : ''}${abs / 1000n}.${String(abs % 1000n).padStart(3, '0')}`;
}

// Fail-safe presisi (keputusan pemilik project, CR-03 CP3 — SPEC §5): hasil tetap JSON number, tetapi sebelum dikirim
// representasi JSON aktualnya (JSON.stringify) harus kembali tepat ke milli-satuan yang sama. Bila tidak, lempar error
// MILLI_PRECISION_LOST — tidak pernah dibulatkan, dipotong, atau diubah menjadi string. Pemetaan ke API: CP4/CP5.
const MILLI_PRECISION_ERROR_CODE = 'MILLI_PRECISION_LOST';
const JSON_NUMBER_PATTERN = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

/** Teks angka JSON (mis. "0.105", "-1.25e2", "1e+21") → BigInt milli-satuan eksak; null bila tidak tepat milli */
function jsonNumberToMilli(text) {
  const match = JSON_NUMBER_PATTERN.exec(text);
  if (!match) return null;
  const [, sign, whole, fraction = '', exponent = '0'] = match;
  const scale = Number(exponent) - fraction.length + 3; // pangkat 10 untuk mengubah digit menjadi milli
  let milli = BigInt(whole + fraction);
  if (scale >= 0) milli *= 10n ** BigInt(scale);
  else {
    const divisor = 10n ** BigInt(-scale);
    if (milli % divisor !== 0n) return null;
    milli /= divisor;
  }
  return sign === '-' ? -milli : milli;
}

/** BigInt milli-satuan → JSON number; melempar error MILLI_PRECISION_LOST bila round-trip JSON tidak eksak */
function milliToNumber(milli) {
  const decimal = milliToDecimalString(milli);
  const value = Number(decimal);
  if (jsonNumberToMilli(JSON.stringify(value)) !== milli) {
    throw Object.assign(new Error(`Nilai ${decimal} tidak dapat dikirim sebagai angka JSON tanpa kehilangan presisi.`), {
      code: MILLI_PRECISION_ERROR_CODE, milli: milli.toString(),
    });
  }
  return value;
}

/** Id sah (string/angka bulat positif) → string; selain itu null */
function normalizeId(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return ID_PATTERN.test(s) ? s : null;
}

/** Pesan error takaran (null bila sah). Request wajib string desimal — JSON number ditolak (SPEC §5). */
function qtyPerUnitError(value) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return 'Isi takaran';
  if (typeof value !== 'string') return 'Kirim takaran sebagai teks desimal';
  const s = value.trim();
  if (!QTY_PATTERN.test(s)) {
    if (/^\d+\.\d{4,}$/.test(s)) return 'Maksimal 3 angka desimal';
    if (/^\d{8,}(\.\d+)?$/.test(s)) return 'Takaran terlalu besar';
    return 'Takaran tidak valid';
  }
  if (decimalToMilli(s) === 0n) return 'Takaran harus lebih dari 0';
  return null;
}

/**
 * Validasi komposisi satu produk (SPEC §6 "Komposisi bahan"): bahan terdaftar, sekali per produk, takaran > 0
 * maks. 3 desimal, maks. RECIPE_MAX_ITEMS baris. Daftar kosong sah (mengosongkan komposisi).
 * @param {Array<{material_id, qty_per_unit}>} items — isi request
 * @param {Array<{material_id}>} materials — master bahan (AD-07)
 * @returns {{errors: Object<string,string>, items: Array<{material_id: string, qty_per_unit_milli: bigint}>}}
 *   kunci error: `items` (daftar) atau `items.<i>.material_id` / `items.<i>.qty_per_unit` (per baris)
 */
function validateRecipeItems(items, materials, { maxItems = RECIPE_MAX_ITEMS } = {}) {
  const errors = {};
  if (!Array.isArray(items)) return { errors: { items: 'Daftar komposisi tidak valid' }, items: [] };
  if (items.length > maxItems) errors.items = `Maksimal ${maxItems} bahan per produk`;
  const known = new Set(materials.map((m) => String(m.material_id)));
  const seen = new Set();
  const normalized = [];
  items.forEach((item, i) => {
    const row = item && typeof item === 'object' ? item : {};
    const materialId = normalizeId(row.material_id);
    const idKey = `items.${i}.material_id`;
    if (row.material_id === undefined || row.material_id === null || row.material_id === '') errors[idKey] = 'Pilih bahan';
    else if (!materialId) errors[idKey] = 'Bahan tidak valid';
    else if (!known.has(materialId)) errors[idKey] = 'Bahan tidak terdaftar';
    else if (seen.has(materialId)) errors[idKey] = 'Bahan sudah ada di komposisi';
    if (materialId) seen.add(materialId);
    const qtyError = qtyPerUnitError(row.qty_per_unit);
    if (qtyError) errors[`items.${i}.qty_per_unit`] = qtyError;
    if (!errors[idKey] && !qtyError) {
      normalized.push({ material_id: materialId, qty_per_unit_milli: decimalToMilli(row.qty_per_unit) });
    }
  });
  return { errors, items: Object.keys(errors).length ? [] : normalized };
}

/**
 * Apakah komposisi berubah (audit `update_product_recipe`, CR-03 B7.4): identitas = himpunan pasangan
 * material_id + qty_per_unit (nilai milli); urutan baris diabaikan.
 * @param {Array<{material_id, qty_per_unit}>} stored — baris tersimpan (qty_per_unit DECIMAL)
 * @param {Array<{material_id: string, qty_per_unit_milli: bigint}>} next — hasil validateRecipeItems
 */
function isRecipeChanged(stored, next) {
  const before = new Map(stored.map((r) => [String(r.material_id), decimalToMilli(r.qty_per_unit)]));
  if (before.size !== next.length) return true;
  return next.some((r) => before.get(r.material_id) !== r.qty_per_unit_milli);
}

module.exports = {
  MILLI_PRECISION_ERROR_CODE,
  decimalToMilli,
  milliToDecimalString,
  jsonNumberToMilli,
  milliToNumber,
  qtyPerUnitError,
  validateRecipeItems,
  isRecipeChanged,
};
