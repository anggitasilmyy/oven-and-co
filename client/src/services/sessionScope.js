// services/sessionScope.js
// Step 6.3 · FR-04 · FR-12 · FR-13 · FR-26 — state & operasi yang terikat sesi/identitas pengguna.
// - Temuan L1: draft checkout dikosongkan saat identitas BENAR-BENAR berganti (masuk, keluar, pengguna lain dari tab
//   lain). Perubahan profil (nama, email) atau token baru untuk pengguna yang sama tidak mengubah kunci identitas.
// - Temuan L6: epoch sesi naik setiap kali sesi berganti (token atau identitas) agar request tahu apakah sesi yang
//   memulainya masih aktif — termasuk bila sesi sempat berakhir lalu pengguna yang sama masuk lagi.
// - Temuan M-A: pelacak urutan identitas selama operasi panjang (simpan desain custom cake).
// - Temuan L1 (notifikasi): halaman dipasang ulang saat identitas berganti, jadi pesan hasil operasi dialihkan ke
//   notifikasi global (useNoticeStore) bila identitas sudah berganti sejak operasi dimulai.
// Catatan: hanya perubahan yang TERAMATI tab ini yang tercatat (tab lain yang keluar-masuk sebelum tab ini sempat
// sinkron terlihat sebagai satu perubahan).

import useAuthStore from '../stores/useAuthStore';
import useCheckoutStore from '../stores/useCheckoutStore';
import useNoticeStore from '../stores/useNoticeStore';
import { getSessionTreeKey, describeSessionChange } from '../utils/sessionIdentity';

// ── Epoch sesi (L6) ───────────────────────────────────────────────────────────────────────────────────────────────
let sessionEpoch = 0;
useAuthStore.subscribe((state, prev) => {
  if (describeSessionChange(prev, state).sessionChanged) sessionEpoch += 1;
});

/** Nomor urut sesi aktif tab ini; berubah setiap kali token atau identitas berganti (bukan saat profil berubah) */
export const getSessionEpoch = () => sessionEpoch;

// ── Draft checkout (L1, L5) ───────────────────────────────────────────────────────────────────────────────────────

/** Draft checkout milik identitas lain atau tanpa pemilik yang bisa diverifikasi → kosongkan */
function resetForeignCheckout(currentKey) {
  const { ownerKey, resetCheckout } = useCheckoutStore.getState();
  if (ownerKey !== currentKey) resetCheckout();
}

/**
 * Mulai menjaga state per identitas. Dipanggil sekali dari useSessionSync.
 * @returns {() => void} pelepas langganan
 */
export function startSessionScope() {
  let currentKey = getSessionTreeKey(useAuthStore.getState().user);
  resetForeignCheckout(currentKey);

  return useAuthStore.subscribe((state) => {
    const nextKey = getSessionTreeKey(state.user);
    if (nextKey === currentKey) return;
    currentKey = nextKey;
    useCheckoutStore.getState().resetCheckout();
  });
}

// ── Pelacak identitas (M-A) ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Catat urutan kunci identitas selama sebuah operasi berjalan (kunci awal + setiap pergantian berikutnya).
 * @returns {{keys: () => string[], stop: () => void}}
 */
export function trackSessionKeys() {
  const keys = [getSessionTreeKey(useAuthStore.getState().user)];
  const stop = useAuthStore.subscribe((state) => {
    const key = getSessionTreeKey(state.user);
    if (key !== keys[keys.length - 1]) keys.push(key);
  });
  return { keys: () => [...keys], stop };
}

// ── Notifikasi hasil operasi (L1) ─────────────────────────────────────────────────────────────────────────────────

/**
 * Pemberi pesan untuk operasi yang dimulai sekarang: identitas sama → toast halaman (`localNotify`); identitas sudah
 * berganti (halaman pemanggil dipasang ulang / unmount) → notifikasi global yang tetap terlihat.
 * @param {(type: string, message: string) => void} localNotify
 * @returns {(type: string, message: string, options?: {replacesSessionNotice?: boolean}) => void}
 *   replacesSessionNotice — pesan sudah menjelaskan sesi berakhir, jadi notifikasi "sesi berakhir" ditutup
 */
export function createSessionBoundNotifier(localNotify) {
  const startKey = getSessionTreeKey(useAuthStore.getState().user);
  return (type, message, { replacesSessionNotice = false } = {}) => {
    if (getSessionTreeKey(useAuthStore.getState().user) === startKey) {
      localNotify(type, message);
      return;
    }
    if (replacesSessionNotice) useAuthStore.getState().dismissSessionNotice();
    useNoticeStore.getState().showNotice(type, message);
  };
}
