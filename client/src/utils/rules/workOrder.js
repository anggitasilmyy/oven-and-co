// utils/rules/workOrder.js
// CR-04b · FR-45, FR-46 · BR-25 – BR-29, BR-36 (Draft 0.8.3 §8, §14; SPEC §5, §6) — aturan murni Work Order: nomor
// WO-YYMMDD-NNN, validasi WO (produk aktif, rencana bilangan bulat 1 – 10.000, tanggal T … T+29 WIB), transisi {from, to},
// baris pengeluaran (WO Diproses; 1 – 30 bahan master tanpa duplikat; qty teks > 0, ≤ 2 desimal), dokumen hasil (tiga
// kasus koreksi §8.2 + kondisi terminal), hasil bersih (§8.3), dan standar/aktual/selisih (§8.4) dalam milli BigInt.
// Port dari server services/workOrderRules.service.js — perilaku & pesan identik (uji silang client tests/vitest/workOrderRules.test.mjs).

import { WO_STATUS, WO_MANUAL_TRANSITIONS, WO_NUMBER_PREFIX, WO_QTY_MAX, WO_MAX_ISSUE_LINES } from '../../constants/workOrder';
import { STOCK_QTY_MAX, LEDGER_ERROR_CODE } from '../../constants/purchasing';
import { parseDecimalInput, decimalToCents, centsToDecimalString } from './decimalInput';
import { decimalToMilli } from './recipe';
import { getRequirementWindow, isValidDateKey } from './materialRequirement';
import { reasonError } from './purchasing';

const ID_PATTERN = /^[1-9]\d*$/;
const INT_PATTERN = /^\d+$/;
const idOf = (value) => (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' ? String(value).trim() : '');
const byMaterial = (a, b) => (BigInt(a.material_id) < BigInt(b.material_id) ? -1 : BigInt(a.material_id) > BigInt(b.material_id) ? 1 : 0);
const superseded = () => ({ status: 409, code: LEDGER_ERROR_CODE.DOCUMENT_ALREADY_SUPERSEDED, message: 'Dokumen sudah dibalik atau dikoreksi.' });

/** Bilangan bulat dari JSON number bulat atau teks digit → Number; selain itu null */
function parseWholeNumber(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value === 'string' && INT_PATTERN.test(value.trim())) return Number(value.trim());
  return null;
}

/** Hasil/rencana bilangan bulat dalam [min, WO_QTY_MAX] → {value} | {error} */
function parseWorkOrderQty(value, { min }) {
  const n = parseWholeNumber(value);
  if (n === null || n < min || n > WO_QTY_MAX) return { error: `Harus bilangan bulat ${min} – ${WO_QTY_MAX.toLocaleString('id-ID')}.` };
  return { value: n };
}

/**
 * Validasi isi WO (buat & ubah Draft).
 * @param {{product_id, production_date, qty_planned, note?}} input
 * @param {{products: Map<string, {is_active: boolean}>, todayKey: string}} ctx — produk dari master; hari ini WIB
 * @returns {{errors: object, value: {product_id, production_date, qty_planned, note}|null}}
 */
function validateWorkOrder(input, { products, todayKey }) {
  const errors = {};
  const productId = idOf(input?.product_id);
  const product = ID_PATTERN.test(productId) ? products.get(productId) : null;
  if (!product || !product.is_active) errors.product_id = 'Produk tidak ditemukan atau tidak aktif.';
  const window = getRequirementWindow(todayKey);
  const date = typeof input?.production_date === 'string' ? input.production_date.trim() : '';
  if (!isValidDateKey(date) || date < window.from || date > window.to) errors.production_date = 'Tanggal produksi harus hari ini s.d. 29 hari ke depan (WIB).';
  const qty = parseWorkOrderQty(input?.qty_planned, { min: 1 });
  if (qty.error) errors.qty_planned = qty.error;
  const note = input?.note === undefined || input?.note === null ? '' : input.note;
  const noteError = typeof note === 'string' ? reasonError(note, { required: false }) : 'Catatan tidak valid.';
  if (noteError) errors.note = noteError;
  if (Object.keys(errors).length) return { errors, value: null };
  return { errors, value: { product_id: productId, production_date: date, qty_planned: qty.value, note: note.trim() || null } };
}

