// Step 6.5 C1 · FR-18 · SPEC §4 — services/orderStatusRecorder.service.js: satu riwayat + satu notifikasi per perubahan
// status, notifikasi poin, salinan email HANYA setelah commit, dan tidak ada email bila transaksi gagal.
// Prisma dipalsukan (objek tx sederhana) — tidak membuktikan transaksi/locking MySQL.

const test = require('node:test');
const assert = require('node:assert/strict');
const fakePrisma = require('./helpers/fakePrisma');

const {
  recordOrderStatus, recordPointsNotice, logNotificationEmails, emailAfterCommit,
} = require('../src/services/orderStatusRecorder.service');

const NOW = new Date('2026-10-20T01:00:00Z');
const order = { orderId: 7n, orderNumber: 'OVC-261020-001', userId: 1n, pickupCode: 'PK4821' };

function fakeTx(log = []) {
  const tables = { histories: [], notifications: [] };
  return {
    tables,
    orderStatusHistory: { create: async ({ data }) => { log.push('history'); tables.histories.push(data); return data; } },
    notification: { create: async ({ data }) => { log.push('notification'); tables.notifications.push(data); return data; } },
  };
}

function captureConsole(t) {
  const lines = [];
  t.mock.method(console, 'info', (line) => lines.push(line));
  t.mock.method(console, 'error', (...args) => lines.push(`ERROR ${args.join(' ')}`));
  return lines;
}

fakePrisma.user = {
  findMany: async ({ where }) => [{ userId: 1n, email: 'anisa@example.com' }, { userId: 2n, email: 'budi@example.com' }]
    .filter((u) => where.userId.in.includes(u.userId)),
};

test('recordOrderStatus: tepat 1 riwayat lalu 1 notifikasi, di tx yang diberikan; changed_by BigInt / null (sistem)', async () => {
  const log = [];
  const tx = fakeTx(log);
  const notice = await recordOrderStatus(tx, order, 'siap_diambil', { changedBy: '3', note: null, now: NOW });

  assert.deepEqual(log, ['history', 'notification']);
  assert.deepEqual(tx.tables.histories, [{ orderId: 7n, status: 'siap_diambil', changedBy: 3n, note: null, changedAt: NOW }]);
  assert.deepEqual(tx.tables.notifications, [{
    userId: 1n, type: 'order_status', title: 'Pesanan siap diambil',
    body: 'Pesanan OVC-261020-001 siap diambil di toko. Tunjukkan kode pickup saat mengambil. Kode pickup: PK4821.',
    orderId: 7n, isRead: false, createdAt: NOW,
  }]);
  assert.equal(notice.title, 'Pesanan siap diambil');

  const system = fakeTx();
  await recordOrderStatus(system, order, 'dikonfirmasi', { now: NOW });
  assert.equal(system.tables.histories[0].changedBy, null);
  assert.equal(system.tables.histories.length, 1);
  assert.equal(system.tables.notifications.length, 1);
});

test('recordOrderStatus: riwayat gagal → notifikasi tidak ditulis (error diteruskan ke transaksi)', async () => {
  const tx = fakeTx();
  tx.orderStatusHistory.create = async () => { throw new Error('db down'); };
  await assert.rejects(recordOrderStatus(tx, order, 'selesai', { now: NOW }), /db down/);
  assert.equal(tx.tables.notifications.length, 0);
});

test('recordPointsNotice: satu notifikasi poin di tx yang diberikan', async () => {
  const tx = fakeTx();
  const notice = await recordPointsNotice(tx, { userId: 1n, points: 56, reason: 'pesanan OVC-261020-001', orderId: 7n, now: NOW });
  assert.deepEqual(tx.tables.notifications, [{
    userId: 1n, type: 'points', title: '+56 poin', body: 'Poin bertambah dari pesanan OVC-261020-001.', orderId: 7n,
    isRead: false, createdAt: NOW,
  }]);
  assert.equal(notice.type, 'points');
  assert.equal(tx.tables.histories.length, 0);
});

test('logNotificationEmails: satu baris per notifikasi ke email pemilik; kosong → tanpa query; gagal → tidak melempar', async (t) => {
  const lines = captureConsole(t);
  let queries = 0;
  const client = { user: { findMany: async (args) => { queries += 1; return fakePrisma.user.findMany(args); } } };

  await logNotificationEmails([], client);
  assert.equal(queries, 0);

  await logNotificationEmails([
    { userId: 1n, title: 'Pesanan dibuat', body: 'Isi A' },
    { userId: 1n, title: '+20 poin', body: 'Isi B' },
    { userId: 9n, title: 'Tanpa email', body: 'Isi C' },
  ], client);
  assert.equal(queries, 1);
  assert.deepEqual(lines, [
    '[DEV EMAIL] Kepada: anisa@example.com · Pesanan dibuat — Isi A',
    '[DEV EMAIL] Kepada: anisa@example.com · +20 poin — Isi B',
  ]);

  lines.length = 0;
  await assert.doesNotReject(logNotificationEmails([{ userId: 1n, title: 'x', body: 'y' }], {
    user: { findMany: async () => { throw new Error('db down'); } },
  }));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^ERROR \[Notifikasi\] Gagal mencetak salinan email: db down/);
});

test('emailAfterCommit: email dicetak SETELAH transaksi selesai, bukan di dalamnya; hasil dikembalikan apa adanya', async (t) => {
  const lines = captureConsole(t);
  let printedInsideTransaction = null;
  const result = await emailAfterCommit((async () => {
    const tx = fakeTx();
    const notice = await recordOrderStatus(tx, order, 'dikonfirmasi', { now: NOW });
    await new Promise((resolve) => setImmediate(resolve)); // "commit" berjalan
    printedInsideTransaction = lines.length;
    return { result: { order_number: order.orderNumber }, notices: [notice] };
  })());

  assert.equal(printedInsideTransaction, 0, 'tidak ada email sebelum commit');
  assert.deepEqual(result, { order_number: 'OVC-261020-001' });
  assert.deepEqual(lines, ['[DEV EMAIL] Kepada: anisa@example.com · Pesanan dikonfirmasi — Pesanan OVC-261020-001 sudah kami terima dan akan segera diproses.']);
});

test('emailAfterCommit: transaksi gagal (rollback) → error diteruskan, tidak ada email', async (t) => {
  const lines = captureConsole(t);
  await assert.rejects(emailAfterCommit((async () => {
    const tx = fakeTx();
    await recordOrderStatus(tx, order, 'dikonfirmasi', { now: NOW });
    throw Object.assign(new Error('conflict'), { statusCode: 409 });
  })()), /conflict/);
  assert.deepEqual(lines, []);
});
