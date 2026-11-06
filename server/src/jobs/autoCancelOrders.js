// jobs/autoCancelOrders.js
// FR-38 · BR-06 · NFR-05 — pembatalan otomatis pesanan (Step 6.5 C2: pembayaran online lewat batas waktu).
// SATU penjadwal (node-cron, tiap menit) untuk semua pembatalan otomatis; BR-07 (Bayar di Toko setelah jam tutup)
// ditambahkan ke runAutoCancel di C3 — tidak ada penjadwal kedua.
//
// Jaminan:
//   - Kandidat dibaca tanpa kunci (consistent read), lalu SETIAP pesanan diproses dalam transaksinya sendiri:
//     kunci baris orders (lockMyOrder: FOR UPDATE sebagai pembacaan pertama) → periksa ULANG semua syarat BR-06
//     → cancelOrderTx (efek pembatalan bersama, urutan kunci C4 + F-C1-1). Pesanan yang sudah lunas, sudah dibatalkan
//     (pelanggan / proses job lain), atau berganti ke Bayar di Toko dilewati tanpa menulis apa pun → antarproses tidak
//     mungkin ada pembatalan ganda, dan pembayaran & pembatalan tidak mungkin sama-sama berhasil.
//   - Error satu pesanan (lock wait 1205, deadlock, database) dicatat dan pesanan lain tetap diproses; pesanan itu
//     dicoba lagi di putaran berikutnya.
//   - Salinan email dicetak setelah commit per pesanan (emailAfterCommit, C1).
//   - Dalam satu proses, putaran tidak tumpang tindih (flag `inFlight`).
//   - Shutdown (stopAutoCancelJob): cron dihentikan, flag `stopping` dipasang, pesanan yang SEDANG diproses dibiarkan
//     selesai commit/rollback, kandidat berikutnya TIDAK diproses, lalu ditunggu sampai putaran (termasuk pencetakan
//     email) benar-benar selesai — tanpa batas waktu yang memotong. Penantian ini pasti berakhir karena setiap transaksi
//     dibatasi Prisma (timeout 15 s, maxWait 2 s, lock wait 2 s — lib/prismaClients.js) dan query kandidat di luar
//     transaksi dibatasi MySQL (MAX_EXECUTION_TIME, lihat findOverdueOnlineOrders). server.js baru memanggil
//     prisma.$disconnect setelah itu, jadi koneksi tidak pernah ditutup saat transaksi job masih aktif.

const cron = require('node-cron');
const prisma = require('../lib/prisma');
const {
  ORDER_STATUS, PAYMENT_STATUS, PAYMENT_OPTION, PAYMENT_TRANSACTION_STATUS, PAYMENT_TIMEOUT_CANCEL_REASON,
  AUTO_CANCEL_PAYMENT_STATUS, AUTO_CANCEL_JOB,
} = require('../utils/businessConstants');
const { lockMyOrder } = require('../services/order.service');
const { cancelOrderTx } = require('../services/orderCancellation.service');
const { emailAfterCommit } = require('../services/orderStatusRecorder.service');
const { isOverdueOnlinePayment } = require('../services/autoCancelRules.service');

const LOG_PREFIX = `[Job ${AUTO_CANCEL_JOB.NAME}]`;
const ERROR_DETAIL_MAX = 300;

/**
 * Ringkasan error yang jelas untuk log: kode + pesan database. Pesan error Prisma diawali cuplikan kode sumber dan pesan
 * MySQL ada di baris terakhir, jadi yang dipakai `meta.message` (bila ada) atau baris terakhir pesan.
 */
function describeError(error) {
  const lines = String(error?.message ?? error).split('\n').map((line) => line.trim()).filter(Boolean);
  const message = error?.meta?.message ?? lines.at(-1) ?? '';
  // P2010 (raw query) menyimpan nomor error MySQL di meta.code (mis. 3024 MAX_EXECUTION_TIME, 1205 lock wait)
  const mysqlCode = error?.meta?.code ? ` (MySQL ${error.meta.code})` : '';
  return `${error?.code ?? error?.name ?? 'Error'}${mysqlCode}: ${message}`.replace(/\s+/g, ' ').slice(0, ERROR_DETAIL_MAX);
}
const OUTCOME = Object.freeze({ CANCELLED: 'cancelled', SKIPPED: 'skipped' });

