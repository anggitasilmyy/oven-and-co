// tests/helpers/fakePrisma.js
// Mengganti src/lib/prisma dengan objek palsu agar pengujian TIDAK menyentuh MySQL.
// Wajib di-require sebelum modul service/app. Setiap file test berjalan di proses terpisah (node --test).

const prismaPath = require.resolve('../../src/lib/prisma');

const fakePrisma = {};

require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: fakePrisma,
};

module.exports = fakePrisma;
