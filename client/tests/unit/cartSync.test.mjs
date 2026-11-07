// Uji engine sinkronisasi keranjang akun (mode API) — Step 6.6 (CP3). Server tiruan meniru savedCart.service; kunci
// antar-tab dalam memori; fetch nyata tidak pernah dipakai (API disuntik).

import test from 'node:test';
import assert from 'node:assert/strict';

const devices = { A: new Map(), B: new Map() };
let current = devices.A;
const storage = {
  getItem: (k) => (current.has(k) ? current.get(k) : null),
  setItem: (k, v) => current.set(k, String(v)),
  removeItem: (k) => current.delete(k),
  clear: () => current.clear(),
  key: (i) => [...current.keys()][i] ?? null,
  get length() { return current.size; },
};
globalThis.localStorage = storage;
globalThis.fetch = async () => { throw new Error('fetch tidak boleh dipanggil'); };

const sync = await import('../../src/services/cartSync.js');
const { createMemoryLock } = await import('../../src/services/cartSyncLock.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');
const { default: useCartStore } = await import('../../src/stores/useCartStore.js');
const { default: useNoticeStore } = await import('../../src/stores/useNoticeStore.js');
const { CART_SYNC_STATUS, CART_SYNC_MESSAGE } = await import('../../src/constants/cart.js');
const { createApiError } = await import('../../src/utils/apiErrors.js');
const { CLIENT_ERROR_CODE } = await import('../../src/constants/apiErrors.js');
const { createFakeCartServer } = await import('./helpers/fakeCartServer.mjs');

const CUSTOMER = { userId: '1', role: 'customer' };
const GUEST_KEY = 'ovenco_api_cart_guest';
const ACCOUNT_KEY = 'ovenco_api_cart_1';
let server;

function configure(extra = {}) {
  sync.configureCartSyncForTests({ reset: true, lock: createMemoryLock(), api: server.api, debounceMs: 0, retryDelaysMs: [], ...extra });
}
const useDevice = (name) => {
  current = devices[name];
  if (useAuthStore.getState().user) useCartStore.getState().loadCartForUser(useAuthStore.getState().user);
  else useCartStore.getState().resetToGuest();
};
const login = () => {
  useAuthStore.getState().setAuth(CUSTOMER, 'jwt-1');
  return sync.syncCartAfterLogin(CUSTOMER);
};
const item = (over) => ({ product_id: '1', quantity: 1, name: 'X', price: 1, ...over });
const writeGuest = (items) => storage.setItem(GUEST_KEY, JSON.stringify(items.map((i, n) => ({ cart_item_id: 900 + n, variant_id: null,
  design_id: null, design_token: null, preferred_date: null, note: '', ...i }))));
const summary = (lines) => lines.map((l) => `${l.design_id ? `d${l.design_id}` : l.product_id}x${l.quantity}`).sort().join(',');
const local = () => useCartStore.getState().items;
const record = (kind) => JSON.parse(storage.getItem(`ovenco_api_cartsync_${kind}_1`) ?? 'null');

test.beforeEach(() => {
  devices.A.clear();
  devices.B.clear();
  current = devices.A;
  server = createFakeCartServer();
  configure();
  useAuthStore.setState({ user: null, token: null, sessionExpired: false });
  useCartStore.getState().resetToGuest();
  useNoticeStore.setState({ notice: null });
});

test('perangkat baru tanpa localStorage: GET lalu hydrate POST /cart → keranjang lengkap (nama/harga), tanpa PUT/POST', async () => {
  server.setRows([{ product_id: '1', quantity: 2 }, { product_id: '9', quantity: 1, preferred_date: '2026-11-09' }]);
  assert.equal((await login()).status, CART_SYNC_STATUS.SYNCED);
  assert.equal(summary(local()), '1x2,9x1');
  assert.ok(local().every((l) => l.name && l.price === 1000));
  assert.equal(server.count('PUT') + server.count('POST'), 0);
});

test('tamu digabung ke keranjang server yang sudah berisi: POST /cart/merge sebelum login selesai, tamu dikosongkan', async () => {
  server.setRows([{ product_id: '1', quantity: 1 }]);
  writeGuest([{ product_id: '1', quantity: 2 }, { product_id: '9', quantity: 1 }]);
  assert.equal((await login()).status, CART_SYNC_STATUS.SYNCED);
  assert.equal(summary(server.rows()), '1x3,9x1');
  assert.equal(summary(local()), '1x3,9x1');
  assert.equal(storage.getItem(GUEST_KEY), null);
  assert.equal(record('prov'), null);
  assert.equal(server.count('POST'), 1);
  assert.equal(server.count('PUT'), 0);
});

