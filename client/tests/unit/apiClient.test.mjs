// Uji apiClient mode API — Step 6.3 · review 49a1214 M1 (sesi kedaluwarsa) & FormData (unggah foto)
// fetch & localStorage dipalsukan; tidak ada request jaringan.

import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
  key: (index) => [...store.keys()][index] ?? null,
  get length() { return store.size; },
};

const calls = [];
let responses = [];
const defaultFetch = async (url, init) => {
  calls.push({ url, init });
  const { status, body } = responses.shift();
  return { ok: status >= 200 && status < 300, status, json: async () => body };
};
globalThis.fetch = defaultFetch;

const { apiClient } = await import('../../src/services/apiClient.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');
const { default: useCartStore } = await import('../../src/stores/useCartStore.js');

function login() {
  useAuthStore.getState().setAuth({ user_id: '1', role: 'customer' }, 'jwt-lama');
  useCartStore.getState().loadUserCart('1');
}

test.beforeEach(() => {
  globalThis.fetch = defaultFetch;
  store.clear();
  calls.length = 0;
  responses = [];
  useAuthStore.setState({ user: null, token: null, sessionExpired: false });
});

const SESSION_INVALID = { status: 401, body: { status: 'error', code: 'SESSION_INVALID', message: 'Token tidak valid atau kedaluwarsa.' } };

test('sesi kedaluwarsa pada endpoint tamu: sesi dihapus, request diulang sekali TANPA token', async () => {
  login();
  responses = [SESSION_INVALID, { status: 200, body: { status: 'success', data: { lines: [] } } }];

  const data = await apiClient('/cart', { method: 'POST', body: { items: [] }, allowGuest: true });

  assert.deepEqual(data, { lines: [] });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer jwt-lama');
  assert.equal(calls[1].init.headers.Authorization, undefined);
  assert.equal(useAuthStore.getState().user, null);
  assert.equal(localStorage.getItem('ovenco_auth_token'), null);
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_guest');
  // Re-review A4: pengguna diberi tahu (flag dibaca SessionExpiredNotice)
  assert.equal(useAuthStore.getState().sessionExpired, true);
});

test('re-review A4: retry tamu MAKSIMAL satu kali walau respons ulang juga 401', async () => {
  login();
  responses = [SESSION_INVALID, SESSION_INVALID, { status: 200, body: { data: 'tidak boleh dipanggil' } }];

  await assert.rejects(apiClient('/cart', { method: 'POST', body: { items: [] }, allowGuest: true }), { status: 401 });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.headers.Authorization, undefined);
});

test('re-review A4: notifikasi sesi berakhir bisa ditutup; login berikutnya membersihkan tanda', async () => {
  login();
  responses = [SESSION_INVALID];
  await assert.rejects(apiClient('/checkout/context'));
  assert.equal(useAuthStore.getState().sessionExpired, true);

  useAuthStore.getState().dismissSessionNotice();
  assert.equal(useAuthStore.getState().sessionExpired, false);

  responses = [SESSION_INVALID];
  login();
  await assert.rejects(apiClient('/checkout/context'));
  login();
  assert.equal(useAuthStore.getState().sessionExpired, false);
});

test('tanpa token: 401 SESSION_INVALID tidak memicu penghapusan sesi / notifikasi / retry', async () => {
  responses = [SESSION_INVALID];
  await assert.rejects(apiClient('/cart', { method: 'POST', body: { items: [] }, allowGuest: true }), { status: 401 });
  assert.equal(calls.length, 1);
  assert.equal(useAuthStore.getState().sessionExpired, false);
});

test('re-review C: error 400 membawa kode aplikasi (INVALID_ID) dari body respons', async () => {
  responses = [{ status: 400, body: { status: 'error', code: 'INVALID_ID', message: 'ID produk tidak valid.' } }];
  await assert.rejects(apiClient('/products/abc'), { status: 400, code: 'INVALID_ID' });
});

test('sesi kedaluwarsa pada endpoint khusus pelanggan: sesi dihapus, TIDAK diulang, pesan sesi berakhir', async () => {
  login();
  responses = [SESSION_INVALID];

  await assert.rejects(apiClient('/checkout/context'), { status: 401, message: /Sesi Anda telah berakhir/ });
  assert.equal(calls.length, 1);
  assert.equal(useAuthStore.getState().token, null);
});

test('403 (peran tidak sesuai) TIDAK menghapus sesi', async () => {
  login();
  responses = [{ status: 403, body: { status: 'error', message: 'Anda tidak memiliki izin.' } }];

  await assert.rejects(apiClient('/cart', { method: 'POST', body: { items: [] }, allowGuest: true }), { status: 403 });
  assert.equal(calls.length, 1);
  assert.equal(useAuthStore.getState().token, 'jwt-lama');
});

