// Uji authService mode mock — Step 6.6 (CP2c/CP2d) · FR-01 – FR-03 · SPEC §6.
// Jalur asli apiClient (USE_MOCK = true) → mockHandler; fetch tidak pernah dipanggil. Akun demo & alur mock tetap.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register as registerHook } from 'node:module';

registerHook('./mock-env-loader.mjs', import.meta.url);

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
  key: (index) => [...store.keys()][index] ?? null,
  get length() { return store.size; },
};
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls += 1; throw new Error('mode mock tidak boleh memanggil fetch'); };
const logged = [];
const originalLog = console.log;
console.log = (...args) => { logged.push(args.join(' ')); };

const { USE_MOCK } = await import('../../src/services/apiClient.js');
const auth = await import('../../src/services/authService.js');
const { getMockUsers, saveMockUsers } = await import('../../src/services/mock/users.js');
const { AUTH_MESSAGE, OTP_DELIVERY_HINT } = await import('../../src/constants/auth.js');

test.beforeEach(() => { store.clear(); logged.length = 0; fetchCalls = 0; });
test.after(() => { console.log = originalLog; });

const otpFromConsole = () => logged.map((l) => l.match(/Kode OTP: (\d{6})/)?.[1]).filter(Boolean).at(-1);

test('mode mock aktif; Google tetap masuk sebagai pelanggan demo (alur mock tidak berubah)', async () => {
  assert.equal(USE_MOCK, true);
  assert.equal(auth.isGoogleLoginAvailable(), true);
  assert.equal(auth.getOtpDeliveryHint(), OTP_DELIVERY_HINT.MOCK);
  const { user, token } = await auth.loginWithGoogle();
  assert.equal(user.email, 'pelanggan@demo.com');
  assert.match(token, /^mock_token_google_/);
  assert.equal(fetchCalls, 0);
});

test('akun demo tetap bisa masuk (email & HP) dan password tidak ikut dikembalikan', async () => {
  for (const id of ['pelanggan@demo.com', 'staf@demo.com', 'owner@demo.com', '+6281234567890']) {
    const { user } = await auth.login(id, 'demo1234');
    assert.ok(user.role, id);
    assert.equal(user.password, undefined, id);
  }
});

test('A7: akun tidak ada, sandi salah, dan akun nonaktif → pesan login yang SAMA dengan API', async () => {
  await assert.rejects(auth.login('tidakada@demo.com', 'demo1234'), { message: AUTH_MESSAGE.LOGIN_FAILED });
  await assert.rejects(auth.login('pelanggan@demo.com', 'salah-sandi'), { message: AUTH_MESSAGE.LOGIN_FAILED });
  saveMockUsers(getMockUsers().map((u) => (u.email === 'staf@demo.com' ? { ...u, is_active: false } : u)));
  await assert.rejects(auth.login('staf@demo.com', 'demo1234'), { message: AUTH_MESSAGE.LOGIN_FAILED });
  assert.equal(AUTH_MESSAGE.LOGIN_FAILED, 'Email/HP atau kata sandi salah.');
});

test('A7: registrasi dengan email ATAU HP terpakai → satu pesan (sama dengan API 409)', async () => {
  const base = { name: 'Uji', password: 'rahasia123', termsAccepted: true };
  await assert.rejects(auth.register({ ...base, email: 'pelanggan@demo.com', phone: '+628111111111' }), { message: AUTH_MESSAGE.ALREADY_REGISTERED });
  await assert.rejects(auth.register({ ...base, email: 'baru@demo.com', phone: '+6281234567890' }), { message: AUTH_MESSAGE.ALREADY_REGISTERED });
  const { user } = await auth.register({ ...base, email: 'baru@demo.com', phone: '+628111111111' });
  assert.equal(user.role, 'customer');
});

test('A7: lupa sandi — pesan sama untuk email terdaftar & tidak; OTP hanya dibuat untuk akun yang ada', async () => {
  const unknown = await auth.requestOtp('tidakada@demo.com');
  assert.equal(otpFromConsole(), undefined);
  const known = await auth.requestOtp('pelanggan@demo.com');
  assert.equal(unknown.message, known.message);
  assert.equal(known.message, AUTH_MESSAGE.OTP_REQUESTED_MOCK);
  assert.ok(otpFromConsole());
  await assert.rejects(auth.requestOtp('bukan-email'), { message: AUTH_MESSAGE.INVALID_EMAIL });
});

