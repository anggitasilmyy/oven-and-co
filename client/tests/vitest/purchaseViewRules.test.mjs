// Uji CR-04a CP6 (Vitest) · FR-42, FR-43 · BR-31 · IT-38 — port client utils/rules/{purchaseOrderView,purchasePayload}.js
// harus identik dengan server services/{purchaseOrderViewRules,purchasePayload}.service.js (mode mock = API): tampilan
// detail PO (nilai, sisa, angka JSON) dan normalisasi payload hash request_id. Kasus acak deterministik + kasus tepi.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SV = require('../../../server/src/services/purchaseOrderViewRules.service.js');
const SP = require('../../../server/src/services/purchasePayload.service.js');
const CV = await import('../../src/utils/rules/purchaseOrderView.js');
const CP = await import('../../src/utils/rules/purchasePayload.js');

function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261113);
const int = (n) => Math.floor(rand() * n);
const dec = (maxWhole) => `${int(maxWhole)}.${String(int(100)).padStart(2, '0')}`;
const pick = (xs) => xs[int(xs.length)];

function randomOrder(n) {
  const items = Array.from({ length: 1 + int(5) }, (_, k) => {
    const ordered = Number(dec(500)) + 0.01;
    const received = Math.min(ordered, Number(dec(600)));
    return {
      po_item_id: String(100 + k), material_id: String(1 + k), name: `Bahan ${k}`, unit: pick(['kg', 'g', 'butir']),
      qty_ordered: ordered.toFixed(2), unit_price: dec(2_000_000), net_received: received.toFixed(2),
      qty_cancelled: rand() < 0.3 ? (ordered - received).toFixed(2) : '0.00',
    };
  });
  const receipts = Array.from({ length: int(3) }, (_, k) => ({
    receipt_id: BigInt(10 + k), kind: pick(['normal', 'pembalik', 'pengganti']), reverses_id: rand() < 0.3 ? 9n : null,
    replaces_id: null, reason: rand() < 0.5 ? 'salah hitung' : null, note: null, created_at: new Date(Date.UTC(2026, 10, 1 + k, 3)),
    effective: rand() < 0.6, lines: items.slice(0, 1 + int(items.length)).map((i) => ({ po_item_id: i.po_item_id, qty: dec(50) })),
  }));
  const movements = Array.from({ length: int(4) }, () => ({ qty_change: `${rand() < 0.2 ? '-' : ''}${dec(100)}`, unit_price: dec(2_000_000) }));
  return {
    po: {
      po_id: BigInt(n), po_number: `PO-261113-${String(n).padStart(3, '0')}`, supplier_id: 7n, supplier_name: 'Supplier Uji',
      status: pick(['draft', 'dipesan', 'diterima_sebagian', 'diterima', 'dibatalkan']), note: rand() < 0.5 ? 'catatan' : null,
      ordered_at: rand() < 0.5 ? new Date(Date.UTC(2026, 10, 2)) : null, cancelled_at: null, cancel_reason: null, created_at: '2026-11-01T01:02:03.004Z',
    },
    items, receipts, movements,
  };
}

test('toPurchaseOrderView client = server (300 PO acak + angka ekstrem)', () => {
  for (let n = 1; n <= 300; n += 1) {
    const input = randomOrder(n);
    assert.deepEqual(CV.toPurchaseOrderView(input), SV.toPurchaseOrderView(input), `PO ${n}`);
  }
  for (const v of ['0', '0.01', '99999999.99', '9999999999.99', '12.5']) {
    assert.equal(CV.qty(v), SV.qty(v), v);
    assert.equal(CV.money(v), SV.money(v), v);
  }
  assert.equal(CV.iso(null), SV.iso(null));
});

test('purchasePayload client = server (urutan ID numerik, desimal ter-normalisasi, nilai tak valid apa adanya)', () => {
  const qtys = ['3', '3.0', '3.00', ' 3,5 ', '1.234', '-1', '', null, undefined, 3, 'abc', '99999999.99', '100000000'];
  for (let n = 0; n < 300; n += 1) {
    const lines = Array.from({ length: int(6) }, () => ({ po_item_id: pick([2, '10', ' 9 ', '100', 1n, null]), qty: pick(qtys) }));
    const items = lines.map((l) => ({ material_id: l.po_item_id, qty_ordered: pick(qtys), unit_price: pick([...qtys, '9999999999.99']) }));
    const ids = lines.map((l) => l.po_item_id);
    assert.deepEqual(CP.receiptLines(lines), SP.receiptLines(lines), `lines ${n}`);
    assert.deepEqual(CP.orderItems(items), SP.orderItems(items), `items ${n}`);
    assert.deepEqual(CP.materialIds(ids), SP.materialIds(ids), `ids ${n}`);
  }
  for (const v of [undefined, null, 'x', 5, {}]) {
    assert.deepEqual(CP.receiptLines(v), SP.receiptLines(v));
    assert.deepEqual(CP.orderItems(v), SP.orderItems(v));
    assert.deepEqual(CP.materialIds(v), SP.materialIds(v));
  }
  assert.deepEqual(CP.receiptLines([{ po_item_id: '10', qty: '3' }, { po_item_id: '9', qty: '1.5' }]), [{ po_item_id: '9', qty: '1.50' }, { po_item_id: '10', qty: '3.00' }]);
});
