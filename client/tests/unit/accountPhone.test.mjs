// Uji Step 6.6 (CP2d) · SPEC §6 — nomor HP akun (daftar, ubah profil, akun staf) = server: "+62" diikuti 8–13 digit
// setelah spasi, tanda kurung, "-" dihapus. Nomor penerima alamat & WhatsApp toko tetap aturan lama (validatePhone).

import test from 'node:test';
import assert from 'node:assert/strict';

const { validateAccountPhone, normalizeAccountPhone, validatePhone } = await import('../../src/utils/authValidation.js');
const { validateProfileInput, validateAddressInput } = await import('../../src/utils/rules/account.js');
const { validateAdminAccount } = await import('../../src/utils/rules/settings.js');
const { ACCOUNT_PHONE_PATTERN } = await import('../../src/constants/auth.js');

const digits = (n) => '8'.repeat(n);

test('batas digit setelah +62: 7 ditolak, 8 & 13 diterima, 14 ditolak (sama dengan regex server)', () => {
  assert.equal(String(ACCOUNT_PHONE_PATTERN), String(/^\+62\d{8,13}$/));
  assert.notEqual(validateAccountPhone(`+62${digits(7)}`), '');
  assert.equal(validateAccountPhone(`+62${digits(8)}`), '');
  assert.equal(validateAccountPhone(`+62${digits(12)}`), ''); // dulu ditolak client walau sah di server
  assert.equal(validateAccountPhone(`+62${digits(13)}`), '');
  assert.notEqual(validateAccountPhone(`+62${digits(14)}`), '');
});

test('pemisah dinormalisasi seperti server; awalan & isi salah ditolak dengan pesan jelas', () => {
  assert.equal(normalizeAccountPhone(' +62 (812) 3456-7890 '), '+6281234567890');
  assert.equal(validateAccountPhone('+62 812-3456-7890'), '');
  assert.equal(validateAccountPhone(''), 'Nomor HP wajib diisi');
  assert.equal(validateAccountPhone('081234567890'), 'Nomor HP harus diawali +62');
  assert.equal(validateAccountPhone('+62812a4567890'), 'Nomor HP harus +62 diikuti 8–13 angka');
  assert.equal(validateAccountPhone('+62.81234567890'), 'Nomor HP harus +62 diikuti 8–13 angka');
});

test('form profil & akun staf memakai aturan HP akun; alamat & WhatsApp toko TIDAK berubah (aturan server berbeda)', () => {
  const long = `+62${digits(12)}`; // 14 digit total
  assert.equal(validateProfileInput({ name: 'A', email: 'a@b.co', phone: long }).phone, undefined);
  assert.ok(validateProfileInput({ name: 'A', email: 'a@b.co', phone: `+62${digits(7)}` }).phone);
  const staff = { name: 'Dewi', email: 'dewi@oven.co', phone: '+62 812 0000 1111', password: 'rahasia123', role: 'staf' };
  assert.equal(validateAdminAccount(staff, []).phone, undefined);
  assert.equal(validateAdminAccount(staff, [{ email: 'x@y.co', phone: '+62-812-0000-1111' }]).phone, 'Nomor HP sudah terdaftar');
  // Alamat (server address.validator: 9–13 digit total) — perilaku lama dipertahankan
  assert.equal(validatePhone(`+62${digits(7)}`), '');
  assert.notEqual(validatePhone(long), '');
  const address = { label: 'Rumah', recipient_name: 'A', full_address: 'Jl', latitude: -6.2, longitude: 106.8 };
  assert.equal(validateAddressInput({ ...address, recipient_phone: `+62${digits(7)}` }).recipient_phone, undefined);
});