test('401 tanpa kode sesi (mis. sandi salah saat login) TIDAK menghapus sesi', async () => {
  login();
  responses = [{ status: 401, body: { status: 'error', message: 'Email atau kata sandi salah.' } }];

  await assert.rejects(apiClient('/auth/login', { method: 'POST', body: {} }), { status: 401, message: /sandi salah/ });
  assert.equal(useAuthStore.getState().token, 'jwt-lama');
});

test('body FormData dikirim apa adanya tanpa Content-Type JSON (boundary diatur fetch)', async () => {
  responses = [{ status: 201, body: { status: 'success', data: { design_id: '1' } } }];
  const form = new FormData();
  form.append('design', '{}');

  await apiClient('/custom-cake-designs', { method: 'POST', body: form, allowGuest: true });

  assert.equal(calls[0].init.body, form);
  assert.equal(calls[0].init.headers['Content-Type'], undefined);
});

test('re-review #2: 401 terlambat dari token lama TIDAK menghapus sesi baru setelah login ulang', async () => {
  login(); // token lama: jwt-lama
  let releaseStale;
  const stale = new Promise((resolve) => { releaseStale = resolve; });
  // Request lama baru dijawab SETELAH pengguna login ulang dengan token baru
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) {
      await stale;
      return { ok: false, status: 401, json: async () => SESSION_INVALID.body };
    }
    return { ok: true, status: 200, json: async () => ({ data: { lines: ['sesi-baru'] } }) };
  };

  const pending = apiClient('/cart', { method: 'POST', body: { items: [] }, allowGuest: true });
  await new Promise((resolve) => setImmediate(resolve)); // tunggu request lama terkirim
  useAuthStore.getState().setAuth({ user_id: '1', role: 'customer' }, 'jwt-baru');
  useCartStore.getState().loadUserCart('1');
  useCartStore.getState().addItem({ product_id: 1, quantity: 2, name: 'Croissant', price: 28000 });
  releaseStale();

  // Kebijakan re-review #2: POST (termasuk endpoint tamu) tidak pernah dikirim ulang dengan token pengganti
  await assert.rejects(pending, { status: 401, code: 'CLIENT_SESSION_CHANGED' });
  assert.equal(useAuthStore.getState().token, 'jwt-baru');
  assert.equal(localStorage.getItem('ovenco_auth_token'), 'jwt-baru');
  assert.equal(useAuthStore.getState().sessionExpired, false); // tidak ada notifikasi palsu
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_1'); // keranjang aktif tidak direset
  assert.equal(useCartStore.getState().items.length, 1);
  assert.equal(calls.length, 1);
});

/**
 * fetch palsu berurutan: setiap langkah boleh menjalankan efek (mis. login ulang) sebelum respons dikembalikan.
 * Langkah: { before?: () => void, status, body }
 */
function scriptFetch(steps) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const step = steps.shift();
    if (!step) throw new Error(`fetch tak terduga ke ${url}`);
    step.before?.();
    return { ok: step.status >= 200 && step.status < 300, status: step.status, json: async () => step.body };
  };
}

const relogin = (token) => () => useAuthStore.getState().setAuth({ user_id: '1', role: 'customer' }, token);
const authOf = (index) => calls[index].init.headers.Authorization;

test('B2: POST khusus akun menerima 401 terlambat → TIDAK diulang, sesi baru tetap aktif, pesan bukan "sesi berakhir"', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    calls.length = 0;
    useAuthStore.getState().setAuth({ user_id: '1', role: 'customer' }, 'jwt-lama');
    scriptFetch([{ before: relogin('jwt-baru'), ...SESSION_INVALID }]);

    await assert.rejects(apiClient('/me/addresses', { method, body: {} }), (error) => {
      assert.equal(error.status, 401);
      assert.match(error.message, /Sesi akun berubah/);
      assert.doesNotMatch(error.message, /berakhir/);
      return true;
    });
    assert.equal(calls.length, 1, method);
    assert.equal(useAuthStore.getState().token, 'jwt-baru');
    assert.equal(localStorage.getItem('ovenco_auth_token'), 'jwt-baru');
    assert.equal(useAuthStore.getState().sessionExpired, false);
  }
});

