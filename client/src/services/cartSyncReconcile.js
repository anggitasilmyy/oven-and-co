// services/cartSyncReconcile.js
// Step 6.6 (CP3) · FR-04 · FR-11 · BR-04 — rekonsiliasi keranjang akun satu pemilik (mode API), dijalankan di dalam kunci
// antar-tab. Ringkasan (lihat ROADMAP 6.6 CP3):
//   NO_BASE        : belum pernah sinkron → GET bila kosong, selain itu POST /cart/merge (tidak pernah PUT).
//   CLEAN          : lokal = base → GET, adopsi perubahan perangkat lain (merge3 dengan ancestor base).
//   LOCAL_CHANGED  : GET → merge3(base, bagian akun lokal, server) → PUT hasilnya; bagian tamu → POST /cart/merge.
//   Attempt SENDING/UNKNOWN/UNCONFIRMED: TIDAK pernah mengirim ulang otomatis. Merge: GET; cocok expectedSig → applied,
//   selain itu UNCONFIRMED (paused, tanpa PUT/POST). PUT: GET → ancestor per baris (choosePutAncestor) → merge3 → putaran
//   berikutnya mengirim hasil gabungan (bukan payload lama).
// Setiap hasil server diadopsi lewat merge3 dengan keranjang lokal TERBARU (dibaca ulang + fold setelah await), sehingga
// perubahan pengguna selama request berjalan tidak tertimpa. Id lokal tidak pernah diganti id hasil PUT.

import {
  foldJournal, takeOverGuest, snapshot, writeLocal, readAttempt, ATTEMPT_KIND, ATTEMPT_STATUS,
} from './cartSyncState';
import { contentSignature, withGuest, predictServerMerge } from '../utils/rules/cartSync';
import { CART_SYNC_STATUS } from '../constants/cart';
import { STEP, fetchServer, adopt, putStep, mergeStep, recoverAttempt } from './cartSyncSteps';

const sig = contentSignature;

/** Satu langkah sinkronisasi tanpa attempt tertunda */
async function syncStep(owner, ctx) {
  const start = snapshot(owner);
  if (!start.base) {
    const server = await fetchServer(ctx);
    if (!server) return CART_SYNC_STATUS.PENDING;
    foldJournal(owner);
    const now = snapshot(owner);
    if (now.local.length === 0) {
      adopt(owner, [], server);
      return STEP.AGAIN;
    }
    // Lokal yang belum pernah sinkron (termasuk tamu) → merge, tidak pernah PUT
    const sent = withGuest(now.account, now.guest);
    return mergeStep(owner, ctx, { serverBefore: server, sent, sentIds: now.local.map((l) => l.cart_item_id), ancestor: now.local });
  }

  const clean = start.guest.length === 0 && sig(start.account) === sig(start.base);
  const server = await fetchServer(ctx);
  if (!server) return CART_SYNC_STATUS.PENDING;
  adopt(owner, start.base, server); // ancestor GET = base sebelum request
  if (clean) {
    const after = snapshot(owner);
    return after.guest.length === 0 && sig(after.account) === sig(server) ? CART_SYNC_STATUS.SYNCED : STEP.AGAIN;
  }

  const now = snapshot(owner); // base = server terbaru; bagian akun lokal sudah digabung
  if (sig(now.account) !== sig(server)) {
    const step = await putStep(owner, ctx, server, now.account);
    if (step !== STEP.AGAIN) return step;
  }
  const afterPut = snapshot(owner);
  if (afterPut.guest.length === 0) {
    return sig(afterPut.account) === sig(afterPut.base) ? CART_SYNC_STATUS.SYNCED : STEP.AGAIN;
  }
  const guestIds = afterPut.local.filter((l) => afterPut.provenance[String(l.cart_item_id)]).map((l) => l.cart_item_id);
  return mergeStep(owner, ctx, {
    serverBefore: afterPut.base, sent: afterPut.guest, sentIds: guestIds,
    ancestor: predictServerMerge(afterPut.base, afterPut.guest),
  });
}

/**
 * Lengkapi nama, harga, dan gambar baris yang berasal dari server (GET/merge tidak membawanya) lewat POST /api/cart,
 * sehingga perangkat baru menampilkan keranjang lengkap tanpa data perangkat lain. Best-effort: gagal → dilewati
 * (halaman Keranjang tetap memuat tampilan yang sama).
 */
async function hydrate(owner, ctx) {
  const before = snapshot(owner).local;
  if (!ctx.api.getCartView || before.every((line) => line.name)) return;
  try {
    const view = await ctx.api.getCartView(before);
    const byId = new Map((view?.lines ?? []).map((line) => [line.cart_item_id, line]));
    foldJournal(owner);
    const now = snapshot(owner).local;
    writeLocal(owner, now.map((line) => {
      const fresh = byId.get(line.cart_item_id);
      return line.name || !fresh ? line : { ...line, name: fresh.name, price: fresh.unit_price, image_url: fresh.image_url };
    }));
  } catch {
    // diabaikan
  }
}

/** Status tanpa request (untuk putaran habis / pemilik tidak aktif) */
export function statusOf(owner) {
  const attempt = readAttempt(owner);
  if (attempt?.status === ATTEMPT_STATUS.UNCONFIRMED && attempt.kind === ATTEMPT_KIND.MERGE) return CART_SYNC_STATUS.PAUSED;
  const now = snapshot(owner);
  if (!attempt && now.base && now.guest.length === 0 && sig(now.account) === sig(now.base)) return CART_SYNC_STATUS.SYNCED;
  return CART_SYNC_STATUS.PENDING;
}

/**
 * Rekonsiliasi satu pemilik (panggil di dalam kunci antar-tab).
 * @param {string} owner
 * @param {{api: object, notify: Function, isActiveOwner: (owner: string) => boolean, maxRounds: number, hooks?: object}} ctx
 * @returns {Promise<string>} CART_SYNC_STATUS
 */
export async function reconcileOwnerCart(owner, ctx) {
  for (let round = 0; round < ctx.maxRounds; round += 1) {
    if (!ctx.isActiveOwner(owner)) return statusOf(owner);
    foldJournal(owner);
    const attempt = readAttempt(owner);
    const step = attempt ? await recoverAttempt(owner, ctx, attempt) : (takeOverGuest(owner), await syncStep(owner, ctx));
    if (step !== STEP.AGAIN) {
      if (step === CART_SYNC_STATUS.SYNCED) await hydrate(owner, ctx);
      return step;
    }
  }
  return statusOf(owner);
}
