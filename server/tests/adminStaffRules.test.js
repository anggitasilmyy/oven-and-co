// Uji aturan murni akun staf Step 6.4.10 AD-11 (FR-36 · FR-26 · UC-30): validasi akun baru (HP = aturan registrasi
// server, pesan mock), status aktif (400 akun sendiri, 409 Owner aktif terakhir, 404, idempoten), respons tanpa data sensitif.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeAdminAccount, validateAdminAccount, adminAccountStatusError, actorStatusError, toAdminAccount, compareAdminAccounts,
  STAFF_MESSAGES: M,
} = require('../src/services/adminStaffRules.service');

const FORM = { name: ' Dewi Staf ', email: ' Dewi@Demo.COM ', phone: '+62 812-3456-7899', password: 'rahasia123', role: 'staf' };

test('akun baru: normalisasi (trim, email huruf kecil, HP seperti registrasi) dan sah untuk Staf & Owner', () => {
  const a = normalizeAdminAccount(FORM);
  assert.deepEqual(a, { name: 'Dewi Staf', email: 'dewi@demo.com', phone: '+6281234567899', password: 'rahasia123', role: 'staf' });
  assert.deepEqual(validateAdminAccount(a), {});
  assert.deepEqual(validateAdminAccount({ ...a, role: 'owner' }), {});
});

test('akun baru: wajib isi & format (pesan mock)', () => {
  assert.deepEqual(validateAdminAccount(normalizeAdminAccount({})), {
    name: 'Nama wajib diisi', email: 'Email wajib diisi', phone: 'Nomor HP wajib diisi', password: 'Kata sandi wajib diisi', role: 'Pilih peran akun',
  });
  const errors = validateAdminAccount(normalizeAdminAccount({ name: 'x'.repeat(101), email: 'bukan-email', phone: '0812345678', password: 'pendek', role: 'customer' }));
  assert.deepEqual(errors, {
    name: 'Nama maksimal 100 karakter', email: 'Format email tidak valid', phone: 'Nomor HP harus diawali +62',
    password: 'Kata sandi minimal 8 karakter', role: 'Pilih peran akun',
  });
  const longEmail = `${'a'.repeat(140)}@demo.co.id`;
  assert.equal(validateAdminAccount(normalizeAdminAccount({ ...FORM, email: longEmail })).email, 'Email maksimal 150 karakter');
});

test('akun baru: HP mengikuti aturan registrasi server (+62 lalu 8–13 digit), bukan aturan mock 9–13 digit total', () => {
  const phone = (v) => validateAdminAccount(normalizeAdminAccount({ ...FORM, phone: v })).phone;
  assert.equal(phone('+6281234567'), undefined); // 8 digit setelah +62
  assert.equal(phone('+620812345678901'), undefined); // 13 digit setelah +62
  assert.equal(phone('+628123456'), 'Nomor HP tidak valid'); // 9 digit total: sah di mock, ditolak registrasi server
  assert.equal(phone('+6208123456789012'), 'Nomor HP tidak valid');
  assert.equal(phone('+62812abc5678'), 'Nomor HP tidak valid');
});

test('akun baru: kata sandi maks. 72 byte (bcrypt); email/HP sudah dipakai pengguna mana pun', () => {
  const a = normalizeAdminAccount(FORM);
  assert.equal(validateAdminAccount({ ...a, password: 'é'.repeat(36) }).password, undefined); // 72 byte
  assert.equal(validateAdminAccount({ ...a, password: 'é'.repeat(37) }).password, 'Kata sandi terlalu panjang');
  assert.deepEqual(validateAdminAccount(a, { emailTaken: true, phoneTaken: true }), { email: 'Email sudah terdaftar', phone: 'Nomor HP sudah terdaftar' });
});

const acc = (id, role, isActive = true) => ({ user_id: String(id), role, is_active: isActive });

