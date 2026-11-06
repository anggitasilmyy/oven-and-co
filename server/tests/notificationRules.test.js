// Step 6.5 C1 · FR-18 · SPEC §4 — fungsi murni pembentuk notifikasi (services/notificationRules.service.js).
// Teks harus SAMA dengan client constants/notification.js & utils/rules/notification.js (mode mock).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  ORDER_STATUS, NOTIFICATION_TYPE, ORDER_STATUS_NOTIFICATION, NOTIFICATION_TITLE_MAX, NOTIFICATION_BODY_MAX,
  POINTS_NOTIFICATION_REASON,
} = require('../src/utils/businessConstants');
const { clip, buildOrderStatusNotification, buildPointsNotification } = require('../src/services/notificationRules.service');

const order = { orderId: 7n, orderNumber: 'OVC-261020-001', userId: 1n, pickupCode: 'PK4821' };

test('teks setiap status sama persis dengan client constants/notification.js', () => {
  const clientSource = fs.readFileSync(path.join(__dirname, '../../client/src/constants/notification.js'), 'utf8');
  assert.deepEqual(Object.keys(ORDER_STATUS_NOTIFICATION).sort(), Object.values(ORDER_STATUS).sort(), 'semua 7 status punya teks');
  for (const [status, text] of Object.entries(ORDER_STATUS_NOTIFICATION)) {
    assert.ok(clientSource.includes(`title: '${text.title}'`), `judul ${status}`);
    assert.ok(clientSource.includes(`body: '${text.body}'`), `isi ${status}`);
  }
  for (const [key, value] of Object.entries(NOTIFICATION_TYPE)) {
    assert.ok(clientSource.includes(`${key}: '${value}'`), `tipe ${key}`);
  }
  assert.ok(clientSource.includes(`NOTIFICATION_TITLE_MAX = ${NOTIFICATION_TITLE_MAX}`));
  assert.ok(clientSource.includes(`NOTIFICATION_BODY_MAX = ${NOTIFICATION_BODY_MAX}`));
});

test('notifikasi status: pemilik pesanan, tipe order_status, nomor pesanan di isi, tautan order_id', () => {
  assert.deepEqual(buildOrderStatusNotification(order, ORDER_STATUS.MENUNGGU_PEMBAYARAN), {
    userId: 1n,
    type: 'order_status',
    title: 'Pesanan dibuat',
    body: 'Pesanan OVC-261020-001 menunggu pembayaran. Selesaikan pembayaran sebelum batas waktu.',
    orderId: 7n,
  });
  assert.equal(buildOrderStatusNotification(order, ORDER_STATUS.DIKONFIRMASI).body,
    'Pesanan OVC-261020-001 sudah kami terima dan akan segera diproses.');
  assert.equal(buildOrderStatusNotification(order, ORDER_STATUS.SELESAI).title, 'Pesanan selesai');
});

test('Siap Diambil menyebut kode pickup bila ada; Dibatalkan menambahkan alasan; catatan lain diabaikan', () => {
  assert.equal(buildOrderStatusNotification(order, ORDER_STATUS.SIAP_DIAMBIL).body,
    'Pesanan OVC-261020-001 siap diambil di toko. Tunjukkan kode pickup saat mengambil. Kode pickup: PK4821.');
  assert.equal(buildOrderStatusNotification({ ...order, pickupCode: null }, ORDER_STATUS.SIAP_DIAMBIL).body,
    'Pesanan OVC-261020-001 siap diambil di toko. Tunjukkan kode pickup saat mengambil.');
  assert.equal(buildOrderStatusNotification(order, ORDER_STATUS.DIBATALKAN, { note: 'Salah pilih tanggal' }).body,
    'Pesanan OVC-261020-001 dibatalkan. Alasan: Salah pilih tanggal');
  assert.equal(buildOrderStatusNotification(order, ORDER_STATUS.DIBATALKAN).body, 'Pesanan OVC-261020-001 dibatalkan.');
  // Catatan kurir (Dalam Pengiriman) tidak masuk isi — sama dengan client
  assert.equal(buildOrderStatusNotification(order, ORDER_STATUS.DALAM_PENGIRIMAN, { note: 'Kurir: Andi' }).body,
    'Pesanan OVC-261020-001 sedang diantar kurir ke alamatmu.');
});

test('isi dipotong ke 255 karakter (alasan batal panjang) dengan "…"; status tidak dikenal ditolak', () => {
  const notice = buildOrderStatusNotification(order, ORDER_STATUS.DIBATALKAN, { note: 'x'.repeat(255) });
  assert.equal(notice.body.length, NOTIFICATION_BODY_MAX);
  assert.ok(notice.body.endsWith('…'));
  assert.equal(clip('abc', 3), 'abc');
  assert.equal(clip('abcd', 3), 'ab…');
  assert.throws(() => buildOrderStatusNotification(order, 'hilang'), /Status tidak dikenal/);
});

test('notifikasi poin: tanda, format angka Indonesia, alasan per sumber (earn / review_bonus / refund)', () => {
  assert.deepEqual(
    buildPointsNotification({ userId: 1n, points: 1250, reason: POINTS_NOTIFICATION_REASON.EARN('OVC-261020-001'), orderId: 7n }),
    { userId: 1n, type: 'points', title: '+1.250 poin', body: 'Poin bertambah dari pesanan OVC-261020-001.', orderId: 7n },
  );
  assert.equal(
    buildPointsNotification({ userId: 1n, points: 20, reason: POINTS_NOTIFICATION_REASON.REVIEW_BONUS('OVC-261020-001') }).body,
    'Poin bertambah dari ulasan pesanan OVC-261020-001.',
  );
  assert.equal(
    buildPointsNotification({ userId: 1n, points: 200, reason: POINTS_NOTIFICATION_REASON.REFUND('OVC-261020-001') }).body,
    'Poin bertambah dari pembatalan pesanan OVC-261020-001.',
  );
  const minus = buildPointsNotification({ userId: 1n, points: -300, reason: 'x' });
  assert.equal(minus.title, '−300 poin');
  assert.equal(minus.body, 'Poin berkurang dari x.');
  assert.equal(minus.orderId, null);
});

test('alasan notifikasi poin sama dengan mock client (adminOrderWrites / reviewWrites / orderCancellation)', () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, '../../client/src/services/mock', file), 'utf8');
  assert.ok(read('adminOrderWrites.js').includes('reason: `pesanan ${order.order_number}`'));
  assert.ok(read('reviewWrites.js').includes('reason: `ulasan pesanan ${order.order_number}`'));
  assert.ok(read('orderCancellation.js').includes('reason: `pembatalan pesanan ${order.order_number}`'));
  assert.equal(POINTS_NOTIFICATION_REASON.EARN('N'), 'pesanan N');
  assert.equal(POINTS_NOTIFICATION_REASON.REVIEW_BONUS('N'), 'ulasan pesanan N');
  assert.equal(POINTS_NOTIFICATION_REASON.REFUND('N'), 'pembatalan pesanan N');
});
