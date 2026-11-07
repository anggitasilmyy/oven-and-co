// services/cartSync.js
// Step 6.6 (CP3) · FR-04 · FR-11 · BR-04 — engine sinkronisasi keranjang AKUN pelanggan ke server (hanya mode API).
// Lokal dulu, dikonfirmasi server: UI tetap membaca/menulis useCartStore (localStorage) secara sinkron; engine menyalin
// ke server di latar belakang lewat services/cartSyncReconcile di dalam kunci antar-tab (services/cartSyncLock).
//   - Satu engine per tab (singleton; start ganda aman, stop ditunda satu tick → React StrictMode tidak menggandakan).
//   - Pemicu: login/registrasi (ditunggu), load aplikasi, perubahan lokal (jeda 300 ms), flushCartSync (checkout), tab
//     terlihat lagi, event `online`, identitas berganti di tab lain. Pemicu untuk pemilik yang sama digabung.
//   - Mode mock, tamu, dan staf/owner: tidak ada request ke /cart/items atau /cart/merge.

import useAuthStore from '../stores/useAuthStore';
import useCartStore from '../stores/useCartStore';
import useNoticeStore from '../stores/useNoticeStore';
import { getCartOwnerId } from '../utils/sessionIdentity';
import { IS_MOCK_MODE } from '../constants/dataMode';
import { CART_SYNC, CART_SYNC_STATUS } from '../constants/cart';
import { getSavedCart, saveCart, mergeGuestCartToAccount, getCartView } from './cartService';
import { createDefaultLock } from './cartSyncLock';
import { readJournal } from './cartStorage';
import { reconcileOwnerCart, statusOf } from './cartSyncReconcile';

const defaults = () => ({
  mockMode: IS_MOCK_MODE,
  lock: null,
  debounceMs: CART_SYNC.DEBOUNCE_MS,
  retryDelaysMs: CART_SYNC.RETRY_DELAYS_MS,
  api: { getSavedCart, saveCart, mergeGuestCartToAccount, getCartView },
  hooks: null,
});
let config = defaults();
const owners = new Map(); // owner → { running, queued, timer, retries }

/** Uji: ganti kunci, API, jeda, dan hook crash; `reset` mengembalikan bawaan */
export function configureCartSyncForTests(overrides = {}) {
  if (overrides.reset) {
    for (const state of owners.values()) clearTimeout(state.timer);
    owners.clear();
    config = defaults();
  }
  config = { ...config, ...overrides };
}

const lock = () => (config.lock ??= createDefaultLock());
const stateOf = (owner) => {
  if (!owners.has(owner)) owners.set(owner, { running: null, queued: null, timer: null, retries: 0 });
  return owners.get(owner);
};

/** Pemilik keranjang akun yang aktif di tab ini (null: mode mock, tamu, staf/owner) */
export function activeCartOwner() {
  return config.mockMode ? null : getCartOwnerId(useAuthStore.getState().user);
}

const context = () => ({
  api: config.api,
  hooks: config.hooks,
  maxRounds: CART_SYNC.MAX_ROUNDS,
  isActiveOwner: (owner) => activeCartOwner() === owner,
  notify: (type, message) => useNoticeStore.getState().showNotice(type, message),
});

function scheduleRetry(owner, status) {
  const state = stateOf(owner);
  if (status !== CART_SYNC_STATUS.PENDING) {
    state.retries = 0;
    return;
  }
  const delay = config.retryDelaysMs[state.retries];
  if (delay == null) return;
  state.retries += 1;
  schedule(owner, delay);
}

/** Jalankan rekonsiliasi; bila sedang berjalan, satu putaran lagi diantrekan (dimulai setelah yang berjalan selesai) */
function runReconcile(owner) {
  const state = stateOf(owner);
  if (state.running) {
    state.queued ??= state.running.then(() => {
      state.queued = null;
      return runReconcile(owner);
    });
    return state.queued;
  }
  clearTimeout(state.timer);
  state.timer = null;
  state.running = lock()
    .run(owner, () => reconcileOwnerCart(owner, context()))
    .catch(() => CART_SYNC_STATUS.PENDING)
    .then((status) => {
      state.running = null;
      scheduleRetry(owner, status);
      return status;
    });
  return state.running;
}

