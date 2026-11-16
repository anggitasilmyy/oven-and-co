// CR-04b · FR-45, FR-46 · BR-25 – BR-29, BR-36 — aturan murni Work Order (workOrderRules) dan keluarga pengeluaran pada
// aturan pembalik/koreksi bersama (stockLedgerRules): nomor WO, validasi, transisi, baris pengeluaran, kasus hasil §8.2
// (IT-22), hasil bersih §8.3, standar/aktual/selisih §8.4 (IT-23), dampak koreksi pengeluaran §4.3 (IT-21).

const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/services/workOrderRules.service');
const L = require('../src/services/stockLedgerRules.service');
const { milliToNumber } = require('../src/services/recipeRules.service');

const products = new Map([['1', { is_active: true }], ['2', { is_active: false }]]);
const T = '2026-11-16';

test('nomor WO-YYMMDD-NNN: urutan terbesar + 1 per tanggal; nomor tanggal lain & format asing diabaikan', () => {
  assert.equal(R.formatWorkOrderNumber(T, 7), 'WO-261116-007');
  assert.equal(R.nextWorkOrderNumber([], T), 'WO-261116-001');
  assert.equal(R.nextWorkOrderNumber(['WO-261116-001', 'WO-261116-009', 'WO-261115-050', 'WO-261116-x', 'PO-261116-099'], T), 'WO-261116-010');
});

test('validasi WO: produk aktif, rencana bulat 1 – 10.000, tanggal T … T+29 WIB, catatan ≤ 255', () => {
  const ok = R.validateWorkOrder({ product_id: 1, production_date: T, qty_planned: '20', note: '  pagi  ' }, { products, todayKey: T });
  assert.deepEqual(ok, { errors: {}, value: { product_id: '1', production_date: T, qty_planned: 20, note: 'pagi' } });
  assert.equal(R.validateWorkOrder({ product_id: '1', production_date: '2026-12-15', qty_planned: 10000 }, { products, todayKey: T }).value.qty_planned, 10000);
  const bad = R.validateWorkOrder({ product_id: '2', production_date: '2026-12-16', qty_planned: 1.5, note: 'x'.repeat(256) }, { products, todayKey: T });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['note', 'product_id', 'production_date', 'qty_planned']);
  for (const qty of [0, 10001, -1, '1.0', '', null, true]) assert.ok(R.validateWorkOrder({ product_id: 1, production_date: T, qty_planned: qty }, { products, todayKey: T }).errors.qty_planned, String(qty));
  for (const date of ['2026-11-15', '2026-02-30', '16-11-2026', 20261116]) assert.ok(R.validateWorkOrder({ product_id: 1, production_date: date, qty_planned: 1 }, { products, todayKey: T }).errors.production_date, String(date));
  assert.ok(R.validateWorkOrder({ product_id: 99, production_date: T, qty_planned: 1 }, { products, todayKey: T }).errors.product_id);
});

test('transisi {from, to} (BR-25): mulai & batal dari Draft, batal dari Diproses; Selesai/Dibatalkan final; status berubah → 409', () => {
  assert.equal(R.workOrderTransitionError('draft', 'draft', 'diproses'), null);
  assert.equal(R.workOrderTransitionError('draft', 'draft', 'dibatalkan'), null);
  assert.equal(R.workOrderTransitionError('diproses', 'diproses', 'dibatalkan'), null);
  assert.equal(R.workOrderTransitionError('diproses', 'draft', 'diproses').message, 'Status WO sudah berubah. Muat ulang data.');
  for (const [from, to] of [['draft', 'selesai'], ['diproses', 'selesai'], ['diproses', 'draft'], ['selesai', 'dibatalkan'], ['dibatalkan', 'diproses']]) {
    assert.deepEqual(R.workOrderTransitionError(from, from, to), { status: 409, message: 'Perubahan status WO tidak diizinkan.' }, `${from} → ${to}`);
  }
});

