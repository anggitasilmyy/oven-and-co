// tests-mysql/20-cr04a-seed.it.test.js
// CR-04a CP2 · FR-44 · BR-23 — seed dengan preflight & saldo awal (Errata E1.1 §2 – §3, §5) pada MySQL 8.
// IT-35  instalasi baru: migrate deploy + seed → satu saldo awal per bahan seed, mutasi hanya stok > 0, ledger lulus.
// IT-36  (a) seed ulang ×2, juga setelah stok masuk, opname selisih 0, dan penerimaan → tidak ada perubahan;
//        (b) bahan SQL langsung tanpa catatan stok (K-C, stok 0 & > 0) diperbaiki sekali, stok tidak berubah;
//        (c)(d) K-D → seed berhenti SEBELUM penulisan pertama (sidik jari seluruh tabel tidak berubah), exit ≠ 0;
//        (e) seed dihentikan setelah bahan ke-3 → seed ulang menyelesaikan tanpa duplikat;
//        (f) data berubah antara preflight dan transaksi bahan → bahan itu rollback, seed ulang berhasil.
// IMPL-CP2-1  `--legacy-fixtures` ditolak di luar database uji harness; mode produksi tanpa pengecualian.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ARTIFACT_DIR } = require('./helpers/context');
const S = require('./helpers/scratchDb');
const { preflightMaterials, applyMaterialPlan, SeedDataChangedError } = require('../prisma/seed/openingBalances');
const C = require('../prisma/seed/catalog');

const FRESH = 'ovenco_cp2_fresh_test';
const BLOCK = 'ovenco_cp2_block_test';
const STOP = 'ovenco_cp2_interrupt_test';
const RACE = 'ovenco_cp2_race_test';
const BLOCK_DUMP = path.join(ARTIFACT_DIR, 'cp2-block-base.sql');
const OP = '33333333-3333-4333-8333-333333333333';
const SEED_COUNT = C.RAW_MATERIALS.length;

const ledgerRows = (name) => S.mysql(`SELECT sa.material_id, sa.kind, sa.qty, COUNT(mm.movement_id)
  FROM stock_adjustments sa LEFT JOIN material_movements mm ON mm.adjustment_id = sa.adjustment_id
  GROUP BY sa.adjustment_id ORDER BY sa.material_id, sa.adjustment_id`, name);
const freshSeeded = (name) => {
  S.recreateDatabase(name);
  assert.equal(S.deploy(name).status, 0);
  const res = S.seed(name);
  assert.equal(res.status, 0, res.output);
  return res;
};
const staffId = (name) => {
  S.mysql(`INSERT IGNORE INTO users (name, email, phone, role, is_active) VALUES ('CP2', 'cp2@it.test', '+620000000002', 'staf', 1);`, name);
  return S.mysql("SELECT user_id FROM users WHERE email = 'cp2@it.test'", name);
};

test.after(() => { for (const name of [FRESH, BLOCK, STOP, RACE]) S.dropDatabase(name); });

test('IT-35: instalasi baru — saldo awal setiap bahan seed, mutasi hanya stok > 0, ledger mode produksi lulus', () => {
  const res = freshSeeded(FRESH);
  assert.match(res.output, /mode produksi \(tanpa pengecualian\): 8 bahan, 8 diperiksa, 0 dikecualikan/);
  assert.match(res.output, /✓ I-1, I-2, I-3, I-7, I-8, I-10, I-11 terpenuhi/);
  assert.equal(S.mysql("SELECT COUNT(*) FROM stock_adjustments WHERE kind = 'saldo_awal'", FRESH), String(SEED_COUNT));
  const positive = C.RAW_MATERIALS.filter((m) => Number(m.stock) > 0).length; // data seed (angka kecil, bukan aritmetika stok)
  assert.equal(S.mysql("SELECT COUNT(*) FROM material_movements WHERE type = 'saldo_awal'", FRESH), String(positive));
  assert.equal(S.mysql("SELECT GROUP_CONCAT(CONCAT(material_id, '=', stock) ORDER BY material_id) FROM raw_materials", FRESH),
    '1=42.00,2=6.50,3=18.00,4=96.00,5=3.00,6=24.00,7=900.00,8=4.00');
  assert.equal(S.checkLedger(FRESH).status, 0);
});

