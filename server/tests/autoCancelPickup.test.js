// Step 6.5 C3 · FR-38 · BR-07 — jobs/autoCancelOrders.js aturan BR-07: preseleksi, keputusan dengan jam operasional
// TERBARU (locking read di transaksi, bukan snapshot), urutan pernyataan kunci (orders → users S → jam S), efek
// pembatalan, idempotensi, BR-06 + BR-07 dalam satu putaran, H6 (query gagal menghentikan putaran), shutdown.
// Prisma dipalsukan (helpers/orderDb.js) — urutan pernyataan saja, TIDAK membuktikan locking InnoDB (tests-mysql/14).

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { installOrderDb } = require('./helpers/orderDb');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');
const job = require('../src/jobs/autoCancelOrders');

const NOW = new Date('2026-10-20T01:00:00Z'); // Selasa 08.00 WIB (day_of_week 2)
const dayKey = (n) => new Date(Date.UTC(2026, 9, 20 + n)).toISOString().slice(0, 10);
const dbDay = (n) => new Date(`${dayKey(n)}T00:00:00.000Z`);
const wib = (hhmmss, dayOffset = 0, ms = 0) => new Date(new Date(`${dayKey(dayOffset)}T${hhmmss}+07:00`).getTime() + ms);
const REASON = 'Tidak diambil sampai jam tutup (BR-07)';
const time = (hhmm) => (hhmm == null ? null : new Date(`1970-01-01T${hhmm}:00.000Z`));
const hourRow = (day, close, { open = '07:00', isOpen = true } = {}) => ({
  hourId: day, dayOfWeek: day, openTime: time(open), closeTime: time(close), isOpen,
});

let db;
let server;
let baseUrl;
let logs;

test.before(async () => {
  test.mock.timers.enable({ apis: ['Date'], now: NOW });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));

test.beforeEach((t) => {
  db = installOrderDb(fakePrisma, { today: dbDay(0), plusDays: dbDay });
  db.t.operatingHours = [1, 2, 3, 4, 5, 6, 7].map((d) => hourRow(d, '20:00'));
  logs = { email: [], error: [], info: [], warn: [] };
  t.mock.method(console, 'info', (line) => (String(line).startsWith('[DEV EMAIL]') ? logs.email : logs.info).push(String(line)));
  t.mock.method(console, 'error', (...args) => logs.error.push(args.join(' ')));
  t.mock.method(console, 'warn', (...args) => logs.warn.push(args.join(' ')));
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const place = async (overrides = {}, sub = '1') => {
  const res = await fetch(`${baseUrl}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFor(sub)}` },
    body: JSON.stringify({
      items: [{ cart_item_id: 'c1', product_id: '1', quantity: 2 }], fulfillment: 'pickup', address_id: null,
      ready_date: dayKey(0), time_slot: '09.00–11.00', voucher_code: null, use_points: false, method_code: 'pay_at_store', ...overrides,
    }),
  });
  const json = await res.json();
  assert.equal(res.status, 201, JSON.stringify(json));
  return json.data.order_number;
};
const orderRow = (number) => db.t.orders.find((o) => o.orderNumber === number);
const paymentOf = (number) => db.t.payments.find((p) => p.orderId === orderRow(number).orderId);
const historyOf = (number) => db.t.statusHistories.filter((h) => h.orderId === orderRow(number).orderId);
const noticesOf = (number) => db.t.notifications.filter((n) => n.orderId === orderRow(number).orderId);
const stockSold = () => db.t.dailyStocks.find((s) => s.productId === 1n).qtySold;
const setClose = (day, close, opts) => { db.t.operatingHours = db.t.operatingHours.map((h) => (h.dayOfWeek === day ? hourRow(day, close, opts) : h)); };
const run = (now) => job.runAutoCancel({ now, shouldStop: () => false });

// ── Batas & status ───────────────────────────────────────────────────────────────────────────────