test('local cart lama yang belum pernah tersinkronisasi → merge (TIDAK PUT), isi server tidak tertimpa', async () => {
  storage.setItem(ACCOUNT_KEY, JSON.stringify([{ cart_item_id: 5, product_id: '7', quantity: 1, variant_id: null, design_id: null, preferred_date: null, note: '' }]));
  server.setRows([{ product_id: '1', quantity: 1 }]);
  await login();
  assert.equal(summary(server.rows()), '1x1,7x1');
  assert.equal(server.count('PUT'), 0);
});

test('perubahan lokal setelah baseline → GET lalu PUT; id lokal stabil (id hasil PUT tidak dipakai)', async () => {
  server.setRows([{ product_id: '1', quantity: 1 }]);
  await login();
  const id = local()[0].cart_item_id;
  useCartStore.getState().updateQuantity(id, 4);
  assert.equal((await sync.flushCartSync()).status, CART_SYNC_STATUS.SYNCED);
  assert.equal(summary(server.rows()), '1x4');
  assert.notEqual(server.rows()[0].cart_item_id, id);
  assert.equal(local()[0].cart_item_id, id);
});

test('S3 + pending guest: perubahan lokal di-PUT dulu TANPA item tamu, lalu tamu lewat POST /cart/merge', async () => {
  server.setRows([{ product_id: '1', quantity: 1 }]);
  await login();
  useCartStore.getState().updateQuantity(local()[0].cart_item_id, 2);
  writeGuest([{ product_id: '9', quantity: 1 }]);
  const putPayloads = [];
  const save = server.api.saveCart;
  configure({ api: { ...server.api, saveCart: (items, o) => { putPayloads.push(items); return save(items, o); } } });
  const before = server.log.length;
  await sync.flushCartSync();
  assert.deepEqual(server.log.slice(before, before + 3), ['GET', 'PUT', 'POST']); // lalu GET konfirmasi
  assert.equal(summary(putPayloads[0]), '1x2');
  assert.equal(summary(server.rows()), '1x2,9x1');
});

test('perubahan lokal saat GET berjalan tidak tertimpa dan ikut dikirim', async () => {
  server.setRows([{ product_id: '1', quantity: 1 }]);
  await login();
  const id = local()[0].cart_item_id;
  useCartStore.getState().updateQuantity(id, 2);
  server.plan('hold');
  const flushing = sync.flushCartSync();
  await new Promise((r) => setTimeout(r, 5));
  useCartStore.getState().addItem(item({ product_id: '7' })); // selama GET ditahan
  server.releaseHeld();
  await flushing;
  await sync.flushCartSync();
  assert.equal(summary(server.rows()), '1x2,7x1');
  assert.equal(summary(local()), '1x2,7x1');
});

test('perubahan lokal saat PUT berjalan → dikirim di putaran berikutnya (tidak hilang)', async () => {
  server.setRows([{ product_id: '1', quantity: 1 }]);
  await login();
  const id = local()[0].cart_item_id;
  useCartStore.getState().updateQuantity(id, 2);
  server.plan('ok', 'hold');
  const flushing = sync.flushCartSync();
  await new Promise((r) => setTimeout(r, 5));
  useCartStore.getState().updateQuantity(id, 5);
  server.releaseHeld();
  await flushing;
  assert.equal(summary(server.rows()), '1x5');
});

test('merge tanpa respons setelah commit → UNKNOWN; GET = expectedSig → applied; POST hanya sekali', async () => {
  server.setRows([{ product_id: '9', quantity: 1 }]);
  writeGuest([{ product_id: '1', quantity: 2 }]);
  server.plan('ok', 'failAfterCommit:network');
  assert.equal((await login()).status, CART_SYNC_STATUS.PENDING);
  assert.equal(record('attempt').status, 'unknown');
  // Perangkat belum pernah sinkron: item tamu tetap terlihat; isi server lama baru tampil setelah merge dikonfirmasi
  assert.equal(summary(local()), '1x2');
  assert.equal((await sync.flushCartSync()).status, CART_SYNC_STATUS.SYNCED);
  assert.equal(server.count('POST'), 1);
  assert.equal(summary(server.rows()), '1x2,9x1');
  assert.equal(record('attempt'), null);
  assert.equal(summary(local()), '1x2,9x1');
});