test('IT-36 (a)(b): seed ulang idempoten, juga setelah transaksi operasional; K-C diperbaiki sekali', () => {
  const user = staffId(FRESH);
  // Transaksi operasional yang konsisten (dokumen + mutasi + stok) — penyiapan lewat SQL, bukan kode yang diuji
  S.mysql(`
    INSERT INTO stock_adjustments (material_id, kind, qty, created_by) VALUES (1, 'stok_masuk', 2.50, ${user});
    INSERT INTO material_movements (material_id, type, qty_change, stock_before, stock_after, adjustment_id, created_by)
      VALUES (1, 'stok_masuk', 2.50, 42.00, 44.50, LAST_INSERT_ID(), ${user});
    UPDATE raw_materials SET stock = 44.50 WHERE material_id = 1;
    INSERT INTO stock_adjustments (material_id, kind, counted_stock, system_stock, created_by) VALUES (2, 'stock_opname', 6.50, 6.50, ${user});
    INSERT INTO operation_requests VALUES ('${OP}', 'receive_purchase_order', ${user}, 'purchase_order', 1, REPEAT('b', 64), 201, '{}', NOW(3));
    INSERT INTO suppliers (name, phone, email, address, contact_person, created_by, created_request_id, updated_at)
      VALUES ('Sup CP2', '+62811', 's@x.id', 'Jl', 'Ani', ${user}, '${OP}', NOW(3));
    INSERT INTO purchase_orders (po_number, supplier_id, status, ordered_at, created_by, created_request_id, updated_at)
      VALUES ('PO-CP2-001', LAST_INSERT_ID(), 'diterima', NOW(3), ${user}, '${OP}', NOW(3));
    SET @po = LAST_INSERT_ID();
    INSERT INTO purchase_order_items (po_id, material_id, qty_ordered, unit_price) VALUES (@po, 3, 5.00, 15000);
    SET @item = LAST_INSERT_ID();
    INSERT INTO goods_receipts (po_id, kind, operation_request_id, created_by) VALUES (@po, 'normal', '${OP}', ${user});
    SET @gr = LAST_INSERT_ID();
    INSERT INTO goods_receipt_lines (receipt_id, po_item_id, qty) VALUES (@gr, @item, 5.00);
    INSERT INTO material_movements (material_id, type, qty_change, stock_before, stock_after, receipt_id, po_item_id, created_by)
      VALUES (3, 'penerimaan', 5.00, 18.00, 23.00, @gr, @item, ${user});
    UPDATE raw_materials SET stock = 23.00 WHERE material_id = 3;`, FRESH);
  assert.equal(S.checkLedger(FRESH).status, 0, 'data operasional konsisten');
  const before = S.tableFingerprint(FRESH);
  for (let i = 0; i < 2; i += 1) assert.equal(S.seed(FRESH).status, 0);
  assert.equal(S.tableFingerprint(FRESH), before, 'seed ulang tidak mengubah tabel mana pun');

  // (b) K-C: bahan dibuat SQL langsung (stok 7,25 dan 0) → saldo awal dari stok saat ini, sekali
  S.mysql(`INSERT INTO raw_materials (name, unit, stock, min_stock) VALUES ('Bahan KC1', 'kg', 7.25, 1), ('Bahan KC0', 'kg', 0, 1);`, FRESH);
  assert.equal(S.checkLedger(FRESH).status, 1, 'mode produksi tidak mengecualikan bahan tanpa saldo awal');
  const repaired = S.seed(FRESH);
  assert.equal(repaired.status, 0, repaired.output);
  assert.equal(S.mysql(`SELECT GROUP_CONCAT(CONCAT(r.name, ':', r.stock, ':', sa.qty, ':', (SELECT COUNT(*) FROM material_movements mm
    WHERE mm.adjustment_id = sa.adjustment_id)) ORDER BY r.name) FROM raw_materials r JOIN stock_adjustments sa
    ON sa.opening_material_id = r.material_id WHERE r.name LIKE 'Bahan KC%'`, FRESH), 'Bahan KC0:0.00:0.00:0,Bahan KC1:7.25:7.25:1');
  const afterRepair = S.tableFingerprint(FRESH);
  assert.equal(S.seed(FRESH).status, 0);
  assert.equal(S.tableFingerprint(FRESH), afterRepair, 'perbaikan hanya sekali');
  assert.equal(S.checkLedger(FRESH).status, 0);
});

