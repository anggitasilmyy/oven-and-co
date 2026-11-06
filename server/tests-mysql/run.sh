#!/usr/bin/env bash
# tests-mysql/run.sh — Integrasi MySQL 8 — Validasi AD-11 (C3), dengan smoke test C2.
# Dijalankan lewat `npm run test:mysql` (dari folder server/). TERPISAH dari unit test (`npm test`, Prisma dipalsukan).
#
# Langkah:
#   1. Container MySQL 8 SEMENTARA (data di tmpfs, port lokal 33306 — bukan 3306), database `ovenco_c4_test`,
#      akun aplikasi `c4app` dengan hak HANYA pada database uji. Database utama / .env tidak disentuh.
#   2. `prisma migrate deploy` (migrasi repo apa adanya) + seed sekali pada database kosong. Tidak ada `migrate reset`:
#      setiap skenario membuat akun/pesanannya sendiri (email unik), jadi file uji tidak saling bergantung.
#   3. `node --test` berurutan (satu file per waktu) untuk tests-mysql/*.it.test.js.
#   4. Log MySQL & output uji disalin ke /tmp/c4 (C4_ARTIFACT_DIR); container dihapus di akhir (image tidak dihapus).
# Variabel opsional: C4_REUSE_CONTAINER=1 (pakai container yang sudah berjalan, tidak dihapus), C4_KEEP_CONTAINER=1,
#   C4_ONLY=<pola file> (mis. 03-), C4_ARTIFACT_DIR, C4_MYSQL_IMAGE (default mysql:8.0).
set -euo pipefail

cd "$(dirname "$0")/.."
CONTAINER="${C4_MYSQL_CONTAINER:-ovenco-c4-mysql}"
IMAGE="${C4_MYSQL_IMAGE:-mysql:8.0}"
PORT=33306
DB=ovenco_c4_test
ROOT_PW=c4root
ARTIFACTS="${C4_ARTIFACT_DIR:-/tmp/c4}"
mkdir -p "$ARTIFACTS"

mysql_root() { docker exec -i "$CONTAINER" mysql -uroot -p"$ROOT_PW" "$@" 2>/dev/null; }

cleanup() {
  docker logs "$CONTAINER" > "$ARTIFACTS/mysql-error.log" 2>&1 || true
  if [[ "${C4_REUSE_CONTAINER:-0}" != "1" && "${C4_KEEP_CONTAINER:-0}" != "1" ]]; then
    docker rm -f "$CONTAINER" > /dev/null 2>&1 || true
    echo "Container $CONTAINER dihapus (image $IMAGE tetap ada)."
  fi
}

docker info > /dev/null 2>&1 || { echo "Docker daemon tidak berjalan." >&2; exit 1; }

if [[ "${C4_REUSE_CONTAINER:-0}" != "1" ]]; then
  if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "Container $CONTAINER sudah ada — hapus dulu atau pakai C4_REUSE_CONTAINER=1." >&2
    exit 1
  fi
  docker run -d --name "$CONTAINER" -p "127.0.0.1:$PORT:3306" --tmpfs /var/lib/mysql:rw,size=2g \
    -e MYSQL_ROOT_PASSWORD="$ROOT_PW" "$IMAGE" \
    --innodb-print-all-deadlocks=ON --log-error-verbosity=3 \
    --innodb-monitor-enable=lock_deadlocks,lock_timeouts,lock_row_lock_waits \
    --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci > /dev/null
fi
trap cleanup EXIT

# Siap = server FINAL menerima koneksi TCP. Server sementara saat inisialisasi image berjalan dengan --skip-networking,
# jadi cek lewat socket bisa lolos lalu server di-restart (race). Gagal tegas bila tidak siap.
READY=0
for _ in $(seq 1 90); do
  if mysql_root -h127.0.0.1 -P3306 -e 'SELECT 1' > /dev/null; then READY=1; break; fi
  sleep 2
done
[[ "$READY" == "1" ]] || { echo "MySQL tidak siap." >&2; exit 1; }
mysql_root <<SQL
CREATE DATABASE IF NOT EXISTS $DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'c4app'@'%' IDENTIFIED BY 'c4app';
GRANT ALL PRIVILEGES ON $DB.* TO 'c4app'@'%';
SQL

export C4_MYSQL_IT=1
export C4_MYSQL_CONTAINER="$CONTAINER"
export C4_ARTIFACT_DIR="$ARTIFACTS"
export ROOT_DATABASE_URL="mysql://root:$ROOT_PW@127.0.0.1:$PORT/$DB"
export APP_DATABASE_URL="mysql://c4app:c4app@127.0.0.1:$PORT/$DB"

DATABASE_URL="$ROOT_DATABASE_URL" npx prisma migrate deploy > "$ARTIFACTS/migrate.log" 2>&1
# Seed hanya pada database kosong (container baru); tanpa migrate reset — skenario membuat datanya sendiri
if [[ "$(mysql_root -N -e "SELECT COUNT(*) FROM $DB.users")" == "0" ]]; then
  DATABASE_URL="$ROOT_DATABASE_URL" npx prisma db seed >> "$ARTIFACTS/migrate.log" 2>&1
fi
mysql_root -e "SELECT VERSION() AS version, @@transaction_isolation AS isolation, @@innodb_lock_wait_timeout AS lock_wait_timeout, @@innodb_print_all_deadlocks AS print_deadlocks" | tee "$ARTIFACTS/mysql-config.txt"

rm -rf "$ARTIFACTS/results"
FILES=$(ls tests-mysql/*.it.test.js | grep -- "${C4_ONLY:-.}")
set +e
# shellcheck disable=SC2086
node --test --test-concurrency=1 --test-reporter=spec $FILES 2>&1 | tee "$ARTIFACTS/test-output.txt"
STATUS=${PIPESTATUS[0]}
set -e
mysql_root -e "SELECT NAME, COUNT FROM information_schema.innodb_metrics WHERE NAME IN ('lock_deadlocks','lock_timeouts','lock_row_lock_waits')" | tee "$ARTIFACTS/innodb-metrics.txt"
exit "$STATUS"
