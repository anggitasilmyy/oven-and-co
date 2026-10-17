// prisma/checkSchemaAgainstSpec.js
// Step 6.1 · Pemeriksa skema: membandingkan SQL migrasi awal dengan Data Dictionary docs/SPEC.md §8
// (29 tabel, nama kolom, tipe & panjang, nullable, PK/composite key, UNIQUE, FK + tabel tujuan, nilai ENUM).
// Tidak butuh database. Jalankan: npm run db:check-spec  (keluar dengan kode 1 bila ada selisih).

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SPEC_PATH = path.join(ROOT, 'docs', 'SPEC.md');
const MIGRATIONS = path.join(__dirname, 'migrations');

// SPEC §4: nilai order_status (SPEC §8 menulis "ENUM(lihat bagian 4)")
const ORDER_STATUS = ['menunggu_pembayaran', 'dikonfirmasi', 'sedang_disiapkan', 'siap_diambil', 'dalam_pengiriman', 'selesai', 'dibatalkan'];
// FK yang di SPEC tidak menyebut tabel tujuan → tujuan menurut nama kolom & ERD (PDF Bab 4.4)
const FK_TARGET_BY_COLUMN = {
  user_id: 'users', order_id: 'orders', product_id: 'products', category_id: 'categories', variant_id: 'product_variants',
  design_id: 'custom_cake_designs', option_id: 'custom_options', cart_id: 'carts', address_id: 'addresses',
  voucher_id: 'vouchers', review_id: 'reviews', order_item_id: 'order_items', method_code: 'payment_methods', changed_by: 'users',
};
// SPEC §8 store_settings hanya menyebut nama kolom; tipe diambil dari PDF Data Dictionary (Bab 4.5, entity store_settings)
const STORE_SETTINGS_TYPES = {
  setting_id: 'TINYINT', store_name: 'VARCHAR(100)', address: 'TEXT', latitude: 'DECIMAL(10,7)', longitude: 'DECIMAL(10,7)',
  whatsapp_number: 'VARCHAR(20)', preorder_cutoff_time: 'TIME', delivery_radius_km: 'DECIMAL(5,2)',
  delivery_fee_per_km: 'DECIMAL(12,2)', payment_timeout_minutes: 'SMALLINT', earn_amount_per_point: 'DECIMAL(12,2)',
  redeem_points_unit: 'INT', redeem_value: 'DECIMAL(12,2)', gold_min_points: 'INT', platinum_min_points: 'INT',
  review_bonus_points: 'INT',
};
// Tipe kolom FK yang tidak ditulis di SPEC §8 (PDF Data Dictionary)
const FK_TYPES = { category_id: 'INT', option_id: 'INT', method_code: 'VARCHAR(20)' };

const TYPE_RE = /^(BIGINT|INT|TINYINT|SMALLINT|TEXT|DATETIME|DATE|TIME|BOOLEAN|VARCHAR\(\d+\)|DECIMAL\(\d+,\d+\)|ENUM\([^)]*\))/;