test('merge 500 sebelum commit → UNKNOWN → GET ≠ expected → UNCONFIRMED paused: tanpa PUT/POST walau keranjang diubah', async () => {
  server.setRows([{ product_id: '9', quantity: 1 }]);
  writeGuest([{ product_id: '1', quantity: 2 }]);
  server.plan('ok', 'failBeforeCommit:500');
  await login();
  assert.equal((await sync.flushCartSync()).status, CART_SYNC_STATUS.PAUSED);
  assert.equal(useNoticeStore.getState().notice?.message, CART_SYNC_MESSAGE.PAUSED);
  useCartStore.getState().addItem(item({ product_id: '7' }));
  assert.equal((await sync.flushCartSync()).status, CART_SYNC_STATUS.PAUSED);
  assert.equal(server.count('POST'), 1);
  assert.equal(server.count('PUT'), 0);
  assert.equal(summary(local()), '1x2,7x1'); // perubahan lokal & tamu tetap tersimpan dan terlihat
  assert.equal(summary(server.rows()), '9x1');
});

test('preSig: merge di-commit, respons hilang, perangkat lain menghapus baris tamu → GET = preSig tetap UNCONFIRMED (tidak POST ulang)', async () => {
  server.setRows([{ product_id: '9', quantity: 1 }]);
  writeGuest([{ product_id: '1', quantity: 2 }]);
  server.plan('ok', 'failAfterCommit:network');
  await login();
  server.setRows([{ product_id: '9', quantity: 1 }]); // perangkat lain
  assert.equal((await sync.flushCartSync()).status, CART_SYNC_STATUS.PAUSED);
  assert.equal(server.count('POST'), 1);
});

test('merge 400 (pasti sebelum commit) → attempt dihapus, isi diblokir tanpa loop, provenance tamu tetap', async () => {
  writeGuest([{ product_id: '1', quantity: 2 }]);
  server.plan('ok', 'failBeforeCommit:400');
  await login();
  assert.equal(record('attempt'), null);
  assert.ok(record('blocked'));
  assert.ok(record('prov'));
  await sync.flushCartSync();
  assert.equal(server.count('POST'), 1);
});

test('crash titik A: attempt SENDING tersimpan, fetch belum dipanggil → tab baru: UNKNOWN → GET → UNCONFIRMED, POST 0', async () => {
  writeGuest([{ product_id: '1', quantity: 2 }]);
  configure({ hooks: { beforeSend: (_o, a) => { if (a.kind === 'merge') throw new Error('crash'); } } });
  await login();
  assert.equal(record('attempt').status, 'sending');
  configure(); // tab baru
  assert.equal((await sync.flushCartSync()).status, CART_SYNC_STATUS.PAUSED);
  assert.equal(server.count('POST'), 0);
});

test('crash titik B: request terkirim & di-commit, respons tidak pernah diterima → tab baru: GET = expected → applied, POST 1', async () => {
  useAuthStore.getState().setAuth(CUSTOMER, 'jwt-1');
  useCartStore.getState().loadCartForUser(CUSTOMER);
  writeGuest([{ product_id: '1', quantity: 2 }]);
  server.plan('ok', 'neverRespondAfterCommit');
  assert.equal((await sync.flushCartSync({ timeoutMs: 30 })).status, CART_SYNC_STATUS.PENDING);
  assert.equal(record('attempt').status, 'sending');
  configure(); // tab baru (kunci baru)
  assert.equal((await sync.flushCartSync()).status, CART_SYNC_STATUS.SYNCED);
  assert.equal(server.count('POST'), 1);
  assert.equal(summary(server.rows()), '1x2');
});

test('desain tamu diklaim tetapi respons merge hilang → GET (token null) = expected → applied; design_id tetap, token lokal null', async () => {
  server.addGuestDesign('5', 'tok-5');
  writeGuest([{ product_id: '6', design_id: '5', design_token: 'tok-5', quantity: 1 }]);
  server.plan('ok', 'failAfterCommit:500');
  await login();
  assert.equal(server.designOwner('5'), '1');
  assert.equal((await sync.flushCartSync()).status, CART_SYNC_STATUS.SYNCED);
  const line = local().find((l) => l.design_id === '5');
  assert.equal(line.design_token, null);
  assert.equal(server.count('POST'), 1);
});

