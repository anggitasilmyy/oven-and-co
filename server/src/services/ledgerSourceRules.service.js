// services/ledgerSourceRules.service.js
// FR-44 · BR-23 · CR-04a CP2 — aturan murni kesesuaian dokumen sumber ↔ mutasi untuk satu bahan (Draft 0.8.3 §2.4,
// §4.3, I-8; T-28). Dipanggil oleh ledgerRules.checkMaterialLedger. BigInt milli-satuan, tanpa floating point.
//   - Setiap mutasi merujuk dokumen bahan yang sama dengan jenis yang cocok (stok masuk/opname/saldo awal ↔
//     stock_adjustments; penerimaan ↔ baris penerimaan item PO bahan itu).
//   - I-8(a) per operasi (operation_request_id, atau dokumen tunggal tanpa request_id): Σ mutasi = Σ jumlah bertanda
//     dokumen operasi (+qty normal/pengganti, −qty pembalik). I-8(b) kumulatif mengikuti dari (a).

const { decimalToMilli } = require('./recipeRules.service');

const toMilli = (value) => decimalToMilli(String(value));

// Jenis dokumen stock_adjustments → jenis mutasi yang boleh merujuknya
const ADJUSTMENT_MOVEMENT_TYPES = {
  saldo_awal: ['saldo_awal'],
  stok_masuk: ['stok_masuk'],
  pembalik_stok_masuk: ['pembalik_stok_masuk'],
  pengganti_stok_masuk: ['koreksi_stok_masuk'],
  stock_opname: ['stock_opname'],
};
const RECEIPT_MOVEMENT_TYPES = {
  normal: ['penerimaan'],
  pembalik: ['pembalik_penerimaan', 'koreksi_penerimaan'],
  pengganti: ['koreksi_penerimaan'],
};
const STOCK_IN_KINDS = ['stok_masuk', 'pembalik_stok_masuk', 'pengganti_stok_masuk'];

const signOf = (kind) => (kind.startsWith('pembalik') ? -1n : 1n);
const opKey = (prefix, doc, id) => doc.operationRequestId ?? `${prefix}:${id}`;

function addTo(map, key, milli) {
  map.set(key, (map.get(key) ?? 0n) + milli);
}

function compareSums(docSums, movementSums, label, fail) {
  for (const key of new Set([...docSums.keys(), ...movementSums.keys()])) {
    const expected = docSums.get(key) ?? 0n;
    const actual = movementSums.get(key) ?? 0n;
    if (expected !== actual) fail('I-8', `${label} ${key}: Σ mutasi ${actual} ≠ jumlah bertanda dokumen ${expected}`);
  }
}

function checkAdjustmentSources(m, fail) {
  const docs = new Map(m.adjustments.map((a) => [String(a.adjustmentId), a]));
  const docSums = new Map();
  const movementSums = new Map();
  for (const doc of m.adjustments.filter((a) => STOCK_IN_KINDS.includes(a.kind))) {
    addTo(docSums, opKey('sa', doc, doc.adjustmentId), signOf(doc.kind) * toMilli(doc.qty));
  }
  for (const mv of m.movements.filter((x) => x.adjustmentId !== null && x.adjustmentId !== undefined)) {
    const doc = docs.get(String(mv.adjustmentId));
    if (!doc) { fail('T-28', `mutasi ${mv.movementId} merujuk dokumen stok bahan lain / tidak ada`); continue; }
    if (!ADJUSTMENT_MOVEMENT_TYPES[doc.kind].includes(mv.type)) fail('T-28', `mutasi ${mv.movementId} (${mv.type}) ≠ dokumen ${doc.kind}`);
    if (STOCK_IN_KINDS.includes(doc.kind)) addTo(movementSums, opKey('sa', doc, doc.adjustmentId), toMilli(mv.qtyChange));
  }
  compareSums(docSums, movementSums, 'operasi stok masuk', fail);
}

function checkReceiptSources(m, fail) {
  const lines = new Map(m.receiptLines.map((l) => [`${l.receiptId}:${l.poItemId}`, l]));
  const receipts = new Map(m.receiptLines.map((l) => [String(l.receiptId), l]));
  const docSums = new Map();
  const movementSums = new Map();
  for (const line of m.receiptLines) {
    addTo(docSums, `${opKey('gr', line, line.receiptId)}/item ${line.poItemId}`, signOf(line.kind) * toMilli(line.qty));
  }
  for (const mv of m.movements.filter((x) => x.receiptId !== null && x.receiptId !== undefined)) {
    const receipt = receipts.get(String(mv.receiptId));
    const line = lines.get(`${mv.receiptId}:${mv.poItemId}`) ?? (receipt && { ...receipt, poItemId: mv.poItemId });
    if (!receipt) { fail('T-28', `mutasi ${mv.movementId} merujuk penerimaan tanpa baris bahan ini`); continue; }
    if (!RECEIPT_MOVEMENT_TYPES[receipt.kind].includes(mv.type)) fail('T-28', `mutasi ${mv.movementId} (${mv.type}) ≠ penerimaan ${receipt.kind}`);
    if (!m.receiptLines.some((l) => String(l.poItemId) === String(mv.poItemId))) fail('T-28', `mutasi ${mv.movementId}: item PO bukan bahan ini`);
    addTo(movementSums, `${opKey('gr', line, mv.receiptId)}/item ${mv.poItemId}`, toMilli(mv.qtyChange));
  }
  compareSums(docSums, movementSums, 'operasi penerimaan', fail);
}

/** @returns {{invariant: string, message: string}[]} */
function checkSourceConsistency(material) {
  const violations = [];
  const fail = (invariant, message) => { violations.push({ invariant, message }); };
  for (const mv of material.movements) {
    if (String(mv.materialId ?? material.materialId) !== String(material.materialId)) fail('T-28', `mutasi ${mv.movementId} milik bahan lain`);
  }
  checkAdjustmentSources(material, fail);
  checkReceiptSources(material, fail);
  return violations;
}

module.exports = { ADJUSTMENT_MOVEMENT_TYPES, RECEIPT_MOVEMENT_TYPES, checkSourceConsistency };
