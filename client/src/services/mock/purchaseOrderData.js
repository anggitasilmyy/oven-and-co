// services/mock/purchaseOrderData.js
// CR-04a CP6 · FR-42, FR-43 · AD-12 — data PO di mode mock dalam bentuk baris mentah yang SAMA dengan server
// loadPurchaseOrder ({po, items, receipts, movements}, DECIMAL sebagai teks), lalu tampilan lewat port identik
// utils/rules/purchaseOrderView (toPurchaseOrderView) — sehingga nilai & bentuk respons mock = API.

import { toPurchaseOrderView, money, iso } from '../../utils/rules/purchaseOrderView';
import { purchaseOrderValue } from '../../utils/rules/purchaseValue';
import { decimalToCents, centsToDecimalString } from '../../utils/rules/decimalInput';

const same = (a, b) => String(a) === String(b);
const byNumber = (key) => (a, b) => Number(a[key]) - Number(b[key]);

/** Baris mentah PO (atau null) dari tabel kerja mock `t` */
export function loadPurchaseOrderRows(t, poId) {
  const po = t.purchase_orders.find((p) => same(p.po_id, poId));
  if (!po) return null;
  const supplier = t.suppliers.find((s) => same(s.supplier_id, po.supplier_id));
  const receipts = t.goods_receipts.filter((r) => same(r.po_id, poId)).sort(byNumber('receipt_id'));
  const receiptIds = new Set(receipts.map((r) => String(r.receipt_id)));
  const lines = t.goods_receipt_lines.filter((l) => receiptIds.has(String(l.receipt_id))).sort(byNumber('line_id'));
  const kindOf = new Map(receipts.map((r) => [String(r.receipt_id), r.kind]));
  const materials = new Map(t.raw_materials.map((m) => [String(m.material_id), m]));
  const items = t.purchase_order_items.filter((i) => same(i.po_id, poId)).sort(byNumber('material_id')).map((i) => {
    const net = lines.filter((l) => same(l.po_item_id, i.po_item_id))
      .reduce((sum, l) => sum + (kindOf.get(String(l.receipt_id)) === 'pembalik' ? -1n : 1n) * decimalToCents(l.qty), 0n);
    const m = materials.get(String(i.material_id));
    return {
      po_item_id: String(i.po_item_id), material_id: String(i.material_id), name: m?.name ?? '', unit: m?.unit ?? '',
      qty_ordered: i.qty_ordered, unit_price: i.unit_price, qty_cancelled: i.qty_cancelled, net_received: centsToDecimalString(net),
    };
  });
  const itemIds = new Set(items.map((i) => i.po_item_id));
  const priceOf = new Map(items.map((i) => [i.po_item_id, i.unit_price]));
  return {
    po: { ...po, supplier_name: supplier?.name ?? '', supplier_active: supplier?.is_active ?? false },
    items,
    receipts: receipts.map((r) => ({
      ...r, effective: r.kind !== 'pembalik' && !t.goods_receipts.some((x) => same(x.reverses_id, r.receipt_id) || same(x.replaces_id, r.receipt_id)),
      reversed_count: t.goods_receipts.filter((x) => same(x.reverses_id, r.receipt_id)).length,
      replaced_count: t.goods_receipts.filter((x) => same(x.replaces_id, r.receipt_id)).length,
      lines: lines.filter((l) => same(l.receipt_id, r.receipt_id)).map((l) => ({ po_item_id: String(l.po_item_id), qty: l.qty })),
    })),
    movements: t.material_movements.filter((m) => m.po_item_id != null && itemIds.has(String(m.po_item_id)))
      .map((m) => ({ qty_change: m.qty_change, unit_price: priceOf.get(String(m.po_item_id)) })),
  };
}

export function purchaseOrderView(t, poId) {
  return toPurchaseOrderView(loadPurchaseOrderRows(t, poId));
}

/** Daftar ringkas (terbaru dulu) — sama dengan server listPurchaseOrders */
export function purchaseOrderList(t) {
  return [...t.purchase_orders].sort((a, b) => b.po_id - a.po_id).map((p) => {
    const own = t.purchase_order_items.filter((i) => same(i.po_id, p.po_id));
    const supplier = t.suppliers.find((s) => same(s.supplier_id, p.supplier_id));
    return {
      po_id: String(p.po_id), po_number: p.po_number, status: p.status, supplier_id: String(p.supplier_id), supplier_name: supplier?.name ?? '',
      item_count: own.length, order_value: money(purchaseOrderValue(own).total), ordered_at: iso(p.ordered_at),
      cancelled_at: iso(p.cancelled_at), created_at: iso(p.created_at),
    };
  });
}
