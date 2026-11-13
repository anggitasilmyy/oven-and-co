// services/mock/ledgerMock.js
// CR-04a CP6 · FR-44 · BR-23, BR-24, BR-31 — buku mutasi & idempotensi di mode mock (pengganti stockLedger.service,
// openingBalance.service, operationRequest.service). Aturan murni SAMA dengan server (utils/rules/ledger, stockLedger,
// idempotency — port identik, diuji silang). Kuantitas buku mutasi disimpan sebagai teks DECIMAL ("6.50"); stok
// raw_materials tetap number (kontrak mock lama) dan selalu ditulis dari teks hasil aturan (tanpa aritmetika float).
// Saldo awal (Errata E1.1 §4): saat dibaca, bahan tanpa catatan stok (K-C, termasuk tabel lama di localStorage) mendapat
// saldo awal dari stok saat ini; data tidak konsisten (K-D) → error konsol dan data bahan & buku mutasi dibuat ulang.
// Atomik: pekerjaan menghitung semua perubahan lebih dulu, lalu `commit` menulis tabel sekaligus (tanpa tulis parsial).

import { getTables, updateTable, LEDGER_TABLES } from './db';
import { RAW_MATERIALS } from './seed/catalog';
import { getMockCurrentTime } from './mockClock';
import { classifyMaterialForSeed } from '../../utils/rules/ledger';
import { applyStockDeltas } from '../../utils/rules/stockLedger';
import { payloadHash, duplicateRequestDecision, requestIdPolicyError } from '../../utils/rules/idempotency';
import { createApiError } from '../../utils/apiErrors';

export const nextId = (rows, key) => rows.reduce((max, r) => Math.max(max, Number(r[key]) || 0), 0) + 1;
export const nowIso = () => new Date(getMockCurrentTime()).toISOString();
const idEq = (a, b) => String(a) === String(b);

/** Baris bahan mock → bentuk aturan ledger (sama dengan server loadLedgerMaterials) */
function toLedgerMaterial(m, t) {
  const items = new Map(t.purchase_order_items.map((i) => [String(i.po_item_id), i]));
  const receipts = new Map(t.goods_receipts.map((r) => [String(r.receipt_id), r]));
  return {
    materialId: String(m.material_id), name: m.name, stock: String(m.stock),
    adjustments: t.stock_adjustments.filter((a) => idEq(a.material_id, m.material_id)).map((a) => ({
      adjustmentId: String(a.adjustment_id), kind: a.kind, qty: a.qty, countedStock: a.counted_stock, systemStock: a.system_stock,
      reversesId: a.reverses_id == null ? null : String(a.reverses_id), replacesId: a.replaces_id == null ? null : String(a.replaces_id),
      openingMaterialId: a.opening_material_id == null ? null : String(a.opening_material_id), operationRequestId: a.operation_request_id, createdAt: a.created_at,
    })),
    movements: t.material_movements.filter((v) => idEq(v.material_id, m.material_id)).map((v) => ({
      movementId: String(v.movement_id), materialId: String(v.material_id), type: v.type, qtyChange: v.qty_change, stockBefore: v.stock_before,
      stockAfter: v.stock_after, adjustmentId: v.adjustment_id == null ? null : String(v.adjustment_id),
      receiptId: v.receipt_id == null ? null : String(v.receipt_id), poItemId: v.po_item_id == null ? null : String(v.po_item_id), createdAt: v.created_at,
    })),
    receiptLines: t.goods_receipt_lines.filter((l) => idEq(items.get(String(l.po_item_id))?.material_id, m.material_id)).map((l) => {
      const r = receipts.get(String(l.receipt_id));
      return { receiptId: String(l.receipt_id), poItemId: String(l.po_item_id), qty: l.qty, kind: r.kind, operationRequestId: r.operation_request_id, createdAt: r.created_at };
    }),
  };
}

/** Dokumen saldo awal (+ mutasi bila stok > 0) untuk bahan; createOpeningBalance server */
export function openingRows(t, materialId, stock, { actorId = null, requestId = null } = {}) {
  const at = nowIso();
  const adjustmentId = nextId(t.stock_adjustments, 'adjustment_id');
  const doc = {
    adjustment_id: adjustmentId, material_id: Number(materialId), kind: 'saldo_awal', qty: stock, counted_stock: null, system_stock: null,
    reverses_id: null, replaces_id: null, reason: null, opening_material_id: Number(materialId), operation_request_id: requestId, created_by: actorId, created_at: at,
  };
  t.stock_adjustments = [...t.stock_adjustments, doc];
  if (/^0+(\.0+)?$/.test(stock)) return doc;
  t.material_movements = [...t.material_movements, {
    movement_id: nextId(t.material_movements, 'movement_id'), material_id: Number(materialId), type: 'saldo_awal', qty_change: stock,
    stock_before: '0.00', stock_after: stock, adjustment_id: adjustmentId, receipt_id: null, po_item_id: null, created_by: actorId, created_at: at,
  }];
  return doc;
}

