// Uji CR-04b (Vitest) · FR-45, FR-46 · BR-25 – BR-29, BR-36 — aturan murni client utils/rules/{workOrder,stockLedger,
// ledger}.js dan konstanta harus identik dengan server services/{workOrderRules,stockLedgerRules,ledgerRules}.service.js
// untuk input yang sama (kasus tepi + acak deterministik). Mode mock memakai modul client, API memakai modul server.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SK = require('../../../server/src/utils/businessConstants.js');
const SR = require('../../../server/src/services/workOrderRules.service.js');
const SL = require('../../../server/src/services/stockLedgerRules.service.js');
const SG = require('../../../server/src/services/ledgerRules.service.js');
const KP = await import('../../src/constants/workOrder.js');
const KU = await import('../../src/constants/purchasing.js');
const CR = await import('../../src/utils/rules/workOrder.js');
const CL = await import('../../src/utils/rules/stockLedger.js');
const CG = await import('../../src/utils/rules/ledger.js');

function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261116);
const int = (n) => Math.floor(rand() * n);
const pick = (xs) => xs[int(xs.length)];
const qty = () => pick(['0', '0.01', '1', '1.5', '10.00', '1.234', '-1', '', null, 3, '99999999.99', '100000000', `${int(500)}.${String(int(100)).padStart(2, '0')}`]);
const same = (a, b, label) => assert.deepEqual(a, b, label);

test('konstanta & allowlist request_id client = server', () => {
  for (const k of ['WO_STATUS', 'WO_MANUAL_TRANSITIONS', 'WO_NUMBER_PREFIX', 'WO_QTY_MAX', 'WO_MAX_ISSUE_LINES']) same(KP[k], SK[k], k);
  same(KU.REQUEST_ID_POLICY, SK.REQUEST_ID_POLICY, 'REQUEST_ID_POLICY');
});

test('validasi WO, transisi, nomor: client = server', () => {
  const products = new Map([['1', { is_active: true }], ['2', { is_active: false }]]);
  for (let n = 0; n < 400; n += 1) {
    const input = {
      product_id: pick([1, '1', '2', '99', 'x', null, ' 1 ']), qty_planned: pick([1, 20, 10000, 10001, 0, '5', '5.5', 1.5, null, -3]),
      production_date: pick(['2026-11-16', '2026-12-15', '2026-12-16', '2026-11-15', '2026-02-30', 20261116, '']), note: pick([undefined, null, ' x ', 'a'.repeat(256), 5]),
    };
    same(CR.validateWorkOrder(input, { products, todayKey: '2026-11-16' }), SR.validateWorkOrder(input, { products, todayKey: '2026-11-16' }), JSON.stringify(input));
  }
  const statuses = Object.values(SK.WO_STATUS);
  for (const a of statuses) for (const b of statuses) for (const c of statuses) same(CR.workOrderTransitionError(a, b, c), SR.workOrderTransitionError(a, b, c), `${a}/${b}/${c}`);
  const numbers = ['WO-261116-001', 'WO-261116-012', 'WO-261115-099', 'WO-261116-abc', 'PO-261116-050'];
  for (const d of ['2026-11-16', '2026-11-15', '2027-01-01']) same(CR.nextWorkOrderNumber(numbers, d), SR.nextWorkOrderNumber(numbers, d), d);
});