/**
 * BR-06: kandidat — consistent read TANPA kunci, di LUAR transaksi interaktif (pemeriksaan yang menentukan tetap
 * dilakukan ulang setelah kunci). Karena di luar transaksi, timeout transaksi Prisma (15 s) TIDAK berlaku: query bisa
 * menunggu metadata lock (LOCK TABLES / DDL pada orders, lock_wait_timeout bawaan 1 tahun) atau memindai lama (tanpa
 * indeks status/expired_at di SPEC §8). Batasnya ditegakkan MySQL sendiri lewat optimizer hint MAX_EXECUTION_TIME
 * (terbukti di MySQL 8: menghentikan tunggu metadata lock & eksekusi lambat, ER 3024) — statement benar-benar berhenti
 * di server, jadi shutdown yang menunggu putaran tidak pernah menunggu tanpa batas dan tidak memutus query yang masih
 * berjalan. Bukan Promise.race di JS (yang meninggalkan query tetap berjalan). Hint tidak bisa lewat findMany, jadi
 * dipakai SELECT ber-parameter; satu-satunya nilai yang disisipkan ke teks SQL adalah konstanta bilangan bulat.
 */
const CANDIDATE_TIMEOUT_MS = AUTO_CANCEL_JOB.CANDIDATE_QUERY_TIMEOUT_MS;
if (!Number.isInteger(CANDIDATE_TIMEOUT_MS) || CANDIDATE_TIMEOUT_MS <= 0) throw new Error('CANDIDATE_QUERY_TIMEOUT_MS tidak sah');
const OVERDUE_ONLINE_SQL = `SELECT /*+ MAX_EXECUTION_TIME(${CANDIDATE_TIMEOUT_MS}) */ DISTINCT
    o.order_id AS orderId, o.order_number AS orderNumber, o.user_id AS userId
  FROM orders o JOIN payments p ON p.order_id = o.order_id
  WHERE o.order_status = ? AND o.payment_option = ? AND o.payment_status = ? AND p.status = ? AND p.expired_at < ?
  ORDER BY o.order_id
  LIMIT ?`;

async function findOverdueOnlineOrders(now, limit) {
  return prisma.$queryRawUnsafe(
    OVERDUE_ONLINE_SQL,
    ORDER_STATUS.MENUNGGU_PEMBAYARAN, PAYMENT_OPTION.ONLINE, PAYMENT_STATUS.UNPAID, PAYMENT_TRANSACTION_STATUS.PENDING,
    now, limit,
  );
}

/**
 * Batalkan satu pesanan BR-06 dalam transaksinya sendiri.
 * @returns {Promise<'cancelled'|'skipped'>}
 */
function cancelOverdueOnlineOrder(candidate, now) {
  return emailAfterCommit(prisma.$transaction(async (tx) => {
    const order = await lockMyOrder(tx, candidate.userId, candidate.orderNumber);
    if (!isOverdueOnlinePayment(order, order.payments[0], now)) return { result: OUTCOME.SKIPPED, notices: [] };

    const notices = await cancelOrderTx(tx, order, {
      reason: PAYMENT_TIMEOUT_CANCEL_REASON, changedBy: null, unpaidPaymentStatus: AUTO_CANCEL_PAYMENT_STATUS, now,
    });
    return { result: OUTCOME.CANCELLED, notices };
  }));
}

// ── Status penjadwal (satu per proses) ──────────────────────────────────────────────────────────

let task = null;
let inFlight = null;
let stopping = false;

/** true setelah shutdown diminta — putaran berhenti sebelum kandidat berikutnya */
const isStopping = () => stopping;

/**
 * Satu putaran pembatalan otomatis.
 * @param {{now?: Date, batchSize?: number, shouldStop?: () => boolean}} [opts] — shouldStop diperiksa sebelum query
 *   kandidat dan sebelum SETIAP pesanan (bawaan: shutdown diminta)
 * @returns {Promise<{cancelled: string[], skipped: string[], failed: Array<{order_number: string, error: string}>,
 *   stopped: boolean, queryError: string|null}>} stopped = putaran dihentikan sebelum semua kandidat diproses;
 *   queryError = query kandidat gagal (tidak ada pesanan yang diproses)
 */