test('BR-07: sebelum & tepat jam tutup tidak dibatalkan; sesudahnya Dibatalkan dengan efek lengkap', async () => {
  const number = await place({ use_points: true, voucher_code: 'HEMAT10' });
  const order = orderRow(number);
  assert.deepEqual([order.paymentOption, order.orderStatus, paymentOf(number).status], ['pay_at_store', 'dikonfirmasi', 'pending']);
  assert.equal(stockSold(), 4);
  logs.email.length = 0;

  for (const now of [wib('19:59:59'), wib('20:00:00')]) assert.deepEqual((await run(now)).cancelled, []);
  assert.equal(order.orderStatus, 'dikonfirmasi');

  const summary = await run(wib('20:00:00', 0, 1000));
  assert.deepEqual(summary.cancelled, [number]);
  assert.deepEqual([order.orderStatus, order.cancelReason, order.paymentStatus, paymentOf(number).status],
    ['dibatalkan', REASON, 'unpaid', 'expired']);
  assert.equal(stockSold(), 2, 'stok ready kembali');
  assert.equal(db.t.vouchers.find((v) => v.voucherId === 1n).quota, 5);
  assert.equal(db.t.userVouchers.find((c) => c.userId === 1n && c.voucherId === 1n).usedAt, null);
  assert.equal(db.t.pointTransactions.filter((p) => p.type === 'refund' && p.orderId === order.orderId).length, 1);
  assert.deepEqual(historyOf(number).map((h) => [h.status, h.changedBy, h.note]), [['dikonfirmasi', 1n, null], ['dibatalkan', null, REASON]]);
  assert.deepEqual(noticesOf(number).slice(1).map((n) => [n.type, n.title, n.body]), [
    ['order_status', 'Pesanan dibatalkan', `Pesanan ${number} dibatalkan. Alasan: ${REASON}`],
    ['points', `+${order.pointsUsed.toLocaleString('id-ID')} poin`, `Poin bertambah dari pembatalan pesanan ${number}.`],
  ]);
  assert.equal(logs.email.length, 2);
  assert.ok(logs.info.some((l) => l.includes(`BR-07: 1 dibatalkan, 0 dilewati, 0 gagal (${number})`)));

  // Idempoten
  const once = JSON.stringify(db.t, (_k, v) => (typeof v === 'bigint' ? String(v) : v));
  assert.deepEqual((await run(wib('21:00:00'))).cancelled, []);
  assert.equal(JSON.stringify(db.t, (_k, v) => (typeof v === 'bigint' ? String(v) : v)), once);
});

test('BR-07: ketiga status belum diambil dibatalkan; lunas, Selesai, Dibatalkan, online tidak', async () => {
  const numbers = {};
  const one = { items: [{ cart_item_id: 'c1', product_id: '1', quantity: 1 }] }; // stok produk 1 tersisa 8
  for (const status of ['dikonfirmasi', 'sedang_disiapkan', 'siap_diambil', 'paid', 'selesai', 'dibatalkan']) {
    numbers[status] = await place(one, status === 'paid' ? '2' : '1');
  }
  orderRow(numbers.sedang_disiapkan).orderStatus = 'sedang_disiapkan';
  orderRow(numbers.siap_diambil).orderStatus = 'siap_diambil';
  Object.assign(orderRow(numbers.paid), { orderStatus: 'siap_diambil', paymentStatus: 'paid' });
  paymentOf(numbers.paid).status = 'paid';
  Object.assign(orderRow(numbers.selesai), { orderStatus: 'selesai', paymentStatus: 'paid' });
  paymentOf(numbers.selesai).status = 'paid';
  orderRow(numbers.dibatalkan).orderStatus = 'dibatalkan';
  const online = await place({ ...one, method_code: 'qris' });

  const summary = await run(wib('20:30:00'));
  // Online yang lewat 30 menit ikut dibatalkan BR-06 pada putaran yang sama — bukan oleh BR-07
  assert.deepEqual(summary.cancelled.sort(), [online, numbers.dikonfirmasi, numbers.sedang_disiapkan, numbers.siap_diambil].sort());
  assert.equal(orderRow(online).cancelReason, 'Tidak dibayar dalam 30 menit (BR-06)');
  for (const key of ['dikonfirmasi', 'sedang_disiapkan', 'siap_diambil']) assert.equal(orderRow(numbers[key]).cancelReason, REASON, key);
  for (const key of ['paid', 'selesai']) assert.notEqual(orderRow(numbers[key]).orderStatus, 'dibatalkan', key);
  assert.equal(historyOf(numbers.dibatalkan).length, 1, 'yang sudah Dibatalkan tidak disentuh');
});

test('BR-07: jam operasional per hari & tanggal siap berbeda dari tanggal pesan; WIB pergantian hari', async () => {
  setClose(2, '22:00'); // Selasa tutup 22.00
  const today = await place();
  const yesterday = await place();
  orderRow(yesterday).readyDate = dbDay(-1); // tanggal siap kemarin (Senin)
  const tomorrow = await place();
  orderRow(tomorrow).readyDate = dbDay(1);

  // 20.30 WIB: jam tutup Selasa 22.00 belum lewat; kemarin pasti lewat; besok belum
  assert.deepEqual((await run(wib('20:30:00'))).cancelled, [yesterday]);
  // 22.00.01 WIB → hari ini lewat
  assert.deepEqual((await run(wib('22:00:01'))).cancelled, [today]);
  // 00.00.01 WIB hari berikutnya (= 17.00.01Z): tanggal siap "besok" = hari ini → belum lewat (Rabu 20.00)
  assert.deepEqual((await run(wib('00:00:01', 1))).cancelled, []);
  assert.deepEqual((await run(wib('20:00:01', 1))).cancelled, [tomorrow]);
});

