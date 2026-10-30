// Regresi tingkat HTTP: /api/me/addresses (FR-24 · BR-12 · UC-16 · C-22) — auth, peran, validasi, alamat utama
// tunggal, isolasi antar-pelanggan, alamat yang dirujuk pesanan, bentuk respons sesuai client
// services/addressService.js, dan error database. Prisma dipalsukan (tabel addresses di memori; transaksi
// dibatalkan bila gagal); server Express dijalankan di port acak lalu ditutup.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { matchesWhere } = require('./helpers/whereMatch');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

const users = {
  1: { userId: 1n, role: 'customer', isActive: true },
  2: { userId: 2n, role: 'customer', isActive: true },
  3: { userId: 3n, role: 'staf', isActive: true },
  4: { userId: 4n, role: 'owner', isActive: true },
  5: { userId: 5n, role: 'customer', isActive: false },
  6: { userId: 6n, role: 'customer', isActive: true },
};

const STORE = { lat: -6.2, lng: 106.8 };

const storeRowDefault = {
  settingId: 1, storeName: 'Oven & Co.', address: 'Jl. Toko No. 1', latitude: String(STORE.lat), longitude: String(STORE.lng),
  whatsappNumber: null, preorderCutoffTime: null, deliveryRadiusKm: '10.00', deliveryFeePerKm: '2500.00',
  paymentTimeoutMinutes: 30, earnAmountPerPoint: '1000.00', redeemPointsUnit: 100, redeemValue: '5000.00',
  goldMinPoints: 500, platinumMinPoints: 2000, reviewBonusPoints: 20,
};

const row = (addressId, userId, overrides = {}) => ({
  addressId: BigInt(addressId), userId: BigInt(userId), label: `Alamat ${addressId}`, recipientName: 'Penerima',
  recipientPhone: '+6281234567890', fullAddress: 'Jl. Contoh', latitude: String(STORE.lat + 0.01),
  longitude: String(STORE.lng), courierNote: null, isPrimary: false, ...overrides,
});

let addresses;
let ordersAddressIds;
let nextId;
let storeRow;
let locks;
let failOn;

const sortBy = (rows, orderBy = []) =>
  [...rows].sort((a, b) => {
    for (const clause of [].concat(orderBy)) {
      const [field, dir] = Object.entries(clause)[0];
      const [x, y] = [Number(a[field]), Number(b[field])];
      if (x !== y) return dir === 'asc' ? x - y : y - x;
    }
    return 0;
  });

const pick = (item, select) => (select ? Object.fromEntries(Object.keys(select).map((key) => [key, item[key]])) : { ...item });
const maybeFail = (op) => {
  if (failOn === op) throw Object.assign(new Error('Can\'t reach database server'), { code: 'P1001' });
  if (failOn === `${op}:P2003`) throw Object.assign(new Error('Foreign key constraint failed'), { code: 'P2003' });
};

