// tests-mysql/09-checkout-settings.it.test.js
// T1 (ROADMAP 6.4.10 · FR-12 – FR-16 · C-14 · AD-11): pengaturan toko basi saat checkout → 409 + rollback, di MySQL 8 nyata.
// T1-a deterministik: transaksi lain memegang store_settings (meniru PUT pengaturan AD-11 yang sedang berjalan), checkout
//      asli membaca pengaturan lama lalu MENUNGGU kunci; transaksi itu mengubah batas pre-order / jam operasional lalu
//      commit → checkout 409, tanpa pesanan, stok, pembayaran, atau riwayat.
// T1-b perubahan yang tidak dipakai pesanan (nama toko, WhatsApp) → checkout tetap 201.
// T1-c PUT /api/admin/settings ASLI bersamaan dengan checkout asli × putaran → hanya 201/409, tanpa 5xx, tanpa deadlock;
//      setiap 409 tanpa data parsial.

const test = require('node:test');
const assert = require('node:assert/strict');
const { TIME_SLOTS } = require('../src/utils/businessConstants');
const { formatTimeSlot } = require('../src/services/operatingHours.service');
const { getJakartaDateKey } = require('../src/utils/jakartaDate');
const { db, rows, holdTransaction, waitForAppLockWait, appHeldLocks, innodbMetrics, record } = require('./helpers/context');
const { startServer, call } = require('./helpers/server');
const { createUser, onlyTheseOwnersActive, unique, tally } = require('./helpers/fixtures');

const FILE = '09-checkout-settings';
const ROUNDS = Number(process.env.C4_ROUNDS_T1 || 10);
const TODAY = getJakartaDateKey(new Date());
const STALE = 'Pengaturan toko baru saja diperbarui. Muat ulang halaman checkout lalu coba lagi.';
let server;
let readyProduct;
let original;

const profileRow = async () => (await rows(`SELECT store_name, address, whatsapp_number, CAST(preorder_cutoff_time AS CHAR) AS cutoff,
  CAST(delivery_radius_km AS CHAR) AS radius, CAST(delivery_fee_per_km AS CHAR) AS fee FROM store_settings WHERE setting_id = 1`))[0];
const hoursRows = () => rows('SELECT day_of_week, is_open, CAST(open_time AS CHAR) AS o, CAST(close_time AS CHAR) AS c FROM operating_hours ORDER BY day_of_week');

test.before(async () => {
  await db.$executeRawUnsafe(`INSERT INTO products (category_id, name, description, price, availability_type, lead_time_days, is_active)
    VALUES (3, ?, 'Produk uji T1', 10000, 'ready', 0, 1)`, unique('T1 Ready '));
  [{ id: readyProduct }] = await rows("SELECT product_id AS id FROM products WHERE description = 'Produk uji T1' ORDER BY product_id DESC LIMIT 1");
  await db.$executeRawUnsafe('INSERT INTO daily_stocks (product_id, stock_date, qty_planned, qty_sold) VALUES (?, ?, 100000, 0)', readyProduct, TODAY);
  original = { profile: await profileRow(), hours: await hoursRows() };
  server = await startServer(FILE);
});
test.after(async () => {
  // Pulihkan pengaturan asli (database uji sementara, file uji lain memakai nilai seed)
  await db.$executeRawUnsafe('UPDATE store_settings SET store_name = ?, whatsapp_number = ?, preorder_cutoff_time = ? WHERE setting_id = 1',
    original.profile.store_name, original.profile.whatsapp_number, original.profile.cutoff);
  for (const h of original.hours) {
    await db.$executeRawUnsafe('UPDATE operating_hours SET is_open = ?, open_time = ?, close_time = ? WHERE day_of_week = ?', h.is_open, h.o, h.c, h.day_of_week);
  }
  await server?.stop();
  await db.$disconnect();
});

/** Body checkout: 1 produk ready (stok hari ini) + 1 pre-order (tanggal & slot sah jam berapa pun uji dijalankan) */
async function orderBody(userId) {
  const items = [{ cart_item_id: unique('ci'), product_id: String(readyProduct), quantity: 1 }, { cart_item_id: unique('ci'), product_id: '9', quantity: 1 }];
  const cart = await call(server, 'POST', '/api/cart', { userId, body: { items } });
  assert.equal(cart.status, 200, JSON.stringify(cart.body));
  return { items, fulfillment: 'pickup', address_id: null, ready_date: cart.body.data.ready_date, time_slot: formatTimeSlot(TIME_SLOTS[1]), voucher_code: null, use_points: false, method_code: 'qris' };
}
const footprint = async (customer) => ({
  orders: Number((await rows('SELECT COUNT(*) AS n FROM orders WHERE user_id = ?', customer))[0].n),
  payments: Number((await rows('SELECT COUNT(*) AS n FROM payments p JOIN orders o ON o.order_id = p.order_id WHERE o.user_id = ?', customer))[0].n),
  histories: Number((await rows('SELECT COUNT(*) AS n FROM order_status_histories WHERE changed_by = ?', customer))[0].n),
  qtySold: Number((await rows('SELECT qty_sold AS n FROM daily_stocks WHERE product_id = ? AND stock_date = ?', readyProduct, TODAY))[0].n),
});