test('PUT: commit lalu respons hilang → GET = payload → applied (payload lama tidak dikirim ulang)', async () => {
  server.setRows([{ product_id: '1', quantity: 1 }]);
  await login();
  useCartStore.getState().updateQuantity(local()[0].cart_item_id, 3);
  server.plan('ok', 'failAfterCommit:network');
  assert.equal((await sync.flushCartSync()).status, CART_SYNC_STATUS.PENDING);
  assert.equal((await sync.flushCartSync()).status, CART_SYNC_STATUS.SYNCED);
  assert.equal(server.count('PUT'), 1);
  assert.equal(summary(server.rows()), '1x3');
});

test('PUT gagal sebelum commit (jaringan) → ancestor B0 per baris: perubahan lokal tetap, dikirim ulang lewat merge3', async () => {
  server.setRows([{ product_id: '1', quantity: 1 }]);
  await login();
  useCartStore.getState().updateQuantity(local()[0].cart_item_id, 3);
  server.plan('ok', 'failBeforeCommit:network');
  await sync.flushCartSync();
  await sync.flushCartSync();
  assert.equal(summary(server.rows()), '1x3');
  assert.equal(summary(local()), '1x3');
});

test('PUT HTTP 500 setelah commit + perangkat lain menambah baris → perubahan perangkat lain dipertahankan', async () => {
  server.setRows([{ product_id: '1', quantity: 1 }]);
  await login();
  useCartStore.getState().updateQuantity(local()[0].cart_item_id, 3);
  server.plan('ok', 'failAfterCommit:500');
  await sync.flushCartSync();
  server.setRows([...server.rows(), { product_id: '9', quantity: 5 }]); // perangkat lain setelah commit
  await sync.flushCartSync();
  assert.equal(summary(server.rows()), '1x3,9x5');
  assert.equal(summary(local()), '1x3,9x5');
});

test('checkout saat PUT berjalan: baris yang dipesan dihapus, item yang ditambah selama checkout tetap, server menerima hasil akhir', async () => {
  server.setRows([{ product_id: '1', quantity: 2 }, { product_id: '9', quantity: 1 }]);
  await login();
  useCartStore.getState().addItem(item({ product_id: '7' }));
  server.plan('ok', 'hold');
  const pending = sync.flushCartSync();
  await new Promise((r) => setTimeout(r, 5));
  const ordered = local().filter((l) => l.product_id !== '7').map((l) => ({ cart_item_id: l.cart_item_id, quantity: l.quantity }));
  useCartStore.getState().removeOrderedItems(ordered); // checkout berhasil
  useCartStore.getState().addItem(item({ product_id: '10' })); // tab lain menambah selama checkout
  const flushed = sync.flushCartSync();
  server.releaseHeld();
  await pending;
  assert.equal((await flushed).status, CART_SYNC_STATUS.SYNCED);
  assert.equal(summary(server.rows()), '10x1,7x1');
});

test('checkout berhasil tetapi sinkronisasi gagal jaringan → flushCartSync tidak melempar, pending tersimpan, pesanan tidak diulang', async () => {
  server.setRows([{ product_id: '1', quantity: 2 }]);
  await login();
  let orders = 0;
  const createOrder = async () => { orders += 1; return { order_number: 'OVC-1' }; };
  await createOrder();
  useCartStore.getState().removeOrderedItems([{ cart_item_id: local()[0].cart_item_id, quantity: 2 }]);
  server.plan('failBeforeCommit:network');
  assert.equal((await sync.flushCartSync()).status, CART_SYNC_STATUS.PENDING);
  assert.equal(orders, 1);
  assert.equal(local().length, 0);
  assert.equal((await sync.flushCartSync()).status, CART_SYNC_STATUS.SYNCED); // jaringan pulih
  assert.equal(server.rows().length, 0);
});

test('logout dengan perubahan tertunda → tidak hilang, dikirim saat login lagi; akun lain tidak membaca cache', async () => {
  server.setRows([{ product_id: '1', quantity: 1 }]);
  await login();
  useCartStore.getState().updateQuantity(local()[0].cart_item_id, 6);
  useAuthStore.getState().logout();
  useCartStore.getState().resetToGuest();
  assert.equal((await sync.flushCartSync()).status, CART_SYNC_STATUS.IDLE);
  assert.equal(local().length, 0); // keranjang tamu, bukan cache akun
  useAuthStore.getState().setAuth({ userId: '2', role: 'customer' }, 'jwt-2');
  useCartStore.getState().loadCartForUser({ userId: '2', role: 'customer' });
  assert.equal(local().length, 0); // akun lain tidak membaca cache akun 1
  useAuthStore.getState().logout();
  await login();
  assert.equal(summary(server.rows()), '1x6');
});