test('baris pengeluaran: 1 – 30 bahan master tanpa duplikat; qty teks > 0, ≤ 2 desimal; urut material_id; status WO', () => {
  const master = new Set(['1', '2', '10']);
  assert.deepEqual(R.validateIssueLines(master, [{ material_id: '10', qty: '1.5' }, { material_id: 2, qty: '0.01' }]),
    { status: 200, value: [{ material_id: '2', qty: '0.01' }, { material_id: '10', qty: '1.50' }] });
  assert.deepEqual(R.validateIssueLines(master, []), { status: 400, errors: { lines: 'Minimal 1 bahan.' } });
  assert.equal(R.validateIssueLines(master, Array.from({ length: 31 }, () => ({ material_id: '1', qty: '1' }))).errors.lines, 'Maksimal 30 bahan per pengeluaran.');
  const bad = R.validateIssueLines(master, [{ material_id: '1', qty: '1' }, { material_id: '1', qty: '0' }, { material_id: '99', qty: 2 }, { material_id: '2', qty: '1.234' }]);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['lines.1.material_id', 'lines.1.qty', 'lines.2.material_id', 'lines.2.qty', 'lines.3.qty']);
  assert.equal(R.issueStatusError('diproses'), null);
  for (const s of ['draft', 'selesai', 'dibatalkan']) assert.equal(R.issueStatusError(s).status, 409, s);
  for (const s of ['diproses', 'selesai', 'dibatalkan']) assert.equal(R.issueCorrectionStatusError(s), null, s);
  assert.equal(R.issueCorrectionStatusError('draft').status, 409);
  assert.equal(R.completionStatusError('diproses'), null);
  assert.equal(R.completionStatusError('draft').status, 409);
  assert.deepEqual(R.issuePlan([{ material_id: '10', qty: '1.50' }, { material_id: '2', qty: '0.01' }]),
    [{ material_id: '2', delta: -1n, type: 'pengeluaran_produksi' }, { material_id: '10', delta: -150n, type: 'pengeluaran_produksi' }]);
});

test('IT-21 (aturan): pembalik pengeluaran +qty; koreksi multi-bahan 10 → 8 (+2 rujuk P), 5 → hapus (+5 rujuk R), sama (tanpa mutasi)', () => {
  const O = [{ material_id: '1', qty: '10.00' }, { material_id: '2', qty: '5.00' }, { material_id: '3', qty: '4.00' }];
  assert.deepEqual(L.planReversalOrCorrection('material_issue', O, null).map((r) => [r.material_id, r.delta, r.reference, r.type]),
    [['1', 1000n, 'R', 'pembalik_pengeluaran'], ['2', 500n, 'R', 'pembalik_pengeluaran'], ['3', 400n, 'R', 'pembalik_pengeluaran']]);
  const P = [{ material_id: '1', qty: '8.00' }, { material_id: '3', qty: '4.00' }];
  assert.deepEqual(L.planReversalOrCorrection('material_issue', O, P).map((r) => [r.material_id, r.delta, r.reference, r.type]),
    [['1', 200n, 'P', 'koreksi_pengeluaran'], ['2', 500n, 'R', 'koreksi_pengeluaran']]);
  // Bahan baru di P (dari master): pengeluaran tambahan → mutasi negatif rujuk P
  assert.deepEqual(L.planReversalOrCorrection('material_issue', O.slice(0, 1), [{ material_id: '1', qty: '10.00' }, { material_id: '4', qty: '0.50' }])
    .map((r) => [r.material_id, r.delta, r.reference]), [['4', -50n, 'P']]);
  assert.equal(L.reversalTargetError('material_issue', { kind: 'normal', reversed: false, replaced: false }), null);
  assert.equal(L.reversalTargetError('material_issue', { kind: 'pengganti', reversed: false, replaced: false }), null);
  for (const doc of [{ kind: 'normal', reversed: true }, { kind: 'normal', replaced: true }, { kind: 'pembalik' }]) {
    assert.equal(L.reversalTargetError('material_issue', { reversed: false, replaced: false, ...doc }).code, 'DOCUMENT_ALREADY_SUPERSEDED');
  }
  assert.equal(L.correctionShapeError('material_issue', O, [{ material_id: '1', qty: '0' }]).status, 400);
  assert.equal(L.correctionShapeError('material_issue', O, [{ material_id: '9', qty: '1' }]), null, 'bahan lain boleh (master)');
});

