// services/stockLedgerRules.service.js
// CR-04a CP3 · FR-43, FR-44 · BR-23, BR-24, BR-30, BR-35 (Draft 0.8.3 §2.4 – §2.7, §4.1 – §4.3) — aturan murni rencana
// mutasi: dokumen berlaku, pembalik & koreksi (R + P) dengan dampak bersih dan rujukan P/R, stock opname, serta saldo
// akhir ∈ [0, 99.999.999,99]. Pemanggil (CP4/CP5) mengunci baris lalu menulis dokumen + mutasi + stok dalam SATU
// transaksi; satu pelanggaran → seluruh operasi ditolak (rollback). BigInt sen, tanpa float.
// Client setara: utils/rules/stockLedger.js (uji silang di client tests/vitest).

const { STOCK_QTY_MAX, LEDGER_ERROR_CODE } = require('../utils/businessConstants');
const { decimalToCents, centsToDecimalString, parseDecimalInput } = require('./decimalInputRules.service');

const STOCK_MAX_CENTS = decimalToCents(STOCK_QTY_MAX);
const EFFECTIVE_KINDS = Object.freeze({
  goods_receipt: Object.freeze(['normal', 'pengganti']),
  stock_adjustment: Object.freeze(['saldo_awal', 'stok_masuk', 'pengganti_stok_masuk', 'stock_opname']),
});
const REVERSIBLE_KINDS = Object.freeze({
  goods_receipt: Object.freeze(['normal', 'pengganti']),
  stock_adjustment: Object.freeze(['stok_masuk', 'pengganti_stok_masuk']),
});
const MOVEMENT_TYPES = Object.freeze({
  goods_receipt: Object.freeze({ normal: 'penerimaan', reverse: 'pembalik_penerimaan', correct: 'koreksi_penerimaan' }),
  stock_adjustment: Object.freeze({ normal: 'stok_masuk', reverse: 'pembalik_stok_masuk', correct: 'koreksi_stok_masuk' }),
});

/**
 * Dokumen asal O boleh dibalik/dikoreksi? Berlaku = jenis normal/pengganti yang belum dirujuk reverses_id/replaces_id.
 * @param {'goods_receipt'|'stock_adjustment'} family
 * @param {{kind: string, reversed: boolean, replaced: boolean}} doc
 * @returns {null | {status: number, code?: string, message: string}}
 */
function reversalTargetError(family, doc) {
  if (!EFFECTIVE_KINDS[family].includes(doc.kind) || doc.reversed || doc.replaced) {
    return { status: 409, code: LEDGER_ERROR_CODE.DOCUMENT_ALREADY_SUPERSEDED, message: 'Dokumen sudah dibalik atau dikoreksi.' };
  }
  if (!REVERSIBLE_KINDS[family].includes(doc.kind)) {
    return { status: 400, message: 'Saldo awal dan stock opname tidak dapat dibalik atau dikoreksi; gunakan stock opname baru.' };
  }
  return null;
}

const keyOf = (line) => String(line.po_item_id ?? line.material_id);

/**
 * Dampak bersih per baris (§4.3). O = dokumen asal, P = pengganti (kosong untuk pembalik murni).
 * Δ = qty(P) − qty(O); Δ = 0 → tanpa mutasi; rujuk P bila baris ada di P, selain itu R.
 * @param {'goods_receipt'|'stock_adjustment'} family
 * @param {{po_item_id?, material_id, qty}[]} original
 * @param {{po_item_id?, material_id, qty}[]|null} replacement — null = pembalik murni
 */
function planReversalOrCorrection(family, original, replacement) {
  const type = MOVEMENT_TYPES[family][replacement ? 'correct' : 'reverse'];
  const rows = new Map();
  for (const line of original) rows.set(keyOf(line), { ...line, before: decimalToCents(line.qty), after: 0n, inP: false });
  for (const line of replacement ?? []) {
    const row = rows.get(keyOf(line)) ?? { ...line, before: 0n };
    rows.set(keyOf(line), { ...row, after: decimalToCents(line.qty), inP: true });
  }
  return [...rows.values()]
    .map((r) => ({ key: keyOf(r), po_item_id: r.po_item_id ?? null, material_id: String(r.material_id), delta: r.after - r.before, reference: r.inP ? 'P' : 'R', type }))
    .filter((r) => r.delta !== 0n)
    .sort((a, b) => (BigInt(a.material_id) < BigInt(b.material_id) ? -1 : BigInt(a.material_id) > BigInt(b.material_id) ? 1 : (a.key < b.key ? -1 : 1)));
}

