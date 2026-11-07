// services/cartSyncState.js
// Step 6.6 (CP3) · FR-04 · BR-04 — status lokal sinkronisasi keranjang akun per pemilik (mode API): fold journal antar-tab,
// pengambilalihan keranjang tamu (provenance), snapshot, dan penulisan hasil rekonsiliasi. Dipanggil HANYA di dalam kunci
// antar-tab (services/cartSyncLock) oleh services/cartSyncReconcile.

import useCartStore, { GUEST_CART_KEY, userCartKey, readStoredCart } from '../stores/useCartStore';
import {
  SYNC_RECORD, readSyncRecord, writeSyncRecord, readJournal, deleteJournalKeys, readGeneration,
} from './cartStorage';
import { mergeCartItems } from '../utils/rules/cart';
import { lineKey, splitGuest } from '../utils/rules/cartSync';

/** Status attempt PUT/merge yang hasilnya belum pasti */
export const ATTEMPT_STATUS = { SENDING: 'sending', UNKNOWN: 'unknown', UNCONFIRMED: 'unconfirmed' };
export const ATTEMPT_KIND = { PUT: 'put', MERGE: 'merge' };

export const readLocal = (owner) => readStoredCart(userCartKey(owner));

/** Tulis keranjang akun atas nama engine (tanpa journal); store aktif ikut diperbarui */
export const writeLocal = (owner, items) => useCartStore.getState().replaceOwnerCart(owner, items);

export const readBase = (owner) => readSyncRecord(SYNC_RECORD.BASE, owner, null);
export const writeBase = (owner, lines) => writeSyncRecord(SYNC_RECORD.BASE, owner, lines);
export const readProvenance = (owner) => readSyncRecord(SYNC_RECORD.PROVENANCE, owner, {}) ?? {};
export const readAttempt = (owner) => readSyncRecord(SYNC_RECORD.ATTEMPT, owner, null);
export const writeAttempt = (owner, attempt) => writeSyncRecord(SYNC_RECORD.ATTEMPT, owner, attempt);
export const readBlocked = (owner) => readSyncRecord(SYNC_RECORD.BLOCKED, owner, null);
export const writeBlocked = (owner, value) => writeSyncRecord(SYNC_RECORD.BLOCKED, owner, value);

export function writeProvenance(owner, provenance) {
  writeSyncRecord(SYNC_RECORD.PROVENANCE, owner, Object.keys(provenance).length ? provenance : null);
}

/** Uji (crash): titik henti setelah journal dibaca, sebelum kunci journal dihapus */
let afterJournalReadHook = null;
export const setAfterJournalReadHookForTests = (hook) => { afterJournalReadHook = hook; };

/**
 * Fold journal semua tab ke keranjang bersama: entri (status akhir per id lokal) diterapkan urut (ts, tabId, seq),
 * keranjang ditulis, lalu HANYA kunci journal yang sudah dibaca dihapus — entri baru dari tab lain tetap ada untuk putaran
 * berikutnya. Menerapkan ulang entri yang sama memberi hasil sama (aman bila crash sebelum penghapusan).
 */
export function foldJournal(owner) {
  const { entries, keys } = readJournal(owner);
  if (keys.length === 0) return false;
  let items = readLocal(owner);
  for (const entry of entries) {
    const index = items.findIndex((item) => item.cart_item_id === entry.localId);
    if (entry.line == null) {
      if (index >= 0) items = items.filter((_, i) => i !== index);
    } else if (index >= 0) {
      items = items.map((item, i) => (i === index ? entry.line : item));
    } else {
      items = [...items, entry.line];
    }
  }
  writeLocal(owner, items);
  afterJournalReadHook?.(owner);
  deleteJournalKeys(keys);
  return true;
}

/**
 * Pindahkan keranjang tamu ke keranjang akun yang aktif (tampil seperti mergeGuestCart lama) dan catat provenance
 * (id lokal → jumlah tamu + design_token) agar bagian tamu selalu dikirim lewat POST /cart/merge. Urutan tulis:
 * provenance → keranjang akun → kunci tamu dihapus.
 * @returns {boolean} true bila ada item tamu yang diambil alih
 */
export function takeOverGuest(owner) {
  const guest = readStoredCart(GUEST_CART_KEY);
  if (guest.length === 0) return false;
  const merged = mergeCartItems(readLocal(owner), guest);
  const provenance = { ...readProvenance(owner) };
  for (const item of guest) {
    const target = merged.find((line) => lineKey(line) === lineKey(item));
    if (!target) continue;
    const id = String(target.cart_item_id);
    provenance[id] = {
      guestQty: (provenance[id]?.guestQty ?? 0) + (Number(item.quantity) || 0),
      design_token: item.design_token ?? provenance[id]?.design_token ?? null,
    };
  }
  writeProvenance(owner, provenance);
  writeLocal(owner, merged);
  localStorage.removeItem(GUEST_CART_KEY);
  return true;
}

/** Snapshot status pemilik (dibaca ulang setelah setiap await) */
export function snapshot(owner) {
  const local = readLocal(owner);
  const provenance = readProvenance(owner);
  return { local, provenance, base: readBase(owner), gen: readGeneration(owner), ...splitGuest(local, provenance) };
}

/** Hapus provenance id lokal yang sudah dikonfirmasi server */
export function clearProvenance(owner, localIds) {
  const provenance = { ...readProvenance(owner) };
  for (const id of localIds) delete provenance[String(id)];
  writeProvenance(owner, provenance);
}