test('re-review #9: pesan sesi berakhir netral untuk semua peran; setelah ditutup tidak muncul lagi tanpa kedaluwarsa baru', async () => {
  const { SESSION_EXPIRED_NOTICE } = await import('../../src/constants/apiErrors.js');
  assert.equal(SESSION_EXPIRED_NOTICE, 'Sesi Anda telah berakhir. Silakan masuk kembali untuk menggunakan fitur akun.');
  assert.doesNotMatch(SESSION_EXPIRED_NOTICE, /keranjang|pesanan/i);

  globalThis.fetch = defaultFetch;
  useAuthStore.getState().setAuth({ user_id: '3', role: 'owner' }, 'jwt-owner');
  responses = [SESSION_INVALID];
  await assert.rejects(apiClient('/admin/orders'));
  assert.equal(useAuthStore.getState().sessionExpired, true);
  useAuthStore.getState().dismissSessionNotice();

  // Request lain tanpa sesi (sukses, 403, 401 biasa) tidak memunculkan notifikasi lagi
  responses = [
    { status: 200, body: { data: [] } },
    { status: 403, body: { message: 'Akses ditolak' } },
    { status: 401, body: { message: 'Email atau kata sandi salah.' } },
  ];
  await apiClient('/products');
  await assert.rejects(apiClient('/admin/orders'));
  await assert.rejects(apiClient('/auth/login', { method: 'POST', body: {} }));
  assert.equal(useAuthStore.getState().sessionExpired, false);
});

test('re-review #5: reset sesi tidak mencampur keranjang akun dan tamu (retry tidak menulis ke store)', async () => {
  localStorage.setItem('ovenco_mock_cart_guest', JSON.stringify([{ cart_item_id: 1, product_id: 9, quantity: 1 }]));
  login();
  useCartStore.getState().addItem({ product_id: 1, quantity: 3, name: 'Croissant', price: 28000 });
  const accountCart = localStorage.getItem('ovenco_mock_cart_1');
  const accountItems = useCartStore.getState().items;

  globalThis.fetch = defaultFetch;
  responses = [SESSION_INVALID, { status: 200, body: { data: { lines: accountItems } } }];
  await apiClient('/cart', { method: 'POST', body: { items: accountItems }, allowGuest: true });

  // Store kini keranjang tamu (isi tamu asli), keranjang akun tetap utuh di perangkat untuk login berikutnya
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_guest');
  assert.deepEqual(useCartStore.getState().items.map((i) => i.product_id), [9]);
  assert.deepEqual(JSON.parse(localStorage.getItem('ovenco_mock_cart_guest')).map((i) => i.product_id), [9]);
  assert.equal(localStorage.getItem('ovenco_mock_cart_1'), accountCart);
});

test('A: dua request bersamaan dengan token kedaluwarsa → keduanya pesan ramah, sesi dihapus & notifikasi SEKALI', async () => {
  login();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let expireCount = 0;
  const unsubscribe = useAuthStore.subscribe((state, prev) => {
    if (state.sessionExpired && !prev.sessionExpired) expireCount += 1;
  });
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    await gate; // kedua request sudah terkirim dengan token lama sebelum ada yang dijawab
    return { ok: false, status: 401, json: async () => SESSION_INVALID.body };
  };

  const first = apiClient('/me/profile');
  const second = apiClient('/orders');
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const results = await Promise.allSettled([first, second]);
  unsubscribe();

  assert.deepEqual(results.map((r) => r.status), ['rejected', 'rejected']);
  for (const { reason } of results) {
    assert.equal(reason.message, 'Sesi Anda telah berakhir. Silakan masuk kembali.');
    assert.equal(reason.status, 401);
  }
  assert.equal(calls.length, 2); // tidak ada request ulang
  assert.equal(expireCount, 1); // notifikasi tidak dobel
  assert.equal(useAuthStore.getState().token, null);
});

test('A: request bersamaan pada endpoint tamu → masing-masing diulang SEKALI tanpa token, notifikasi sekali', async () => {
  login();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (init.headers.Authorization) {
      await gate;
      return { ok: false, status: 401, json: async () => SESSION_INVALID.body };
    }
    return { ok: true, status: 200, json: async () => ({ data: { lines: [] } }) };
  };

  const both = Promise.all([
    apiClient('/cart', { method: 'POST', body: { items: [] }, allowGuest: true }),
    apiClient('/cart', { method: 'POST', body: { items: [] }, allowGuest: true }),
  ]);
  await new Promise((resolve) => setImmediate(resolve));
  release();
  assert.deepEqual(await both, [{ lines: [] }, { lines: [] }]);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((c) => c.init.headers.Authorization), ['Bearer jwt-lama', 'Bearer jwt-lama', undefined, undefined]);
});

test('A: sesi sudah dihapus request lain → token kosong tidak menghapus apa pun / tidak memicu notifikasi baru', async () => {
  login();
  // Request ini dijawab setelah request lain menghapus sesi DAN notifikasinya sudah ditutup pengguna
  scriptFetch([{
    before: () => {
      useAuthStore.getState().expireSession();
      useAuthStore.getState().dismissSessionNotice();
    },
    ...SESSION_INVALID,
  }]);

  await assert.rejects(apiClient('/me/profile'), { message: 'Sesi Anda telah berakhir. Silakan masuk kembali.' });
  assert.equal(useAuthStore.getState().sessionExpired, false);
  assert.equal(calls.length, 1);
});