/** Kasus §4.2: koreksi wajib ≥ 1 baris qty > 0 (semua 0 → gunakan pembalik); stok masuk: bahan sama dengan O */
function correctionShapeError(family, original, replacement) {
  if (!Array.isArray(replacement) || replacement.length === 0 || replacement.every((l) => decimalToCents(l.qty) === 0n)) {
    return { status: 400, message: 'Koreksi harus berisi minimal 1 baris dengan jumlah > 0; untuk membatalkan seluruhnya gunakan pembalik.' };
  }
  if (family === 'stock_adjustment' && (replacement.length !== 1 || String(replacement[0].material_id) !== String(original[0].material_id))) {
    return { status: 400, message: 'Koreksi stok masuk harus untuk bahan yang sama.' };
  }
  return null;
}

/**
 * Terapkan dampak ke stok terkunci (urut material_id). Satu saja di luar [0, batas] → 409 STOCK_OUT_OF_RANGE.
 * @param {Map<string, string>} lockedStocks — material_id → stok DECIMAL (teks) dari baris yang dikunci
 * @param {{material_id: string, delta: bigint}[]} deltas — paling banyak satu per bahan (penerimaan: per item)
 */
function applyStockDeltas(lockedStocks, deltas) {
  const running = new Map([...lockedStocks].map(([id, s]) => [String(id), decimalToCents(s)]));
  const movements = [];
  const violations = [];
  for (const d of deltas) {
    const before = running.get(String(d.material_id));
    const after = before + d.delta;
    if (after < 0n || after > STOCK_MAX_CENTS) violations.push(String(d.material_id));
    running.set(String(d.material_id), after);
    movements.push({ ...d, qty_change: centsToDecimalString(d.delta), stock_before: centsToDecimalString(before), stock_after: centsToDecimalString(after) });
  }
  if (violations.length) {
    return { status: 409, code: LEDGER_ERROR_CODE.STOCK_OUT_OF_RANGE, message: 'Stok bahan akan di luar batas 0 – 99.999.999,99.', materials: [...new Set(violations)] };
  }
  return { status: 200, movements, stocks: new Map([...running].map(([id, c]) => [id, centsToDecimalString(c)])) };
}

/** Validasi input stock opname (§2.7 langkah 1): counted & expected wajib, teks ≥ 0, ≤ 2 desimal, ≤ batas */
function validateStockCountInput(input) {
  const errors = {};
  const counted = parseDecimalInput(input?.counted_stock, { max: STOCK_QTY_MAX, allowZero: true });
  const expected = parseDecimalInput(input?.expected_stock, { max: STOCK_QTY_MAX, allowZero: true });
  if (counted.error) errors.counted_stock = counted.error;
  if (expected.error) errors.expected_stock = expected.error;
  if (Object.keys(errors).length) return { status: 400, errors };
  return { status: 200, value: { counted_stock: centsToDecimalString(counted.cents), expected_stock: centsToDecimalString(expected.cents) } };
}

/** Rencana opname setelah kunci (§2.7 langkah 4 – 5): expected ≠ stok terkunci → 409 STOCK_CHANGED; selisih 0 → tanpa mutasi */
function planStockCount(lockedStock, countedStock, expectedStock) {
  const system = decimalToCents(lockedStock);
  if (decimalToCents(expectedStock) !== system) {
    return { status: 409, code: LEDGER_ERROR_CODE.STOCK_CHANGED, message: 'Stok sudah berubah sejak dibuka. Muat ulang data.' };
  }
  const delta = decimalToCents(countedStock) - system;
  return {
    status: 200,
    document: { system_stock: centsToDecimalString(system), counted_stock: centsToDecimalString(decimalToCents(countedStock)) },
    movement: delta === 0n ? null : { type: 'stock_opname', qty_change: centsToDecimalString(delta), stock_before: centsToDecimalString(system), stock_after: centsToDecimalString(decimalToCents(countedStock)) },
  };
}

module.exports = {
  EFFECTIVE_KINDS, REVERSIBLE_KINDS, MOVEMENT_TYPES, reversalTargetError, planReversalOrCorrection, correctionShapeError,
  applyStockDeltas, validateStockCountInput, planStockCount,
};
