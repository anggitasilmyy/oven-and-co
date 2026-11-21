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
#   4. Log MySQL, output uji, results/ & log server masuk ke SATU folder artefak BARU per run
#      (default <tmp>/ovenco-c4/run-<waktu>-<pid>); container yang DIBUAT run ini dihapus di akhir berdasarkan ID-nya.
# Variabel opsional: C4_REUSE_CONTAINER=1 (pakai container yang sudah berjalan, tidak pernah dihapus), C4_KEEP_CONTAINER=1
#   (container buatan run ini dibiarkan hidup, mis. untuk uji api.http Step 7c), C4_ONLY=<pola file> (mis. 03-),
#   C4_ARTIFACT_DIR (path absolut di bawah /tmp yang BELUM ada; dibuat & ditandai skrip ini), C4_MYSQL_IMAGE (default mysql:8.0).
# Step 7 (pengamanan): server uji listen di 127.0.0.1 saja (penanda C4_MYSQL_IT=1); cleanup hanya menghapus ID container
#   buatan run ini; folder artefak selalu baru, jadi tidak ada penghapusan artefak & hasil run lama tidak tercampur.
#   Node menerima path folder yang sama dalam bentuk Windows (cygpath -m) — dibuktikan dengan probe sebelum uji berjalan.
set -euo pipefail
# Git Bash (MSYS): matikan konversi path otomatis untuk SEMUA executable Windows yang dipanggil skrip ini, agar argumen
# Docker seperti `--tmpfs /var/lib/mysql:rw,size=2g` diteruskan apa adanya. Node menerima C4_ARTIFACT_DIR dalam bentuk
# `cygpath -m` (tidak terpengaruh pengaturan ini). npx & shim prisma menghitung path Windows sendiri. Di Linux/macOS
# variabel ini tidak berpengaruh.
export MSYS_NO_PATHCONV=1

cd "$(dirname "$0")/.."
CONTAINER="${C4_MYSQL_CONTAINER:-ovenco-c4-mysql}"
IMAGE="${C4_MYSQL_IMAGE:-mysql:8.0}"
PORT=33306
DB=ovenco_c4_test
ROOT_PW=c4root
die() { echo "$*" >&2; exit 1; }

# ── Folder artefak (B) ─────────────────────────────────────────────────────────────────────────────────────────────
# Aman bila: absolut; induknya ada, bukan symlink, dan path kanoniknya (pwd -P) berada DI BAWAH /tmp kanonik (bukan /tmp
# itu sendiri); folder BELUM ada lalu dibuat skrip ini + diberi penanda. Nama folder saja tidak dianggap pengaman.
# Folder lama (mis. /tmp/c4, C:\tmp\c4, run sebelumnya) tidak pernah dipakai ulang maupun dihapus.
ARTIFACT_MARKER=".ovenco-c4-artifacts"
TMP_ROOT="$(cd /tmp && pwd -P)"
if [[ -n "${C4_ARTIFACT_DIR:-}" ]]; then
  ARTIFACTS_REQUESTED="$C4_ARTIFACT_DIR"
else
  ARTIFACTS_BASE="$TMP_ROOT/ovenco-c4"
  [[ ! -L "$ARTIFACTS_BASE" ]] || die "Folder induk artefak tidak boleh symlink: $ARTIFACTS_BASE"
  mkdir -p -- "$ARTIFACTS_BASE"
  ARTIFACTS_REQUESTED="$ARTIFACTS_BASE/run-$(date +%Y%m%d-%H%M%S)-$$"