test('session expiry saat PUT → attempt dihapus (pasti belum diproses), login ulang mengirim perubahan', async () => {
  server.setRows([{ product_id: '1', quantity: 1 }]);
  await login();
  useCartStore.getState().updateQuantity(local()[0].cart_item_id, 2);
  const save = server.api.saveCart;
  let expire = true;
  configure({ api: { ...server.api, saveCart: (items, o) => {
    if (expire) { expire = false; server.log.push('PUT'); return Promise.reject(createApiError('Sesi berakhir', 401, CLIENT_ERROR_CODE.SESSION_EXPIRED)); }
    return save(items, o);
  } } });
  assert.equal((await sync.flushCartSync()).status, CART_SYNC_STATUS.PENDING);
  assert.equal(record('attempt'), null);
  assert.equal((await login()).status, CART_SYNC_STATUS.SYNCED);
  assert.equal(summary(server.rows()), '1x2');
});

test('tamu dan staf/owner tidak mengirim request keranjang akun', async () => {
  useCartStore.getState().addItem(item());
  assert.equal((await sync.flushCartSync()).status, CART_SYNC_STATUS.IDLE);
  useAuthStore.getState().setAuth({ userId: '2', role: 'staf' }, 'jwt-s');
  assert.equal((await sync.syncCartAfterLogin({ userId: '2', role: 'staf' })).status, CART_SYNC_STATUS.IDLE);
  assert.equal((await sync.flushCartSync()).status, CART_SYNC_STATUS.IDLE);
  assert.equal(server.log.length, 0);
});

test('dua perangkat: baris berbeda digabung; baris sama → last-write-wins (best-effort, terdokumentasi)', async () => {
  server.setRows([{ product_id: '1', quantity: 1 }, { product_id: '9', quantity: 1 }]);
  await login();
  useDevice('B');
  await sync.syncCartAfterLogin(CUSTOMER);
  useDevice('A');
  useCartStore.getState().updateQuantity(local().find((l) => l.product_id === '1').cart_item_id, 3);
  useDevice('B');
  useCartStore.getState().updateQuantity(local().find((l) => l.product_id === '9').cart_item_id, 4);
  useDevice('A');
  await sync.flushCartSync();
  useDevice('B');
  await sync.flushCartSync();
  assert.equal(summary(server.rows()), '1x3,9x4');
  // Baris yang sama di dua perangkat: penulis terakhir menang
  useCartStore.getState().updateQuantity(local().find((l) => l.product_id === '1').cart_item_id, 5);
  useDevice('A');
  useCartStore.getState().updateQuantity(local().find((l) => l.product_id === '1').cart_item_id, 7);
  useDevice('B');
  await sync.flushCartSync();
  useDevice('A');
  await sync.flushCartSync();
  assert.equal(summary(server.rows()), '1x7,9x4');
});

test('engine: StrictMode mount→unmount→mount tetap satu engine; stop terakhir mematikannya', async () => {
  const stop1 = sync.startCartSync();
  stop1();
  const stop2 = sync.startCartSync();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(sync.isCartSyncRunningForTests(), 1);
  stop2();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(sync.isCartSyncRunningForTests(), 0);
});

test('namespace: data lama ovenco_mock_cart_* tidak dipindahkan, dihapus, atau diubah oleh mode API', async () => {
  const legacy = JSON.stringify([{ cart_item_id: 1, product_id: 1, quantity: 9 }]);
  storage.setItem('ovenco_mock_cart_1', legacy);
  storage.setItem('ovenco_mock_cart_guest', legacy);
  server.setRows([{ product_id: '1', quantity: 1 }]);
  await login();
  useCartStore.getState().updateQuantity(local()[0].cart_item_id, 2);
  await sync.flushCartSync();
  assert.equal(storage.getItem('ovenco_mock_cart_1'), legacy);
  assert.equal(storage.getItem('ovenco_mock_cart_guest'), legacy);
  assert.equal(summary(local()), '1x2');
});
