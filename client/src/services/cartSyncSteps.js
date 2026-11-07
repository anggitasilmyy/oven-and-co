// services/cartSyncSteps.js
// Step 6.6 (CP3) · FR-04 · BR-04 — langkah request sinkronisasi keranjang akun (dipakai services/cartSyncReconcile):
// adopsi hasil server lewat merge3 dengan lokal TERBARU, PUT, POST /cart/merge, dan recovery attempt yang hasilnya belum
// pasti (TIDAK pernah mengirim ulang otomatis; merge: GET cocok expectedSig → applied, selain itu UNCONFIRMED/paused;
// PUT: GET → ancestor per baris → hasil gabungan dikirim di putaran berikutnya, bukan payload lama).

import {
  ATTEMPT_KIND, ATTEMPT_STATUS, foldJournal, snapshot, writeLocal, writeBase, writeAttempt,
  readBlocked, writeBlocked, clearProvenance,
} from './cartSyncState';
import {
  contentSignature, merge3, withGuest, serverView, toPayload, predictServerMerge, choosePutAncestor, lineKey,
} from '../utils/rules/cartSync';
import { classifySyncError, SYNC_OUTCOME } from '../utils/rules/cartSyncErrors';
import { CLIENT_ERROR_CODE } from '../constants/apiErrors';
import { CART_SYNC_STATUS, CART_SYNC_MESSAGE } from '../constants/cart';

export const STEP = { AGAIN: 'again' };
const sig = contentSignature;

/** Panggil API mutasi; hasil yang sudah di-commit saat sesi berganti (M1) tetap dianggap sukses */
async function mutate(call) {
  let committed;
  try {
    return { outcome: SYNC_OUTCOME.SUCCESS, data: await call((data) => { committed = data; }) };
  } catch (error) {
    if (error?.code === CLIENT_ERROR_CODE.SESSION_CHANGED_COMMITTED && committed) {
      return { outcome: SYNC_OUTCOME.SUCCESS, data: committed };
    }
    return { outcome: classifySyncError(error), error };
  }
}

export async function fetchServer(ctx) {
  try {
    const data = await ctx.api.getSavedCart();
    return serverView(data?.items ?? []);
  } catch {
    return null;
  }
}

/** Adopsi isi server ke lokal TERBARU: merge3(ancestor ⊕ tamu, lokal sekarang, server ⊕ tamu) */
export function adopt(owner, ancestor, server) {
  foldJournal(owner);
  const now = snapshot(owner);
  writeLocal(owner, merge3(withGuest(ancestor, now.guest), now.local, withGuest(server, now.guest)));
  writeBase(owner, server);
}

/** Token desain yang sudah dikonfirmasi server (baris desain ada di hasil server) dikosongkan di lokal */
function clearConfirmedTokens(owner, server) {
  const confirmed = new Set(server.filter((line) => line.design_id != null).map(lineKey));
  const now = snapshot(owner);
  const pendingIds = new Set(Object.keys(now.provenance));
  writeLocal(owner, now.local.map((line) => (confirmed.has(lineKey(line)) && !pendingIds.has(String(line.cart_item_id))
    ? { ...line, design_token: null } : line)));
}

function notifySkipped(ctx, skipped) {
  if (skipped?.length) ctx.notify('info', CART_SYNC_MESSAGE.SKIPPED);
}

export async function putStep(owner, ctx, before, payload) {
  if (readBlocked(owner)?.sig === sig(payload)) return CART_SYNC_STATUS.PENDING;
  const attempt = { kind: ATTEMPT_KIND.PUT, status: ATTEMPT_STATUS.SENDING, before, payload, startedAt: Date.now() };
  writeAttempt(owner, attempt);
  ctx.hooks?.beforeSend?.(owner, attempt);
  const result = await mutate((reconcileOwner) => ctx.api.saveCart(toPayload(payload), { reconcileOwner }));
  if (result.outcome === SYNC_OUTCOME.SUCCESS) {
    writeAttempt(owner, null);
    writeBlocked(owner, null);
    adopt(owner, payload, serverView(result.data?.items ?? []));
    notifySkipped(ctx, result.data?.skipped);
    return STEP.AGAIN;
  }
  if (result.outcome === SYNC_OUTCOME.UNKNOWN) {
    writeAttempt(owner, { ...attempt, status: ATTEMPT_STATUS.UNKNOWN });
    return CART_SYNC_STATUS.PENDING;
  }
  writeAttempt(owner, null);
  if (result.outcome === SYNC_OUTCOME.FAILED && result.error?.status === 400) {
    writeBlocked(owner, { sig: sig(payload) });
    ctx.notify('error', CART_SYNC_MESSAGE.BLOCKED);
  }
  return CART_SYNC_STATUS.PENDING;
}