test('A7: reset sandi — OTP salah / email tak terdaftar → pesan sama; OTP benar sekali pakai; sandi baru berlaku', async () => {
  await auth.requestOtp('pelanggan@demo.com');
  const otp = otpFromConsole();
  const wrong = otp === '000000' ? '111111' : '000000';
  await assert.rejects(auth.verifyOtpAndReset({ email: 'pelanggan@demo.com', otp: wrong, newPassword: 'baru12345' }), { message: AUTH_MESSAGE.OTP_INVALID });
  await assert.rejects(auth.verifyOtpAndReset({ email: 'tidakada@demo.com', otp, newPassword: 'baru12345' }), { message: AUTH_MESSAGE.OTP_INVALID });
  assert.deepEqual(await auth.verifyOtpAndReset({ email: 'pelanggan@demo.com', otp, newPassword: 'baru12345' }), { message: AUTH_MESSAGE.PASSWORD_CHANGED });
  await assert.rejects(auth.verifyOtpAndReset({ email: 'pelanggan@demo.com', otp, newPassword: 'lagi12345' }), { message: AUTH_MESSAGE.OTP_INVALID });
  assert.ok((await auth.login('pelanggan@demo.com', 'baru12345')).token);
  assert.equal(fetchCalls, 0);
});

// ── Step 6.6 (CP2) · masa berlaku OTP mock = server (10 menit, sah hanya selama expiresAt > sekarang) ──────────────

const { OTP_VALID_MINUTES } = await import('../../src/constants/auth.js');
const OTP_TTL_MS = 10 * 60 * 1000;
const T0 = Date.parse('2026-11-06T10:00:00.000Z');
const realNow = Date.now;
/** Jam palsu khusus Date.now (setTimeout latensi mock tetap jam asli) */
const atTime = (ms) => { Date.now = () => ms; };

async function freshOtpAt(time, email = 'pelanggan@demo.com') {
  atTime(time);
  await auth.requestOtp(email);
  return otpFromConsole();
}
const resetWith = (otp, newPassword = 'baru12345') => auth.verifyOtpAndReset({ email: 'pelanggan@demo.com', otp, newPassword });

test('masa berlaku OTP = 10 menit (sama dengan server) dan expires_at tersimpan = waktu permintaan + 10 menit', async (t) => {
  t.after(() => { Date.now = realNow; });
  assert.equal(OTP_VALID_MINUTES, 10);
  await freshOtpAt(T0);
  const record = JSON.parse(store.get('ovenco_mock_otp_pelanggan@demo.com'));
  assert.equal(record.expires_at, T0 + OTP_TTL_MS);
});

test('OTP masih sah 1 ms sebelum kedaluwarsa (juga setelah 5 menit — batas lama mock)', async (t) => {
  t.after(() => { Date.now = realNow; });
  let otp = await freshOtpAt(T0);
  atTime(T0 + 5 * 60 * 1000 + 1); // lewat batas lama 5 menit
  assert.deepEqual(await resetWith(otp), { message: AUTH_MESSAGE.PASSWORD_CHANGED });
  otp = await freshOtpAt(T0);
  atTime(T0 + OTP_TTL_MS - 1);
  assert.deepEqual(await resetWith(otp, 'lagi12345'), { message: AUTH_MESSAGE.PASSWORD_CHANGED });
});

test('OTP ditolak TEPAT di waktu kedaluwarsa dan sesudahnya (server: expiresAt > now)', async (t) => {
  t.after(() => { Date.now = realNow; });
  const otp = await freshOtpAt(T0);
  atTime(T0 + OTP_TTL_MS);
  await assert.rejects(resetWith(otp), { message: AUTH_MESSAGE.OTP_INVALID });
  atTime(T0 + OTP_TTL_MS + 1);
  await assert.rejects(resetWith(otp), { message: AUTH_MESSAGE.OTP_INVALID });
  // Sandi lama tetap berlaku karena reset gagal
  assert.ok((await auth.login('pelanggan@demo.com', 'demo1234')).token);
});

test('OTP yang sudah dipakai ditolak walau masih dalam masa berlaku', async (t) => {
  t.after(() => { Date.now = realNow; });
  const otp = await freshOtpAt(T0);
  atTime(T0 + 60 * 1000);
  await resetWith(otp);
  atTime(T0 + 2 * 60 * 1000);
  await assert.rejects(resetWith(otp, 'lagi12345'), { message: AUTH_MESSAGE.OTP_INVALID });
});

test('permintaan OTP baru menggantikan OTP lama yang belum dipakai; masa berlaku dihitung dari permintaan baru', async (t) => {
  t.after(() => { Date.now = realNow; });
  const first = await freshOtpAt(T0);
  let second = await freshOtpAt(T0 + 60 * 1000);
  while (second === first) second = await freshOtpAt(T0 + 60 * 1000); // OTP acak bisa sama (peluang 1/900.000)
  atTime(T0 + 2 * 60 * 1000);
  await assert.rejects(resetWith(first), { message: AUTH_MESSAGE.OTP_INVALID });
  // Lewat 10 menit dari permintaan PERTAMA, masih dalam 10 menit dari permintaan kedua → sah
  atTime(T0 + OTP_TTL_MS + 30 * 1000);
  assert.deepEqual(await resetWith(second), { message: AUTH_MESSAGE.PASSWORD_CHANGED });
});
