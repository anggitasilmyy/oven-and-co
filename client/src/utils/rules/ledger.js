// utils/rules/ledger.js
// FR-44 · BR-23 · CR-04a CP2 — aturan murni buku mutasi stok bahan (Draft 0.8.3 §2.6; Errata E1 B.1/B.6; E1.1 §2, §5).
// Memeriksa satu bahan: I-1, I-2, I-3, I-7, I-10, I-11 (+ I-8 & kesesuaian dokumen ↔ mutasi di ledgerSourceRules).
// Juga klasifikasi seed K-A – K-D (E1.1 §2). Tanpa database & tanpa floating point: semua kuantitas BigInt
// milli-satuan (nilai DECIMAL(10,2) dibaca sebagai string). ID dibandingkan sebagai BigInt.
// Port dari server services/ledgerRules.service.js — perilaku & pesan identik (uji silang client tests/vitest/purchasingRules.test.mjs).

import { decimalToMilli } from './recipe';
import { checkSourceConsistency } from './ledgerSource';

const STOCK_MAX_MILLI = 99999999990n; // 99.999.999,99
const STOCK_PATTERN = /^\d+(\.\d{1,2})?$/;

const toMilli = (value) => decimalToMilli(String(value));
const byId = (key) => (a, b) => (BigInt(a[key]) < BigInt(b[key]) ? -1 : BigInt(a[key]) > BigInt(b[key]) ? 1 : 0);
const inRange = (milli) => milli >= 0n && milli <= STOCK_MAX_MILLI;

/** Stok bahan sah: string desimal ≥ 0, maks. 2 desimal, ≤ 99.999.999,99 */
function isValidStock(value) {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  return STOCK_PATTERN.test(text) && inRange(toMilli(text));
}

/** Bahan punya catatan stok apa pun (dokumen, mutasi, baris penerimaan) — Errata E1.1 §2 */
function hasStockRecords(m) {
  return m.adjustments.length > 0 || m.movements.length > 0 || m.receiptLines.length > 0;
}

function checkOpening(m, saldo, movements, fail) {
  const docs = m.adjustments.filter((a) => a.kind === 'saldo_awal');
  if (docs.length !== 1) return fail('I-7', `dokumen saldo_awal = ${docs.length} (harus tepat 1)`);
  const doc = docs[0];
  if (String(doc.openingMaterialId) !== String(m.materialId)) fail('I-7', 'opening_material_id ≠ material_id');
  if (doc.qty === null || !inRange(toMilli(doc.qty))) return fail('I-7', 'qty saldo awal di luar [0, batas]');
  const qty = toMilli(doc.qty);
  const opening = movements.filter((mv) => mv.type === 'saldo_awal');
  if (opening.some((mv) => String(mv.adjustmentId) !== String(doc.adjustmentId))) fail('I-7', 'mutasi saldo_awal merujuk dokumen lain');
  if (qty === 0n && opening.length) fail('I-7', 'saldo awal 0 tetapi ada mutasi saldo_awal');
  if (qty > 0n) {
    if (opening.length !== 1) return fail('I-7', `saldo awal > 0 tetapi mutasi saldo_awal = ${opening.length}`);
    const mv = opening[0];
    if (toMilli(mv.stockBefore) !== 0n || toMilli(mv.qtyChange) !== qty || toMilli(mv.stockAfter) !== qty) {
      fail('I-7', 'mutasi saldo_awal ≠ (0, qty, qty)');
    }
  }
  saldo.doc = doc;
  saldo.movement = opening[0] ?? null;
}

function checkChain(m, movements, fail) {
  let total = 0n;
  movements.forEach((mv, i) => {
    const before = toMilli(mv.stockBefore);
    const after = toMilli(mv.stockAfter);
    const change = toMilli(mv.qtyChange);
    total += change;
    if (!inRange(before) || !inRange(after)) fail('I-3', `mutasi ${mv.movementId} di luar [0, batas]`);
    if (change === 0n || after !== before + change) fail('I-2', `mutasi ${mv.movementId}: stock_after ≠ stock_before + qty_change`);
    const expectedBefore = i === 0 ? 0n : toMilli(movements[i - 1].stockAfter);
    if (before !== expectedBefore) fail('I-2', `mutasi ${mv.movementId}: stock_before tidak menyambung`);
  });
  const stock = toMilli(m.stock);
  if (total !== stock) fail('I-1', `Σ qty_change ${total} ≠ stok ${stock} (milli)`);
  const last = movements.at(-1);
  if (last && toMilli(last.stockAfter) !== stock) fail('I-2', 'stock_after mutasi terakhir ≠ stok bahan');
}