test('baris pengeluaran, status, rencana mutasi, keluarga material_issue: client = server', () => {
  const master = new Set(['1', '2', '3', '10']);
  for (let n = 0; n < 400; n += 1) {
    const lines = n % 50 === 0 ? pick([[], null, 'x']) : Array.from({ length: 1 + int(5) }, () => ({ material_id: pick([1, '2', '3', '10', '99', null, '01']), qty: qty() }));
    same(CR.validateIssueLines(master, lines), SR.validateIssueLines(master, lines), `lines ${n}`);
    const O = Array.from({ length: 1 + int(3) }, (_, i) => ({ material_id: String(i + 1), qty: `${1 + int(20)}.00` }));
    const P = rand() < 0.3 ? null : Array.from({ length: int(4) }, (_, i) => ({ material_id: String(i + 1 + int(2)), qty: `${int(20)}.${String(int(100)).padStart(2, '0')}` }));
    same(CL.planReversalOrCorrection('material_issue', O, P), SL.planReversalOrCorrection('material_issue', O, P), `plan ${n}`);
    same(CL.correctionShapeError('material_issue', O, P), SL.correctionShapeError('material_issue', O, P), `shape ${n}`);
  }
  for (const s of Object.values(SK.WO_STATUS)) {
    same(CR.issueStatusError(s), SR.issueStatusError(s));
    same(CR.issueCorrectionStatusError(s), SR.issueCorrectionStatusError(s));
    same(CR.completionStatusError(s), SR.completionStatusError(s));
  }
  for (const doc of [{ kind: 'normal' }, { kind: 'pengganti' }, { kind: 'pembalik' }, { kind: 'normal', reversed: true }, { kind: 'normal', replaced: true }]) {
    const d = { reversed: false, replaced: false, ...doc };
    same(CL.reversalTargetError('material_issue', d), SL.reversalTargetError('material_issue', d), JSON.stringify(d));
  }
  same(CR.issuePlan([{ material_id: '10', qty: '1.50' }, { material_id: '2', qty: '0.01' }]), SR.issuePlan([{ material_id: '10', qty: '1.50' }, { material_id: '2', qty: '0.01' }]));
});

test('dokumen hasil (§8.2), hasil bersih (§8.3), standar/aktual/selisih (§8.4): client = server', () => {
  for (let n = 0; n < 400; n += 1) {
    const doc = { kind: pick(['normal', 'pengganti', 'pembalik']), qty_output: pick([0, 1, 5, 8, 10000]), reversed: rand() < 0.2, replaced: rand() < 0.2 };
    const q = pick([0, 1, 5, 8, 10000, 10001, -1, 2.5, '3', '3x', null]);
    same(CR.planOutputCorrection(doc, q), SR.planOutputCorrection(doc, q), `${JSON.stringify(doc)} → ${q}`);
    same(CR.planOutputReversal(doc), SR.planOutputReversal(doc));
    same(CR.directReplacementError(doc), SR.directReplacementError(doc));
    const outputs = Array.from({ length: int(5) }, () => ({ kind: pick(['normal', 'pengganti', 'pembalik']), qty_output: int(10001) }));
    same(CR.netOutput(outputs), SR.netOutput(outputs));
    const snapshot = Array.from({ length: int(4) }, (_, i) => ({ material_id: String(i + 1), qty_per_unit: `${int(10000)}.${String(int(1000)).padStart(3, '0')}` }));
    const issues = Array.from({ length: int(5) }, () => ({ material_id: String(1 + int(6)), qty: `${int(500)}.${String(int(100)).padStart(2, '0')}`, kind: pick(['normal', 'pengganti', 'pembalik']) }));
    const output = int(10001);
    same(CR.materialUsage(snapshot, issues, output), SR.materialUsage(snapshot, issues, output), 'usage');
  }
});

test('invarian buku mutasi dengan baris pengeluaran (I-5, I-8, I-11): client = server', () => {
  const T0 = Date.UTC(2026, 10, 16, 1);
  const at = (ms) => new Date(T0 + ms);
  for (let n = 0; n < 200; n += 1) {
    const issueQty = `${1 + int(10)}.00`;
    const material = {
      materialId: '1', name: 'Tepung', stock: pick(['10.00', '20.00', `${20 - Number(issueQty)}.00`]),
      adjustments: [{ adjustmentId: '1', kind: 'saldo_awal', qty: '20.00', openingMaterialId: '1', operationRequestId: null, createdAt: at(0) }],
      movements: [
        { movementId: '1', materialId: '1', type: 'saldo_awal', qtyChange: '20.00', stockBefore: '0.00', stockAfter: '20.00', adjustmentId: '1', receiptId: null, poItemId: null, issueId: null, createdAt: at(0) },
        ...(rand() < 0.8 ? [{ movementId: '2', materialId: '1', type: pick(['pengeluaran_produksi', 'stok_masuk']), qtyChange: `-${issueQty}`, stockBefore: '20.00', stockAfter: `${20 - Number(issueQty)}.00`, adjustmentId: null, receiptId: null, poItemId: null, issueId: '1', createdAt: at(2) }] : []),
      ],
      receiptLines: [],
      issueLines: [{ issueId: '1', woId: '7', qty: issueQty, kind: pick(['normal', 'pembalik']), operationRequestId: 'op-1', createdAt: at(pick([-1, 2])) }],
    };
    same(CG.checkMaterialLedger(material), SG.checkMaterialLedger(material), `ledger ${n}`);
  }
});