test('BR-07 H1: hari tanggal siap tutup → batas 00.00 WIB hari berikutnya (eksklusif) + log', async () => {
  const number = await place();
  setClose(2, '20:00', { isOpen: false }); // Owner menutup hari itu SETELAH pesanan dibuat
  assert.deepEqual((await run(wib('23:59:59', 0, 999))).cancelled, []);
  assert.deepEqual((await run(wib('00:00:00', 1))).cancelled, [number]);
  assert.ok(logs.warn.some((l) => l.includes(`BR-07 ${number}`) && l.includes('akhir tanggal siap')), logs.warn.join('\n'));
});

// ── Jam operasional TERBARU di transaksi (H4) ─────────────────────────────────────────────────────

test('H4: jam diperpanjang setelah snapshot (AD-11 commit sebelum locking read) → job MELEWATI pesanan', async () => {
  const number = await place();
  // Snapshot preseleksi: 20.00 → kandidat. Sebelum job membaca jam dengan kunci, Owner memperpanjang ke 22.00.
  db.hooks.whileWaitingHoursLock = () => { setClose(2, '22:00'); db.hooks.whileWaitingHoursLock = null; };
  const summary = await run(wib('20:05:00'));
  assert.deepEqual([summary.cancelled, summary.skipped], [[], [number]]);
  assert.deepEqual([orderRow(number).orderStatus, historyOf(number).length, noticesOf(number).length, stockSold()],
    ['dikonfirmasi', 1, 1, 4], 'tanpa riwayat, notifikasi, atau pengembalian stok');
  assert.deepEqual((await run(wib('22:00:01'))).cancelled, [number], 'dibatalkan setelah jam tutup BARU');
});

test('H4: jam dimajukan — snapshot lama bukan kandidat (tidak terlalu awal); setelah perubahan, putaran berikutnya membatalkan', async () => {
  setClose(2, '22:00');
  const number = await place();
  assert.deepEqual((await run(wib('20:05:00'))).cancelled, [], 'menurut 22.00 belum lewat');
  setClose(2, '20:00'); // Owner memajukan jam tutup
  assert.deepEqual((await run(wib('19:55:00'))).cancelled, [], 'sebelum jam tutup baru tidak dibatalkan');
  assert.deepEqual((await run(wib('20:05:00'))).cancelled, [number]);
  // Snapshot 20.00 (kandidat) lalu dimajukan lagi ke 19.00 sebelum locking read → tetap lewat → dibatalkan (diuji di MySQL juga)
});

test('urutan pernyataan BR-07: orders X → users S → operating_hours S (hari tanggal siap) → tulis', async () => {
  const number = await place({ use_points: true });
  await run(wib('20:05:00'));
  assert.equal(orderRow(number).orderStatus, 'dibatalkan');
  const tail = db.ops.slice(db.ops.lastIndexOf('tx:begin'));
  const at = (op) => tail.indexOf(op);
  assert.equal(tail[1], 'lock:orders');
  assert.ok(at('lock:users:S') > 1 && at('lock:operating_hours:S') > at('lock:users:S'), tail.join(' → '));
  assert.ok(at('orderStatusHistory.create') > at('lock:operating_hours:S'));
  assert.ok(at('payment.updateMany') > tail.lastIndexOf('notification.create'), 'urutan F-C1-1 tetap');
  assert.ok(at('executeRaw') > at('payment.updateMany'));
});

test('pemeriksaan ulang setelah kunci pesanan: admin menandai lunas selagi job menunggu → dilewati, tanpa kunci users/jam', async () => {
  const number = await place();
  orderRow(number).orderStatus = 'siap_diambil';
  db.hooks.whileWaitingOrderLock = () => {
    Object.assign(orderRow(number), { paymentStatus: 'paid' });
    paymentOf(number).status = 'paid';
    db.hooks.whileWaitingOrderLock = null;
  };
  const summary = await run(wib('20:05:00'));
  assert.deepEqual([summary.cancelled, summary.skipped], [[], [number]]);
  const tail = db.ops.slice(db.ops.lastIndexOf('tx:begin'));
  assert.ok(!tail.includes('lock:users:S') && !tail.includes('lock:operating_hours:S'), 'syarat status gagal → kunci lain tidak diambil');
});

