// Uji regresi review commit dc054bd — M-A (desain tamu selesai setelah login), L2 (fallback tamu setelah JWT
// kedaluwarsa), L1/L3 (notifikasi & peran staf), L5 (draft checkout lama), L6 (sesi = token + epoch, aturan sama
// sebelum request & setelah respons).
// Menguji jalur aslinya: saveCustomCakeToCart + apiClient + store, startSessionScope, persist checkout.
// SIMULASI Node: "tab lain" = menulis sesi kanonis "ovenco_auth" seperti persist Zustand. Bukan bukti browser nyata.

import test from 'node:test';
import assert from 'node:assert/strict';

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}
globalThis.localStorage = memoryStorage();
globalThis.sessionStorage = memoryStorage();
const store = globalThis.localStorage.map;

const calls = [];
function scriptFetch(steps) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const step = steps.shift();
    if (!step) throw new Error(`fetch tak terduga ke ${url}`);
    step.before?.();
    return { ok: step.status >= 200 && step.status < 300, status: step.status, json: async () => step.body };
  };
}

const { apiClient } = await import('../../src/services/apiClient.js');
const {
  saveCustomCakeToCart, resolveDesignCart, getDesignCartNotice, DESIGN_CART_TARGET, GUEST_CART_REASON,
} = await import('../../src/services/customCakeCartService.js');
const { runMockRequest } = await import('../../src/services/sessionRecovery.js');
const {
  startSessionScope, getSessionEpoch, createSessionBoundNotifier,
} = await import('../../src/services/sessionScope.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');
const { default: useCartStore } = await import('../../src/stores/useCartStore.js');
const { default: useCheckoutStore } = await import('../../src/stores/useCheckoutStore.js');
const { default: useNoticeStore } = await import('../../src/stores/useNoticeStore.js');
const { getCartOwnerId } = await import('../../src/utils/sessionIdentity.js');
const { CLIENT_ERROR_CODE, SESSION_CHANGED_MESSAGE, API_ERROR_CODE } = await import('../../src/constants/apiErrors.js');
const {
  DESIGN_CART_NOTICE, DESIGN_SAVED_CART_FULL_MESSAGE, DESIGN_ADDED_MESSAGE,
} = await import('../../src/constants/cart.js');
const { AUTH_PERSIST_KEY } = await import('../../src/constants/auth.js');

const CHANGED = { status: 401, code: CLIENT_ERROR_CODE.SESSION_CHANGED, message: SESSION_CHANGED_MESSAGE };
const SESSION_INVALID = { status: 401, body: { status: 'error', code: API_ERROR_CODE.SESSION_INVALID, message: 'x' } };
const customer = (id) => ({ userId: String(id), name: `Pelanggan ${id}`, role: 'customer' });
const staff = (id) => ({ userId: String(id), name: `Staf ${id}`, role: 'staf' });
const otherTabWrites = (user, token) => store.set(AUTH_PERSIST_KEY, JSON.stringify({ state: { user, token }, version: 0 }));
const cartOf = (key) => JSON.parse(store.get(key) ?? '[]');
const designsIn = (key) => cartOf(key).map((i) => i.design_id);
const PRODUCT = { product_id: 6, name: 'Custom Celebration Cake', image_url: '/images/products/custom-cake-1.webp' };
const DESIGN = { selections: {}, writingText: '', writingColor: 'Cokelat', referencePhoto: null, readyDate: '2026-10-30' };
const created = (id, token) => ({ status: 201, body: { data: { design_id: id, price: 1, ready_date: '2026-10-30', design_token: token } } });

/** Halaman Masuk di tab INI: setAuth lalu gabung keranjang tamu (MasukPage.runLogin) */
function thisTabLogin(user, token) {
  useAuthStore.getState().setAuth(user, token);
  useCartStore.getState().mergeGuestCart(getCartOwnerId(user));
}
function signIn(user, token) {
  useAuthStore.getState().setAuth(user, token);
  useCartStore.getState().loadCartForUser(user);
}

