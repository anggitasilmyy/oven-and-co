// Regresi re-review d11ebcb (A3): foto referensi ditulis DI LUAR transaksi Prisma, dihapus bila validasi data server /
// penyimpanan gagal, dan kegagalan pembersihan tidak menutupi error utama.
// Prisma & penyimpanan file dipalsukan — tidak ada MySQL, tidak ada file nyata.

const test = require('node:test');
const assert = require('node:assert/strict');
const fakePrisma = require('./helpers/fakePrisma');

process.env.JWT_SECRET = 'test-jwt-secret-only';

const events = [];
let deleteFails = false;

const storagePath = require.resolve('../src/utils/referencePhotoStorage');
const realStorage = require(storagePath);
require.cache[storagePath].exports = {
  ...realStorage,
  saveReferencePhoto: async () => {
    events.push('save');
    return '/uploads/custom-cakes/0123456789abcdef0123456789abcdef.jpg';
  },
  deleteReferencePhoto: async (url) => {
    events.push(`delete:${url}`);
    if (deleteFails) throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
  },
};

const { createCustomCakeDesign } = require('../src/services/customCakeDesign.service');

let createError = null;
let activeOptions = [
  { optionId: 1, optionGroup: 'ukuran', extraPrice: 0 },
  { optionId: 5, optionGroup: 'bentuk', extraPrice: 0 },
  { optionId: 9, optionGroup: 'rasa', extraPrice: 0 },
  { optionId: 13, optionGroup: 'krim_topping', extraPrice: 0 },
];
const saved = [];

fakePrisma.$transaction = async (callback) => {
  events.push('transaction:start');
  try {
    return await callback({
      product: {
        findFirst: async () => ({ productId: 6n, price: 450000, availabilityType: 'custom', leadTimeDays: 3 }),
      },
      customOption: { findMany: async () => activeOptions },
      customCakeDesign: {
        create: async ({ data }) => {
          if (createError) throw createError;
          saved.push(data);
          return { designId: 1000001n, price: data.price };
        },
      },
      customCakeDesignOption: { createMany: async () => ({ count: 4 }) },
    });
  } finally {
    events.push('transaction:end');
  }
};

const NOW = new Date('2026-10-22T03:00:00.000Z'); // 22 Okt 10.00 WIB → H+3 = 25 Okt
const payload = (overrides = {}) => ({
  selections: { ukuran: 1, bentuk: 5, rasa: 9, krim_topping: 13 },
  writingText: '',
  readyDate: '2026-10-26',
  ...overrides,
});
const photo = { buffer: Buffer.from([0xff, 0xd8, 0xff]), extension: 'jpg' };

test.beforeEach(() => {
  events.length = 0;
  deleteFails = false;
  createError = null;
});

test('file ditulis SEBELUM transaksi dimulai (bukan di dalam transaksi) dan URL-nya disimpan', async () => {
  const result = await createCustomCakeDesign(payload(), '1', NOW, { photo });

  assert.deepEqual(events, ['save', 'transaction:start', 'transaction:end']);
  assert.equal(saved.at(-1).referencePhotoUrl, '/uploads/custom-cakes/0123456789abcdef0123456789abcdef.jpg');
  assert.equal(result.design_id, '1000001');
});

test('validasi request gagal → file tidak pernah ditulis', async () => {
  await assert.rejects(createCustomCakeDesign(payload({ readyDate: '2026-02-30' }), '1', NOW, { photo }), { statusCode: 400 });
  assert.deepEqual(events, []);
});

test('validasi data server gagal di dalam transaksi (opsi nonaktif / tanggal) → file dihapus', async () => {
  activeOptions = activeOptions.filter((option) => option.optionId !== 9);
  await assert.rejects(createCustomCakeDesign(payload(), '1', NOW, { photo }), { statusCode: 400, message: /rasa/ });
  activeOptions = [...activeOptions, { optionId: 9, optionGroup: 'rasa', extraPrice: 0 }];
  assert.deepEqual(events.at(-1), 'delete:/uploads/custom-cakes/0123456789abcdef0123456789abcdef.jpg');

  events.length = 0;
  await assert.rejects(createCustomCakeDesign(payload({ readyDate: '2026-10-24' }), '1', NOW, { photo }), { statusCode: 400 });
  assert.equal(events.filter((event) => event.startsWith('delete:')).length, 1);
});

test('penyimpanan database gagal → file dihapus dan error asli yang diteruskan', async () => {
  createError = new Error('Koneksi database terputus');
  await assert.rejects(createCustomCakeDesign(payload(), null, NOW, { photo }), { message: 'Koneksi database terputus' });
  assert.ok(events.includes('delete:/uploads/custom-cakes/0123456789abcdef0123456789abcdef.jpg'));
});

test('pembersihan file gagal TIDAK menutupi error utama', async () => {
  createError = Object.assign(new Error('Tanggal siap paling awal adalah 2026-10-25.'), { statusCode: 400 });
  deleteFails = true;
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));

  try {
    await assert.rejects(createCustomCakeDesign(payload(), '1', NOW, { photo }), {
      statusCode: 400,
      message: 'Tanggal siap paling awal adalah 2026-10-25.',
    });
  } finally {
    console.warn = warn;
  }

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Gagal menghapus foto referensi/);
});

test('tanpa foto: tidak ada operasi file sama sekali', async () => {
  await createCustomCakeDesign(payload(), '1', NOW);
  assert.deepEqual(events, ['transaction:start', 'transaction:end']);
  assert.equal(saved.at(-1).referencePhotoUrl, null);
});