/** Data Dictionary SPEC §8 → { tabel: { kolom: {type, nullable, pk, unique, fk} } } */
function parseSpec() {
  const md = fs.readFileSync(SPEC_PATH, 'utf8');
  const section = md.split('## 8. Data Dictionary')[1].split('## 9.')[0];
  const block = section.split('```')[1];
  const lines = block.split('\n').map((l) => l.replace(/--.*$/, '')).filter((l) => l.trim());
  const entries = [];
  for (const line of lines) {
    if (/^\S/.test(line)) entries.push(line.trim());
    else entries[entries.length - 1] += ` ${line.trim()}`;
  }
  const tables = {};
  for (const entry of entries) {
    const [head, ...rest] = entry.split(':');
    const table = head.replace(/\(.*\)/, '').trim();
    const cols = {};
    // store_settings: setting_id ditulis di judul SPEC ("setting_id = 1"); PDF: setting_id TINYINT PK
    if (table === 'store_settings') cols.setting_id = { type: 'TINYINT', nullable: false, pk: true, unique: false, fk: null };
    for (const raw of rest.join(':').split(';').map((s) => s.trim()).filter(Boolean)) {
      const name = raw.match(/^[a-z_]+/)[0];
      let tail = raw.slice(name.length).trim();
      const col = { type: null, nullable: false, pk: false, unique: false, fk: null };
      if (tail.startsWith('?')) { col.nullable = true; tail = tail.slice(1).trim(); }
      const type = tail.match(TYPE_RE);
      if (type) { col.type = type[1].replace(/\s/g, ''); tail = tail.slice(type[1].length).trim(); }
      if (tail.startsWith('?')) { col.nullable = true; tail = tail.slice(1).trim(); }
      const flags = tail.replace(/\([^)]*\)/g, ' ');
      if (/\bPK\b/.test(flags)) col.pk = true;
      if (/\bUQ\b/.test(flags) && !/UQ bersama/.test(tail)) col.unique = true;
      const fk = flags.match(/\bFK\b(\?)?\s*([a-z_]+)?/);
      if (fk) {
        // "FK users" menyebut tujuan; "FK", "FK?", "FK (admin)" → tujuan menurut nama kolom
        col.fk = fk[2] ?? FK_TARGET_BY_COLUMN[name];
        if (fk[1]) col.nullable = true;
      }
      if (/FK\?/.test(tail) || /UQ\?/.test(tail) || /FK [a-z_]+\?/.test(tail)) col.nullable = true;
      if (table === 'store_settings') {
        col.type = STORE_SETTINGS_TYPES[name] ?? col.type;
        col.pk = name === 'setting_id';
        // SPEC: "address?; latitude?; ..." → nullable; nilai dalam kurung = nilai default (NOT NULL)
      }
      if (!col.type && FK_TYPES[name]) col.type = FK_TYPES[name];
      if (!col.type && col.fk) col.type = 'BIGINT';
      if (col.type === 'ENUM(lihatbagian4)') col.type = `ENUM(${ORDER_STATUS.join(',')})`;
      cols[name] = col;
    }
    tables[table] = { cols, composite: /UQ bersama product_id/.test(entry) ? [['product_id', 'stock_date']] : [] };
  }
  // order_status_histories.status memakai enum status pesanan yang sama (SPEC §4 & §8 "status ENUM")
  tables.order_status_histories.cols.status.type = `ENUM(${ORDER_STATUS.join(',')})`;
  return tables;
}

/** SQL migrasi → { tabel: { cols: {nama: {type, nullable}}, pk: [], uniques: [[...]], fks: {kolom: tabel} } } */
function parseSql() {
  const dirs = fs.readdirSync(MIGRATIONS).filter((d) => fs.statSync(path.join(MIGRATIONS, d)).isDirectory()).sort();
  const sql = dirs.map((d) => fs.readFileSync(path.join(MIGRATIONS, d, 'migration.sql'), 'utf8')).join('\n');
  const tables = {};
  for (const m of sql.matchAll(/CREATE TABLE `(\w+)` \(([\s\S]*?)\n\) DEFAULT/g)) {
    const t = { cols: {}, pk: [], uniques: [], fks: {} };
    for (const line of m[2].split('\n').map((l) => l.trim().replace(/,$/, '')).filter(Boolean)) {
      const col = line.match(/^`(\w+)` (.+?) (NOT NULL|NULL)\b/);
      if (col) {
        const type = col[2].replace(/INTEGER/, 'INT').replace(/\((\d+), (\d+)\)/, '($1,$2)').replace(/\((0)\)$/, '')
          .replace(/ENUM\((.*)\)/, (_, v) => `ENUM(${v.replace(/'|\s/g, '')})`);
        t.cols[col[1]] = { type, nullable: col[3] === 'NULL' };
      } else if (line.startsWith('PRIMARY KEY')) t.pk = [...line.matchAll(/`(\w+)`/g)].map((x) => x[1]);
      else if (line.startsWith('UNIQUE INDEX')) t.uniques.push([...line.split('(')[1].matchAll(/`(\w+)`/g)].map((x) => x[1]));
    }
    tables[m[1]] = t;
  }
  for (const m of sql.matchAll(/ALTER TABLE `(\w+)` ADD CONSTRAINT `\w+` FOREIGN KEY \(`(\w+)`\) REFERENCES `(\w+)`\(`\w+`\)/g)) {
    tables[m[1]].fks[m[2]] = m[3];
  }
  return tables;
}

