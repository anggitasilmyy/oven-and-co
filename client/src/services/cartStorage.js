// services/cartStorage.js
// Step 6.6 (CP3) · FR-04 · FR-11 · BR-04 — kunci localStorage keranjang per mode data + journal antar-tab + catatan
// sinkronisasi keranjang akun (mode API).
//   - Mode mock: kunci LAMA tetap `ovenco_mock_cart_guest` / `ovenco_mock_cart_{id}` (data mock tidak berubah).
//   - Mode API : namespace terpisah `ovenco_api_cart_*`. Data lama `ovenco_mock_cart_*` TIDAK dipindahkan (tidak bisa
//     dibedakan apakah dibuat di mode mock atau API) dan TIDAK dihapus/diubah.
//   - Journal (mode API, keranjang akun): setiap perubahan lokal = SATU kunci immutable
//     `ovenco_api_cartsync_op_{owner}_{tabId}_{seq}` berisi status akhir satu baris (bukan delta). Hanya tab penulis yang
//     menulis kuncinya, jadi tidak ada penulisan yang saling menimpa antar-tab; engine menghapus HANYA kunci yang sudah
//     diproses. Urutan tulis: journal → kunci keranjang → token generasi (crash di tengah tidak menghilangkan perubahan).

import { IS_MOCK_MODE } from '../constants/dataMode';

const CART_PREFIX = IS_MOCK_MODE ? 'ovenco_mock_cart' : 'ovenco_api_cart';
const SYNC_PREFIX = 'ovenco_api_cartsync';

/** Kunci keranjang tamu mode aktif */
export const GUEST_CART_KEY = `${CART_PREFIX}_guest`;

/** Kunci keranjang akun mode aktif */
export const userCartKey = (userId) => `${CART_PREFIX}_${userId}`;

/** Id pemilik dari kunci keranjang akun (null untuk tamu / kunci lain) */
export function ownerOfCartKey(key) {
  if (key === GUEST_CART_KEY || !key.startsWith(`${CART_PREFIX}_`)) return null;
  const id = key.slice(CART_PREFIX.length + 1);
  return /^\d+$/.test(id) ? id : null;
}

/** Sinkronisasi server hanya di mode API */
export const isSyncStorageEnabled = () => !IS_MOCK_MODE;

// ── Catatan sinkronisasi per pemilik (mode API) ────────────────────────────────────────────────────────────────

/** Jenis catatan: base (isi terakhir yang dikonfirmasi server), pending guest (provenance), attempt, blocked, gen */
export const SYNC_RECORD = { BASE: 'base', PROVENANCE: 'prov', ATTEMPT: 'attempt', BLOCKED: 'blocked', GEN: 'gen', NOTICE: 'notice' };

const recordKey = (kind, owner) => `${SYNC_PREFIX}_${kind}_${owner}`;

export function readSyncRecord(kind, owner, fallback = null) {
  try {
    const raw = localStorage.getItem(recordKey(kind, owner));
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeSyncRecord(kind, owner, value) {
  if (value == null) localStorage.removeItem(recordKey(kind, owner));
  else localStorage.setItem(recordKey(kind, owner), JSON.stringify(value));
}

// ── Identitas tab & journal ───────────────────────────────────────────────────────────────────────────────────────

const randomId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 12);

let tabId = randomId();
let sequence = 0;
const sequencesForTests = new Map();

/** Uji: beberapa "tab" dalam satu proses memakai identitas berbeda (urutan per tab dipertahankan) */
export function setTabIdentityForTests(id) {
  sequencesForTests.set(tabId, sequence);
  tabId = id;
  sequence = sequencesForTests.get(id) ?? 0;
}

export const getTabId = () => tabId;

const opPrefix = (owner) => `${SYNC_PREFIX}_op_${owner}_`;

/**
 * Catat perubahan baris (status akhir per cart_item_id) sebelum kunci keranjang ditulis.
 * @param {string} owner
 * @param {Array} before — isi keranjang sebelum perubahan
 * @param {Array} after  — isi keranjang sesudah perubahan
 */
export function appendJournal(owner, before, after) {
  const prev = new Map(before.map((line) => [line.cart_item_id, line]));
  const next = new Map(after.map((line) => [line.cart_item_id, line]));
  const ts = Date.now();
  for (const id of new Set([...prev.keys(), ...next.keys()])) {
    const line = next.get(id) ?? null;
    if (JSON.stringify(prev.get(id) ?? null) === JSON.stringify(line)) continue;
    sequence += 1;
    const entry = { id: `${tabId}:${sequence}`, tabId, seq: sequence, ts, localId: id, line };
    localStorage.setItem(`${opPrefix(owner)}${tabId}_${sequence}`, JSON.stringify(entry));
  }
}

/** Token generasi unik setiap perubahan lokal (deteksi perubahan selama request berjalan) */
export function bumpGeneration(owner) {
  sequence += 1;
  writeSyncRecord(SYNC_RECORD.GEN, owner, `${tabId}:${sequence}`);
}

export const readGeneration = (owner) => readSyncRecord(SYNC_RECORD.GEN, owner, null);

/**
 * Semua entri journal milik `owner` → { entries (urut ts, tabId, seq), keys (nama kunci yang dibaca) }.
 * Entri rusak diabaikan tetapi kuncinya ikut dihapus setelah diproses (tidak bisa dipakai).
 */
export function readJournal(owner) {
  const prefix = opPrefix(owner);
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  const entries = [];
  for (const key of keys) {
    try {
      const entry = JSON.parse(localStorage.getItem(key));
      if (entry && entry.localId != null) entries.push(entry);
    } catch {
      // diabaikan
    }
  }
  entries.sort((a, b) => a.ts - b.ts || String(a.tabId).localeCompare(String(b.tabId)) || a.seq - b.seq);
  return { entries, keys };
}

/** Hapus HANYA kunci journal yang sudah diproses (entri baru dari tab lain tetap ada) */
export function deleteJournalKeys(keys) {
  for (const key of keys) localStorage.removeItem(key);
}