function finishMerge(owner, ctx, attempt, server, skipped) {
  writeAttempt(owner, null);
  // Provenance dihapus DULU: bagian tamu sudah ada di hasil server, jadi tidak boleh ditambahkan lagi saat adopsi
  clearProvenance(owner, attempt.sentIds);
  adopt(owner, attempt.ancestor, server);
  clearConfirmedTokens(owner, server);
  notifySkipped(ctx, skipped);
  return STEP.AGAIN;
}

/**
 * POST /cart/merge. `ancestor` = keadaan lokal yang setara dengan hasil server yang diharapkan: NO_BASE → seluruh lokal
 * saat dikirim (semua isi lokal adalah kiriman); selain itu → perkiraan server (isi server ⊕ tamu).
 */
export async function mergeStep(owner, ctx, { serverBefore, sent, sentIds, ancestor }) {
  const blocked = readBlocked(owner);
  if (blocked?.kind === ATTEMPT_KIND.MERGE && blocked.sig === sig(sent)) return CART_SYNC_STATUS.PENDING;
  const attempt = {
    kind: ATTEMPT_KIND.MERGE, status: ATTEMPT_STATUS.SENDING, sent, sentIds, ancestor,
    expectedSig: sig(predictServerMerge(serverBefore, sent)), startedAt: Date.now(),
  };
  writeAttempt(owner, attempt);
  ctx.hooks?.beforeSend?.(owner, attempt);
  const result = await mutate((reconcileOwner) => ctx.api.mergeGuestCartToAccount(toPayload(sent), { reconcileOwner }));
  if (result.outcome === SYNC_OUTCOME.SUCCESS) {
    return finishMerge(owner, ctx, attempt, serverView(result.data?.items ?? []), result.data?.skipped);
  }
  if (result.outcome === SYNC_OUTCOME.UNKNOWN) {
    writeAttempt(owner, { ...attempt, status: ATTEMPT_STATUS.UNKNOWN });
    return CART_SYNC_STATUS.PENDING;
  }
  writeAttempt(owner, null);
  if (result.outcome === SYNC_OUTCOME.FAILED && result.error?.status === 400) {
    writeBlocked(owner, { kind: ATTEMPT_KIND.MERGE, sig: sig(sent) });
    ctx.notify('error', CART_SYNC_MESSAGE.BLOCKED);
  }
  return CART_SYNC_STATUS.PENDING;
}

/** Attempt yang hasilnya belum pasti: HANYA GET, tidak pernah kirim ulang otomatis */
export async function recoverAttempt(owner, ctx, attempt) {
  const current = attempt.status === ATTEMPT_STATUS.SENDING ? { ...attempt, status: ATTEMPT_STATUS.UNKNOWN } : attempt;
  if (current !== attempt) writeAttempt(owner, current); // SENDING ditemukan di dalam kunci = crash sebelumnya
  const paused = current.kind === ATTEMPT_KIND.MERGE && current.status === ATTEMPT_STATUS.UNCONFIRMED;
  const server = await fetchServer(ctx);
  if (!server) return paused ? CART_SYNC_STATUS.PAUSED : CART_SYNC_STATUS.PENDING;

  if (current.kind === ATTEMPT_KIND.MERGE) {
    if (sig(server) === current.expectedSig) return finishMerge(owner, ctx, current, server, []);
    if (!current.noticed) ctx.notify('info', CART_SYNC_MESSAGE.PAUSED);
    writeAttempt(owner, { ...current, status: ATTEMPT_STATUS.UNCONFIRMED, noticed: true });
    return CART_SYNC_STATUS.PAUSED;
  }

  // PUT: ancestor per baris; hasil gabungan dikirim di putaran berikutnya (bukan payload lama)
  writeAttempt(owner, null);
  if (sig(server) === sig(serverView(current.payload))) {
    adopt(owner, current.payload, server);
  } else {
    adopt(owner, choosePutAncestor(current.before, current.payload, server), server);
  }
  return STEP.AGAIN;
}
