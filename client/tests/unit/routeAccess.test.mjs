// Uji Step 6.6 (CP2a) · FR-26 · BR-04 — keputusan guard rute & return path aman (utils/routeAccess, fungsi murni).

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  ACCESS_AREA, AREA_ROLES, ADMIN_PAGE_ROLES, rolesForPath, isPathAllowedForRole, sanitizeReturnTo, postLoginTarget,
  resolveAccessRedirect, loginRouteFor, areaOf,
} = await import('../../src/utils/routeAccess.js');
const { ADMIN_ROUTES } = await import('../../src/constants/routes.js');

const customer = { userId: '1', role: 'customer' };
const staf = { userId: '2', role: 'staf' };
const owner = { userId: '3', role: 'owner' };
const at = (pathname, search = '', hash = '') => ({ pathname, search, hash });

test('tabel peran admin sesuai SPEC §7 (Owner: dashboard, laporan, promo, pengaturan; lainnya Staf & Owner)', () => {
  const ownerOnly = [ADMIN_ROUTES.DASHBOARD, ADMIN_ROUTES.LAPORAN, ADMIN_ROUTES.PROMO, ADMIN_ROUTES.PENGATURAN];
  for (const [path, roles] of Object.entries(ADMIN_PAGE_ROLES)) {
    assert.deepEqual(roles, ownerOnly.includes(path) ? ['owner'] : ['staf', 'owner'], path);
  }
  // CR-04a CP6: + AD-12 Pembelian (/admin/pembelian, Staf & Owner — SPEC §1 peran & §7 layar)
  assert.deepEqual(ADMIN_PAGE_ROLES[ADMIN_ROUTES.PEMBELIAN], ['staf', 'owner']);
  assert.equal(Object.keys(ADMIN_PAGE_ROLES).length, 10);
  assert.deepEqual(AREA_ROLES[ACCESS_AREA.ADMIN], ['staf', 'owner']);
  assert.deepEqual(AREA_ROLES[ACCESS_AREA.CUSTOMER], ['customer']);
});

test('A3: tamu di area admin → /admin/login dengan return path lengkap; di area pelanggan → /masuk', () => {
  assert.deepEqual(
    resolveAccessRedirect({ user: null, roles: ['owner'], area: ACCESS_AREA.ADMIN, location: at('/admin/laporan', '?periode=bulanan', '#tabel') }),
    { to: '/admin/login', state: { returnTo: '/admin/laporan?periode=bulanan#tabel' } },
  );
  assert.deepEqual(
    resolveAccessRedirect({ user: null, roles: ['customer'], area: ACCESS_AREA.CUSTOMER, location: at('/checkout') }),
    { to: '/masuk', state: { returnTo: '/checkout' } },
  );
  assert.equal(loginRouteFor(ACCESS_AREA.ADMIN), '/admin/login');
  assert.equal(areaOf('/admin/stok'), ACCESS_AREA.ADMIN);
  assert.equal(areaOf('/administrasi'), ACCESS_AREA.CUSTOMER);
});

test('A4: Staf & Owner di halaman khusus pelanggan → halaman awal perannya (tanpa return path); pelanggan lolos', () => {
  const guard = (user, path) => resolveAccessRedirect({ user, roles: AREA_ROLES[ACCESS_AREA.CUSTOMER], area: ACCESS_AREA.CUSTOMER, location: at(path) });
  assert.deepEqual(guard(staf, '/akun'), { to: '/admin/pesanan' });
  assert.deepEqual(guard(owner, '/checkout'), { to: '/admin/dashboard' });
  assert.equal(guard(customer, '/akun'), null);
});

test('peran tidak sesuai di admin: pelanggan → Beranda, Staf di halaman Owner → Pesanan; peran sesuai lolos', () => {
  const guard = (user, path, roles) => resolveAccessRedirect({ user, roles, area: ACCESS_AREA.ADMIN, location: at(path) });
  assert.deepEqual(guard(customer, '/admin/pesanan', AREA_ROLES[ACCESS_AREA.ADMIN]), { to: '/' });
  assert.deepEqual(guard(staf, '/admin/dashboard', ADMIN_PAGE_ROLES[ADMIN_ROUTES.DASHBOARD]), { to: '/admin/pesanan' });
  assert.equal(guard(owner, '/admin/dashboard', ADMIN_PAGE_ROLES[ADMIN_ROUTES.DASHBOARD]), null);
  assert.equal(guard(staf, '/admin/pesanan/OVC-261016-001', ADMIN_PAGE_ROLES[ADMIN_ROUTES.PESANAN]), null);
});

