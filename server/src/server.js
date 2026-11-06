// server.js — Entry point, listen port
// Step 1 · Setup Project

require('dotenv').config();
const app = require('./app');
const prisma = require('./lib/prisma');

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`✅  Oven & Co. API berjalan di http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
});

// Integrasi MySQL 8 (F-2): saat proses dihentikan, berhenti menerima request lalu tutup KEDUA pool Prisma
// (client utama & client transaksi — lib/prismaClients.js).
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} diterima — menutup server & koneksi database…`);
  server.close(() => {
    prisma.$disconnect()
      .catch((error) => console.error('[DB] Gagal menutup koneksi:', error))
      .finally(() => process.exit(0));
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