/** Checkout menunggu kunci store_settings yang dipegang "Owner"; Owner menjalankan `ownerChange` lalu commit */
async function checkoutWhileOwnerSaves(ownerChange) {
  const customer = await createUser('customer');
  const body = await orderBody(customer);
  const before = await footprint(customer);
  const owner = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT setting_id FROM store_settings WHERE setting_id = 1 FOR UPDATE'));
  await owner.ready;
  const pending = call(server, 'POST', '/api/orders', { userId: customer, body });
  const waits = await waitForAppLockWait((w) => w.waiting_table === 'store_settings');
  await owner.release(ownerChange);
  const res = await pending;
  return { res, before, after: await footprint(customer), waits };
}

test('T1-a batas pre-order diubah & di-commit selagi checkout menunggu kunci → 409, tanpa pesanan/pembayaran/riwayat/stok', async () => {
  const { res, before, after, waits } = await checkoutWhileOwnerSaves((tx) => tx.$executeRawUnsafe("UPDATE store_settings SET preorder_cutoff_time = '15:00:00' WHERE setting_id = 1"));
  record(FILE, 'T1-a-cutoff', { status: res.status, message: res.body.message, before, after, waited: waits.map((w) => w.waiting_table) });
  assert.deepEqual([res.status, res.body.message], [409, STALE]);
  assert.deepEqual(after, before, 'rollback penuh');
  assert.deepEqual(await appHeldLocks(), []);
  await db.$executeRawUnsafe('UPDATE store_settings SET preorder_cutoff_time = ? WHERE setting_id = 1', original.profile.cutoff);
});

test('T1-a jam operasional diubah & di-commit selagi checkout menunggu kunci → 409, tanpa data parsial', async () => {
  const { res, before, after } = await checkoutWhileOwnerSaves((tx) => tx.$executeRawUnsafe("UPDATE operating_hours SET close_time = '19:30:00' WHERE day_of_week = 1"));
  record(FILE, 'T1-a-hours', { status: res.status, before, after });
  assert.deepEqual([res.status, res.body.message], [409, STALE]);
  assert.deepEqual(after, before);
  const h = original.hours.find((x) => Number(x.day_of_week) === 1);
  await db.$executeRawUnsafe('UPDATE operating_hours SET close_time = ? WHERE day_of_week = 1', h.c);
});

test('T1-b perubahan yang tidak dipakai pesanan (nama toko, WhatsApp) selagi checkout menunggu → 201', async () => {
  const { res, before, after } = await checkoutWhileOwnerSaves((tx) => tx.$executeRawUnsafe("UPDATE store_settings SET store_name = 'Oven & Co. T1', whatsapp_number = '+6281299990000' WHERE setting_id = 1"));
  record(FILE, 'T1-b', { status: res.status, before, after });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual(after, { orders: before.orders + 1, payments: before.payments + 1, histories: before.histories + 1, qtySold: before.qtySold + 1 });
  await db.$executeRawUnsafe('UPDATE store_settings SET store_name = ?, whatsapp_number = ? WHERE setting_id = 1', original.profile.store_name, original.profile.whatsapp_number);
});

test(`T1-c PUT /api/admin/settings asli bersamaan dengan checkout asli × ${ROUNDS} → hanya 201/409, tanpa 5xx & deadlock, 409 tanpa data parsial`, async () => {
  const ownerId = await createUser('owner');
  await onlyTheseOwnersActive([ownerId]);
  const base = { store_name: original.profile.store_name, address: original.profile.address, whatsapp_number: original.profile.whatsapp_number,
    delivery_radius_km: original.profile.radius, delivery_fee_per_km: original.profile.fee };
  const metricsBefore = await innodbMetrics();
  const statuses = {};
  const partial = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    const customers = [];
    for (let i = 0; i < 4; i += 1) customers.push(await createUser('customer'));
    const bodies = await Promise.all(customers.map(orderBody)); // pengaturan dibaca SEBELUM PUT dikirim
    const befores = await Promise.all(customers.map(footprint));
    const cutoff = round % 2 ? '16:00' : '16:30';
    const results = await Promise.all([
      call(server, 'PUT', '/api/admin/settings', { userId: ownerId, body: { ...base, preorder_cutoff_time: cutoff } }),
      ...customers.map((c, i) => call(server, 'POST', '/api/orders', { userId: c, body: bodies[i] })),
    ]);
    Object.entries(tally(results.slice(1))).forEach(([s, n]) => { statuses[`checkout ${s}`] = (statuses[`checkout ${s}`] ?? 0) + n; });
    statuses[`put ${results[0].status}`] = (statuses[`put ${results[0].status}`] ?? 0) + 1;
    for (let i = 0; i < customers.length; i += 1) {
      if (results[i + 1].status !== 409) continue;
      const after = await footprint(customers[i]);
      if (after.orders !== befores[i].orders || after.payments !== befores[i].payments || after.histories !== befores[i].histories) partial.push({ round, i, after });
    }
  }
  const metricsAfter = await innodbMetrics();
  const summary = { statuses, partial, deadlocks: metricsAfter.lock_deadlocks - metricsBefore.lock_deadlocks, leftover: await appHeldLocks() };
  record(FILE, 'T1-c', summary);
  assert.ok(Object.keys(statuses).every((k) => /^(checkout (201|409)|put 200)$/.test(k)), JSON.stringify(statuses));
  assert.deepEqual(partial, []);
  assert.equal(summary.deadlocks, 0);
  assert.deepEqual(summary.leftover, []);
});
