// Uji authService mode API — Step 6.6 (CP2c/CP2d) · FR-01 · FR-02 · FR-03.
// fetch & localStorage dipalsukan; tidak ada request jaringan nyata.

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
globalThis.fetch = async (url, init) => {
  calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
  const { status, body } = responses.shift();
  return { ok: status >= 200 && status < 300, status, json: async () => body };
};

const { USE_MOCK } = await import('../../src/services/apiClient.js');
const auth = await import('../../src/services/authService.js');
const { GOOGLE_LOGIN_UNAVAILABLE_MESSAGE, GOOGLE_LOGIN_UNAVAILABLE_CODE, OTP_DELIVERY_HINT } = await import('../../src/constants/auth.js');

test.beforeEach(() => { calls.length = 0; responses = []; store.clear(); });

test('mode API aktif di uji ini', () => assert.equal(USE_MOCK, false));

test('CP2c: Google di mode API tidak tersedia & TIDAK mengirim request ke /auth/google', async () => {
  assert.equal(auth.isGoogleLoginAvailable(), false);
  await assert.rejects(auth.loginWithGoogle(), { message: GOOGLE_LOGIN_UNAVAILABLE_MESSAGE, code: GOOGLE_LOGIN_UNAVAILABLE_CODE });
  assert.equal(calls.length, 0);
});

test('CP2c: petunjuk OTP mode API = console server', () => {
  assert.equal(auth.getOtpDeliveryHint(), OTP_DELIVERY_HINT.API);
  assert.match(auth.getOtpDeliveryHint(), /console server/);
});

test('kontrak payload tidak berubah: login identifier, register termsAccepted, forgot email, reset newPassword', async () => {
  const user = { userId: '9', role: 'customer' };
  responses = [
    { status: 200, body: { data: { user, token: 'jwt' } } },
    { status: 201, body: { data: { user, token: 'jwt' } } },
    { status: 200, body: { status: 'success', message: 'Jika email terdaftar, OTP reset kata sandi akan ditampilkan di console server.' } },
    { status: 200, body: { status: 'success', message: 'Kata sandi berhasil diubah.' } },
  ];
  assert.deepEqual(await auth.login('a@b.co', 'rahasia123'), { user, token: 'jwt' });
  await auth.register({ name: 'A', email: 'a@b.co', phone: '+6281234567', password: 'rahasia123', termsAccepted: true });
  const otp = await auth.requestOtp('a@b.co');
  const reset = await auth.verifyOtpAndReset({ email: 'a@b.co', otp: '123456', newPassword: 'baru12345' });

  assert.deepEqual(calls.map((c) => `${c.init.method} ${new URL(c.url).pathname}`), [
    'POST /api/auth/login', 'POST /api/auth/register', 'POST /api/auth/forgot-password', 'POST /api/auth/reset-password',
  ]);
  assert.deepEqual(calls[0].body, { identifier: 'a@b.co', password: 'rahasia123' });
  assert.equal(calls[1].body.termsAccepted, true);
  assert.deepEqual(calls[2].body, { email: 'a@b.co' });
  assert.deepEqual(calls[3].body, { email: 'a@b.co', otp: '123456', newPassword: 'baru12345' });
  assert.match(otp.message, /Jika email terdaftar/);
  assert.equal(reset.message, 'Kata sandi berhasil diubah.');
});

test('pesan gagal login dari server diteruskan apa adanya (401 tanpa membuka status akun)', async () => {
  responses = [{ status: 401, body: { status: 'error', message: 'Email/HP atau kata sandi salah.' } }];
  await assert.rejects(auth.login('x@y.co', 'salah1234'), { status: 401, message: 'Email/HP atau kata sandi salah.' });
});
