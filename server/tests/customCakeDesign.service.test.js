// Regresi: simpan desain custom cake memakai tanggal WIB & jendela 30 hari (audit Step 6.3 · C-5)
// Prisma dipalsukan — create() hanya dicatat, tidak ada data yang ditulis ke MySQL.

const test = require('node:test');
const assert = require('node:assert/strict');
const fakePrisma = require('./helpers/fakePrisma');

process.env.JWT_SECRET = 'test-jwt-secret-only';

const { createCustomCakeDesign } = require('../src/services/customCakeDesign.service');
const { verifyDesignToken } = require('../src/utils/designToken');

const created = [];

const tx = {
  product: {
    findFirst: async () => ({ productId: 6n, price: 450000, availabilityType: 'custom', leadTimeDays: 3 }),
  },
  customOption: {
    findMany: async ({ where }) =>
      [
        { optionId: 1, optionGroup: 'ukuran', extraPrice: 0 },
        { optionId: 5, optionGroup: 'bentuk', extraPrice: 25000 },
        { optionId: 9, optionGroup: 'rasa', extraPrice: 50000 },
        { optionId: 13, optionGroup: 'krim_topping', extraPrice: 0 },
      ].filter((option) => where.optionId.in.includes(option.optionId)),
  },
  customCakeDesign: {
    create: async ({ data }) => {
      created.push(data);
      return { designId: 1000001n, price: data.price, readyDate: data.readyDate };
    },
  },
  customCakeDesignOption: { createMany: async () => ({ count: 4 }) },
};

fakePrisma.$transaction = async (callback) => callback(tx);

const payload = (readyDate) => ({
  selections: { ukuran: 1, bentuk: 5, rasa: 9, krim_topping: 13 },
  writingText: 'Selamat',
  writingColor: 'Emas',
  readyDate,
});

// 21 Okt 18.00 UTC = 22 Okt 01.00 WIB → paling cepat 25 Okt, paling lambat 20 Nov
const NOW = new Date('2026-10-21T18:00:00.000Z');

test('tanggal H+3 dihitung dari hari WIB, bukan tanggal UTC/lokal server', async () => {
  await assert.rejects(
    createCustomCakeDesign(payload('2026-10-24'), '1', NOW),
    { statusCode: 400, message: 'Tanggal siap paling awal adalah 2026-10-25.' }
  );
});

test('tanggal melewati jendela 30 hari ditolak', async () => {
  await assert.rejects(
    createCustomCakeDesign(payload('2026-11-21'), '1', NOW),
    { statusCode: 400, message: 'Tanggal siap paling lambat adalah 2026-11-20.' }
  );
});

test('tanggal tidak ada di kalender ditolak sebelum menyentuh database', async () => {
  await assert.rejects(createCustomCakeDesign(payload('2026-02-30'), '1', NOW), { statusCode: 400 });
});

test('desain valid disimpan dengan harga hitungan server dan tanggal kolom DATE', async () => {
  const result = await createCustomCakeDesign(payload('2026-10-25'), '1', NOW);

  // Desain pelanggan login: pemilik = user_id, tidak butuh token
  assert.deepEqual(result, { design_id: '1000001', price: 525000, ready_date: '2026-10-25', design_token: null });
  assert.equal(created.at(-1).readyDate.toISOString(), '2026-10-25T00:00:00.000Z');
  assert.equal(created.at(-1).userId, 1n);
});

test('desain tamu mendapat design_token HMAC untuk desain itu', async () => {
  const result = await createCustomCakeDesign(payload('2026-10-25'), null, NOW);

  assert.equal(created.at(-1).userId, null);
  assert.equal(verifyDesignToken(1000001n, result.design_token), true);
  assert.equal(verifyDesignToken(1000002n, result.design_token), false);
});

test('desain tamu tanpa kunci token tidak disimpan sama sekali', async () => {
  const saved = process.env.JWT_SECRET;
  const before = created.length;
  delete process.env.JWT_SECRET;

  await assert.rejects(createCustomCakeDesign(payload('2026-10-25'), null, NOW), { statusCode: 500 });
  assert.equal(created.length, before);
  process.env.JWT_SECRET = saved;
});