let stopScope = () => {};

test.beforeEach(() => {
  stopScope();
  store.clear();
  globalThis.sessionStorage.clear();
  calls.length = 0;
  useAuthStore.setState({ user: null, token: null, sessionExpired: false });
  useCartStore.getState().resetToGuest();
  useCheckoutStore.getState().resetCheckout();
  useNoticeStore.getState().dismissNotice();
});

// ── M-A: desain tamu yang selesai setelah login ───────────────────────────────────────────────────────────────────

test('M-A: login di TAB INI saat desain tamu disimpan (gabung keranjang berjalan dulu) → desain tetap masuk keranjang X, satu baris', async () => {
  store.set('ovenco_mock_cart_guest', JSON.stringify([{ cart_item_id: 1, product_id: 2, quantity: 1 }]));
  useCartStore.getState().resetToGuest();
  scriptFetch([{ before: () => thisTabLogin(customer(7), 'jwt-X'), ...created('90', 'tok-90') }]);

  const result = await saveCustomCakeToCart(DESIGN, PRODUCT);

  assert.equal(result.target, DESIGN_CART_TARGET.ACCOUNT_MERGED);
  assert.deepEqual(designsIn('ovenco_mock_cart_7').filter(Boolean), ['90']);
  assert.equal(cartOf('ovenco_mock_cart_7').length, 2); // item tamu lama (digabung saat login) + desain
  assert.equal(store.has('ovenco_mock_cart_guest'), false);
  assert.equal(cartOf('ovenco_mock_cart_7').find((i) => i.design_id === '90').design_token, 'tok-90');
  assert.equal(getDesignCartNotice(result).message, DESIGN_CART_NOTICE.account_merged);
});

test('M-A: identitas berganti LAGI (X lalu Y) sebelum desain selesai → tidak dimasukkan diam-diam ke akun mana pun', async () => {
  scriptFetch([{
    before: () => { thisTabLogin(customer(7), 'jwt-X'); thisTabLogin(customer(8), 'jwt-Y'); },
    ...created('91', 'tok-91'),
  }]);

  const result = await saveCustomCakeToCart(DESIGN, PRODUCT);

  assert.equal(result.target, DESIGN_CART_TARGET.GUEST_CART);
  assert.equal(result.reason, GUEST_CART_REASON.NOT_MERGED);
  assert.ok(!designsIn('ovenco_mock_cart_7').includes('91'));
  assert.ok(!designsIn('ovenco_mock_cart_8').includes('91'));
  assert.deepEqual(designsIn('ovenco_mock_cart_guest'), ['91']);
  const notice = getDesignCartNotice(result);
  assert.equal(notice.type, 'info');
  assert.equal(notice.message, DESIGN_CART_NOTICE.not_merged);
});

test('M-A: X masuk lalu keluar lagi sebelum desain selesai → keranjang tamu (aktif & terlihat), bukan keranjang X', async () => {
  scriptFetch([{
    before: () => { thisTabLogin(customer(7), 'jwt-X'); useAuthStore.getState().logout(); useCartStore.getState().resetToGuest(); },
    ...created('92', 'tok-92'),
  }]);

  const result = await saveCustomCakeToCart(DESIGN, PRODUCT);

  assert.equal(result.target, DESIGN_CART_TARGET.ACTIVE);
  assert.ok(useCartStore.getState().items.some((i) => i.design_id === '92'));
  assert.ok(!designsIn('ovenco_mock_cart_7').includes('92'));
});