function checkOpnameDocs(m, fail) {
  for (const doc of m.adjustments.filter((a) => a.kind === 'stock_opname')) {
    const diff = toMilli(doc.countedStock) - toMilli(doc.systemStock);
    const refs = m.movements.filter((mv) => String(mv.adjustmentId) === String(doc.adjustmentId));
    if (diff === 0n && refs.length) fail('I-10', `opname ${doc.adjustmentId} selisih 0 tetapi punya mutasi`);
    if (diff !== 0n) {
      const mv = refs[0];
      if (refs.length !== 1 || mv.type !== 'stock_opname' || toMilli(mv.qtyChange) !== diff
        || toMilli(mv.stockBefore) !== toMilli(doc.systemStock) || toMilli(mv.stockAfter) !== toMilli(doc.countedStock)) {
        fail('I-10', `opname ${doc.adjustmentId}: mutasi tidak sesuai fisik − sistem`);
      }
    }
  }
}

function checkOpeningFirst(m, saldo, movements, fail) {
  if (!saldo.doc) return;
  const id = BigInt(saldo.doc.adjustmentId);
  if (m.adjustments.some((a) => a !== saldo.doc && BigInt(a.adjustmentId) < id)) fail('I-11', 'ada dokumen stok sebelum saldo awal');
  if (saldo.movement && movements[0] !== saldo.movement) fail('I-11', 'mutasi saldo_awal bukan mutasi pertama');
  const openedAt = new Date(saldo.doc.createdAt).getTime();
  if (m.receiptLines.some((l) => new Date(l.createdAt).getTime() < openedAt)) fail('I-11', 'penerimaan sebelum saldo awal');
}

/**
 * Periksa buku mutasi satu bahan.
 * @param {{materialId, name?, stock, adjustments: object[], movements: object[], receiptLines: object[]}} material
 * @returns {{invariant: string, message: string}[]} pelanggaran (kosong = lulus)
 */
function checkMaterialLedger(material) {
  const violations = [];
  const fail = (invariant, message) => { violations.push({ invariant, message }); };
  const movements = [...material.movements].sort(byId('movementId'));
  const m = { ...material, adjustments: [...material.adjustments].sort(byId('adjustmentId')), movements };
  if (!isValidStock(m.stock)) fail('I-3', `stok bahan tidak sah: ${m.stock}`);
  const saldo = { doc: null, movement: null };
  checkOpening(m, saldo, movements, fail);
  if (isValidStock(m.stock)) checkChain(m, movements, fail);
  checkOpnameDocs(m, fail);
  checkOpeningFirst(m, saldo, movements, fail);
  for (const v of checkSourceConsistency(m)) violations.push(v);
  return violations;
}

/**
 * Klasifikasi seed (Errata E1.1 §2): K-A belum ada · K-B saldo awal sah · K-C tanpa catatan stok (perbaikan otomatis)
 * · K-D tidak konsisten (seed berhenti sebelum penulisan pertama).
 * @param {object|null} material — null bila bahan belum ada di database
 */
function classifyMaterialForSeed(material) {
  if (!material) return { kind: 'K-A', reasons: [] };
  if (!isValidStock(material.stock)) return { kind: 'K-D', reasons: [`stok tidak sah: ${material.stock}`] };
  const hasOpening = material.adjustments.some((a) => a.kind === 'saldo_awal');
  if (!hasOpening && !hasStockRecords(material)) return { kind: 'K-C', reasons: [] };
  if (!hasOpening) return { kind: 'K-D', reasons: ['tanpa saldo awal tetapi punya mutasi atau dokumen transaksi stok'] };
  const violations = checkMaterialLedger(material);
  return violations.length
    ? { kind: 'K-D', reasons: violations.map((v) => `${v.invariant}: ${v.message}`) }
    : { kind: 'K-B', reasons: [] };
}

export { STOCK_MAX_MILLI, isValidStock, hasStockRecords, checkMaterialLedger, classifyMaterialForSeed };
