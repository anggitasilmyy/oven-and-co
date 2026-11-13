// services/purchaseOrderView.service.js
// CR-04a CP5 · FR-42, FR-43 · UC-34, UC-35 · BR-19 – BR-22 · AD-12 — data & tampilan PO (Staf & Owner): item dengan
// jumlah bersih diterima (Σ baris penerimaan bertanda: normal/pengganti +, pembalik −), sisa, qty_cancelled historis,
// dokumen penerimaan (berlaku atau tidak), dan nilai pembelian (aturan murni CP3 purchaseValueRules: nilai PO, nilai
// penerimaan dari mutasi, nilai sisa dibatalkan). DECIMAL dibaca sebagai teks (CAST AS CHAR); keluaran JSON number lewat
// fail-safe CR-03 milliToNumber. `client` = PrismaClient atau transaksi.

const prisma = require('../lib/prisma');
const { purchaseOrderValue } = require('./purchaseValueRules.service');
const { toPurchaseOrderView, money, iso } = require('./purchaseOrderViewRules.service');

const PO_NOT_FOUND = 'Purchase order tidak ditemukan.';

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

/** PO + item (dengan net_received) + penerimaan + mutasi penerimaan; null bila tidak ada */
async function loadPurchaseOrder(client, poId) {
  const id = BigInt(poId);
  const [po] = await client.$queryRaw`SELECT p.po_id, p.po_number, p.supplier_id, s.name AS supplier_name, s.is_active AS supplier_active,
    p.status, p.note, p.ordered_at, p.cancelled_at, p.cancel_reason, p.created_at FROM purchase_orders p
    JOIN suppliers s ON s.supplier_id = p.supplier_id WHERE p.po_id = ${id}`;
  if (!po) return null;
  const items = await client.$queryRaw`SELECT i.po_item_id, i.material_id, m.name, m.unit, CAST(i.qty_ordered AS CHAR) AS qty_ordered,
    CAST(i.unit_price AS CHAR) AS unit_price, CAST(i.qty_cancelled AS CHAR) AS qty_cancelled,
    CAST(COALESCE((SELECT SUM(CASE r.kind WHEN 'pembalik' THEN -l.qty ELSE l.qty END) FROM goods_receipt_lines l
      JOIN goods_receipts r ON r.receipt_id = l.receipt_id WHERE l.po_item_id = i.po_item_id), 0) AS CHAR) AS net_received
    FROM purchase_order_items i JOIN raw_materials m ON m.material_id = i.material_id WHERE i.po_id = ${id} ORDER BY i.material_id`;
  const receipts = await client.$queryRaw`SELECT r.receipt_id, r.kind, r.reverses_id, r.replaces_id, r.reason, r.note, r.created_at,
    (SELECT COUNT(*) FROM goods_receipts x WHERE x.reverses_id = r.receipt_id) AS reversed_count,
    (SELECT COUNT(*) FROM goods_receipts x WHERE x.replaces_id = r.receipt_id) AS replaced_count
    FROM goods_receipts r WHERE r.po_id = ${id} ORDER BY r.receipt_id`;
  const lines = await client.$queryRaw`SELECT l.receipt_id, l.po_item_id, CAST(l.qty AS CHAR) AS qty FROM goods_receipt_lines l
    JOIN goods_receipts r ON r.receipt_id = l.receipt_id WHERE r.po_id = ${id} ORDER BY l.line_id`;
  const movements = await client.$queryRaw`SELECT CAST(mm.qty_change AS CHAR) AS qty_change, CAST(i.unit_price AS CHAR) AS unit_price
    FROM material_movements mm JOIN purchase_order_items i ON i.po_item_id = mm.po_item_id WHERE i.po_id = ${id}`;
  return {
    po,
    items: items.map((i) => ({ ...i, po_item_id: String(i.po_item_id), material_id: String(i.material_id) })),
    receipts: receipts.map((r) => ({
      ...r, receipt_id: String(r.receipt_id), effective: r.kind !== 'pembalik' && Number(r.reversed_count) === 0 && Number(r.replaced_count) === 0,
      lines: lines.filter((l) => String(l.receipt_id) === String(r.receipt_id)).map((l) => ({ po_item_id: String(l.po_item_id), qty: l.qty })),
    })),
    movements,
  };
}

/** GET /api/admin/purchase-orders/:id */
async function getPurchaseOrder(poId, client = prisma) {
  const data = await loadPurchaseOrder(client, poId);
  if (!data) throw httpError(404, PO_NOT_FOUND);
  return toPurchaseOrderView(data);
}

/** GET /api/admin/purchase-orders → daftar ringkas (terbaru dulu) dengan nilai PO */
async function listPurchaseOrders() {
  const rows = await prisma.$queryRaw`SELECT p.po_id, p.po_number, p.status, p.ordered_at, p.cancelled_at, p.created_at,
    s.supplier_id, s.name AS supplier_name FROM purchase_orders p JOIN suppliers s ON s.supplier_id = p.supplier_id
    ORDER BY p.po_id DESC`;
  const items = await prisma.$queryRaw`SELECT po_id, CAST(qty_ordered AS CHAR) AS qty_ordered, CAST(unit_price AS CHAR) AS unit_price
    FROM purchase_order_items`;
  return rows.map((p) => {
    const own = items.filter((i) => String(i.po_id) === String(p.po_id));
    return {
      po_id: String(p.po_id), po_number: p.po_number, status: p.status, supplier_id: String(p.supplier_id), supplier_name: p.supplier_name,
      item_count: own.length, order_value: money(purchaseOrderValue(own).total), ordered_at: iso(p.ordered_at),
      cancelled_at: iso(p.cancelled_at), created_at: iso(p.created_at),
    };
  });
}

module.exports = { PO_NOT_FOUND, loadPurchaseOrder, toPurchaseOrderView, getPurchaseOrder, listPurchaseOrders };
