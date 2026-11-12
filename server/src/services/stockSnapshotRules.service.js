// services/stockSnapshotRules.service.js
// CR-04a CP2 · IMPL-CP2-2 — snapshot stok pra-migrasi (langkah M-4) yang deterministik (Errata E1.1 §1).
// Format: CSV UTF-8 tanpa BOM, header `material_id,stock`, satu baris per bahan urut material_id naik (numerik),
// stok = string DECIMAL dari MySQL (tepat 2 desimal, titik desimal, tanpa pemisah ribuan, tanpa konversi number),
// akhir baris LF termasuk baris terakhir, tanpa spasi tambahan. SHA-256 dihitung dari berkas final (byte UTF-8).

const crypto = require('node:crypto');

const HEADER = 'material_id,stock';
const ID_PATTERN = /^[1-9]\d*$/;
const STOCK_PATTERN = /^\d+\.\d{2}$/;

const toCents = (stock) => {
  const [whole, fraction] = stock.split('.');
  return BigInt(whole) * 100n + BigInt(fraction);
};
const centsToString = (cents) => `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;

/**
 * @param {{material_id: string|bigint, stock: string}[]} rows — stok dari CAST(stock AS CHAR)
 * @returns {{csv: string, count: number, sum: string, sha256: string}}
 */
function buildStockSnapshot(rows) {
  const normalized = rows.map((r) => ({ id: String(r.material_id), stock: String(r.stock) }));
  for (const r of normalized) {
    if (!ID_PATTERN.test(r.id)) throw new Error(`material_id tidak sah: ${r.id}`);
    if (!STOCK_PATTERN.test(r.stock)) throw new Error(`Stok bahan ${r.id} bukan DECIMAL 2 desimal: ${r.stock}`);
  }
  normalized.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  for (let i = 1; i < normalized.length; i += 1) {
    if (normalized[i].id === normalized[i - 1].id) throw new Error(`material_id ganda: ${normalized[i].id}`);
  }
  const csv = `${[HEADER, ...normalized.map((r) => `${r.id},${r.stock}`)].join('\n')}\n`;
  const sum = centsToString(normalized.reduce((total, r) => total + toCents(r.stock), 0n));
  return { csv, count: normalized.length, sum, sha256: sha256(csv) };
}

function sha256(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

/** CSV snapshot → Map(material_id → stok string). Melempar Error bila format menyimpang. */
function parseStockSnapshot(csv) {
  if (csv.charCodeAt(0) === 0xfeff) throw new Error('Snapshot tidak boleh memakai BOM.');
  if (csv.includes('\r')) throw new Error('Snapshot harus memakai akhir baris LF.');
  if (!csv.endsWith('\n')) throw new Error('Snapshot harus diakhiri LF.');
  const [header, ...lines] = csv.slice(0, -1).split('\n');
  if (header !== HEADER) throw new Error('Header snapshot tidak sah.');
  const map = new Map();
  for (const line of lines) {
    const [id, stock, extra] = line.split(',');
    if (extra !== undefined || !ID_PATTERN.test(id ?? '') || !STOCK_PATTERN.test(stock ?? '')) throw new Error(`Baris snapshot tidak sah: ${line}`);
    map.set(id, stock);
  }
  return map;
}

module.exports = { HEADER, buildStockSnapshot, parseStockSnapshot, sha256 };
