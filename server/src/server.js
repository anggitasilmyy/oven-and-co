// server.js — Entry point, listen port
// Step 1 · Setup Project

require('dotenv').config();
const app = require('./app');
const prisma = require('./lib/prisma');
const { startAutoCancelJob, stopAutoCancelJob } = require('./jobs/autoCancelOrders');

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`✅  Oven & Co. API berjalan di http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  // Step 6.5 C2 · FR-38: pembatalan otomatis (BR-06) — tidak berjalan bila NODE_ENV=test / AUTO_CANCEL_ENABLED=false
  startAutoCancelJob();
});

// Integrasi MySQL 8 (F-2): saat proses dihentikan, berhenti menerima request lalu tutup KEDUA pool Prisma
// (client utama & client transaksi — lib/prismaClients.js). Step 6.5 C2: penjadwal pembatalan otomatis dihentikan
// dan putaran yang sedang berjalan ditunggu SAMPAI SELESAI (pesanan yang sedang diproses commit/rollback, kandidat
// berikutnya tidak diproses) — baru setelah itu $disconnect, sehingga tidak ada transaksi job yang terputus.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} diterima — menutup server & koneksi database…`);
  const jobStopped = stopAutoCancelJob().catch((error) => console.error('[Job] Gagal menghentikan penjadwal:', error));
  // Disconnect HANYA setelah jobStopped selesai (lihat stopAutoCancelJob)
  server.close(() => {
    jobStopped
      .then(() => prisma.$disconnect())
      .catch((error) => console.error('[DB] Gagal menutup koneksi:', error))
      .finally(() => process.exit(0));
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
