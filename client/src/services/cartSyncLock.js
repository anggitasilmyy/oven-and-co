// services/cartSyncLock.js
// Step 6.6 (CP3) — kunci antar-tab per pemilik keranjang: semua operasi server (GET/PUT/merge) satu pemilik berjalan
// berurutan di semua tab browser yang sama.
//   - Utama: Web Locks API (`navigator.locks.request`, eksklusif; dilepas otomatis bila tab tertutup/crash).
//   - Cadangan (browser tanpa Web Locks): lease localStorage dengan masa berlaku — perkiraan; journal + fold tetap
//     menjaga data lokal walau request dua tab sempat tumpang tindih.
//   - Uji: createMemoryLock() — satu kunci bersama untuk beberapa "tab" dalam satu proses.

const LEASE_MS = 60_000;
const LEASE_POLL_MS = 50;

/** Kunci dalam memori (uji): antrean per nama */
export function createMemoryLock() {
  const tails = new Map();
  return {
    async run(name, task) {
      const previous = tails.get(name) ?? Promise.resolve();
      let release;
      const current = new Promise((resolve) => { release = resolve; });
      tails.set(name, previous.then(() => current));
      await previous;
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}

/** Lease localStorage (cadangan tanpa Web Locks) */
function createLeaseLock(owner = Math.random().toString(36).slice(2)) {
  const read = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? 'null');
    } catch {
      return null;
    }
  };
  return {
    async run(name, task) {
      const key = `ovenco_api_cartsync_lease_${name}`;
      for (;;) {
        const lease = read(key);
        if (!lease || lease.expiresAt < Date.now() || lease.owner === owner) {
          localStorage.setItem(key, JSON.stringify({ owner, expiresAt: Date.now() + LEASE_MS }));
          if (read(key)?.owner === owner) break;
        }
        await new Promise((resolve) => setTimeout(resolve, LEASE_POLL_MS));
      }
      try {
        return await task();
      } finally {
        if (read(key)?.owner === owner) localStorage.removeItem(key);
      }
    },
  };
}

/** Kunci bawaan: Web Locks bila tersedia, selain itu lease localStorage */
export function createDefaultLock() {
  const locks = globalThis.navigator?.locks;
  if (locks?.request) {
    return { run: (name, task) => locks.request(`ovenco-cart-sync-${name}`, { mode: 'exclusive' }, task) };
  }
  return createLeaseLock();
}
