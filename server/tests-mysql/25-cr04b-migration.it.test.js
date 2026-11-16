// tests-mysql/25-cr04b-migration.it.test.js
// CR-04b · FR-45, FR-46 · AC-46.8 — migrasi 20261116000000_cr04b_manufacturing pada MySQL 8 (database sementara sendiri).
// IT-16  migrasi CR-04b di atas data CR-04a (39 → 44 tabel): data lama tidak berubah (jumlah baris & isi kolom lama),
//        ALTER aditif material_movements, CHECK pengganti aktif, FK baru RESTRICT/RESTRICT, buku mutasi lulus (mode
//        produksi, I-1 – I-11).
// IT-17  INSERT melanggar CHECK CR-04b ditolak (work_orders status/kolom waktu & qty, work_order_recipes qty,
//        material_issues per kind termasuk NULL/alasan kosong, material_issue_lines qty, production_outputs per kind
//        termasuk NULL & normal_wo_id ≠ wo_id, material_movements sumber/tanda pengeluaran); baris sah diterima.

const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./helpers/scratchDb');

const DB = 'ovenco_cp2_cr04b_test';
const NEW_TABLES = ['work_orders', 'work_order_recipes', 'material_issues', 'material_issue_lines', 'production_outputs'];
const NEW_CHECKS = ['ck_wo_qty', 'ck_wo_status', 'ck_wor_qty', 'ck_mi_kind', 'ck_mil_qty', 'ck_out_kind', 'ck_mm_source', 'ck_mm_sign'];
const RID = (n) => `5b5b5b5b-0000-4000-8000-${String(n).padStart(12, '0')}`;

