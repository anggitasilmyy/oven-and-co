// Uji multi-tab Step 6.6 (CP3): DUA instance useCartStore (dua tab) dengan SATU localStorage bersama. Interleaving dipaksa
// dengan mencegat localStorage.setItem dan hook di tengah fold journal — bukan sekadar dua request server.

import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
let interceptor = null;
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => {
    if (interceptor) {
      const run = interceptor;
      interceptor = null;
      run(k, v);
    }
    store.set(k, String(v));
  },
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
globalThis.fetch = async () => { throw new Error('fetch tidak boleh dipanggil'); };

const sync = await import('../../src/services/cartSync.js');
const { createMemoryLock } = await import('../../src/services/cartSyncLock.js');
const { setTabIdentityForTests } = await import('../../src/services/cartStorage.js');
const { setAfterJournalReadHookForTests, foldJournal } = await import('../../src/services/cartSyncState.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');
const { default: tabA } = await import('../../src/stores/useCartStore.js');
const { default: tabB } = await import('../../src/stores/useCartStore.js?tab=kedua');
const { createFakeCartServer } = await import('./helpers/fakeCartServer.mjs');

const CUSTOMER = { userId: '1', role: 'customer' };
const ACCOUNT_KEY = 'ovenco_api_cart_1';
const opKeys = () => [...store.keys()].filter((k) => k.startsWith('ovenco_api_cartsync_op_1_'));
const summary = (lines) => lines.map((l) => `${l.product_id}x${l.quantity}`).sort().join(',');
const shared = () => JSON.parse(store.get(ACCOUNT_KEY) ?? '[]');
const item = (product_id, quantity = 1) => ({ product_id, quantity, name: 'X', price: 1 });
/** Jalankan aksi atas nama tab tertentu (identitas journal per tab) */
const asTab = (name, fn) => {
  setTabIdentityForTests(name);
  try {
    return fn();
  } finally {
    setTabIdentityForTests('A');
  }
};
let server;

test.beforeEach(async () => {
  store.clear();
  interceptor = null;
  setAfterJournalReadHookForTests(null);
  setTabIdentityForTests('A');
  server = createFakeCartServer();
  server.setRows([{ product_id: '1', quantity: 1 }]);
  sync.configureCartSyncForTests({ reset: true, lock: createMemoryLock(), api: server.api, debounceMs: 0, retryDelaysMs: [] });
  useAuthStore.getState().setAuth(CUSTOMER, 'jwt-1');
  await sync.syncCartAfterLogin(CUSTOMER); // baseline server
  tabB.getState().loadCartForUser(CUSTOMER);
});

test('lost update dipaksa: tab B menulis di antara baca & tulis tab A → kunci bersama kehilangan B, journal memulihkan keduanya', async () => {
  interceptor = (key) => {
    if (key !== ACCOUNT_KEY) return;
    asTab('B', () => tabB.getState().addItem(item('7'))); // B membaca isi LAMA lalu menulis
  };
  // Interceptor dipicu pada setItem pertama A (entri journal A); arahkan ke tulisan kunci keranjang
  const original = interceptor;
  interceptor = (key, value) => { if (key === ACCOUNT_KEY) original(key, value); else interceptor = original; };
  // Kedua tab membuat baris baru pada milidetik yang SAMA (dulu id bentrok → satu baris hilang saat fold)
  const realNow = Date.now;
  const fixed = realNow();
  Date.now = () => fixed;
  try {
    tabA.getState().addItem(item('9'));
  } finally {
    Date.now = realNow;
  }
  assert.equal(summary(shared()), '1x1,9x1'); // tulisan B tertimpa A
  assert.ok(opKeys().some((k) => k.includes('_B_')), 'entri journal B tetap ada');
  await sync.flushCartSync();
  assert.equal(summary(shared()), '1x1,7x1,9x1');
  assert.equal(summary(server.rows()), '1x1,7x1,9x1');
  assert.equal(opKeys().length, 0);
});

test('baca journal → tab lain menulis entri baru → engine hapus: HANYA entri yang diproses dihapus, entri baru dilipat berikutnya', async () => {
  tabA.getState().addItem(item('9'));
  let newKeys = [];
  setAfterJournalReadHookForTests(() => {
    setAfterJournalReadHookForTests(null);
    const before = new Set(opKeys());
    asTab('B', () => { tabB.getState().reloadActiveCart(); tabB.getState().addItem(item('7')); });
    newKeys = opKeys().filter((k) => !before.has(k));
  });
  foldJournal('1');
  assert.ok(newKeys.length > 0);
  assert.ok(newKeys.every((k) => store.has(k)), 'entri yang ditulis selama fold tidak ikut dihapus');
  await sync.flushCartSync();
  assert.equal(summary(server.rows()), '1x1,7x1,9x1');
});

test('crash setelah journal ditulis, sebelum kunci keranjang ditulis → perubahan dipulihkan dari journal', async () => {
  interceptor = (key) => {
    if (key === ACCOUNT_KEY) throw new Error('crash tab');
    interceptor = (k) => { if (k === ACCOUNT_KEY) throw new Error('crash tab'); };
  };
  assert.throws(() => tabA.getState().addItem(item('9')), /crash/);
  interceptor = null;
  assert.equal(summary(shared()), '1x1');
  await sync.flushCartSync();
  assert.equal(summary(server.rows()), '1x1,9x1');
});

test('engine crash setelah menulis hasil fold, sebelum menghapus journal → fold ulang idempoten (tidak menggandakan)', async () => {
  tabA.getState().addItem(item('9'));
  asTab('B', () => { tabB.getState().reloadActiveCart(); tabB.getState().updateQuantity(tabB.getState().items.find((l) => l.product_id === '9').cart_item_id, 3); });
  setAfterJournalReadHookForTests(() => { throw new Error('crash engine'); });
  assert.throws(() => foldJournal('1'), /crash engine/);
  setAfterJournalReadHookForTests(null);
  const afterCrash = summary(shared());
  foldJournal('1');
  assert.equal(summary(shared()), afterCrash);
  assert.equal(afterCrash, '1x1,9x3');
  await sync.flushCartSync();
  assert.equal(summary(server.rows()), '1x1,9x3');
});

test('baris yang sama diubah di dua tab (lost update) → urutan journal (ts, tab, seq) menentukan: yang terakhir menang', async () => {
  const id = tabA.getState().items[0].cart_item_id;
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    interceptor = (key) => {
      if (key !== ACCOUNT_KEY) return;
      clock += 10;
      asTab('B', () => tabB.getState().updateQuantity(id, 5)); // B lebih baru
    };
    const original = interceptor;
    interceptor = (key, value) => { if (key === ACCOUNT_KEY) original(key, value); else interceptor = original; };
    tabA.getState().updateQuantity(id, 3);
    assert.equal(summary(shared()), '1x3'); // A menimpa B di kunci bersama
  } finally {
    Date.now = realNow;
  }
  await sync.flushCartSync();
  assert.equal(summary(shared()), '1x5');
  assert.equal(summary(server.rows()), '1x5');
});
