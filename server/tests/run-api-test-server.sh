#!/usr/bin/env bash
# tests/run-api-test-server.sh — Step 7c/7d · server API uji untuk server/tests/api.http (Opsi 1: database harness MySQL).
# Dijalankan dari Git Bash/bash (folder mana pun) SETELAH `C4_KEEP_CONTAINER=1 bash tests-mysql/run.sh` selesai:
#   export DATABASE_URL='mysql://c4app:c4app@127.0.0.1:33306/ovenco_c4_test'
#   export JWT_SECRET="$(node -e 'process.stdout.write(require("crypto").randomBytes(48).toString("hex"))')"
#   bash tests/run-api-test-server.sh                 # validasi, lalu jalankan server di 127.0.0.1:4100
#   C4_API_CHECK_ONLY=1 bash tests/run-api-test-server.sh   # hanya validasi, server TIDAK dijalankan
#
# Pengaman (semua dicek SEBELUM server dijalankan; kredensial tidak pernah dicetak):
#   - DATABASE_URL wajib diisi di environment (server/.env TIDAK dipakai untuk ini: dotenv tidak menimpa env yang ada).
#   - Protokol tepat `mysql:`, host tepat 127.0.0.1, port tepat 33306, database tepat `ovenco_c4_test`, tanpa query
#     string/fragment — jadi database pengembangan (127.0.0.1:3308/oven_and_co) dan database lain selalu ditolak.
#   - JWT_SECRET khusus pengujian wajib diisi di environment, minimal 32 karakter (asumsi uji: setara 128 bit hex;
#     contoh di atas membuat 96 karakter acak). Karena dotenv tidak menimpa env yang sudah ada, nilai ini yang dipakai
#     server — JWT_SECRET di server/.env development tidak pernah terpakai. Ditolak bila kosong, terlalu pendek, atau
#     SAMA dengan JWT_SECRET di server/.env. DESIGN_TOKEN_SECRET (kunci token desain custom cake; bila kosong diturunkan
#     dari JWT_SECRET) ditolak bila hanya akan terbaca dari server/.env. Nilai secret tidak pernah dicetak.
#   - Server dijalankan dengan C4_MYSQL_IT=1 (src/server.js → listen hanya di 127.0.0.1), PORT=4100, NODE_ENV=test
#     (job auto-cancel mati; OTP reset sandi tetap tampil di console server).
set -euo pipefail
cd "$(dirname "$0")/.."

EXPECTED_HOST=127.0.0.1
EXPECTED_DB_PORT=33306
EXPECTED_DB=ovenco_c4_test
API_PORT=4100
die() { echo "DITOLAK: $*" >&2; exit 1; }

[[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL belum diisi di environment."

# Lapis 1 (shell): bentuk utuh harus persis mysql://<user>:<sandi>@127.0.0.1:33306/ovenco_c4_test
[[ "$DATABASE_URL" =~ ^mysql://[^:@/?#]+:[^@/?#]*@127\.0\.0\.1:33306/ovenco_c4_test$ ]] \
  || die "DATABASE_URL bukan database uji harness (wajib mysql://…@$EXPECTED_HOST:$EXPECTED_DB_PORT/$EXPECTED_DB)."

# Lapis 2 (parser URL Node): komponen dicek satu per satu; hanya nama komponen yang gagal yang dicetak.
EXPECTED_HOST="$EXPECTED_HOST" EXPECTED_DB_PORT="$EXPECTED_DB_PORT" EXPECTED_DB="$EXPECTED_DB" node -e '
  const { EXPECTED_HOST: host, EXPECTED_DB_PORT: port, EXPECTED_DB: db, DATABASE_URL: raw } = process.env;
  let u; try { u = new URL(raw); } catch { console.error("DITOLAK: DATABASE_URL tidak dapat diurai."); process.exit(1); }
  const checks = [
    ["protokol", u.protocol === "mysql:"], ["host", u.hostname === host], ["port", u.port === port],
    ["database", u.pathname === `/${db}`], ["tanpa query/fragment", u.search === "" && u.hash === ""],
    ["user", u.username !== ""], ["bukan port pengembangan 3308", u.port !== "3308"],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (failed.length) { console.error(`DITOLAK: komponen DATABASE_URL tidak sesuai: ${failed.join(", ")}.`); process.exit(1); }
  console.log(`DATABASE_URL OK: mysql://***:***@${u.hostname}:${u.port}${u.pathname}`);
' || exit 1

# JWT_SECRET khusus uji: wajib dari environment (bukan server/.env development). Nilai tidak pernah dicetak.
[[ -n "${JWT_SECRET:-}" ]] \
  || die "JWT_SECRET khusus pengujian belum diisi di environment (server/.env development tidak dipakai). Lihat header skrip."
node -e '
  const fs = require("fs");
  const fail = (msg) => { console.error(`DITOLAK: ${msg}`); process.exit(1); };
  const secret = process.env.JWT_SECRET;
  if (secret.length < 32) fail("JWT_SECRET khusus pengujian minimal 32 karakter.");
  const devEnv = fs.existsSync(".env") ? require("dotenv").parse(fs.readFileSync(".env")) : {};
  if (devEnv.JWT_SECRET && devEnv.JWT_SECRET === secret) {
    fail("JWT_SECRET sama dengan server/.env development — gunakan secret khusus pengujian.");
  }
  if (devEnv.DESIGN_TOKEN_SECRET && !process.env.DESIGN_TOKEN_SECRET) {
    fail("DESIGN_TOKEN_SECRET hanya ada di server/.env development — isi nilai khusus pengujian di environment.");
  }
  console.log("JWT_SECRET OK: khusus pengujian, dari environment (nilai tidak dicetak).");
' || exit 1

if [[ "${C4_API_CHECK_ONLY:-0}" == "1" ]]; then
  echo "C4_API_CHECK_ONLY=1 — validasi selesai, server tidak dijalankan."
  exit 0
fi

echo "Menjalankan server API uji di http://$EXPECTED_HOST:$API_PORT/api (NODE_ENV=test, C4_MYSQL_IT=1)."
exec env C4_MYSQL_IT=1 PORT="$API_PORT" NODE_ENV=test node src/server.js