test('IT-36 (c)(d): data K-D → seed berhenti sebelum penulisan pertama, tanpa perubahan', () => {
  freshSeeded(BLOCK);
  const user = staffId(BLOCK);
  S.dump(BLOCK, BLOCK_DUMP);
  const material = (name, stock) => `INSERT INTO raw_materials (name, unit, stock, min_stock) VALUES ('${name}', 'kg', ${stock}, 0); SET @m = LAST_INSERT_ID();`;
  const cases = {
    'mutasi tanpa saldo awal': `${material('Bahan KD1', 1)}
      INSERT INTO stock_adjustments (material_id, kind, qty, created_by) VALUES (@m, 'stok_masuk', 1, ${user});
      INSERT INTO material_movements (material_id, type, qty_change, stock_before, stock_after, adjustment_id, created_by)
        VALUES (@m, 'stok_masuk', 1, 0, 1, LAST_INSERT_ID(), ${user});`,
    'opname selisih 0 tanpa saldo awal': `${material('Bahan KD2', 3)}
      INSERT INTO stock_adjustments (material_id, kind, counted_stock, system_stock, created_by) VALUES (@m, 'stock_opname', 3, 3, ${user});`,
    'baris penerimaan tanpa saldo awal': `${material('Bahan KD3', 0)}
      INSERT INTO operation_requests VALUES ('${OP}', 'uji', ${user}, NULL, NULL, REPEAT('c', 64), 201, '{}', NOW(3));
      INSERT INTO suppliers (name, phone, email, address, contact_person, created_by, created_request_id, updated_at)
        VALUES ('Sup KD', '+62811', 's@x.id', 'Jl', 'Ani', ${user}, '${OP}', NOW(3));
      INSERT INTO purchase_orders (po_number, supplier_id, status, ordered_at, created_by, created_request_id, updated_at)
        VALUES ('PO-KD', LAST_INSERT_ID(), 'dipesan', NOW(3), ${user}, '${OP}', NOW(3));
      INSERT INTO purchase_order_items (po_id, material_id, qty_ordered, unit_price) VALUES (LAST_INSERT_ID(), @m, 5, 100);`
      + ` SET @item = LAST_INSERT_ID();
      INSERT INTO goods_receipts (po_id, kind, operation_request_id, created_by) SELECT po_id, 'normal', '${OP}', ${user} FROM purchase_orders WHERE po_number = 'PO-KD';
      INSERT INTO goods_receipt_lines (receipt_id, po_item_id, qty) VALUES (LAST_INSERT_ID(), @item, 2);`,
    'saldo awal qty ≠ mutasi': "UPDATE stock_adjustments SET qty = 41.00 WHERE kind = 'saldo_awal' AND material_id = 1;",
    'saldo awal > 0 tanpa mutasi': `${material('Bahan KD4', 5)}
      INSERT INTO stock_adjustments (material_id, kind, qty, opening_material_id) VALUES (@m, 'saldo_awal', 5, @m);`,
    'saldo awal bukan dokumen pertama': `${material('Bahan KD5', 0)}
      INSERT INTO stock_adjustments (material_id, kind, counted_stock, system_stock, created_by) VALUES (@m, 'stock_opname', 0, 0, ${user});
      INSERT INTO stock_adjustments (material_id, kind, qty, opening_material_id) VALUES (@m, 'saldo_awal', 0, @m);`,
    'Σ mutasi ≠ stok': 'UPDATE raw_materials SET stock = stock + 1 WHERE material_id = 2;',
  };
  for (const [label, sql] of Object.entries(cases)) {
    S.restore(BLOCK, BLOCK_DUMP);
    S.mysql(sql, BLOCK);
    const before = S.tableFingerprint(BLOCK);
    const res = S.seed(BLOCK);
    assert.notEqual(res.status, 0, label);
    assert.match(res.output, /Preflight seed menemukan 1 bahan tidak konsisten \(K-D\)/, label);
    assert.equal(S.tableFingerprint(BLOCK), before, `${label}: tidak ada penulisan`);
  }
});

