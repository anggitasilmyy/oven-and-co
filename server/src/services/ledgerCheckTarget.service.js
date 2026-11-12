// services/ledgerCheckTarget.service.js
// CR-04a CP2 · IMPL-CP2-1 — penjaga mode `--legacy-fixtures` pada `db:check-ledger` (Errata E1.1 §4 – §5).
// Mode produksi (default) tidak punya pengecualian. Mode fixture lama hanya diterima bila identitas database uji
// terverifikasi — NODE_ENV saja tidak cukup:
//   1. NODE_ENV bukan production;
//   2. host koneksi 127.0.0.1/localhost dan port harness 33306;
//   3. nama database (dari URL dan SELECT DATABASE()) ada di daftar izin;
//   4. penanda harness `OVENCO_LEDGER_TEST_DB` (diekspor tests-mysql/run.sh) ada dan sama dengan nama database.
// Pengecualian hanya bahan fixture lama suite 16 – 18 yang namanya cocok pola DAN tidak punya catatan stok apa pun.

const LEGACY_FIXTURE_DATABASES = Object.freeze(['ovenco_c4_test']);
const LEGACY_FIXTURE_PORT = '33306';
const LEGACY_FIXTURE_HOSTS = Object.freeze(['127.0.0.1', 'localhost']);
// tests-mysql/16-audit-log, 17-product-recipe, 18-material-requirements (INSERT INTO raw_materials langsung)
const LEGACY_FIXTURE_NAME_PATTERNS = Object.freeze([/^Bahan C5 /, /^Bahan R17 /, /^Bahan R18 /]);

/**
 * @param {{databaseUrl: string, currentDatabase: string, env: Record<string, string|undefined>}} input
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
function verifyLegacyFixtureTarget({ databaseUrl, currentDatabase, env }) {
  if (env.NODE_ENV === 'production') return { ok: false, reason: 'NODE_ENV=production' };
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return { ok: false, reason: 'DATABASE_URL tidak dapat dibaca' };
  }
  const urlDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!LEGACY_FIXTURE_HOSTS.includes(parsed.hostname)) return { ok: false, reason: `host ${parsed.hostname} bukan host harness` };
  if (parsed.port !== LEGACY_FIXTURE_PORT) return { ok: false, reason: `port ${parsed.port || '(default)'} bukan port harness ${LEGACY_FIXTURE_PORT}` };
  if (!LEGACY_FIXTURE_DATABASES.includes(urlDatabase)) return { ok: false, reason: `database ${urlDatabase} tidak dikenal` };
  if (currentDatabase !== urlDatabase) return { ok: false, reason: `DATABASE() ${currentDatabase} ≠ ${urlDatabase}` };
  if (env.OVENCO_LEDGER_TEST_DB !== urlDatabase) return { ok: false, reason: 'penanda harness OVENCO_LEDGER_TEST_DB tidak cocok' };
  return { ok: true };
}

/** Bahan fixture lama yang boleh dikecualikan: nama cocok pola dan tanpa catatan stok */
function isLegacyFixtureMaterial(material, hasStockRecords) {
  return LEGACY_FIXTURE_NAME_PATTERNS.some((p) => p.test(material.name ?? '')) && !hasStockRecords(material);
}

module.exports = {
  LEGACY_FIXTURE_DATABASES, LEGACY_FIXTURE_PORT, LEGACY_FIXTURE_NAME_PATTERNS, verifyLegacyFixtureTarget, isLegacyFixtureMaterial,
};