// ── Putaran: BR-06 + BR-07, H6, shutdown ──────────────────────────────────────────────────────────

test('satu putaran membatalkan BR-06 dan BR-07 sekaligus (alasan masing-masing)', async () => {
  const online = await place({ method_code: 'qris' });
  const store = await place();
  const summary = await run(wib('20:05:00')); // > 30 menit setelah 08.00 & > jam tutup
  assert.deepEqual(summary.cancelled, [online, store]);
  assert.equal(orderRow(online).cancelReason, 'Tidak dibayar dalam 30 menit (BR-06)');
  assert.equal(orderRow(store).cancelReason, REASON);
  assert.ok(logs.info.some((l) => l.startsWith('[Job autoCancelOrders] BR-06: 1 dibatalkan')));
  assert.ok(logs.info.some((l) => l.startsWith('[Job autoCancelOrders] BR-07: 1 dibatalkan')));
});

test('H6: query kandidat BR-06 gagal → putaran dihentikan, BR-07 tidak di-query', async () => {
  await place();
  db.hooks.candidateQuery = async () => { throw Object.assign(new Error('Query execution was interrupted'), { code: 'P2010', meta: { code: '3024' } }); };
  const opsBefore = db.ops.length;
  const summary = await run(wib('20:05:00'));
  assert.match(summary.queryError, /MySQL 3024/);
  assert.deepEqual(db.ops.slice(opsBefore), ['candidateQuery']);
  assert.ok(logs.error.some((l) => l.includes('Query kandidat BR-06 gagal')));
});

test('H6: query jam / kandidat BR-07 gagal → dicatat sebagai BR-07, tanpa transaksi, putaran berikutnya normal', async () => {
  const number = await place();
  db.hooks.hoursQuery = async () => { db.hooks.hoursQuery = null; throw Object.assign(new Error('x'), { code: 'P2010', meta: { code: '3024', message: 'Query execution was interrupted' } }); };
  const summary = await run(wib('20:05:00'));
  assert.equal(summary.queryError, 'P2010 (MySQL 3024): Query execution was interrupted');
  assert.ok(logs.error.some((l) => l.includes('Query kandidat BR-07 gagal')));
  assert.ok(!db.ops.includes('lock:operating_hours:S'));
  assert.deepEqual((await run(wib('20:05:00'))).cancelled, [number]);
});

test('shutdown diminta selama transaksi BR-06 terakhir → BR-07 tidak di-query', async () => {
  const online = await place({ method_code: 'qris' });
  const store = await place();
  let stop = false;
  db.hooks.whileWaitingOrderLock = () => { stop = true; db.hooks.whileWaitingOrderLock = null; };
  const summary = await job.runAutoCancel({ now: wib('20:05:00'), shouldStop: () => stop });
  assert.deepEqual([summary.cancelled, summary.stopped], [[online], true]);
  assert.ok(!db.ops.includes('hoursQuery') && !db.ops.includes('pickupCandidateQuery'));
  assert.equal(orderRow(store).orderStatus, 'dikonfirmasi');
});

test('rollback per pesanan BR-07: notifikasi gagal → pesanan utuh, dicatat dengan aturan BR-07, putaran berikutnya berhasil', async () => {
  const number = await place({ use_points: true });
  logs.email.length = 0;
  db.failOn = 'notification.create';
  const summary = await run(wib('20:05:00'));
  db.failOn = null;
  assert.deepEqual(summary.failed.map((f) => [f.order_number, f.rule]), [[number, 'BR-07']]);
  assert.deepEqual([orderRow(number).orderStatus, paymentOf(number).status, historyOf(number).length, stockSold()],
    ['dikonfirmasi', 'pending', 1, 4]);
  assert.equal(db.t.pointTransactions.filter((p) => p.type === 'refund').length, 0);
  assert.deepEqual(logs.email, []);
  assert.deepEqual((await run(wib('20:06:00'))).cancelled, [number]);
});

test('SQL BR-07: MAX_EXECUTION_TIME 5000, semua nilai sebagai parameter; snapshot jam juga dibatasi', async () => {
  await place();
  await run(wib('20:05:00'));
  assert.match(db.pickupCandidateSql, /^SELECT \/\*\+ MAX_EXECUTION_TIME\(5000\) \*\/ DISTINCT/);
  assert.match(db.pickupCandidateSql, /o\.order_status IN \(\?, \?, \?\) AND p\.status = \?\s+AND \(o\.ready_date < \? OR \(o\.ready_date = \? AND \? = 1\)\)/);
  assert.ok(!/pay_at_store|dikonfirmasi|2026/.test(db.pickupCandidateSql));
});