/** Transisi manual {from, to} (BR-25): status sudah berubah / tidak diizinkan → 409 */
function workOrderTransitionError(current, from, to) {
  if (current !== from) return { status: 409, message: 'Status WO sudah berubah. Muat ulang data.' };
  if (!(WO_MANUAL_TRANSITIONS[from] ?? []).includes(to)) return { status: 409, message: 'Perubahan status WO tidak diizinkan.' };
  return null;
}

/**
 * Baris pengeluaran (normal maupun pengganti P): 1 – 30 bahan dari master tanpa duplikat; qty teks > 0, ≤ 2 desimal,
 * ≤ 99.999.999,99. Bahan tidak harus ada di snapshot resep (Draft §8.4: standar 0).
 * @param {Set<string>} materialIds — material_id master yang ada
 * @returns {{status: 200, value: {material_id, qty}[]} | {status: 400, errors: object}}
 */
function validateIssueLines(materialIds, lines) {
  if (!Array.isArray(lines) || lines.length === 0) return { status: 400, errors: { lines: 'Minimal 1 bahan.' } };
  if (lines.length > WO_MAX_ISSUE_LINES) return { status: 400, errors: { lines: `Maksimal ${WO_MAX_ISSUE_LINES} bahan per pengeluaran.` } };
  const errors = {};
  const value = [];
  const seen = new Set();
  lines.forEach((line, i) => {
    const id = idOf(line?.material_id);
    if (!ID_PATTERN.test(id) || !materialIds.has(id)) errors[`lines.${i}.material_id`] = 'Bahan tidak terdaftar di master bahan.';
    else if (seen.has(id)) errors[`lines.${i}.material_id`] = 'Bahan sudah ada di dokumen.';
    seen.add(id);
    const qty = parseDecimalInput(line?.qty, { max: STOCK_QTY_MAX });
    if (qty.error) errors[`lines.${i}.qty`] = qty.error;
    if (!errors[`lines.${i}.material_id`] && !qty.error) value.push({ material_id: id, qty: centsToDecimalString(qty.cents) });
  });
  if (Object.keys(errors).length) return { status: 400, errors };
  return { status: 200, value: value.sort(byMaterial) };
}

/** Pengeluaran baru hanya untuk WO Diproses (Draft §8.1) */
function issueStatusError(woStatus) {
  return woStatus === WO_STATUS.DIPROSES ? null : { status: 409, message: 'Pengeluaran hanya untuk WO berstatus Diproses.' };
}

/** Pembalik/koreksi pengeluaran: WO bukan Draft (§2.5) — Diproses, Selesai, atau Dibatalkan */
function issueCorrectionStatusError(woStatus) {
  return woStatus === WO_STATUS.DRAFT ? { status: 409, message: 'WO Draft tidak memiliki pengeluaran.' } : null;
}

/** Rencana mutasi pengeluaran normal: −qty per bahan (urut material_id) */
function issuePlan(lines) {
  return lines.map((l) => ({ material_id: String(l.material_id), delta: -decimalToCents(l.qty), type: 'pengeluaran_produksi' })).sort(byMaterial);
}

/** Selesaikan WO: WO Diproses (Draft §8.1, §14) */
function completionStatusError(woStatus) {
  return woStatus === WO_STATUS.DIPROSES ? null : { status: 409, message: 'Hanya WO berstatus Diproses yang dapat diselesaikan.' };
}

const OUTPUT_EFFECTIVE_KINDS = Object.freeze(['normal', 'pengganti']);

/** Dokumen hasil berlaku = normal/pengganti yang belum dibalik/diganti; selain itu (termasuk terminal) → 409 */
function outputTargetError(doc) {
  return OUTPUT_EFFECTIVE_KINDS.includes(doc.kind) && !doc.reversed && !doc.replaced ? null : superseded();
}

/**
 * Pembalik hasil (§8.2): hanya dokumen berlaku qty > 0; R berisi qty asal. Kasus 3 → kondisi terminal.
 * @param {{kind, qty_output: number, reversed: boolean, replaced: boolean}} doc
 * @returns {{status: 200, documents: Array<{kind: 'pembalik'|'pengganti', qty_output: number}>} | {status, code?, message}}
 */
function planOutputReversal(doc) {
  const target = outputTargetError(doc);
  if (target) return target;
  if (doc.qty_output === 0) return { status: 400, message: 'Hasil 0 tidak dapat dibalik; gunakan koreksi.' };
  return { status: 200, documents: [{ kind: 'pembalik', qty_output: doc.qty_output }] };
}