function schedule(owner, delay) {
  const state = stateOf(owner);
  clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    state.timer = null;
    runReconcile(owner);
  }, delay);
}

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(CART_SYNC_STATUS.PENDING), ms))])
    .catch(() => CART_SYNC_STATUS.PENDING);

/**
 * Login/registrasi berhasil: integrasikan keranjang SEBELUM redirect.
 * Mode mock → mergeGuestCart (perilaku lama). Mode API pelanggan → rekonsiliasi (ambil alih keranjang tamu → merge).
 * Gagal/lewat batas waktu → `pending` (login tetap berhasil, item tamu tetap tersimpan & terlihat). Tidak pernah melempar.
 * @returns {Promise<{status: string}>}
 */
export async function syncCartAfterLogin(user) {
  const ownerId = getCartOwnerId(user);
  if (config.mockMode) {
    useCartStore.getState().mergeGuestCart(ownerId);
    return { status: CART_SYNC_STATUS.IDLE };
  }
  if (!ownerId) return { status: CART_SYNC_STATUS.IDLE };
  useCartStore.getState().loadCartForUser(user);
  const state = stateOf(ownerId);
  const status = await withTimeout(state.running ?? runReconcile(ownerId), CART_SYNC.LOGIN_TIMEOUT_MS);
  return { status };
}

/**
 * Kirim perubahan yang tertunda sekarang (dipakai setelah checkout berhasil). Tidak pernah melempar dan tidak pernah
 * memicu pembuatan pesanan ulang. Paused (merge belum pasti) → `paused` tanpa PUT/POST.
 * @returns {Promise<{status: string}>}
 */
export async function flushCartSync({ timeoutMs = CART_SYNC.FLUSH_TIMEOUT_MS } = {}) {
  const owner = activeCartOwner();
  if (!owner) return { status: CART_SYNC_STATUS.IDLE };
  return { status: await withTimeout(runReconcile(owner), timeoutMs) };
}

/** Status sinkronisasi pemilik aktif tanpa request */
export function getCartSyncStatus() {
  const owner = activeCartOwner();
  return owner ? statusOf(owner) : CART_SYNC_STATUS.IDLE;
}

// ── Siklus hidup engine (satu per tab) ───────────────────────────────────────────────────────────────────────────

let references = 0;
let teardown = null;
let pendingStop = null;

function startListeners() {
  const cleanups = [];
  const triggerActive = (delay) => {
    const owner = activeCartOwner();
    if (owner) schedule(owner, delay);
  };
  cleanups.push(useAuthStore.subscribe((state, prev) => {
    const owner = activeCartOwner();
    if (owner && getCartOwnerId(prev.user) !== owner) schedule(owner, 0);
  }));
  cleanups.push(useCartStore.subscribe((state, prev) => {
    const owner = activeCartOwner();
    // Hanya perubahan pengguna (ada journal); tulisan engine sendiri tidak memicu putaran baru
    if (owner && state.items !== prev.items && readJournal(owner).keys.length > 0) schedule(owner, config.debounceMs);
  }));
  const win = typeof window === 'undefined' ? null : window;
  const doc = typeof document === 'undefined' ? null : document;
  if (win?.addEventListener) {
    const onOnline = () => triggerActive(0);
    win.addEventListener('online', onOnline);
    cleanups.push(() => win.removeEventListener('online', onOnline));
  }
  if (doc?.addEventListener) {
    const onVisible = () => doc.visibilityState === 'visible' && triggerActive(0);
    doc.addEventListener('visibilitychange', onVisible);
    cleanups.push(() => doc.removeEventListener('visibilitychange', onVisible));
  }
  triggerActive(0);
  return () => cleanups.forEach((cleanup) => cleanup());
}

/**
 * Mulai engine (dipanggil useCartSync di App). Start ganda hanya menambah referensi; stop ditunda satu tick sehingga
 * mount → unmount → mount (React StrictMode) tetap satu engine. Mode mock: tidak melakukan apa pun.
 * @returns {() => void} stop
 */
export function startCartSync() {
  if (config.mockMode) return () => {};
  references += 1;
  clearTimeout(pendingStop);
  pendingStop = null;
  teardown ??= startListeners();
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    references -= 1;
    pendingStop = setTimeout(() => {
      if (references > 0 || !teardown) return;
      teardown();
      teardown = null;
    }, 0);
  };
}

/** Uji: jumlah engine aktif (0 atau 1) */
export const isCartSyncRunningForTests = () => (teardown ? 1 : 0);