const q = (sql) => S.mysql(sql, DB);
const rejects = (sql, label) => assert.throws(() => q(sql), /Check constraint|CONSTRAINT|cannot be null|foreign key|Duplicate entry/i, label);
const tableCount = () => Number(S.mysql(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${DB}' AND table_name <> '_prisma_migrations'`));
// Isi kolom lama yang dibandingkan sebelum & sesudah migrasi (CHECKSUM TABLE berubah karena kolom baru issue_id)
const oldData = () => q(`SELECT
  (SELECT COUNT(*) FROM raw_materials), (SELECT GROUP_CONCAT(CONCAT_WS(':', material_id, stock) ORDER BY material_id) FROM raw_materials),
  (SELECT COUNT(*) FROM stock_adjustments), (SELECT GROUP_CONCAT(CONCAT_WS(':', adjustment_id, kind, qty) ORDER BY adjustment_id) FROM stock_adjustments),
  (SELECT COUNT(*) FROM material_movements), (SELECT GROUP_CONCAT(CONCAT_WS(':', movement_id, material_id, type, qty_change, stock_before, stock_after, adjustment_id) ORDER BY movement_id) FROM material_movements),
  (SELECT COUNT(*) FROM products), (SELECT COUNT(*) FROM users), (SELECT COUNT(*) FROM orders), (SELECT COUNT(*) FROM daily_stocks)`);

test.after(() => S.dropDatabase(DB));

test('IT-16: migrasi CR-04b di atas data CR-04a — data lama tetap, ALTER aditif, CHECK & FK RESTRICT aktif, buku mutasi lulus', () => {
  S.recreateDatabase(DB);
  assert.equal(S.deploy(DB, { upToCr04a: true }).status, 0);
  assert.equal(tableCount(), 39);
  const seeded = S.seed(DB, { SEED_ANCHOR_DATE: '2026-11-16' });
  assert.equal(seeded.status, 0, seeded.output);
  // Transaksi CR-04a: stok masuk bahan 1 (dokumen + mutasi) agar data lama memuat lebih dari saldo awal
  q(`INSERT INTO stock_adjustments (material_id, kind, qty, created_by, created_at)
       SELECT 1, 'stok_masuk', 2.50, MIN(user_id), CURRENT_TIMESTAMP(3) FROM users WHERE role = 'staf';
     INSERT INTO material_movements (material_id, type, qty_change, stock_before, stock_after, adjustment_id, created_by, created_at)
       SELECT 1, 'stok_masuk', 2.50, r.stock, r.stock + 2.50, MAX(a.adjustment_id), MIN(u.user_id), CURRENT_TIMESTAMP(3)
       FROM raw_materials r, stock_adjustments a, users u WHERE r.material_id = 1 AND a.material_id = 1 AND u.role = 'staf' GROUP BY r.stock;
     UPDATE raw_materials SET stock = stock + 2.50 WHERE material_id = 1;`);
  assert.equal(S.checkLedger(DB).status, 0, 'buku mutasi CR-04a sah sebelum migrasi');
  const before = oldData();

  const migrate = S.deploy(DB);
  assert.equal(migrate.status, 0, migrate.output);
  assert.equal(tableCount(), 44);
  assert.equal(oldData(), before, 'data CR-04a & tabel lama tidak berubah');
  assert.equal(q("SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name LIKE '%cr04b%' AND finished_at IS NOT NULL"), '1');
  for (const t of NEW_TABLES) assert.equal(q(`SELECT COUNT(*) FROM ${t}`), '0', `${t} kosong`);
  assert.equal(q("SELECT COUNT(*) FROM material_movements WHERE issue_id IS NOT NULL"), '0');

  const checks = q(`SELECT CONSTRAINT_NAME FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = '${DB}'`).split('\n');
  for (const c of NEW_CHECKS) assert.ok(checks.includes(c), `CHECK ${c}`);
  const fks = q(`SELECT CONCAT(TABLE_NAME, ':', DELETE_RULE, ':', UPDATE_RULE) FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = '${DB}' AND (TABLE_NAME IN (${NEW_TABLES.map((t) => `'${t}'`).join(',')}) OR CONSTRAINT_NAME = 'material_movements_issue_id_fkey')`).split('\n');
  assert.equal(fks.length, 19, 'FK baru: 18 tabel CR-04b + material_movements.issue_id');
  assert.ok(fks.every((f) => f.endsWith(':RESTRICT:RESTRICT')), fks.join(' '));
  const enumType = q(`SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${DB}' AND TABLE_NAME = 'material_movements' AND COLUMN_NAME = 'type'`);
  for (const t of ['pengeluaran_produksi', 'pembalik_pengeluaran', 'koreksi_pengeluaran', 'koreksi_penerimaan']) assert.ok(enumType.includes(`'${t}'`), t);

  const ledger = S.checkLedger(DB);
  assert.equal(ledger.status, 0, ledger.output);
});

test('IT-17: INSERT melanggar CHECK CR-04b ditolak; baris sah diterima', () => {
  const staff = q("SELECT MIN(user_id) FROM users WHERE role = 'staf'");
  q(`INSERT INTO operation_requests (request_id, operation, actor_id, payload_hash, response_status, response_body)
       VALUES ${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `('${RID(n)}', 'it17', ${staff}, REPEAT('a', 64), 201, '{}')`).join(', ')};`);
  const wo = (n, status, extra = '') => `INSERT INTO work_orders (wo_number, product_id, production_date, qty_planned, status,
    started_at, recipe_snapshot_at, completed_at, cancelled_at, created_by, created_request_id, updated_at)
    VALUES ('WO-IT17-${n}', 1, '2026-11-16', 5, '${status}', ${extra}, ${staff}, '${RID(n)}', CURRENT_TIMESTAMP(3));`;
  const T = 'CURRENT_TIMESTAMP(3)';
  // work_orders: status ↔ kolom waktu, qty_planned 1 – 10.000
  rejects(wo(9, 'draft', `${T}, NULL, NULL, NULL`), 'draft dengan started_at');
  rejects(wo(9, 'diproses', `${T}, NULL, NULL, NULL`), 'diproses tanpa recipe_snapshot_at');
  rejects(wo(9, 'selesai', `${T}, ${T}, NULL, NULL`), 'selesai tanpa completed_at');
  rejects(wo(9, 'dibatalkan', `NULL, NULL, ${T}, ${T}`), 'dibatalkan dengan completed_at');
  rejects(wo(9, 'dibatalkan', `${T}, NULL, NULL, ${T}`), 'dibatalkan: started tanpa snapshot');
  rejects(wo(9, 'diproses', `${T}, ${T}, NULL, ${T}`), 'diproses dengan cancelled_at');
  rejects(wo(9, 'draft', 'NULL, NULL, NULL, NULL').replace("'2026-11-16', 5,", "'2026-11-16', 0,"), 'qty_planned 0');
  rejects(wo(9, 'draft', 'NULL, NULL, NULL, NULL').replace("'2026-11-16', 5,", "'2026-11-16', 10001,"), 'qty_planned > 10.000');
  q(wo(1, 'draft', 'NULL, NULL, NULL, NULL'));
  q(wo(2, 'diproses', `${T}, ${T}, NULL, NULL`));
  q(wo(3, 'dibatalkan', `NULL, NULL, NULL, ${T}`));
  const [w1, w2] = q("SELECT wo_id FROM work_orders WHERE wo_number IN ('WO-IT17-1', 'WO-IT17-2') ORDER BY wo_number").split('\n');
  assert.equal(q("SELECT COUNT(*) FROM work_orders WHERE wo_number LIKE 'WO-IT17-%'"), '3');

  // work_order_recipes: 0 < takaran ≤ 9.999.999,999
  rejects(`INSERT INTO work_order_recipes (wo_id, material_id, qty_per_unit) VALUES (${w2}, 1, 0);`, 'takaran 0');
  q(`INSERT INTO work_order_recipes (wo_id, material_id, qty_per_unit) VALUES (${w2}, 1, 0.015);`);

  // material_issues per kind; material_issue_lines qty
  const issue = (kind, reverses, replaces, reason) => `INSERT INTO material_issues (wo_id, kind, reverses_id, replaces_id, reason,
    operation_request_id, created_by) VALUES (${w2}, '${kind}', ${reverses}, ${replaces}, ${reason}, '${RID(4)}', ${staff});`;
  q(issue('normal', 'NULL', 'NULL', 'NULL'));
  const i1 = q('SELECT MAX(issue_id) FROM material_issues');
  rejects(issue('normal', 'NULL', 'NULL', "'alasan'"), 'normal dengan alasan');
  rejects(issue('normal', i1, 'NULL', 'NULL'), 'normal dengan reverses_id');
  rejects(issue('pembalik', i1, 'NULL', 'NULL'), 'pembalik tanpa alasan');
  rejects(issue('pembalik', i1, 'NULL', "'   '"), 'pembalik alasan kosong');
  rejects(issue('pembalik', 'NULL', 'NULL', "'x'"), 'pembalik tanpa reverses_id');
  rejects(issue('pengganti', 'NULL', 'NULL', "'x'"), 'pengganti tanpa replaces_id');
  rejects(issue('pengganti', i1, i1, "'x'"), 'pengganti dengan reverses_id');
  rejects(`INSERT INTO material_issue_lines (issue_id, material_id, qty) VALUES (${i1}, 1, 0);`, 'qty 0');
  rejects(`INSERT INTO material_issue_lines (issue_id, material_id, qty) VALUES (${i1}, 1, -1);`, 'qty negatif');
  q(`INSERT INTO material_issue_lines (issue_id, material_id, qty) VALUES (${i1}, 1, 0.10);`);

  // production_outputs per kind (normal 0 – 10.000 & normal_wo_id = wo_id; pembalik/pengganti 1 – 10.000 + alasan)
  const out = (woId, kind, qty, normal, reverses, replaces, reason, rid = 5) => `INSERT INTO production_outputs (wo_id, kind, qty_output,
    normal_wo_id, reverses_id, replaces_id, reason, operation_request_id, created_by) VALUES (${woId}, '${kind}', ${qty}, ${normal},
    ${reverses}, ${replaces}, ${reason}, '${RID(rid)}', ${staff});`;
  rejects(out(w2, 'normal', -1, w2, 'NULL', 'NULL', 'NULL'), 'normal qty < 0');
  rejects(out(w2, 'normal', 10001, w2, 'NULL', 'NULL', 'NULL'), 'normal qty > 10.000');
  rejects(out(w2, 'normal', 0, 'NULL', 'NULL', 'NULL', 'NULL'), 'normal tanpa normal_wo_id');
  rejects(out(w2, 'normal', 0, w1, 'NULL', 'NULL', 'NULL'), 'normal_wo_id ≠ wo_id');
  rejects(out(w2, 'normal', 0, w2, 'NULL', 'NULL', "'x'"), 'normal dengan alasan');
  q(out(w2, 'normal', 0, w2, 'NULL', 'NULL', 'NULL'));
  const o1 = q('SELECT MAX(output_id) FROM production_outputs');
  rejects(out(w1, 'normal', 1, w1, 'NULL', 'NULL', 'NULL').replace(`${w1}, 'normal', 1, ${w1}`, `${w2}, 'normal', 1, ${w2}`), 'normal kedua per WO (uq_po_normal)');
  rejects(out(w2, 'pembalik', 0, 'NULL', o1, 'NULL', "'x'"), 'pembalik qty 0');
  rejects(out(w2, 'pembalik', 3, 'NULL', o1, 'NULL', 'NULL'), 'pembalik tanpa alasan');
  rejects(out(w2, 'pembalik', 3, w2, o1, 'NULL', "'x'"), 'pembalik dengan normal_wo_id');
  rejects(out(w2, 'pengganti', 3, 'NULL', o1, o1, "'x'"), 'pengganti dengan reverses_id');
  rejects(out(w2, 'pengganti', 3, 'NULL', 'NULL', 'NULL', "'x'"), 'pengganti tanpa replaces_id');
  q(out(w2, 'pengganti', 3, 'NULL', 'NULL', o1, "'koreksi 0 → 3'", 6));

  // material_movements: sumber & tanda pengeluaran
  const mm = (type, change, source) => `INSERT INTO material_movements (material_id, type, qty_change, stock_before, stock_after,
    ${source[0]}, created_by) VALUES (1, '${type}', ${change}, 5, ${5 + change}, ${source[1]}, ${staff});`;
  rejects(mm('pengeluaran_produksi', 1, ['issue_id', i1]), 'pengeluaran bertanda +');
  rejects(mm('pembalik_pengeluaran', -1, ['issue_id', i1]), 'pembalik pengeluaran bertanda −');
  rejects(mm('pengeluaran_produksi', -1, ['adjustment_id', 1]), 'pengeluaran tanpa issue_id');
  rejects(`INSERT INTO material_movements (material_id, type, qty_change, stock_before, stock_after, adjustment_id, issue_id, created_by)
    VALUES (1, 'stok_masuk', 1, 5, 6, 1, ${i1}, ${staff});`, 'stok masuk dengan issue_id');
  q(mm('pengeluaran_produksi', -0.1, ['issue_id', i1]));
  rejects(mm('koreksi_pengeluaran', 0.1, ['issue_id', i1]), 'UNIQUE (issue_id, material_id)');
});