test('M-A: idempoten — desain yang sama tidak membuat baris atau jumlah ganda', async () => {
  scriptFetch([created('93', 'tok-93'), created('93', 'tok-93')]);
  await saveCustomCakeToCart(DESIGN, PRODUCT);
  const again = await saveCustomCakeToCart(DESIGN, PRODUCT);

  assert.equal(again.added, true);
  const lines = useCartStore.getState().items.filter((i) => i.design_id === '93');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, 1);

  // Keranjang non-aktif juga idempoten (design_id dibandingkan sebagai string)
  assert.equal(useCartStore.getState().addItemToOwnerCart('5', { product_id: 6, design_id: 94, quantity: 1 }), true);
  assert.equal(useCartStore.getState().addItemToOwnerCart('5', { product_id: 6, design_id: '94', quantity: 1 }), true);
  assert.deepEqual(cartOf('ovenco_mock_cart_5').map((i) => [i.design_id, i.quantity]), [[94, 1]]);
});

test('M-A: desain milik akun A hanya ke keranjang A; desain tamu hanya ke pelanggan tunggal yang aktif (resolveDesignCart)', () => {
  const B = customer(2);
  assert.deepEqual(
    resolveDesignCart({ keys: ['1', '2'], startOwnerId: '1', isGuestDesign: false, currentUser: B }),
    { target: DESIGN_CART_TARGET.ORIGINAL_OWNER, ownerId: '1', reason: null },
  );
  assert.equal(
    resolveDesignCart({ keys: ['tamu', '2'], startOwnerId: null, isGuestDesign: true, currentUser: B }).target,
    DESIGN_CART_TARGET.ACCOUNT_MERGED,
  );
  // Sesi A berakhir (fallback tamu) lalu pelanggan LAIN masuk → tidak digabung diam-diam
  assert.deepEqual(
    resolveDesignCart({ keys: ['1', 'tamu', '2'], startOwnerId: '1', isGuestDesign: true, currentUser: B }),
    { target: DESIGN_CART_TARGET.GUEST_CART, ownerId: null, reason: GUEST_CART_REASON.NOT_MERGED },
  );
});

// ── L2: fallback tamu setelah JWT kedaluwarsa ─────────────────────────────────────────────────────────────────────

test('L2: JWT A kedaluwarsa → desain disimpan sebagai tamu, masuk keranjang tamu yang TERLIHAT, lalu digabung ke A saat masuk lagi', async () => {
  signIn(customer(1), 'jwt-A');
  store.set('ovenco_mock_cart_1', JSON.stringify([{ cart_item_id: 1, product_id: 2, quantity: 1 }]));
  scriptFetch([{ ...SESSION_INVALID }, created('95', 'tok-95')]);

  const result = await saveCustomCakeToCart(DESIGN, PRODUCT);

  assert.equal(calls[1].init.headers.Authorization, undefined); // dikirim ulang SEKALI sebagai tamu
  assert.equal(result.target, DESIGN_CART_TARGET.GUEST_CART);
  assert.equal(result.reason, GUEST_CART_REASON.SESSION_EXPIRED);
  assert.equal(useAuthStore.getState().sessionExpired, true);
  // Keranjang aktif = keranjang tamu berisi desain (bukan keranjang akun A yang tidak terlihat)
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_guest');
  assert.ok(useCartStore.getState().items.some((i) => i.design_id === '95' && i.design_token === 'tok-95'));
  assert.ok(!designsIn('ovenco_mock_cart_1').includes('95'));
  const notice = getDesignCartNotice(result);
  assert.equal(notice.message, DESIGN_CART_NOTICE.session_expired);
  assert.equal(notice.replacesSessionNotice, true);

  thisTabLogin(customer(1), 'jwt-A2'); // masuk lagi → keranjang tamu digabung (FR-04), tanpa duplikat
  assert.deepEqual(designsIn('ovenco_mock_cart_1').filter(Boolean), ['95']);
});

