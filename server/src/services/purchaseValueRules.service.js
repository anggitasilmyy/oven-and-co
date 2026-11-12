// services/purchaseValueRules.service.js
// CR-04a CP3 · FR-42, FR-43 · BR-22 · K06 (Draft 0.8.3 §6) — nilai pembelian sebagai informasi (bukan akuntansi).
//   nilai baris PO       = round(qty_ordered × unit_price)
//   nilai PO             = Σ nilai baris PO
//   nilai penerimaan     = Σ per baris mutasi penerimaan/pembalik/koreksi round(qty_change × unit_price) (bertanda)
//   nilai sisa dibatalkan= Σ per item round(qty_cancelled × unit_price)
// round = setengah menjauhi nol ke 2 desimal, PER BARIS (= ROUND() MySQL pada DECIMAL), dihitung eksak dalam BigInt
// 1/10.000 Rupiah (sen kuantitas × sen harga). Pembalik murni → tepat negatif nilai asal. Satu fungsi dipakai API,
// mode mock (client utils/rules/purchaseValue.js), dan laporan.

const { decimalToCents, centsToDecimalString } = require('./decimalInputRules.service');
const { PURCHASE_PRICE_MAX } = require('../utils/businessConstants');

const VALUE_MAX_CENTS = decimalToCents(PURCHASE_PRICE_MAX);

/** BigInt 1/10.000 → BigInt sen, setengah menjauhi nol */
function roundHalfAwayFromZero(tenThousandths) {
  const negative = tenThousandths < 0n;
  const abs = negative ? -tenThousandths : tenThousandths;
  const cents = (abs + 50n) / 100n;
  return negative ? -cents : cents;
}

/** Nilai satu baris: round(kuantitas × harga). Kuantitas boleh bertanda (baris mutasi). → BigInt sen */
function lineValueCents(qty, unitPrice) {
  return roundHalfAwayFromZero(decimalToCents(qty) * decimalToCents(unitPrice));
}

/** @param {{qty_ordered: string, unit_price: string}[]} items → {lines: string[], total: string, exceeds: boolean} */
function purchaseOrderValue(items) {
  const lines = items.map((item) => lineValueCents(item.qty_ordered, item.unit_price));
  const total = lines.reduce((sum, v) => sum + v, 0n);
  return {
    lines: lines.map(centsToDecimalString),
    total: centsToDecimalString(total),
    exceeds: total > VALUE_MAX_CENTS || lines.some((v) => v > VALUE_MAX_CENTS),
  };
}

/** @param {{qty_change: string, unit_price: string}[]} movements — mutasi penerimaan (bertanda) → string */
function receiptValue(movements) {
  return centsToDecimalString(movements.reduce((sum, m) => sum + lineValueCents(m.qty_change, m.unit_price), 0n));
}

/** @param {{qty_cancelled: string, unit_price: string}[]} items → string */
function cancelledValue(items) {
  return centsToDecimalString(items.reduce((sum, i) => sum + lineValueCents(i.qty_cancelled, i.unit_price), 0n));
}

module.exports = { VALUE_MAX_CENTS, roundHalfAwayFromZero, lineValueCents, purchaseOrderValue, receiptValue, cancelledValue };
