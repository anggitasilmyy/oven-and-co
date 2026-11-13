// services/operationRequest.service.js
// CR-04a CP4 · BR-31 · FR-44 (Draft 0.8.3 §5.2, §10.1 – §10.2) — satu operasi tulis = satu transaksi interaktif dengan
// idempotensi `request_id` di tabel operation_requests:
//   kunci pelaku users (S) → INSERT operation_requests (nilai sementara 102 / {"status":"in_progress"}) → pekerjaan →
//   UPDATE operation_requests ke respons final (2xx) → COMMIT. Nilai sementara tidak pernah ter-commit.
// Duplikat request_id (1062 setelah transaksi asli COMMIT) → transaksi ini rollback, lalu baris tersimpan dibaca di
// luar transaksi: aktor + operasi + target + hash sama → replay respons asli (header Idempotent-Replay); berbeda →
// 409 REQUEST_ID_REUSED. Transaksi asli masih berjalan (lock wait > 2 s / deadlock pada kunci unik) → 409
// REQUEST_IN_PROGRESS (boleh dikirim ulang dengan request_id sama). Penolakan bisnis & error → rollback penuh: dokumen,
// mutasi, stok, audit, dan operation_requests tidak tersimpan. Tanpa request_id → transaksi biasa (perilaku lama).

const prisma = require('../lib/prisma');
const { LEDGER_ERROR_CODE } = require('../utils/businessConstants');
const { lockAuditActor } = require('./auditLog.service');
const { payloadHash, duplicateRequestDecision } = require('./idempotencyRules.service');

const PENDING_STATUS = 102;
const PENDING_BODY = Object.freeze({ status: 'in_progress' });

function httpError(statusCode, message, apiCode) {
  return Object.assign(new Error(message), { statusCode, ...(apiCode ? { apiCode } : {}) });
}

const inProgressError = () => httpError(409, 'Permintaan dengan request_id ini masih diproses. Coba lagi sebentar.', LEDGER_ERROR_CODE.REQUEST_IN_PROGRESS);

/** Lock wait timeout (1205) atau deadlock (1213) — Prisma model API maupun raw query */
function isLockConflict(err) {
  const text = `${err?.code ?? ''} ${err?.meta?.code ?? ''} ${err?.message ?? ''}`;
  return /\b(1205|1213|P2034)\b|Lock wait timeout|Deadlock/i.test(text);
}

const isDuplicateRequest = (err) => err?.code === 'P2002' || /\b1062\b|Duplicate entry/.test(`${err?.meta?.code ?? ''} ${err?.message ?? ''}`);

class DuplicateRequestError extends Error {}

// INSERT mentah (bukan Prisma create): create Prisma menjalankan SELECT sesudah INSERT, dan SELECT biasa pertama membuat
// read view REPEATABLE READ SEBELUM baris bisnis dikunci → pembacaan berikutnya bisa basi (terbukti: penerimaan PO
// bersamaan melewati sisa). Tanpa SELECT biasa di sini, read view baru terbentuk setelah seluruh kunci diambil.
async function insertPending(tx, { requestId, operation, actorId, targetType, targetId, hash }) {
  try {
    await tx.$executeRaw`INSERT INTO operation_requests (request_id, operation, actor_id, target_type, target_id, payload_hash,
      response_status, response_body) VALUES (${requestId}, ${operation}, ${BigInt(actorId)}, ${targetType},
      ${targetId == null ? null : BigInt(targetId)}, ${hash}, ${PENDING_STATUS}, ${JSON.stringify(PENDING_BODY)})`;
  } catch (err) {
    if (isDuplicateRequest(err)) throw new DuplicateRequestError(requestId);
    if (isLockConflict(err)) throw inProgressError();
    throw err;
  }
}

async function replayOrReject(stored, incoming) {
  if (!stored || stored.responseStatus === PENDING_STATUS) throw inProgressError();
  const decision = duplicateRequestDecision(
    { actor_id: stored.actorId, operation: stored.operation, target_type: stored.targetType, target_id: stored.targetId,
      payload_hash: stored.payloadHash, response_status: stored.responseStatus, response_body: stored.responseBody },
    incoming,
  );
  if (decision.action === 'reject') throw httpError(decision.status, decision.message, decision.code);
  return { statusCode: decision.status, body: decision.body, replay: true };
}

/**
 * @param {{actorId, requestId?: string, operation: string, targetType: string|null, targetId: string|null,
 *   payload: object, successStatus: number}} op — payload sudah dinormalisasi (tanpa request_id)
 * @param {(tx) => Promise<object>} work — dijalankan setelah kunci pelaku & INSERT operation_requests; mengembalikan `data`
 * @returns {Promise<{statusCode: number, body: object, replay: boolean}>}
 */
async function runOperation(op, work) {
  const hash = op.requestId ? payloadHash(op.payload) : null;
  try {
    return await prisma.$transaction(async (tx) => {
      await lockAuditActor(tx, op.actorId);
      if (op.requestId) await insertPending(tx, { ...op, hash });
      const body = { status: 'success', data: await work(tx) };
      if (op.requestId) {
        await tx.operationRequest.update({
          where: { requestId: op.requestId }, data: { responseStatus: op.successStatus, responseBody: body },
        });
      }
      return { statusCode: op.successStatus, body, replay: false };
    });
  } catch (err) {
    if (!(err instanceof DuplicateRequestError)) throw err;
    const stored = await prisma.operationRequest.findUnique({ where: { requestId: op.requestId } });
    return replayOrReject(stored, {
      actor_id: op.actorId, operation: op.operation, target_type: op.targetType, target_id: op.targetId, payload_hash: hash,
    });
  }
}

/** Kirim hasil runOperation (replay → header Idempotent-Replay: true, status & body identik respons asli) */
function sendOperationResult(res, result) {
  if (result.replay) res.set('Idempotent-Replay', 'true');
  res.status(result.statusCode).json(result.body);
}

module.exports = { PENDING_STATUS, runOperation, sendOperationResult, isLockConflict };