test('B1: GET dengan token lama menerima 401 setelah login ulang → diulang sekali dengan token BARU dan berhasil', async () => {
  login();
  scriptFetch([
    { before: relogin('jwt-baru'), ...SESSION_INVALID },
    { status: 200, body: { data: { name: 'Anisa' } } },
  ]);

  assert.deepEqual(await apiClient('/me/profile'), { name: 'Anisa' });
  assert.equal(calls.length, 2);
  assert.equal(authOf(0), 'Bearer jwt-lama');
  assert.equal(authOf(1), 'Bearer jwt-baru');
  assert.equal(useAuthStore.getState().token, 'jwt-baru');
  assert.equal(useAuthStore.getState().sessionExpired, false);
});

test('B3: respons token lama tidak pernah menghapus token lain yang masih aktif (semua jenis endpoint)', async () => {
  const cases = [
    { path: '/me/profile', options: {} },
    { path: '/me/addresses', options: { method: 'POST', body: {} } },
    { path: '/cart', options: { method: 'POST', body: { items: [] }, allowGuest: true } },
  ];

  for (const { path, options } of cases) {
    calls.length = 0;
    login();
    scriptFetch([
      { before: relogin('jwt-baru'), ...SESSION_INVALID },
      { status: 200, body: { data: 'ok' } },
    ]);
    await apiClient(path, options).catch(() => {});
    assert.equal(useAuthStore.getState().token, 'jwt-baru', path);
    assert.equal(localStorage.getItem('ovenco_auth_token'), 'jwt-baru', path);
    assert.equal(useAuthStore.getState().sessionExpired, false, path);
  }
});

test('C: ulangan dengan token baru juga 401 → diproses sekali tanpa ulang lagi; sesi baru (masih aktif) dihapus', async () => {
  login();
  scriptFetch([
    { before: relogin('jwt-baru'), ...SESSION_INVALID },
    { ...SESSION_INVALID }, // token baru juga ditolak (mis. akun dinonaktifkan)
  ]);

  await assert.rejects(apiClient('/me/profile'), { message: 'Sesi Anda telah berakhir. Silakan masuk kembali.' });
  assert.equal(calls.length, 2);
  assert.equal(authOf(1), 'Bearer jwt-baru');
  assert.equal(useAuthStore.getState().token, null);
  assert.equal(useAuthStore.getState().sessionExpired, true);
});

test('C: ulangan gagal tetapi pengguna masuk lagi dengan token ketiga selama ulangan → sesi ketiga tidak dihapus', async () => {
  login();
  scriptFetch([
    { before: relogin('jwt-baru'), ...SESSION_INVALID },
    { before: relogin('jwt-ketiga'), ...SESSION_INVALID },
  ]);

  await assert.rejects(apiClient('/me/profile'), { message: /Sesi akun berubah/ });
  assert.equal(calls.length, 2);
  assert.equal(useAuthStore.getState().token, 'jwt-ketiga');
  assert.equal(useAuthStore.getState().sessionExpired, false);
});

test('C: ulangan gagal dan sesi sudah dihapus request lain selama ulangan → pesan ramah, tanpa notifikasi kedua', async () => {
  login();
  scriptFetch([
    { before: relogin('jwt-baru'), ...SESSION_INVALID },
    {
      before: () => {
        useAuthStore.getState().expireSession(); // request lain lebih dulu menghapus sesi jwt-baru
        useAuthStore.getState().dismissSessionNotice();
      },
      ...SESSION_INVALID,
    },
  ]);

  await assert.rejects(apiClient('/me/profile'), { message: 'Sesi Anda telah berakhir. Silakan masuk kembali.' });
  assert.equal(calls.length, 2);
  assert.equal(useAuthStore.getState().sessionExpired, false);
});

test('C: endpoint tamu dengan sesi berganti → tidak ada ulangan sama sekali (bukan dengan token baru, bukan tanpa token)', async () => {
  login();
  scriptFetch([{ before: relogin('jwt-baru'), ...SESSION_INVALID }]);

  await assert.rejects(
    apiClient('/cart', { method: 'POST', body: { items: [] }, allowGuest: true }),
    { status: 401, code: 'CLIENT_SESSION_CHANGED' }
  );
  assert.equal(calls.length, 1);
});

test('#7: token disimpan & dibaca lewat key yang sama dengan sesi lama di perangkat', async () => {
  const { AUTH_TOKEN_STORAGE_KEY } = await import('../../src/constants/auth.js');
  assert.equal(AUTH_TOKEN_STORAGE_KEY, 'ovenco_auth_token');

  localStorage.setItem('ovenco_auth_token', 'jwt-dari-sesi-lama'); // ditulis versi aplikasi sebelumnya
  responses = [{ status: 200, body: { data: 'ok' } }];
  await apiClient('/me/profile');
  assert.equal(authOf(0), 'Bearer jwt-dari-sesi-lama');
});
