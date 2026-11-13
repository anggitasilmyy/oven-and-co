// utils/rules/purchasePayload.js
// CR-04a CP5 · BR-31 (Draft 0.8.3 §5.2 langkah 1) — payload kanonik request_id untuk endpoint pembelian: desimal yang sah
// dinormalisasi ke 2 desimal tetap (aturan murni CP3 parseDecimalInput), ID sebagai teks, baris diurutkan menurut ID
// item/bahan. Nilai yang tidak sah dibiarkan apa adanya (permintaan itu ditolak 400 dan tidak disimpan).
// Port dari server services/purchasePayload.service.js — perilaku identik (uji silang client tests/vitest/purchasingRules.test.mjs).

import { STOCK_QTY_MAX, PURCHASE_PRICE_MAX } from '../../constants/purchasing';
import { parseDecimalInput, centsToDecimalString } from './decimalInput';

const ID = /^[1-9]\d*$/;
const id = (v) => (v == null ? null : String(v).trim());
function decimal(value, max) {
  const parsed = parseDecimalInput(value, { max, allowZero: true });
  return parsed.error ? value : centsToDecimalString(parsed.cents);
}
const byId = (key) => (a, b) => {
  const [x, y] = [a[key], b[key]];
  if (ID.test(x ?? '') && ID.test(y ?? '')) return BigInt(x) < BigInt(y) ? -1 : BigInt(x) > BigInt(y) ? 1 : 0;
  return String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0;
};
const list = (v, map, key) => (Array.isArray(v) ? v.map(map).sort(byId(key)) : v ?? null);

const receiptLines = (lines) => list(lines, (l) => ({ po_item_id: id(l?.po_item_id), qty: decimal(l?.qty, STOCK_QTY_MAX) }), 'po_item_id');
const orderItems = (items) => list(items, (i) => ({
  material_id: id(i?.material_id), qty_ordered: decimal(i?.qty_ordered, STOCK_QTY_MAX), unit_price: decimal(i?.unit_price, PURCHASE_PRICE_MAX),
}), 'material_id');
const materialIds = (ids) => (Array.isArray(ids) ? ids.map(id).sort((a, b) => byId('v')({ v: a }, { v: b })) : ids ?? null);

export { receiptLines, orderItems, materialIds };