const LEDGER_SOURCE = ['raw_materials', ...LEDGER_TABLES];

/** Pastikan setiap bahan punya saldo awal (K-C diperbaiki; K-D → bahan & buku mutasi dibuat ulang dari seed) */
export function loadLedgerTables() {
  let t = getTables(...LEDGER_SOURCE);
  const classes = t.raw_materials.map((m) => [m, classifyMaterialForSeed(toLedgerMaterial(m, t))]);
  if (classes.some(([, c]) => c.kind === 'K-D')) {
    console.error('[mock] Buku mutasi bahan tidak konsisten (K-D) — data bahan & buku mutasi dibuat ulang dari seed.', classes.filter(([, c]) => c.kind === 'K-D'));
    commit({ raw_materials: RAW_MATERIALS, ...Object.fromEntries(LEDGER_TABLES.map((name) => [name, []])) });
    t = getTables(...LEDGER_SOURCE);
  }
  const repair = t.raw_materials.filter((m) => classifyMaterialForSeed(toLedgerMaterial(m, t)).kind === 'K-C');
  if (repair.length) {
    const next = { stock_adjustments: [...t.stock_adjustments], material_movements: [...t.material_movements] };
    repair.forEach((m) => openingRows(next, m.material_id, toDecimalText(m.stock)));
    commit(next);
    t = { ...t, ...next };
  }
  return t;
}

/** number/teks stok → teks 2 desimal (stok mock lama number, mis. 6.5 → "6.50") */
export function toDecimalText(value) {
  const [whole, fraction = ''] = String(value).split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}

/** Tulis beberapa tabel sekaligus (setelah seluruh validasi lulus) */
export function commit(tables) {
  Object.entries(tables).forEach(([name, rows]) => updateTable(name, () => rows));
}

/**
 * Terapkan rencana dampak ke tabel kerja `t` (stockLedger.service server): batas [0, 99.999.999,99] → 409
 * STOCK_OUT_OF_RANGE; mutasi ≠ 0; stok bahan diperbarui. `referenceOf(row)` → {adjustment_id} | {receipt_id, po_item_id}.
 */
export function applyMovements(t, plan, referenceOf, actorId) {
  const locked = new Map(t.raw_materials.map((m) => [String(m.material_id), toDecimalText(m.stock)]));
  const result = applyStockDeltas(locked, plan);
  if (result.status !== 200) throw createApiError(result.message, 409, result.code, { fieldErrors: { materials: result.materials.join(', ') } });
  const at = nowIso();
  const written = [];
  let movements = [...t.material_movements];
  for (const m of result.movements) {
    const row = {
      movement_id: nextId(movements, 'movement_id'), material_id: Number(m.material_id), type: m.type, qty_change: m.qty_change,
      stock_before: m.stock_before, stock_after: m.stock_after, adjustment_id: null, receipt_id: null, po_item_id: null,
      created_by: actorId, created_at: at, ...referenceOf(m),
    };
    movements = [...movements, row];
    written.push({ ...m, movement_id: String(row.movement_id) });
  }
  const changed = new Set(plan.map((row) => String(row.material_id)));
  t.material_movements = movements;
  t.raw_materials = t.raw_materials.map((m) => (changed.has(String(m.material_id)) ? { ...m, stock: Number(result.stocks.get(String(m.material_id))) } : m));
  return written;
}

export const movementView = (m) => (m ? {
  movement_id: m.movement_id, type: m.type, qty_change: m.qty_change, stock_before: m.stock_before, stock_after: m.stock_after,
} : null);

/**
 * Idempotensi request_id (operationRequest.service server, §5.2): sama → kembalikan respons asli; berbeda → 409
 * REQUEST_ID_REUSED. Mock berjalan satu per satu (tanpa REQUEST_IN_PROGRESS). `work()` mengembalikan {data, tables}.
 */
export async function runMockOperation({ requestId, actorId, operation, targetType = null, targetId = null, payload, successStatus }, work) {
  const policy = requestIdPolicyError(operation, requestId ?? undefined); // = middleware requestId server (wajib/format)
  if (policy) throw createApiError(policy.message, policy.status);
  if (!requestId) {
    const { data, tables } = work();
    commit(tables);
    return data;
  }
  const hash = await payloadHash(payload);
  const stored = getTables('operation_requests').operation_requests.find((r) => r.request_id === requestId);
  const incoming = { actor_id: actorId, operation, target_type: targetType, target_id: targetId, payload_hash: hash };
  if (stored) {
    const decision = duplicateRequestDecision(stored, incoming);
    if (decision.action === 'reject') throw createApiError(decision.message, decision.status, decision.code);
    return decision.body.data;
  }
  const { data, tables } = work();
  const requests = getTables('operation_requests').operation_requests;
  commit({ ...tables, operation_requests: [...requests, { request_id: requestId, ...incoming, response_status: successStatus, response_body: { status: 'success', data }, created_at: nowIso() }] });
  return data;
}