test('L2: JWT kedaluwarsa dan penyimpanan ulang sebagai tamu GAGAL → error, tidak ada item di keranjang mana pun', async () => {
  signIn(customer(1), 'jwt-A');
  scriptFetch([{ ...SESSION_INVALID }, { status: 500, body: { message: 'Server sedang gangguan' } }]);

  await assert.rejects(saveCustomCakeToCart(DESIGN, PRODUCT), { message: 'Server sedang gangguan' });
  assert.equal(useCartStore.getState().items.length, 0);
  assert.equal(store.has('ovenco_mock_cart_1'), false);
  assert.equal(store.has('ovenco_mock_cart_guest'), false);
});

test('L2: keranjang tujuan penuh → pesan error "desain tersimpan, belum masuk keranjang", bukan pesan berhasil', () => {
  const notice = getDesignCartNotice({ added: false, target: DESIGN_CART_TARGET.ACTIVE, reason: null });
  assert.equal(notice.type, 'error');
  assert.equal(notice.message, DESIGN_SAVED_CART_FULL_MESSAGE);
  assert.equal(getDesignCartNotice({ added: true, target: DESIGN_CART_TARGET.ACTIVE, reason: null }).message, DESIGN_ADDED_MESSAGE);
});

// ── L3: staf/owner aktif ──────────────────────────────────────────────────────────────────────────────────────────

test('L3: tamu menyimpan desain, STAF masuk di tab lain → desain tamu di keranjang tamu, tidak ke keranjang pelanggan mana pun', async () => {
  scriptFetch([{ before: () => otherTabWrites(staff(50), 'jwt-staf'), ...created('96', 'tok-96') }]);

  const result = await saveCustomCakeToCart(DESIGN, PRODUCT);

  assert.equal(result.target, DESIGN_CART_TARGET.GUEST_CART);
  assert.equal(result.reason, GUEST_CART_REASON.STAFF_SESSION);
  assert.deepEqual(designsIn('ovenco_mock_cart_guest'), ['96']);
  assert.equal([...store.keys()].some((k) => /^ovenco_mock_cart_\d+$/.test(k)), false);
  assert.equal(getDesignCartNotice(result).message, DESIGN_CART_NOTICE.staff_session);
});

// ── L1: notifikasi tidak bergantung pada toast halaman yang sudah unmount ─────────────────────────────────────────

test('L1: identitas sama → toast halaman; identitas berganti → notifikasi global (menutup notifikasi sesi bila diminta)', () => {
  const local = [];
  const sameIdentity = createSessionBoundNotifier((type, message) => local.push([type, message]));
  sameIdentity('success', 'ok');
  assert.deepEqual(local, [['success', 'ok']]);
  assert.equal(useNoticeStore.getState().notice, null);

  signIn(customer(1), 'jwt-A');
  const report = createSessionBoundNotifier((type, message) => local.push([type, message]));
  useAuthStore.getState().expireSession();
  report('info', DESIGN_CART_NOTICE.session_expired, { replacesSessionNotice: true });

  assert.equal(local.length, 1);
  assert.deepEqual(
    { type: useNoticeStore.getState().notice.type, message: useNoticeStore.getState().notice.message },
    { type: 'info', message: DESIGN_CART_NOTICE.session_expired },
  );
  assert.equal(useAuthStore.getState().sessionExpired, false);
});

// ── L5: draft checkout lama ───────────────────────────────────────────────────────────────────────────────────────

test('L5: draft checkout versi lama (tanpa ownerKey) dibuang saat dipulihkan; draft tanpa pemilik sah direset saat mulai', async () => {
  globalThis.sessionStorage.setItem('ovenco_checkout', JSON.stringify({
    state: { fulfillment: 'delivery', addressId: 'alamat-lama', voucherCode: 'KODE-LAMA', usePoints: true }, version: 0,
  }));
  await useCheckoutStore.persist.rehydrate();
  const { addressId, voucherCode, usePoints, ownerKey } = useCheckoutStore.getState();
  assert.deepEqual({ addressId, voucherCode, usePoints, ownerKey }, { addressId: null, voucherCode: null, usePoints: false, ownerKey: null });

  useCheckoutStore.setState({ voucherCode: 'TANPA-PEMILIK', ownerKey: null }); // tidak bisa diverifikasi
  signIn(customer(1), 'jwt-A');
  stopScope = startSessionScope();
  assert.equal(useCheckoutStore.getState().voucherCode, null);
});