fi
case "$ARTIFACTS_REQUESTED" in
  /*) ;;
  *) die "C4_ARTIFACT_DIR harus path absolut: $ARTIFACTS_REQUESTED" ;;
esac
ARTIFACTS_PARENT="$(dirname -- "$ARTIFACTS_REQUESTED")"
ARTIFACTS_NAME="$(basename -- "$ARTIFACTS_REQUESTED")"
[[ "$ARTIFACTS_NAME" != "." && "$ARTIFACTS_NAME" != ".." && "$ARTIFACTS_NAME" != "/" ]] || die "Nama folder artefak tidak sah."
[[ -d "$ARTIFACTS_PARENT" && ! -L "$ARTIFACTS_PARENT" ]] || die "Induk folder artefak tidak ada atau symlink: $ARTIFACTS_PARENT"
ARTIFACTS="$(cd -- "$ARTIFACTS_PARENT" && pwd -P)/$ARTIFACTS_NAME"
case "$ARTIFACTS" in
  "$TMP_ROOT"/?*) ;;
  *) die "Folder artefak harus berada di bawah $TMP_ROOT: $ARTIFACTS" ;;
esac
[[ ! -L "$ARTIFACTS" ]] || die "Folder artefak tidak boleh symlink: $ARTIFACTS"
[[ ! -e "$ARTIFACTS" ]] || die "Folder artefak sudah ada — pakai folder baru agar hasil run lama tidak tercampur: $ARTIFACTS"
mkdir -- "$ARTIFACTS"
: > "$ARTIFACTS/$ARTIFACT_MARKER"
[[ "$(cd -- "$ARTIFACTS" && pwd -P)" == "$ARTIFACTS" ]] || die "Path kanonik folder artefak berubah: $ARTIFACTS"

# Representasi untuk Node.js: di Git Bash (Windows) path /tmp/... TIDAK aman diteruskan apa adanya — dengan
# MSYS_NO_PATHCONV=1 Node menafsirkannya sebagai C:\tmp\... (folder fisik lain). Bentuk campuran `cygpath -m`
# (C:/Users/.../Temp/...) tidak dikonversi MSYS dalam mode apa pun. Di Linux/macOS (tanpa cygpath) path sama.
if command -v cygpath > /dev/null 2>&1; then
  ARTIFACTS_NODE="$(cygpath -m -- "$ARTIFACTS")"
else
  ARTIFACTS_NODE="$ARTIFACTS"
fi
# Bukti satu folder fisik: shell menulis token unik, Node membacanya lewat C4_ARTIFACT_DIR (jalur yang sama dengan uji)
# setelah fs.realpathSync. Gagal → berhenti sebelum Docker/uji berjalan.
ARTIFACT_PROBE=".path-probe-$$"
ARTIFACT_TOKEN="ovenco-c4-probe-$$-$RANDOM$RANDOM"
printf '%s' "$ARTIFACT_TOKEN" > "$ARTIFACTS/$ARTIFACT_PROBE"
ARTIFACT_SEEN="$(C4_ARTIFACT_DIR="$ARTIFACTS_NODE" node -e '
  const fs = require("fs"); const path = require("path");
  const dir = fs.realpathSync(process.env.C4_ARTIFACT_DIR);
  process.stdout.write(fs.readFileSync(path.join(dir, process.argv[1]), "utf8"));
' "$ARTIFACT_PROBE" 2>/dev/null || true)"
[[ "$ARTIFACT_SEEN" == "$ARTIFACT_TOKEN" ]] \
  || die "Node.js tidak melihat folder artefak yang sama dengan shell: $ARTIFACTS ↔ $ARTIFACTS_NODE"
rm -f -- "$ARTIFACTS/$ARTIFACT_PROBE"
echo "Folder artefak run ini: $ARTIFACTS (Node: $ARTIFACTS_NODE)"

mysql_root() { docker exec -i "$CONTAINER" mysql -uroot -p"$ROOT_PW" "$@" 2>/dev/null; }

# ── Container & cleanup (C) ────────────────────────────────────────────────────────────────────────────────────────
# CREATED_ID hanya terisi oleh ID hasil `docker create` run INI. Cleanup menghapus ID itu saja — tidak pernah berdasarkan
# nama — sehingga container yang sudah ada sebelumnya atau container mode reuse tidak pernah dihapus.
# C4_KEEP_CONTAINER hanya berlaku untuk container yang BERHASIL di-start (STARTED=1); container berstatus "Created" dari
# start yang gagal selalu dihapus (berdasarkan ID) agar tidak memblokir run berikutnya.
CREATED_ID=""
STARTED=0
cleanup() {
  if [[ -n "$CREATED_ID" ]]; then
    docker logs "$CREATED_ID" > "$ARTIFACTS/mysql-error.log" 2>&1 || true
    if [[ "${C4_KEEP_CONTAINER:-0}" == "1" && "$STARTED" == "1" ]]; then
      echo "Container $CONTAINER ($CREATED_ID) dibiarkan berjalan (C4_KEEP_CONTAINER=1)."
    else
      docker rm -f "$CREATED_ID" > /dev/null 2>&1 || true
      echo "Container $CONTAINER ($CREATED_ID) dihapus (image $IMAGE tetap ada)."
    fi
  elif [[ "${C4_REUSE_CONTAINER:-0}" == "1" ]]; then
    docker logs "$CONTAINER" > "$ARTIFACTS/mysql-error.log" 2>&1 || true
  fi
}
trap cleanup EXIT

docker info > /dev/null 2>&1 || die "Docker daemon tidak berjalan."

if [[ "${C4_REUSE_CONTAINER:-0}" != "1" ]]; then
  if docker ps -a --format '{{.Names}}' | grep -qx -- "$CONTAINER"; then
    die "Container $CONTAINER sudah ada — hapus dulu atau pakai C4_REUSE_CONTAINER=1."
  fi
  # create → simpan ID → start: bila start gagal (mis. port 33306 terpakai), trap hanya menghapus ID ini.
  CREATED_ID="$(docker create --name "$CONTAINER" -p "127.0.0.1:$PORT:3306" --tmpfs /var/lib/mysql:rw,size=2g \
    -e MYSQL_ROOT_PASSWORD="$ROOT_PW" "$IMAGE" \
    --innodb-print-all-deadlocks=ON --log-error-verbosity=3 \
    --innodb-monitor-enable=lock_deadlocks,lock_timeouts,lock_row_lock_waits \
    --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci)"
  [[ "$CREATED_ID" =~ ^[0-9a-f]{64}$ ]] || { CREATED_ID=""; die "docker create tidak mengembalikan ID container yang sah."; }
  docker start "$CREATED_ID" > /dev/null
  STARTED=1
fi

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

# Step 7 (A): C4_MYSQL_IT=1 juga penanda bagi src/server.js untuk listen HANYA di 127.0.0.1. Semua server uji
# (`node src/server.js` di helpers/server.js, helpers/autoCancelFixtures.js, suite 13 & 15) mewarisi env ini lewat
# `...process.env`. Variabel HOST tidak dipakai.
export C4_MYSQL_IT=1
# CR-04a IMPL-CP2-1: penanda identitas database uji untuk `db:check-ledger --legacy-fixtures`
export OVENCO_LEDGER_TEST_DB="$DB"
export C4_MYSQL_CONTAINER="$CONTAINER"
# (B) Node menulis results/ & log server ke folder fisik yang sama dengan shell (bentuk cygpath -m, sudah diprobe).
export C4_ARTIFACT_DIR="$ARTIFACTS_NODE"
export ROOT_DATABASE_URL="mysql://root:$ROOT_PW@127.0.0.1:$PORT/$DB"
export APP_DATABASE_URL="mysql://c4app:c4app@127.0.0.1:$PORT/$DB"

DATABASE_URL="$ROOT_DATABASE_URL" npx prisma migrate deploy > "$ARTIFACTS/migrate.log" 2>&1
# Seed hanya pada database kosong (container baru); tanpa migrate reset — skenario membuat datanya sendiri
if [[ "$(mysql_root -N -e "SELECT COUNT(*) FROM $DB.users")" == "0" ]]; then
  DATABASE_URL="$ROOT_DATABASE_URL" npx prisma db seed >> "$ARTIFACTS/migrate.log" 2>&1
fi
mysql_root -e "SELECT VERSION() AS version, @@transaction_isolation AS isolation, @@innodb_lock_wait_timeout AS lock_wait_timeout, @@innodb_print_all_deadlocks AS print_deadlocks" | tee "$ARTIFACTS/mysql-config.txt"

# (B) Tidak ada penghapusan `results`: folder artefak run ini selalu baru (dibuat di atas), jadi results/ belum ada dan
# hasil run sebelumnya tidak mungkin tercampur.
[[ ! -e "$ARTIFACTS/results" ]] || die "Folder hasil sudah ada di folder artefak baru (tidak terduga): $ARTIFACTS/results"
FILES=$(ls tests-mysql/*.it.test.js | grep -- "${C4_ONLY:-.}")
set +e
# shellcheck disable=SC2086
node --test --test-concurrency=1 --test-reporter=spec $FILES 2>&1 | tee "$ARTIFACTS/test-output.txt"
STATUS=${PIPESTATUS[0]}
set -e
mysql_root -e "SELECT NAME, COUNT FROM information_schema.innodb_metrics WHERE NAME IN ('lock_deadlocks','lock_timeouts','lock_row_lock_waits')" | tee "$ARTIFACTS/innodb-metrics.txt"
exit "$STATUS"