test('IT-22 (aturan): hasil 0 → pembalik 400 → 0→5 P langsung → 5→8 R+P → pengganti langsung atas 8 → 400 → 8→8 400 → 8→0 R → terminal 409; hasil bersih', () => {
  const doc = (kind, qty, extra = {}) => ({ kind, qty_output: qty, reversed: false, replaced: false, ...extra });
  assert.deepEqual(R.planOutputReversal(doc('normal', 0)), { status: 400, message: 'Hasil 0 tidak dapat dibalik; gunakan koreksi.' });
  assert.deepEqual(R.planOutputCorrection(doc('normal', 0), 5), { status: 200, documents: [{ kind: 'pengganti', qty_output: 5 }] });
  assert.deepEqual(R.planOutputCorrection(doc('pengganti', 5), 8), { status: 200, documents: [{ kind: 'pembalik', qty_output: 5 }, { kind: 'pengganti', qty_output: 8 }] });
  assert.deepEqual(R.directReplacementError(doc('pengganti', 8)), { status: 400, message: 'Pengganti langsung hanya untuk hasil 0; gunakan koreksi.' });
  assert.equal(R.directReplacementError(doc('normal', 0)), null);
  assert.deepEqual(R.planOutputCorrection(doc('pengganti', 8), 8), { status: 400, message: 'Koreksi tidak mengubah hasil.' });
  assert.deepEqual(R.planOutputCorrection(doc('pengganti', 8), 0), { status: 200, documents: [{ kind: 'pembalik', qty_output: 8 }] });
  // Terminal: semua dokumen rantai tidak berlaku → 409 untuk koreksi, pembalik, pengganti langsung
  for (const d of [doc('normal', 0, { replaced: true }), doc('pengganti', 5, { replaced: true }), doc('pengganti', 8, { reversed: true }), doc('pembalik', 8)]) {
    assert.equal(R.planOutputCorrection(d, 3).code, 'DOCUMENT_ALREADY_SUPERSEDED');
    assert.equal(R.planOutputReversal(d).code, 'DOCUMENT_ALREADY_SUPERSEDED');
    assert.equal(R.directReplacementError(d).code, 'DOCUMENT_ALREADY_SUPERSEDED');
  }
  assert.deepEqual(R.planOutputCorrection(doc('normal', 0), 0), { status: 400, message: 'Koreksi tidak mengubah hasil.' }, 'WO-3: 0 → 0');
  for (const q of [-1, 10001, 2.5, '3x', null]) assert.equal(R.planOutputCorrection(doc('normal', 4), q).status, 400, String(q));
  const chain = [{ kind: 'normal', qty_output: 0 }];
  assert.equal(R.netOutput(chain), 0);
  chain.push({ kind: 'pengganti', qty_output: 5 });
  assert.equal(R.netOutput(chain), 5);
  chain.push({ kind: 'pembalik', qty_output: 5 }, { kind: 'pengganti', qty_output: 8 });
  assert.equal(R.netOutput(chain), 8);
  chain.push({ kind: 'pembalik', qty_output: 8 });
  assert.equal(R.netOutput(chain), 0);
});

test('IT-23 (aturan) & §8.4: standar = snapshot × hasil bersih eksak 3 desimal; aktual bertanda; selisih; gabungan bahan', () => {
  const usage = R.materialUsage(
    [{ material_id: '2', qty_per_unit: '0.015' }, { material_id: '5', qty_per_unit: '1.000' }],
    [{ material_id: '2', qty: '0.10', kind: 'normal' }, { material_id: '9', qty: '2.00', kind: 'normal' }, { material_id: '9', qty: '0.50', kind: 'pembalik' }],
    7,
  );
  assert.deepEqual(usage.map((u) => [u.material_id, milliToNumber(u.standard), milliToNumber(u.actual), milliToNumber(u.variance), u.in_recipe]),
    [['2', 0.105, 0.1, -0.005, true], ['5', 7, 0, -7, true], ['9', 0, 1.5, 1.5, false]]);
  const max = R.materialUsage([{ material_id: '1', qty_per_unit: '9999999.999' }], [], 10000);
  assert.equal(max[0].standard, 99999999990000n, 'standar maksimum 99.999.999.990,000 eksak (milli)');
  assert.deepEqual(R.materialUsage([], [], 5), [], 'snapshot kosong & tanpa pengeluaran');
});