// ── L6: sesi = token + epoch; aturan sama sebelum & sesudah ──────────────────────────────────────────────────────

test('L6: epoch naik saat token atau identitas berganti, TIDAK saat profil berubah', () => {
  signIn(customer(1), 'jwt-A');
  const start = getSessionEpoch();
  useAuthStore.getState().updateCurrentUser({ ...customer(1), name: 'Nama Baru' });
  assert.equal(getSessionEpoch(), start);
  useAuthStore.getState().setAuth(customer(1), 'jwt-A2');
  assert.equal(getSessionEpoch(), start + 1);
  useAuthStore.getState().logout();
  assert.equal(getSessionEpoch(), start + 2);
});

test('L6: keluar lalu masuk lagi sebagai pengguna sama (token SAMA) selama POST → respons sesi lama ditolak', async () => {
  signIn(customer(1), 'jwt-A');
  scriptFetch([{
    before: () => { useAuthStore.getState().logout(); useAuthStore.getState().setAuth(customer(1), 'jwt-A'); },
    status: 201, body: { data: { address_id: 'baru' } },
  }]);
  await assert.rejects(apiClient('/me/addresses', { method: 'POST', body: {} }), CHANGED);
  assert.equal(calls.length, 1);
});

test('L6: keluar lalu masuk lagi selama GET → respons lama tidak dipakai, GET diulang SEKALI di sesi aktif', async () => {
  signIn(customer(1), 'jwt-A');
  scriptFetch([
    { before: () => { useAuthStore.getState().logout(); useAuthStore.getState().setAuth(customer(1), 'jwt-A2'); }, status: 200, body: { data: 'lama' } },
    { status: 200, body: { data: 'baru' } },
  ]);
  assert.equal(await apiClient('/me/orders'), 'baru');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer jwt-A2');
});

test('L6: token ganti untuk pengguna sama → PUT ditolak sebelum dikirim, sama seperti setelah respons', async () => {
  signIn(customer(1), 'jwt-A');
  otherTabWrites(customer(1), 'jwt-A2');
  scriptFetch([]);
  await assert.rejects(apiClient('/me/profile', { method: 'PUT', body: {} }), CHANGED);

  signIn(customer(1), 'jwt-A');
  scriptFetch([{ before: () => otherTabWrites(customer(1), 'jwt-A2'), status: 200, body: { data: 'ok' } }]);
  await assert.rejects(apiClient('/me/profile', { method: 'PUT', body: {} }), CHANGED);
  assert.equal(calls.length, 1);
});

test('L6 (mock): aturan sesi sama dengan mode API — mutasi ditolak, GET pengguna sama dijalankan atas nama sesi aktif', async () => {
  signIn({ user_id: 1, role: 'customer' }, 'mock_token_1_a');
  let ran = false;
  const post = runMockRequest(() => { ran = true; }, 5, 'POST');
  useAuthStore.getState().setAuth({ user_id: 1, role: 'customer' }, 'mock_token_1_b');
  await assert.rejects(post, CHANGED);
  assert.equal(ran, false);

  const get = runMockRequest(({ sessionUser }) => sessionUser.user_id, 5, 'GET');
  useAuthStore.getState().logout();
  useAuthStore.getState().setAuth({ user_id: 1, role: 'customer' }, 'mock_token_1_c');
  assert.equal(await get, 1);

  const other = runMockRequest(() => 'data 1', 5, 'GET');
  useAuthStore.getState().setAuth({ user_id: 2, role: 'customer' }, 'mock_token_2');
  await assert.rejects(other, CHANGED);
});