test('status akun: 404 bukan akun admin, 400 akun sendiri, 409 Owner aktif terakhir, idempoten', () => {
  const ctx = { currentUserId: '4', activeOwnerIds: ['4'] };
  assert.deepEqual(adminAccountStatusError(null, false, ctx), { statusCode: 404, message: M.NOT_FOUND });
  assert.deepEqual(adminAccountStatusError(acc(1, 'customer'), true, ctx), { statusCode: 404, message: M.NOT_FOUND });
  assert.deepEqual(adminAccountStatusError(acc(4, 'owner'), false, ctx), { statusCode: 400, message: M.SELF });
  assert.equal(adminAccountStatusError(acc(3, 'staf'), false, ctx), null);
  assert.equal(adminAccountStatusError(acc(3, 'staf', false), true, ctx), null); // aktifkan
  assert.equal(adminAccountStatusError(acc(3, 'staf'), true, ctx), null); // sudah aktif → tanpa perubahan

  // Owner lain yang aktif dinonaktifkan oleh Owner yang (sudah) tidak tercatat aktif → tidak boleh 0 Owner aktif
  assert.deepEqual(adminAccountStatusError(acc(5, 'owner'), false, { currentUserId: '4', activeOwnerIds: ['5'] }), { statusCode: 409, message: M.LAST_OWNER });
  assert.equal(adminAccountStatusError(acc(5, 'owner'), false, { currentUserId: '4', activeOwnerIds: ['4', '5'] }), null);
  assert.equal(adminAccountStatusError(acc(5, 'owner', false), false, { currentUserId: '4', activeOwnerIds: [] }), null); // sudah nonaktif
  assert.equal(adminAccountStatusError(acc(4, 'owner'), true, ctx), null); // aktifkan diri sendiri = tanpa perubahan
});

test('respons akun: whitelist tanpa password_hash/google_id; urutan Owner → Staf, nama, id', () => {
  const row = {
    userId: 12n, name: 'Dewi', email: 'dewi@demo.com', phone: '+6281234567899', role: 'staf', isActive: true,
    createdAt: new Date('2026-10-31T01:02:03.000Z'), passwordHash: '$2b$12$rahasia', googleId: 'g-1',
  };
  const view = toAdminAccount(row);
  assert.deepEqual(view, {
    user_id: '12', name: 'Dewi', email: 'dewi@demo.com', phone: '+6281234567899', role: 'staf', is_active: true, created_at: '2026-10-31T01:02:03.000Z',
  });
  assert.ok(!JSON.stringify(view).includes('rahasia'));
  const rows = [
    { user_id: '10', role: 'staf', name: 'Budi' }, { user_id: '3', role: 'owner', name: 'Citra' },
    { user_id: '9', role: 'staf', name: 'Budi' }, { user_id: '2', role: 'staf', name: 'Andi' },
  ];
  assert.deepEqual([...rows].sort(compareAdminAccounts).map((r) => r.user_id), ['3', '2', '9', '10']);
});

test('pelaku dicek ulang setelah kunci (C3 D2): tidak ada / nonaktif → 401 SESSION_INVALID, bukan Owner → 403', () => {
  const session = { statusCode: 401, message: M.ACTOR_INACTIVE, apiCode: 'SESSION_INVALID' };
  assert.deepEqual(actorStatusError(null), session);
  assert.deepEqual(actorStatusError({ role: 'owner', is_active: false }), session);
  assert.deepEqual(actorStatusError({ role: 'staf', is_active: true }), { statusCode: 403, message: M.ACTOR_NOT_OWNER });
  assert.deepEqual(actorStatusError({ role: 'customer', is_active: true }), { statusCode: 403, message: M.ACTOR_NOT_OWNER });
  assert.equal(actorStatusError({ role: 'owner', is_active: true }), null);
  assert.equal(M.ACTOR_INACTIVE, 'Akun tidak ditemukan atau tidak aktif.'); // pesan sama dengan middleware auth
});
