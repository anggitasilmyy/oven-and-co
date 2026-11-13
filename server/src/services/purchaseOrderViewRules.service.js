// services/purchaseOrderViewRules.service.js
// CR-04a CP6 · FR-42, FR-43 · AD-12 — aturan murni tampilan detail PO (dipisah dari purchaseOrderView.service agar mode
// mock memakai port identik: client utils/rules/purchaseOrderView.js, diuji silang). Masukan = baris mentah
// {po, items, receipts, movements} (DECIMAL sebagai teks); keluaran JSON number lewat fail-safe CR-03 milliToNumber.

const { decimalToCents, centsToDecimalString } = require('./decimalInputRules.service');
const { purchaseOrderValue, receiptValue, cancelledValue } = require('./purchaseValueRules.service');
const { itemRemainingCents } = require('./purchasingRules.service');
const { decimalToMilli, milliToNumber } = require('./recipeRules.service');

const qty = (text) => milliToNumber(decimalToMilli(String(text)));
const money = (text) => milliToNumber(decimalToCents(String(text)) * 10n);
const iso = (d) => (d ? new Date(d).toISOString() : null);
const idOrNull = (v) => (v == null ? null : String(v));

/** Tampilan JSON detail PO (AD-12 detail PO) */
function toPurchaseOrderView({ po, items, receipts, movements }) {
  const value = purchaseOrderValue(items);
  return {
    po_id: String(po.po_id), po_number: po.po_number, supplier_id: String(po.supplier_id), supplier_name: po.supplier_name,
    status: po.status, note: po.note, ordered_at: iso(po.ordered_at), cancelled_at: iso(po.cancelled_at),
    cancel_reason: po.cancel_reason, created_at: iso(po.created_at),
    items: items.map((i, k) => ({
      po_item_id: i.po_item_id, material_id: i.material_id, name: i.name, unit: i.unit, qty_ordered: qty(i.qty_ordered),
      unit_price: money(i.unit_price), line_value: money(value.lines[k]), net_received: qty(i.net_received),
      qty_cancelled: qty(i.qty_cancelled), remaining: qty(centsToDecimalString(itemRemainingCents(i))),
    })),
    receipts: receipts.map((r) => ({
      receipt_id: String(r.receipt_id), kind: r.kind, reverses_id: idOrNull(r.reverses_id), replaces_id: idOrNull(r.replaces_id), reason: r.reason, note: r.note, created_at: iso(r.created_at),
      effective: r.effective, lines: r.lines.map((l) => ({ po_item_id: l.po_item_id, qty: qty(l.qty) })),
    })),
    values: { order_value: money(value.total), received_value: money(receiptValue(movements)), cancelled_value: money(cancelledValue(items)) },
  };
}

module.exports = { qty, money, iso, toPurchaseOrderView };
