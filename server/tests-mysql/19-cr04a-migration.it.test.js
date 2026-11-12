// tests-mysql/19-cr04a-migration.it.test.js
// CR-04a CP2 · FR-44 · BR-23 — migrasi 20261112000000_cr04a_purchasing pada MySQL 8 (database sementara sendiri).
// IT-01  upgrade 30 → 39 tabel: satu saldo awal per bahan, mutasi hanya stok > 0, stok tidak berubah, FK RESTRICT/RESTRICT,
//        12 CHECK, I-1 – I-11 (`db:check-ledger` mode produksi).
// IT-34  saldo awal = snapshot M-4 persis (0; 0,01; 1.234,56; 99.999.999,99); tanpa duplikat; eksekusi ulang data step
//        ditolak UNIQUE; snapshot deterministik (IMPL-CP2-2: dua kali → hash sama; nilai berubah → hash beda).
// IT-02  backup (mysqldump) + restore uji: snapshot hasil restore = snapshot M-4 (M-6).
// IT-03  kegagalan M-7 disuntik → restore backup → database identik backup, `_prisma_migrations` tanpa CR-04a.
// IT-04  INSERT melanggar setiap CHECK CR-04a ditolak; baris sah (saldo awal 0, opname tanpa reason) diterima; FK RESTRICT.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ARTIFACT_DIR } = require('./helpers/context');
const S = require('./helpers/scratchDb');

const UP = 'ovenco_cp2_upgrade_test';
const RESTORED = 'ovenco_cp2_restored_test';
const FAIL = 'ovenco_cp2_failed_test';
const SNAP = path.join(ARTIFACT_DIR, 'cp2-snapshot-m4.csv');
const BACKUP = path.join(ARTIFACT_DIR, 'cp2-backup-m5.sql');
const STOCKS = ['0.00', '0.01', '1234.56', '99999999.99', '42.00', '6.50'];
const CR04A_TABLES = ['operation_requests', 'suppliers', 'supplier_materials', 'purchase_orders', 'purchase_order_items',
  'goods_receipts', 'goods_receipt_lines', 'stock_adjustments', 'material_movements'];

const tableCount = (name) => Number(S.mysql(`SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = '${name}' AND table_name <> '_prisma_migrations'`));
const insertMaterials = (name) => S.mysql(STOCKS.map((s, i) => `INSERT INTO raw_materials (name, unit, stock, min_stock)
  VALUES ('Bahan U${i}', 'kg', ${s}, 1);`).join('\n'), name);

test.after(() => { for (const name of [UP, RESTORED, FAIL]) S.dropDatabase(name); });

test('IT-01 · IT-34 · IT-02: upgrade 30 → 39 tabel dengan snapshot M-4, backup terverifikasi, saldo awal = snapshot', () => {
  S.recreateDatabase(UP);
  assert.equal(S.deploy(UP, { preCr04a: true }).status, 0);
  assert.equal(tableCount(UP), 30);
  insertMaterials(UP);

  // M-4 snapshot deterministik (IMPL-CP2-2)
  assert.equal(S.snapshot(UP, ['--out', SNAP]).status, 0);
  const meta = JSON.parse(fs.readFileSync(`${SNAP}.meta.json`, 'utf8'));
  assert.equal(meta.count, STOCKS.length);
  assert.equal(meta.sum, '100001283.06'); // Σ eksak dari SUM MySQL
  const csv = fs.readFileSync(SNAP, 'utf8');
  assert.match(csv, /^material_id,stock\n1,0\.00\n2,0\.01\n3,1234\.56\n4,99999999\.99\n5,42\.00\n6,6\.50\n$/);
  assert.equal(S.snapshot(UP, ['--compare', SNAP]).status, 0, 'dibuat ulang dari data yang sama → hash sama');

  // M-5/M-6: backup + restore uji
  S.dump(UP, BACKUP);
  S.restore(RESTORED, BACKUP);
  assert.equal(S.snapshot(RESTORED, ['--compare', SNAP]).status, 0);
  S.mysql('UPDATE raw_materials SET stock = 0.02 WHERE material_id = 2;', RESTORED);
  assert.equal(S.snapshot(RESTORED, ['--compare', SNAP]).status, 1, 'nilai berubah → hash beda');

  // M-7 migrasi, M-8 validasi
  const migrate = S.deploy(UP);
  assert.equal(migrate.status, 0, migrate.output);
  assert.equal(tableCount(UP), 39);
  assert.equal(S.snapshot(UP, ['--compare', SNAP]).status, 0, 'raw_materials tidak berubah');
  const verify = S.snapshot(UP, ['--verify-opening', SNAP]);
  assert.equal(verify.status, 0, verify.output);
  assert.equal(S.mysql("SELECT COUNT(*) FROM stock_adjustments WHERE kind = 'saldo_awal'", UP), String(STOCKS.length));
  assert.equal(S.mysql("SELECT COUNT(*) FROM material_movements WHERE type = 'saldo_awal'", UP), String(STOCKS.length - 1));
  assert.equal(S.mysql('SELECT COUNT(*) FROM (SELECT material_id FROM stock_adjustments GROUP BY material_id HAVING COUNT(*) > 1) d', UP), '0');
  assert.equal(S.mysql("SELECT COUNT(*) FROM material_movements WHERE created_by IS NOT NULL OR stock_before <> 0", UP), '0');
  const ledger = S.checkLedger(UP);
  assert.equal(ledger.status, 0, ledger.output);

  // Eksekusi ulang data step ditolak UNIQUE (uq_sa_opening)
  assert.throws(() => S.mysql(`INSERT INTO stock_adjustments (material_id, kind, qty, opening_material_id)
    SELECT material_id, 'saldo_awal', stock, material_id FROM raw_materials;`, UP), /Duplicate entry/);
  assert.equal(S.mysql("SELECT COUNT(*) FROM stock_adjustments", UP), String(STOCKS.length));
});

