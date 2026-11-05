const { PrismaClient } = require('@prisma/client');
const { createPrismaClients } = require('./prismaClients');

// Dua pool (temuan F-2 integrasi MySQL 8 — lihat prismaClients.js): client utama untuk query biasa & auth, client
// transaksi (probe nonce + batas lock wait) untuk semua `prisma.$transaction`.
const { prisma } = createPrismaClients({
  databaseUrl: process.env.DATABASE_URL,
  PrismaClient,
  onProbeRetry: (error, attempt) => {
    console.warn(`[DB] Probe transaksi gagal (percobaan ${attempt}, ${error.code ?? error.name}); transaksi diulang dengan koneksi lain.`);
  },
});

module.exports = prisma;