fakePrisma.user = { findUnique: async ({ where }) => users[String(where.userId)] ?? null };
fakePrisma.storeSetting = { findFirst: async () => storeRow };
fakePrisma.order = { count: async ({ where }) => ordersAddressIds.filter((id) => id === where.addressId).length };
fakePrisma.address = {
  findMany: async ({ where, orderBy }) => {
    maybeFail('findMany');
    return sortBy(addresses.filter((a) => matchesWhere(a, where)), orderBy).map((a) => ({ ...a }));
  },
  findFirst: async ({ where, orderBy, select }) => {
    const found = sortBy(addresses.filter((a) => matchesWhere(a, where)), orderBy)[0];
    return found ? pick(found, select) : null;
  },
  create: async ({ data, select }) => {
    maybeFail('create');
    const created = { ...data, addressId: BigInt(nextId++), latitude: String(data.latitude), longitude: String(data.longitude) };
    addresses.push(created);
    return pick(created, select);
  },
  update: async ({ where, data }) => {
    const target = addresses.find((a) => a.addressId === where.addressId);
    if (!target) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
    Object.assign(target, data);
    return { ...target };
  },
  updateMany: async ({ where, data }) => {
    const targets = addresses.filter((a) => matchesWhere(a, where));
    targets.forEach((a) => Object.assign(a, data));
    return { count: targets.length };
  },
  delete: async ({ where }) => {
    maybeFail('delete');
    addresses = addresses.filter((a) => a.addressId !== where.addressId);
  },
};
fakePrisma.$queryRaw = async (strings, ...values) => {
  locks.push({ sql: strings.join('?'), values });
  return [];
};
// Transaksi interaktif: isi tabel dikembalikan bila callback gagal (meniru rollback)
fakePrisma.$transaction = async (callback) => {
  const snapshot = addresses.map((a) => ({ ...a }));
  try {
    return await callback(fakePrisma);
  } catch (error) {
    addresses = snapshot;
    throw error;
  }
};

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/me/addresses`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test.beforeEach(() => {
  storeRow = { ...storeRowDefault };
  addresses = [
    row(10, 1, { label: 'Kantor' }),
    row(11, 1, { label: 'Rumah', isPrimary: true }),
    row(12, 1, { label: 'Kos Jauh', latitude: String(STORE.lat + 0.5) }), // ±55 km → di luar radius 10 km
    row(20, 2, { label: 'Rumah B', isPrimary: true }),
  ];
  ordersAddressIds = [];
  nextId = 100;
  locks = [];
  failOn = null;
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });

const call = async (method, path = '', token, body) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json() };
};

const validInput = (overrides = {}) => ({
  label: '  Rumah Baru ', recipient_name: ' Ana ', recipient_phone: '+62 812 3456 7890',
  full_address: ' Jl. Melati No. 5 ', latitude: STORE.lat + 0.02, longitude: STORE.lng, courier_note: '   ',
  is_primary: false, ...overrides,
});

const primaryIdsOf = (userId) => addresses.filter((a) => a.userId === BigInt(userId) && a.isPrimary).map((a) => String(a.addressId));
const snapshotOf = () => JSON.stringify(addresses, (key, value) => (typeof value === 'bigint' ? String(value) : value));

const ENDPOINTS = [['GET', ''], ['POST', ''], ['PUT', '/10'], ['PATCH', '/10/primary'], ['DELETE', '/10']];

test('tamu (tanpa token) → 401 di kelima endpoint, bukan 404', async () => {
  for (const [method, path] of ENDPOINTS) {
    const { status, json } = await call(method, path, null, method === 'GET' ? undefined : validInput());
    assert.equal(status, 401, `${method} ${path}`);
    assert.equal(json.message, 'Autentikasi diperlukan.');
  }
  assert.equal(locks.length, 0);
});

test('token rusak, kedaluwarsa, salah secret, dan akun nonaktif → 401 SESSION_INVALID', async () => {
  const expired = jwt.sign({ sub: '1', exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
  const wrongSecret = jwt.sign({ sub: '1' }, 'secret-lain', { algorithm: 'HS256' });

  for (const [method, path] of ENDPOINTS) {
    for (const token of ['token-palsu', expired, wrongSecret, tokenFor('5')]) {
      const { status, json } = await call(method, path, token, method === 'GET' ? undefined : validInput());
      assert.equal(status, 401, `${method} ${path}`);
      assert.equal(json.code, 'SESSION_INVALID');
    }
  }
});

test('staf dan owner → 403 tanpa kode sesi, data tidak berubah', async () => {
  const before = snapshotOf();
  for (const [method, path] of ENDPOINTS) {
    for (const sub of ['3', '4']) {
      const { status, json } = await call(method, path, tokenFor(sub), method === 'GET' ? undefined : validInput());
      assert.equal(status, 403, `${method} ${path}`);
      assert.equal(json.code, undefined);
    }
  }
  assert.equal(snapshotOf(), before);
});

test('GET: pelanggan tanpa alamat → addresses [] beserta data toko & pengaturan', async () => {
  const { status, json } = await call('GET', '', tokenFor('6'));

  assert.equal(status, 200);
  assert.deepEqual(json.data.addresses, []);
  assert.deepEqual(json.data.store, { name: 'Oven & Co.', address: 'Jl. Toko No. 1', latitude: STORE.lat, longitude: STORE.lng });
  assert.equal(json.data.settings.delivery_radius_km, 10);
  assert.equal(json.data.settings.delivery_fee_per_km, 2500);
});

test('GET: utama dulu lalu id terkecil, id string, jarak & status radius (BR-12), hanya milik sendiri', async () => {
  const { json } = await call('GET', '?userId=2', tokenFor('1'));
  const list = json.data.addresses;

  assert.deepEqual(list.map((a) => a.address_id), ['11', '10', '12']);
  assert.ok(list.every((a) => a.user_id === '1'));
  assert.deepEqual(Object.keys(list[0]).sort(), [
    'address_id', 'courier_note', 'distance', 'fee', 'full_address', 'is_primary', 'label', 'latitude', 'longitude',
    'recipient_name', 'recipient_phone', 'user_id', 'withinRadius',
  ]);
  assert.equal(list[0].is_primary, true);
  assert.equal(typeof list[0].latitude, 'number');
  assert.equal(list[0].withinRadius, true);
  assert.equal(list[0].fee, Math.ceil(list[0].distance) * 2500);
  assert.equal(list[2].withinRadius, false);
  assert.equal(list[2].fee, 0);
});

test('POST: alamat pertama otomatis utama; isian dinormalisasi; pemilik dari token, bukan body', async () => {
  const { status, json } = await call('POST', '', tokenFor('6'), validInput({ user_id: '2', address_id: '11', is_primary: false }));

  assert.equal(status, 201);
  assert.deepEqual(json, { status: 'success', data: { address_id: '100' } });

  const saved = addresses.find((a) => a.addressId === 100n);
  assert.equal(saved.userId, 6n);
  assert.equal(saved.isPrimary, true);
  assert.equal(saved.label, 'Rumah Baru');
  assert.equal(saved.recipientName, 'Ana');
  assert.equal(saved.recipientPhone, '+6281234567890');
  assert.equal(saved.fullAddress, 'Jl. Melati No. 5');
  assert.equal(saved.courierNote, null);
  assert.equal(addresses.find((a) => a.addressId === 11n).label, 'Rumah'); // address_id di body diabaikan
  assert.deepEqual(locks.map((lock) => lock.values), [[6n]]);
  assert.match(locks[0].sql, /FOR UPDATE/);
});

test('POST: alamat berikutnya tidak utama, kecuali is_primary true → satu-satunya utama', async () => {
  await call('POST', '', tokenFor('1'), validInput());
  assert.deepEqual(primaryIdsOf(1), ['11']);

  await call('POST', '', tokenFor('1'), validInput({ is_primary: true }));
  assert.deepEqual(primaryIdsOf(1), ['101']);
  assert.deepEqual(primaryIdsOf(2), ['20']); // pelanggan lain tidak tersentuh
});

test('POST/PUT: isian tidak valid → 400 dengan pesan Indonesia, tidak ada yang tersimpan', async () => {
  const cases = [
    [validInput({ label: '  ' }), 'Label alamat wajib diisi.'],
    [validInput({ label: 'x'.repeat(31) }), 'Label maksimal 30 karakter.'],
    [validInput({ recipient_name: undefined }), 'Nama penerima wajib diisi.'],
    [validInput({ recipient_phone: '081234567890' }), 'Nomor HP harus diawali +62.'],
    [validInput({ recipient_phone: '+62123' }), 'Nomor HP tidak valid.'],
    [validInput({ full_address: '' }), 'Alamat lengkap wajib diisi.'],
    [validInput({ latitude: null }), 'Tentukan titik lokasi di peta.'],
    [validInput({ longitude: 'abc' }), 'Tentukan titik lokasi di peta.'],
    [validInput({ latitude: 95 }), 'Tentukan titik lokasi di peta.'],
    [validInput({ courier_note: 'x'.repeat(256) }), 'Catatan kurir maksimal 255 karakter.'],
    [validInput({ is_primary: 'ya' }), 'is_primary tidak valid.'],
    [[], 'Data alamat tidak valid.'],
  ];
  const before = snapshotOf();

  for (const [body, message] of cases) {
    for (const [method, path] of [['POST', ''], ['PUT', '/10']]) {
      const { status, json } = await call(method, path, tokenFor('1'), body);
      assert.equal(status, 400, `${method} ${message}`);
      assert.equal(json.message, message);
    }
  }
  assert.equal(snapshotOf(), before);
  assert.equal(locks.length, 0);
});

test('PUT: mengubah alamat sendiri; is_primary false tidak mencabut utama, true memindahkan utama', async () => {
  const first = await call('PUT', '/11', tokenFor('1'), validInput({ label: 'Rumah Ibu', is_primary: false }));
  assert.deepEqual(first, { status: 200, json: { status: 'success', data: { address_id: '11' } } });
  assert.equal(addresses.find((a) => a.addressId === 11n).label, 'Rumah Ibu');
  assert.deepEqual(primaryIdsOf(1), ['11']);

  await call('PUT', '/12', tokenFor('1'), validInput({ is_primary: true }));
  assert.deepEqual(primaryIdsOf(1), ['12']);
});

test('PATCH /:id/primary: alamat menjadi satu-satunya utama', async () => {
  const { status, json } = await call('PATCH', '/10/primary', tokenFor('1'));

  assert.equal(status, 200);
  assert.deepEqual(json.data, { address_id: '10' });
  assert.deepEqual(primaryIdsOf(1), ['10']);
  assert.deepEqual(primaryIdsOf(2), ['20']);
});

test('isolasi: alamat pelanggan lain → 404 untuk ubah, jadikan utama, dan hapus; data tidak berubah', async () => {
  const before = snapshotOf();

  for (const [method, path, body] of [['PUT', '/20', validInput()], ['PATCH', '/20/primary'], ['DELETE', '/20'], ['DELETE', '/999']]) {
    const { status, json } = await call(method, path, tokenFor('1'), body);
    assert.equal(status, 404, `${method} ${path}`);
    assert.equal(json.message, 'Alamat tidak ditemukan.');
  }
  assert.equal(snapshotOf(), before);
});

test('id alamat tidak valid → 400 INVALID_ID', async () => {
  for (const [method, path, body] of [['PUT', '/abc', validInput()], ['PATCH', '/0/primary'], ['DELETE', '/-1']]) {
    const { status, json } = await call(method, path, tokenFor('1'), body);
    assert.equal(status, 400, `${method} ${path}`);
    assert.equal(json.code, 'INVALID_ID');
  }
});

test('DELETE: hapus alamat biasa; hapus alamat utama → id terkecil yang tersisa jadi utama; hapus terakhir → kosong', async () => {
  assert.deepEqual((await call('DELETE', '/12', tokenFor('1'))).json, { status: 'success', data: { address_id: '12' } });
  assert.deepEqual(primaryIdsOf(1), ['11']);

  await call('DELETE', '/11', tokenFor('1'));
  assert.deepEqual(primaryIdsOf(1), ['10']);

  await call('DELETE', '/10', tokenFor('1'));
  assert.deepEqual((await call('GET', '', tokenFor('1'))).json.data.addresses, []);
  assert.deepEqual(primaryIdsOf(2), ['20']);
});

test('DELETE: alamat yang dirujuk pesanan → 409 dan tetap ada (FK RESTRICT, rujukan pesanan tidak dikosongkan)', async () => {
  ordersAddressIds = [11n];
  const before = snapshotOf();

  const { status, json } = await call('DELETE', '/11', tokenFor('1'));

  assert.equal(status, 409);
  assert.match(json.message, /sudah dipakai pada pesanan/);
  assert.equal(snapshotOf(), before);
});

test('DELETE: pesanan dibuat di sela pengecekan (FK P2003) → 409, bukan 500', async () => {
  failOn = 'delete:P2003';

  const { status, json } = await call('DELETE', '/10', tokenFor('1'));

  assert.equal(status, 409);
  assert.match(json.message, /sudah dipakai pada pesanan/);
  assert.ok(addresses.some((a) => a.addressId === 10n));
});

test('error database → 500 dengan pesan umum; transaksi yang gagal tidak meninggalkan perubahan', async (t) => {
  t.mock.method(console, 'error', () => {});

  failOn = 'findMany';
  assert.deepEqual(await call('GET', '', tokenFor('1')), {
    status: 500, json: { status: 'error', message: 'Terjadi kesalahan pada server.' },
  });

  failOn = 'create';
  const before = snapshotOf();
  assert.equal((await call('POST', '', tokenFor('1'), validInput({ is_primary: true }))).status, 500);
  assert.equal(snapshotOf(), before);

  failOn = 'delete';
  assert.equal((await call('DELETE', '/11', tokenFor('1'))).status, 500);
  assert.equal(snapshotOf(), before);
});

test('GET: store_settings kosong → 500, tidak memakai nilai karangan', async (t) => {
  t.mock.method(console, 'error', () => {});
  storeRow = null;

  const { status, json } = await call('GET', '', tokenFor('1'));

  assert.equal(status, 500);
  assert.equal(json.data, undefined);
});