test('IT-01: FK CR-04a RESTRICT/RESTRICT dan 12 CHECK terpasang', () => {
  const rules = S.mysql(`SELECT CONCAT(TABLE_NAME, '.', CONSTRAINT_NAME, ':', DELETE_RULE, '/', UPDATE_RULE)
    FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = '${UP}'
    AND TABLE_NAME IN (${CR04A_TABLES.map((t) => `'${t}'`).join(',')})`).split('\n');
  assert.equal(rules.length, 27);
  assert.deepEqual(rules.filter((r) => !r.endsWith(':RESTRICT/RESTRICT')), []);
  const checks = S.mysql(`SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = '${UP}'
    AND CONSTRAINT_TYPE = 'CHECK' ORDER BY CONSTRAINT_NAME`).split('\n');
  assert.deepEqual(checks, ['ck_gr_kind', 'ck_grl_qty', 'ck_mm_actor', 'ck_mm_balance', 'ck_mm_sign', 'ck_mm_source',
    'ck_opreq_fmt', 'ck_opreq_target', 'ck_po_status', 'ck_poi_values', 'ck_sa_kind', 'ck_supplier_text']);
});

test('IT-04: INSERT melanggar CHECK ditolak; baris sah diterima; FK RESTRICT menolak hapus bahan bersaldo awal', () => {
  S.mysql(`INSERT INTO users (name, email, phone, role, is_active) VALUES ('CP2', 'cp2@it.test', '+620000000001', 'staf', 1);
    INSERT INTO raw_materials (name, unit, stock, min_stock) VALUES ('Bahan IT04', 'kg', 0, 0);`, UP);
  const user = S.mysql("SELECT user_id FROM users WHERE email = 'cp2@it.test'", UP);
  const mat = S.mysql("SELECT material_id FROM raw_materials WHERE name = 'Bahan IT04'", UP);
  const op = '11111111-1111-4111-8111-111111111111';
  const setup = `INSERT INTO operation_requests VALUES ('${op}', 'uji', ${user}, NULL, NULL, REPEAT('a', 64), 201, '{}', NOW(3));
    INSERT INTO suppliers (name, phone, email, address, contact_person, created_by, created_request_id, updated_at)
      VALUES ('Sup IT04', '+62811', 's@x.id', 'Jl', 'Ani', ${user}, '${op}', NOW(3));
    INSERT INTO purchase_orders (po_number, supplier_id, status, ordered_at, created_by, created_request_id, updated_at)
      VALUES ('PO-IT04', LAST_INSERT_ID(), 'dipesan', NOW(3), ${user}, '${op}', NOW(3));
    SET @po = LAST_INSERT_ID();
    INSERT INTO purchase_order_items (po_id, material_id, qty_ordered, unit_price) VALUES (@po, ${mat}, 5, 1000);
    SET @item = LAST_INSERT_ID();
    INSERT INTO goods_receipts (po_id, kind, operation_request_id, created_by) VALUES (@po, 'normal', '${op}', ${user});
    SET @gr = LAST_INSERT_ID();`;
  const tx = (statement) => `START TRANSACTION; ${setup} ${statement}; ROLLBACK;`;
  const violations = {
    ck_opreq_fmt: `INSERT INTO operation_requests VALUES ('x', 'uji', ${user}, NULL, NULL, 'pendek', 201, '{}', NOW(3))`,
    ck_opreq_target: `INSERT INTO operation_requests VALUES ('22222222-2222-4222-8222-222222222222', 'uji', ${user}, 'po', NULL, REPEAT('a', 64), 201, '{}', NOW(3))`,
    ck_supplier_text: `INSERT INTO suppliers (name, phone, email, address, contact_person, created_by, created_request_id, updated_at) VALUES ('  ', '1', 'e', 'a', 'c', ${user}, '${op}', NOW(3))`,
    ck_po_status: `INSERT INTO purchase_orders (po_number, supplier_id, status, ordered_at, created_by, created_request_id, updated_at) SELECT 'PO-X', supplier_id, 'draft', NOW(3), ${user}, '${op}', NOW(3) FROM suppliers LIMIT 1`,
    ck_poi_values: `INSERT INTO purchase_order_items (po_id, material_id, qty_ordered, unit_price, qty_cancelled) VALUES (@po, ${mat}, 1, 1000, 2)`,
    ck_gr_kind: `INSERT INTO goods_receipts (po_id, kind, replaces_id, reason, operation_request_id, created_by) VALUES (@po, 'pengganti', @gr, NULL, '${op}', ${user})`,
    ck_grl_qty: 'INSERT INTO goods_receipt_lines (receipt_id, po_item_id, qty) VALUES (@gr, @item, 0)',
    'ck_sa_kind (stok_masuk qty NULL)': `INSERT INTO stock_adjustments (material_id, kind, qty, created_by) VALUES (${mat}, 'stok_masuk', NULL, ${user})`,
    'ck_sa_kind (opname counted NULL)': `INSERT INTO stock_adjustments (material_id, kind, system_stock, created_by) VALUES (${mat}, 'stock_opname', 0, ${user})`,
    'ck_sa_kind (saldo awal opening ≠ material)': `INSERT INTO stock_adjustments (material_id, kind, qty, opening_material_id) VALUES (${mat}, 'saldo_awal', 0, ${mat} + 1000)`,
    'ck_sa_kind (pembalik reason NULL)': `INSERT INTO stock_adjustments (material_id, kind, qty, reverses_id, operation_request_id, created_by) VALUES (${mat}, 'pembalik_stok_masuk', 1, 1, '${op}', ${user})`,
    'ck_mm_sign (qty 0)': `INSERT INTO material_movements (material_id, type, qty_change, stock_before, stock_after, receipt_id, po_item_id, created_by) VALUES (${mat}, 'koreksi_penerimaan', 0, 0, 0, @gr, @item, ${user})`,
    'ck_mm_source (sumber ganda)': `INSERT INTO material_movements (material_id, type, qty_change, stock_before, stock_after, adjustment_id, receipt_id, po_item_id, created_by) VALUES (${mat}, 'penerimaan', 1, 0, 1, 1, @gr, @item, ${user})`,
    'ck_mm_source (sumber kosong)': `INSERT INTO material_movements (material_id, type, qty_change, stock_before, stock_after, created_by) VALUES (${mat}, 'penerimaan', 1, 0, 1, ${user})`,
    ck_mm_balance: `INSERT INTO material_movements (material_id, type, qty_change, stock_before, stock_after, receipt_id, po_item_id, created_by) VALUES (${mat}, 'penerimaan', 1, 0, 2, @gr, @item, ${user})`,
    ck_mm_actor: `INSERT INTO material_movements (material_id, type, qty_change, stock_before, stock_after, receipt_id, po_item_id) VALUES (${mat}, 'penerimaan', 1, 0, 1, @gr, @item)`,
  };
  for (const [label, statement] of Object.entries(violations)) {
    assert.throws(() => S.mysql(tx(statement), UP), /Check constraint|3819/, label);
  }
  // Baris sah: saldo awal qty 0 (dokumen tanpa mutasi) & opname tanpa reason
  S.mysql(tx(`INSERT INTO stock_adjustments (material_id, kind, qty, opening_material_id) VALUES (${mat}, 'saldo_awal', 0, ${mat});
    INSERT INTO stock_adjustments (material_id, kind, counted_stock, system_stock, created_by) VALUES (${mat}, 'stock_opname', 0, 0, ${user})`), UP);
  // FK RESTRICT: bahan yang punya saldo awal tidak dapat dihapus
  assert.throws(() => S.mysql('DELETE FROM raw_materials WHERE material_id = 1;', UP), /foreign key constraint fails/);
  S.mysql(`DELETE FROM raw_materials WHERE material_id = ${mat}; DELETE FROM users WHERE user_id = ${user};`, UP);
});

test('IT-03: kegagalan M-7 disuntik → restore backup M-5 → identik, tanpa CR-04a di _prisma_migrations', () => {
  S.restore(FAIL, BACKUP);
  const before = S.tableFingerprint(FAIL);
  S.mysql('CREATE TABLE material_movements (x INT);', FAIL); // tabrakan nama → CREATE TABLE migrasi gagal di tengah
  const failed = S.deploy(FAIL);
  assert.notEqual(failed.status, 0);
  assert.ok(Number(S.mysql('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = \'ovenco_cp2_failed_test\'')) > 31, 'keadaan parsial');
  // Pemulihan §11.4: hapus & buat ulang database → restore backup M-5 → verifikasi
  S.restore(FAIL, BACKUP);
  assert.equal(S.tableFingerprint(FAIL), before);
  assert.equal(S.snapshot(FAIL, ['--compare', SNAP]).status, 0);
  assert.equal(S.mysql("SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name LIKE '%cr04a%'", FAIL), '0');
  assert.equal(tableCount(FAIL), 30);
});