test('IT-36 (e): seed terhenti setelah bahan ke-3 → seed ulang melanjutkan tanpa duplikat', () => {
  S.recreateDatabase(STOP);
  assert.equal(S.deploy(STOP).status, 0);
  const stopped = S.seed(STOP, { SEED_TEST_FAIL_AFTER_MATERIALS: '3' });
  assert.notEqual(stopped.status, 0);
  assert.equal(S.mysql('SELECT COUNT(*) FROM raw_materials', STOP), '3');
  assert.equal(S.mysql("SELECT COUNT(*) FROM stock_adjustments WHERE kind = 'saldo_awal'", STOP), '3', 'bahan yang COMMIT lengkap');
  const resumed = S.seed(STOP);
  assert.equal(resumed.status, 0, resumed.output);
  assert.equal(ledgerRows(STOP), ledgerRows(FRESH).split('\n').filter((r) => /saldo_awal/.test(r) && Number(r.split('\t')[0]) <= SEED_COUNT).join('\n'));
  assert.equal(S.checkLedger(STOP).status, 0);
});

test('IT-36 (f): data berubah antara preflight dan transaksi bahan → rollback bahan itu, seed ulang berhasil', async () => {
  S.recreateDatabase(RACE);
  assert.equal(S.deploy(RACE).status, 0);
  const client = S.clientFor(RACE);
  try {
    const plan = await preflightMaterials(client, [C.RAW_MATERIALS[0]]);
    assert.equal(plan.create.length, 1);
    S.mysql("INSERT INTO raw_materials (material_id, name, unit, stock, min_stock) VALUES (1, 'Dibuat bersamaan', 'kg', 9.00, 1);", RACE);
    await assert.rejects(applyMaterialPlan(client, plan), SeedDataChangedError);
    assert.equal(S.mysql('SELECT COUNT(*) FROM stock_adjustments', RACE), '0');
  } finally {
    await client.$disconnect();
  }
  const res = S.seed(RACE);
  assert.equal(res.status, 0, res.output);
  assert.equal(S.mysql("SELECT CONCAT(r.stock, '/', sa.qty) FROM raw_materials r JOIN stock_adjustments sa ON sa.opening_material_id = r.material_id WHERE r.material_id = 1", RACE),
    '9.00/9.00', 'stok bahan yang sudah ada tidak diubah seed');
});

test('IMPL-CP2-1: --legacy-fixtures hanya di database uji harness; mode produksi tanpa pengecualian', () => {
  const marker = { OVENCO_LEDGER_TEST_DB: 'ovenco_c4_test' };
  const refused = S.checkLedger(FRESH, ['--legacy-fixtures'], marker);
  assert.equal(refused.status, 2);
  assert.match(refused.output, /--legacy-fixtures ditolak: database ovenco_cp2_fresh_test tidak dikenal/);
  const harness = (env) => spawnSync('node', ['prisma/checkLedger.js', '--legacy-fixtures'], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', env: { ...process.env, DATABASE_URL: process.env.ROOT_DATABASE_URL, ...env },
  });
  assert.equal(harness({ ...marker, NODE_ENV: 'production' }).status, 2);
  assert.equal(harness({ OVENCO_LEDGER_TEST_DB: '' }).status, 2);
  const accepted = harness(marker);
  assert.notEqual(accepted.status, 2, accepted.stderr);
  assert.match(accepted.stdout, /mode fixture lama \(harness\)/);
});