function main() {
  const spec = parseSpec();
  const sql = parseSql();
  const problems = [];
  const fail = (msg) => problems.push(msg);
  const specNames = Object.keys(spec).sort();
  const sqlNames = Object.keys(sql).sort();
  if (specNames.length !== 29) fail(`SPEC berisi ${specNames.length} tabel (harus 29)`);
  if (sqlNames.length !== 29) fail(`Migrasi berisi ${sqlNames.length} tabel (harus 29)`);
  specNames.filter((t) => !sql[t]).forEach((t) => fail(`Tabel ${t} tidak ada di migrasi`));
  sqlNames.filter((t) => !spec[t]).forEach((t) => fail(`Tabel ${t} tidak ada di SPEC`));

  let columns = 0;
  for (const table of specNames.filter((t) => sql[t])) {
    const s = spec[table];
    const q = sql[table];
    const specCols = Object.keys(s.cols);
    Object.keys(q.cols).filter((c) => !s.cols[c]).forEach((c) => fail(`${table}.${c} ada di migrasi tetapi tidak di SPEC`));
    for (const name of specCols) {
      const sc = s.cols[name];
      const qc = q.cols[name];
      if (!qc) { fail(`${table}.${name} tidak ada di migrasi`); continue; }
      columns += 1;
      if (sc.type && sc.type !== qc.type) fail(`${table}.${name}: tipe ${qc.type} ≠ SPEC ${sc.type}`);
      if (!sc.type) fail(`${table}.${name}: tipe tidak terbaca dari SPEC`);
      if (sc.nullable !== qc.nullable) fail(`${table}.${name}: nullable ${qc.nullable} ≠ SPEC ${sc.nullable}`);
      if (sc.unique && !q.uniques.some((u) => u.length === 1 && u[0] === name)) fail(`${table}.${name}: UNIQUE tidak ada`);
      if (!sc.unique && q.uniques.some((u) => u.length === 1 && u[0] === name)) fail(`${table}.${name}: UNIQUE tambahan di luar SPEC`);
      if (sc.fk && q.fks[name] !== sc.fk) fail(`${table}.${name}: FK → ${q.fks[name] ?? '(tidak ada)'} ≠ SPEC ${sc.fk}`);
      if (!sc.fk && q.fks[name]) fail(`${table}.${name}: FK tambahan → ${q.fks[name]}`);
    }
    const specPk = specCols.filter((c) => s.cols[c].pk);
    if (JSON.stringify(specPk) !== JSON.stringify(q.pk)) fail(`${table}: PK (${q.pk}) ≠ SPEC (${specPk})`);
    for (const combo of s.composite) {
      if (!q.uniques.some((u) => JSON.stringify(u) === JSON.stringify(combo))) fail(`${table}: UNIQUE (${combo}) tidak ada`);
    }
    q.uniques.filter((u) => u.length > 1 && !s.composite.some((c) => JSON.stringify(c) === JSON.stringify(u)))
      .forEach((u) => fail(`${table}: UNIQUE gabungan tambahan (${u})`));
  }
  const fkCount = Object.values(sql).reduce((n, t) => n + Object.keys(t.fks).length, 0);
  console.log(`Tabel: ${sqlNames.length} · kolom dicek: ${columns} · foreign key: ${fkCount}`);
  if (problems.length) {
    console.log(`\n✗ ${problems.length} selisih:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log('✓ Migrasi sesuai SPEC §8 (nama, tipe & panjang, nullable, PK/composite, UNIQUE, FK, ENUM)');
}

main();
