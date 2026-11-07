// Uji Step 6.6 (CP2b) · FR-26 — id pengguna sesi untuk bentuk mock (user_id angka) & API (userId string).
// Dipakai PengaturanPage/AdminAccountsPanel (label "Akun Anda"), AkunPage, BerandaPage, useWishlist.

import test from 'node:test';
import assert from 'node:assert/strict';

const { getSessionUserId, isSameUserId } = await import('../../src/utils/sessionIdentity.js');

test('getSessionUserId membaca user_id (mock) maupun userId (API) sebagai string', () => {
  assert.equal(getSessionUserId({ user_id: 3, role: 'owner' }), '3');
  assert.equal(getSessionUserId({ userId: '3', role: 'owner', isActive: true }), '3');
  assert.equal(getSessionUserId(null), null);
  assert.equal(getSessionUserId({ role: 'owner' }), null);
  assert.equal(getSessionUserId({ userId: 'undefined' }), null);
});

test('isSameUserId: baris akun admin (mock angka / API string) cocok dengan id sesi; id kosong tidak pernah cocok', () => {
  const apiSession = getSessionUserId({ userId: '3', role: 'owner' });
  const mockSession = getSessionUserId({ user_id: 3, role: 'owner' });
  assert.equal(isSameUserId('3', apiSession), true); // baris API toAdminAccount: user_id string
  assert.equal(isSameUserId(3, mockSession), true); // baris mock: user_id angka
  assert.equal(isSameUserId(3, apiSession), true);
  assert.equal(isSameUserId('2', apiSession), false);
  assert.equal(isSameUserId(undefined, undefined), false);
  assert.equal(isSameUserId(null, null), false);
  assert.equal(isSameUserId('', ''), false);
  assert.equal(isSameUserId(Number.NaN, 'NaN'), false);
});