test('akses per path: publik untuk semua; khusus pelanggan; admin per peran; path admin tak dikenal & halaman login ditolak', () => {
  for (const path of ['/', '/katalog', '/cari', '/produk/1', '/produk/1/ulasan', '/custom-cake', '/keranjang']) {
    assert.equal(rolesForPath(path), null, path);
    for (const role of ['customer', 'staf', 'owner']) assert.equal(isPathAllowedForRole(path, role), true, `${path} ${role}`);
  }
  for (const path of ['/checkout', '/checkout/pembayaran', '/bayar/OVC-1', '/pesanan-berhasil/OVC-1', '/pesanan', '/pesanan/OVC-1/ulasan',
    '/akun', '/akun/alamat', '/notifikasi']) {
    assert.equal(isPathAllowedForRole(path, 'customer'), true, path);
    assert.equal(isPathAllowedForRole(path, 'staf'), false, path);
    assert.equal(isPathAllowedForRole(path, 'owner'), false, path);
  }
  assert.equal(isPathAllowedForRole('/admin/laporan', 'owner'), true);
  assert.equal(isPathAllowedForRole('/admin/laporan', 'staf'), false);
  assert.equal(isPathAllowedForRole('/admin/stok', 'staf'), true);
  assert.equal(isPathAllowedForRole('/admin/stok', 'customer'), false);
  assert.equal(isPathAllowedForRole('/admin/rahasia', 'owner'), false);
  assert.equal(isPathAllowedForRole('/admin', 'owner'), false);
  for (const path of ['/masuk', '/daftar', '/lupa-sandi', '/onboarding', '/admin/login']) {
    assert.equal(isPathAllowedForRole(path, 'customer'), false, path);
    assert.equal(isPathAllowedForRole(path, 'owner'), false, path);
  }
});

test('return path aman: path internal yang boleh dibuka peran dipertahankan (query & hash ikut)', () => {
  assert.equal(sanitizeReturnTo('/checkout?voucher=HEMAT#ringkasan', 'customer'), '/checkout?voucher=HEMAT#ringkasan');
  assert.equal(sanitizeReturnTo('/admin/laporan?periode=bulanan', 'owner'), '/admin/laporan?periode=bulanan');
  assert.equal(sanitizeReturnTo('/produk/5', 'staf'), '/produk/5');
});

test('open redirect ditolak: URL absolut, protokol-relatif, backslash, skema, karakter kontrol, bukan string, terlalu panjang', () => {
  const attacks = [
    'https://evil.example/akun', '//evil.example/akun', '/\\evil.example', '\\\\evil.example', 'javascript:alert(1)',
    'data:text/html,x', ' /akun', 'akun', '/akun\nLocation: x', '/akun\t', '', null, undefined, 42, { pathname: '/akun' },
    `/${'a'.repeat(3000)}`,
  ];
  for (const value of attacks) assert.equal(sanitizeReturnTo(value, 'customer'), null, JSON.stringify(value));
});

test('return path dinormalisasi lalu diperiksa: traversal ke halaman Owner tidak lolos untuk Staf / pelanggan', () => {
  assert.equal(sanitizeReturnTo('/katalog/../admin/laporan', 'staf'), null);
  assert.equal(sanitizeReturnTo('/katalog/../admin/laporan', 'owner'), '/admin/laporan');
  assert.equal(sanitizeReturnTo('/./akun/../admin/pengaturan', 'customer'), null);
  assert.equal(sanitizeReturnTo('/%2F%2Fevil.example', 'customer'), '/%2F%2Fevil.example'); // tetap path internal
});

test('tujuan setelah login: return path aman, selain itu halaman awal peran', () => {
  assert.equal(postLoginTarget(customer, '/checkout'), '/checkout');
  assert.equal(postLoginTarget(customer, undefined), '/');
  assert.equal(postLoginTarget(customer, '/admin/pesanan'), '/');
  assert.equal(postLoginTarget(staf, '/admin/laporan'), '/admin/pesanan');
  assert.equal(postLoginTarget(staf, '/admin/stok'), '/admin/stok');
  assert.equal(postLoginTarget(staf, '/akun'), '/admin/pesanan');
  assert.equal(postLoginTarget(owner, '/admin/laporan'), '/admin/laporan');
  assert.equal(postLoginTarget(owner, 'https://evil.example'), '/admin/dashboard');
  assert.equal(postLoginTarget(owner, '/admin/login'), '/admin/dashboard');
  assert.equal(postLoginTarget({ role: 'tidak-dikenal' }, '/katalog'), '/katalog');
  assert.equal(postLoginTarget({ role: 'tidak-dikenal' }, '/akun'), '/');
});