async function runAutoCancel({ now = new Date(), batchSize = AUTO_CANCEL_JOB.BATCH_SIZE, shouldStop = isStopping } = {}) {
  const summary = { cancelled: [], skipped: [], failed: [], stopped: false, queryError: null };
  if (shouldStop()) return { ...summary, stopped: true };
  let candidates;
  try {
    candidates = await findOverdueOnlineOrders(now, batchSize);
  } catch (error) {
    // Query kandidat gagal / melewati MAX_EXECUTION_TIME (ER 3024): tidak ada transaksi yang dimulai; dicoba lagi
    // putaran berikutnya. Setelah ini shutdown (bila diminta) tidak lagi menunggu aktivitas database job.
    summary.queryError = describeError(error);
    console.error(`${LOG_PREFIX} Query kandidat BR-06 gagal, dicoba lagi putaran berikutnya — ${summary.queryError}`);
    return summary;
  }

  for (const candidate of candidates) {
    // Shutdown diminta: pesanan sebelumnya sudah commit/rollback; sisanya diproses putaran berikutnya setelah restart
    if (shouldStop()) {
      summary.stopped = true;
      console.info(`${LOG_PREFIX} Shutdown diminta — ${candidates.length - summary.cancelled.length - summary.skipped.length
        - summary.failed.length} kandidat tersisa tidak diproses.`);
      break;
    }
    try {
      const outcome = await cancelOverdueOnlineOrder(candidate, now);
      summary[outcome].push(candidate.orderNumber);
    } catch (error) {
      const detail = describeError(error);
      summary.failed.push({ order_number: candidate.orderNumber, error: detail });
      console.error(`${LOG_PREFIX} Gagal membatalkan ${candidate.orderNumber} (BR-06), dicoba lagi putaran berikutnya — ${detail}`);
    }
  }

  if (summary.cancelled.length || summary.failed.length) {
    console.info(`${LOG_PREFIX} BR-06: ${summary.cancelled.length} dibatalkan, ${summary.skipped.length} dilewati, `
      + `${summary.failed.length} gagal${summary.cancelled.length ? ` (${summary.cancelled.join(', ')})` : ''}`);
  }
  return summary;
}

// ── Penjadwal ──────────────────────────────────────────────────────────────────────────────────

/** Job tidak berjalan di unit test / server uji (NODE_ENV=test) atau bila AUTO_CANCEL_ENABLED=false */
function isAutoCancelEnabled(env = process.env) {
  return env.NODE_ENV !== 'test' && env[AUTO_CANCEL_JOB.ENABLED_ENV] !== 'false';
}

/** Satu tick: dilewati saat shutdown atau bila putaran sebelumnya di proses ini masih berjalan (tanpa tumpang tindih) */
function tick(run = runAutoCancel) {
  if (stopping) return Promise.resolve();
  if (inFlight) {
    console.warn(`${LOG_PREFIX} Putaran sebelumnya belum selesai — tick ini dilewati.`);
    return inFlight;
  }
  inFlight = Promise.resolve()
    .then(() => run())
    .catch((error) => console.error(`${LOG_PREFIX} Putaran gagal — ${describeError(error)}`))
    .finally(() => { inFlight = null; });
  return inFlight;
}

/**
 * Mulai penjadwal: sekali saat start (pesanan yang lewat batas selama server mati), lalu tiap menit.
 * @returns {boolean} true bila dijalankan
 */
function startAutoCancelJob({ env = process.env, schedule = cron.schedule, run = runAutoCancel } = {}) {
  if (task || !isAutoCancelEnabled(env)) return false;
  stopping = false;
  task = schedule(AUTO_CANCEL_JOB.CRON, () => tick(run), { name: AUTO_CANCEL_JOB.NAME });
  tick(run);
  console.info(`${LOG_PREFIX} Aktif (${AUTO_CANCEL_JOB.CRON}).`);
  return true;
}

/**
 * Shutdown: hentikan cron (tidak ada putaran baru), tandai `stopping` (putaran berjalan berhenti sebelum kandidat
 * berikutnya), lalu tunggu putaran yang sedang berjalan SAMPAI SELESAI — termasuk transaksi pesanan yang sedang
 * diproses (commit/rollback) dan pencetakan email setelah commit. Tidak ada batas waktu yang memotong; setelah
 * `logAfterMs` hanya dicatat peringatan. Dipanggil server.js SEBELUM prisma.$disconnect.
 * @returns {Promise<void>} selesai = tidak ada aktivitas database job lagi
 */
async function stopAutoCancelJob({ logAfterMs = AUTO_CANCEL_JOB.SHUTDOWN_LOG_AFTER_MS } = {}) {
  stopping = true;
  if (task) {
    await task.stop();
    await task.destroy?.();
    task = null;
  }
  if (!inFlight) return;
  const waiting = setTimeout(() => {
    console.warn(`${LOG_PREFIX} Masih menunggu putaran selesai (> ${logAfterMs} ms) sebelum koneksi database ditutup.`);
  }, logAfterMs);
  try {
    await inFlight;
  } finally {
    clearTimeout(waiting);
  }
}

module.exports = {
  OUTCOME,
  describeError,
  isStopping,
  findOverdueOnlineOrders,
  cancelOverdueOnlineOrder,
  runAutoCancel,
  isAutoCancelEnabled,
  tick,
  startAutoCancelJob,
  stopAutoCancelJob,
};
