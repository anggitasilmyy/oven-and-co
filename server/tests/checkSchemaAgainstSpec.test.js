// Step 6.1 · Pemeriksa skema SPEC §8 — regresi akhir baris CRLF (checkout Windows, core.autocrlf=true)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseSpec, parseSql } = require('../prisma/checkSchemaAgainstSpec');

const SPEC_PATH = path.resolve(__dirname, '..', '..', 'docs', 'SPEC.md');

// Potongan SPEC §8 minimal: baris komentar lanjutan berisi ':' dan ';' (pola product_materials CR-03)
const fixture = [
  '## 8. Data Dictionary (1 tabel)',
  '```',
  'product_materials: product_id BIGINT PK,FK products; material_id BIGINT PK,FK raw_materials; qty_per_unit DECIMAL(10,3)',
  '  -- CR-03: takaran per 1 unit produk; FK ON DELETE RESTRICT',
  'order_status_histories: history_id BIGINT PK; status ENUM(lihat bagian 4)',
  '```',
  '## 9. Data Contoh',
].join('\n');

const columnsOf = (spec) => Object.keys(spec.product_materials.cols);

test('parseSpec: komentar `--` berisi ";" diabaikan pada akhir baris LF', () => {
  assert.deepEqual(columnsOf(parseSpec(fixture)), ['product_id', 'material_id', 'qty_per_unit']);
});

test('parseSpec: akhir baris CRLF tidak membuat komentar terbaca sebagai kolom', () => {
  const crlf = fixture.replace(/\n/g, '\r\n');
  assert.doesNotThrow(() => parseSpec(crlf));
  const spec = parseSpec(crlf);
  assert.deepEqual(columnsOf(spec), ['product_id', 'material_id', 'qty_per_unit']);
  assert.equal(spec.product_materials.cols.qty_per_unit.type, 'DECIMAL(10,3)');
});

test('parseSpec: SPEC.md asli menghasilkan hasil identik untuk LF dan CRLF', () => {
  const lf = fs.readFileSync(SPEC_PATH, 'utf8').replace(/\r\n/g, '\n');
  const fromLf = parseSpec(lf);
  assert.equal(Object.keys(fromLf).length, 44);
  assert.deepEqual(parseSpec(lf.replace(/\n/g, '\r\n')), fromLf);
});

test('parseSql: membaca 44 tabel migrasi beserta CHECK CR-04a/b', () => {
  const sql = parseSql();
  const tables = Object.keys(sql).filter((t) => !t.startsWith('__'));
  assert.equal(tables.length, 44);
  assert.ok(sql.__checks.includes('ck_mm_balance'));
  assert.ok(sql.__checks.includes('ck_out_kind'));
  assert.equal(sql.__openingInsert, true);
});