test('tampilan detail & daftar WO (toWorkOrderView, toWorkOrderListRow): client = server', async () => {
  const SV = require('../../../server/src/services/workOrderViewRules.service.js');
  const CV = await import('../../src/utils/rules/workOrderView.js');
  const materials = new Map([['1', { name: 'Tepung', unit: 'kg' }], ['2', { name: 'Gula', unit: 'kg' }], ['3', { name: 'Garam', unit: 'kg' }]]);
  const wo = (status, snapshot) => ({
    wo_id: 7n, wo_number: 'WO-261116-001', product_id: 3n, product_name: 'Roti', production_date: new Date('2026-11-16T00:00:00.000Z'),
    qty_planned: 7, status, note: null, recipe_snapshot_at: snapshot, started_at: snapshot, completed_at: null, cancelled_at: null,
    created_at: new Date('2026-11-16T01:02:03.004Z'),
  });
  const T = new Date('2026-11-16T02:00:00.000Z');
  const cases = [
    { wo: wo('draft', null), recipe: [], issues: [], outputs: [], materials },
    { wo: wo('diproses', T), recipe: [], issues: [], outputs: [], materials }, // WO tanpa resep
    {
      wo: wo('selesai', T), materials,
      recipe: [{ material_id: 1n, qty_per_unit: '0.015' }, { material_id: 2n, qty_per_unit: '9999999.999' }],
      issues: [
        { issue_id: 1n, kind: 'normal', reverses_id: null, replaces_id: null, reason: null, created_at: T, reversed_count: 1, replaced_count: 1, lines: [{ material_id: 1n, qty: '0.10' }, { material_id: 3n, qty: '0.50' }] },
        { issue_id: 2n, kind: 'pembalik', reverses_id: 1n, replaces_id: null, reason: 'salah', created_at: T, reversed_count: 0, replaced_count: 0, lines: [{ material_id: 1n, qty: '0.10' }, { material_id: 3n, qty: '0.50' }] },
        { issue_id: 3n, kind: 'pengganti', reverses_id: null, replaces_id: 1n, reason: 'salah', created_at: T, reversed_count: 0, replaced_count: 0, lines: [{ material_id: 1n, qty: '0.10' }] },
      ],
      outputs: [
        { output_id: 1n, kind: 'normal', qty_output: 10000, reverses_id: null, replaces_id: null, reason: null, recorded_at: T, reversed_count: 1, replaced_count: 1 },
        { output_id: 2n, kind: 'pembalik', qty_output: 10000, reverses_id: 1n, replaces_id: null, reason: 'x', recorded_at: T, reversed_count: 0, replaced_count: 0 },
        { output_id: 3n, kind: 'pengganti', qty_output: 7, reverses_id: null, replaces_id: 1n, reason: 'x', recorded_at: T, reversed_count: 0, replaced_count: 0 },
      ],
    },
  ];
  for (const [i, c] of cases.entries()) {
    same(CV.toWorkOrderView(c), SV.toWorkOrderView(c), `detail #${i}`);
    same(CV.toWorkOrderListRow(c.wo, c.outputs), SV.toWorkOrderListRow(c.wo, c.outputs), `daftar #${i}`);
  }
  const done = CV.toWorkOrderView(cases[2]);
  same([done.net_output, done.usage.map((u) => [u.material_id, u.standard, u.actual, u.variance])],
    [7, [['1', 0.105, 0.1, -0.005], ['2', 69999999.993, 0, -69999999.993], ['3', 0, 0, 0]]], 'IT-23: 0,015 × 7 = 0,105; aktual 0,10 → selisih −0,005');
  same(CV.toWorkOrderView(cases[1]).without_recipe, true, 'WO tanpa resep');
});