/**
 * Koreksi hasil ke q (§8.2): 0 → q = P langsung; p → q = R + P; p → 0 = R saja; 0 → 0 & q = p ditolak 400.
 * @param {{kind, qty_output: number, reversed: boolean, replaced: boolean}} doc
 * @param {unknown} qty — hasil benar (bilangan bulat 0 – 10.000)
 */
function planOutputCorrection(doc, qty) {
  const target = outputTargetError(doc);
  if (target) return target;
  const parsed = parseWorkOrderQty(qty, { min: 0 });
  if (parsed.error) return { status: 400, errors: { qty_output: parsed.error } };
  const q = parsed.value;
  if (q === doc.qty_output) return { status: 400, message: 'Koreksi tidak mengubah hasil.' };
  if (doc.qty_output === 0) return { status: 200, documents: [{ kind: 'pengganti', qty_output: q }] };
  if (q === 0) return { status: 200, documents: [{ kind: 'pembalik', qty_output: doc.qty_output }] };
  return { status: 200, documents: [{ kind: 'pembalik', qty_output: doc.qty_output }, { kind: 'pengganti', qty_output: q }] };
}

/** Pengganti langsung (tanpa R) hanya atas dokumen hasil qty 0 (§4.2) */
function directReplacementError(doc) {
  const target = outputTargetError(doc);
  if (target) return target;
  return doc.qty_output === 0 ? null : { status: 400, message: 'Pengganti langsung hanya untuk hasil 0; gunakan koreksi.' };
}

/** Hasil bersih WO (§8.3) = Σ normal + Σ pengganti − Σ pembalik */
function netOutput(outputs) {
  return outputs.reduce((sum, o) => sum + (o.kind === 'pembalik' ? -o.qty_output : o.qty_output), 0);
}

/**
 * Standar, aktual, selisih per bahan (§8.4) dalam milli BigInt: standar = snapshot × hasil bersih; aktual = Σ jumlah
 * bertanda baris pengeluaran (normal/pengganti +, pembalik −); selisih = aktual − standar. Gabungan bahan snapshot &
 * pengeluaran, urut material_id. Serialisasi (milliToNumber) oleh pemanggil.
 * @param {{material_id, qty_per_unit: string}[]} snapshot
 * @param {{material_id, qty: string, kind: string}[]} issueLines
 * @param {number} output — hasil bersih
 */
function materialUsage(snapshot, issueLines, output) {
  const rows = new Map();
  const row = (id) => rows.get(String(id)) ?? rows.set(String(id), { material_id: String(id), standard: 0n, actual: 0n, in_recipe: false }).get(String(id));
  for (const s of snapshot) Object.assign(row(s.material_id), { standard: decimalToMilli(String(s.qty_per_unit)) * BigInt(output), in_recipe: true });
  for (const l of issueLines) row(l.material_id).actual += (l.kind === 'pembalik' ? -1n : 1n) * decimalToMilli(String(l.qty));
  return [...rows.values()].map((r) => ({ ...r, variance: r.actual - r.standard })).sort(byMaterial);
}

/** Nomor WO-YYMMDD-NNN untuk kunci tanggal WIB "YYYY-MM-DD" (SPEC §10) */
function formatWorkOrderNumber(dateKey, seq) {
  const [y, m, d] = dateKey.split('-');
  return `${WO_NUMBER_PREFIX}-${y.slice(2)}${m}${d}-${String(seq).padStart(3, '0')}`;
}

/** Nomor WO berikutnya untuk tanggal itu = urutan terbesar + 1 (pemanggil menyerialkan penomoran) */
function nextWorkOrderNumber(existingNumbers, dateKey) {
  const prefix = formatWorkOrderNumber(dateKey, 0).slice(0, -3);
  const maxSeq = existingNumbers.filter((n) => n.startsWith(prefix))
    .reduce((max, n) => (/^\d+$/.test(n.slice(prefix.length)) && Number(n.slice(prefix.length)) > max ? Number(n.slice(prefix.length)) : max), 0);
  return formatWorkOrderNumber(dateKey, maxSeq + 1);
}

export {
  parseWorkOrderQty, validateWorkOrder, workOrderTransitionError, validateIssueLines, issueStatusError,
  issueCorrectionStatusError, issuePlan, completionStatusError, outputTargetError, planOutputReversal, planOutputCorrection,
  directReplacementError, netOutput, materialUsage, formatWorkOrderNumber, nextWorkOrderNumber,
};
