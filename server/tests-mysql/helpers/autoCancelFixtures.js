// tests-mysql/helpers/autoCancelFixtures.js
// Step 6.5 C3 — data & alat uji bersama pembatalan otomatis (BR-06/BR-07) untuk tests-mysql/14-*.
// (File 13 memakai salinan lokalnya sendiri dan sengaja tidak diubah.) Kondisi awal disiapkan lewat SQL langsung;
// AKSI yang diuji (job, checkout, batal, AD-04, AD-11) selalu asli.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { TIME_SLOTS } = require('../../src/utils/businessConstants');
const { formatTimeSlot } = require('../../src/services/operatingHours.service');
const { getJakartaDateKey } = require('../../src/utils/jakartaDate');
const { ARTIFACT_DIR, APP_URL, CONTAINER, DATABASE, db, rows, holdTransaction } = require('./context');
const { call } = require('./server');
const { createUser, unique } = require('./fixtures');

const SERVER_DIR = path.join(__dirname, '..', '..');

/**
 * @param {{label: string, getServer: () => object}} opts — label produk/voucher uji; getServer = server API uji (startServer)
 */
function createAutoCancelFixtures({ label, getServer }) {
  const today = () => getJakartaDateKey(new Date());
  // harnessStock = jumlah +1 qty_sold yang di-COMMIT peniru checkout (holdCheckoutStock) — pesanan peniru tanpa item
  const state = { readyProduct: null, voucherId: null, voucherCode: null, harnessStock: 0 };

  async function setup() {
    await db.$executeRawUnsafe(`INSERT INTO products (category_id, name, description, price, availability_type, lead_time_days, is_active)
      VALUES (3, ?, ?, 10000, 'ready', 0, 1)`, unique(`${label} ready `), `Produk uji ${label}`);
    state.readyProduct = (await rows('SELECT product_id AS id FROM products WHERE description = ? ORDER BY product_id DESC LIMIT 1', `Produk uji ${label}`))[0].id;
    await db.$executeRawUnsafe('INSERT INTO daily_stocks (product_id, stock_date, qty_planned, qty_sold) VALUES (?, ?, 100000, 0)', state.readyProduct, today());
    state.voucherCode = `${label}${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
    await db.$executeRawUnsafe(`INSERT INTO vouchers (code, title, discount_type, discount_value, product_id, quota, valid_from, valid_to, is_active)
      VALUES (?, ?, 'amount', 5000, NULL, 100000, DATE_SUB(?, INTERVAL 1 DAY), DATE_ADD(?, INTERVAL 30 DAY), 1)`,
    state.voucherCode, `Voucher uji ${label}`, today(), today());
    state.voucherId = (await rows('SELECT voucher_id FROM vouchers WHERE code = ?', state.voucherCode))[0].voucher_id;
  }

  /** Pelanggan baru dengan 300 poin & klaim voucher uji */
  async function customerWithBenefits() {
    const customer = await createUser('customer');
    await db.$executeRawUnsafe("INSERT INTO point_transactions (user_id, type, points, created_at) VALUES (?, 'earn', 300, NOW())", customer);
    await db.$executeRawUnsafe('INSERT INTO user_vouchers (user_id, voucher_id, claimed_at) VALUES (?, ?, NOW())', customer, state.voucherId);
    return customer;
  }

  /** Produk ready uji ×2 + pre-order 9 → tanggal siap besok, slot apa pun sah (tidak bergantung jam nyata) */
  async function orderBody(customer, { benefits = false } = {}) {
    const items = [
      { cart_item_id: unique('ci'), product_id: String(state.readyProduct), quantity: 2 },
      { cart_item_id: unique('ci'), product_id: '9', quantity: 1 },
    ];
    const cart = await call(getServer(), 'POST', '/api/cart', { userId: customer, body: { items } });
    assert.equal(cart.status, 200, JSON.stringify(cart.body));
    return {
      items, fulfillment: 'pickup', address_id: null, ready_date: cart.body.data.ready_date, time_slot: formatTimeSlot(TIME_SLOTS[1]),
      voucher_code: benefits ? state.voucherCode : null, use_points: benefits, method_code: 'qris',
    };
  }

  async function placeOrder(customer, opts) {
    const res = await call(getServer(), 'POST', '/api/orders', { userId: customer, body: await orderBody(customer, opts) });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.data.order_number;
  }

  const orderIdOf = async (number) => (await rows('SELECT order_id FROM orders WHERE order_number = ?', number))[0].order_id;

  /** BR-06: geser batas bayar online */
  async function setExpiry(number, offsetMs) {
    const expiredAt = new Date(Math.floor((Date.now() + offsetMs) / 1000) * 1000);
    await db.payment.updateMany({ where: { orderId: BigInt(await orderIdOf(number)) }, data: { expiredAt } });
    return expiredAt;
  }

  /**
   * BR-07: jadikan pesanan (hasil checkout asli) Bayar di Toko pada status & tanggal siap tertentu — penyiapan SQL.
   * Baris payments tetap `pending`, orders.payment_status `unpaid`.
   */
  async function makePayAtStore(number, { status = 'dikonfirmasi', readyDate }) {
    const orderId = await orderIdOf(number);
    await db.$executeRawUnsafe(`UPDATE orders SET payment_option = 'pay_at_store', order_status = ?, ready_date = ?
      WHERE order_id = ?`, status, readyDate, orderId);
    await db.$executeRawUnsafe("UPDATE payments SET method_code = 'pay_at_store', payment_code = NULL, gateway_ref = NULL WHERE order_id = ?", orderId);
  }

  const stockSold = async () => Number((await rows('SELECT qty_sold AS n FROM daily_stocks WHERE product_id = ? AND stock_date = ?', state.readyProduct, today()))[0].n);
  const quota = async () => Number((await rows('SELECT quota AS n FROM vouchers WHERE voucher_id = ?', state.voucherId))[0].n);
  const balance = async (customer) => Number((await rows('SELECT COALESCE(SUM(points), 0) AS n FROM point_transactions WHERE user_id = ?', customer))[0].n);
  const claimUsed = async (customer) => (await rows('SELECT used_at FROM user_vouchers WHERE user_id = ? AND voucher_id = ?', customer, state.voucherId))[0].used_at !== null;
  const benefits = async (customer) => ({ sold: await stockSold(), quota: await quota(), balance: await balance(customer), claimUsed: await claimUsed(customer) });

  /** Jejak satu pesanan */
  async function trail(number) {
    const [o] = await rows(`SELECT o.order_id, o.order_status, o.payment_status, o.cancel_reason, o.points_used, p.status AS payment_row
      FROM orders o JOIN payments p ON p.order_id = o.order_id WHERE o.order_number = ?`, number);
    const count = async (sql) => Number((await rows(sql, o.order_id))[0].n);
    return {
      status: o.order_status, payment: o.payment_status, paymentRow: o.payment_row, reason: o.cancel_reason, pointsUsed: Number(o.points_used),
      histories: await count('SELECT COUNT(*) AS n FROM order_status_histories WHERE order_id = ?'),
      cancelHistories: await count("SELECT COUNT(*) AS n FROM order_status_histories WHERE order_id = ? AND status = 'dibatalkan'"),
      systemCancel: await count("SELECT COUNT(*) AS n FROM order_status_histories WHERE order_id = ? AND status = 'dibatalkan' AND changed_by IS NULL"),
      statusNotices: await count("SELECT COUNT(*) AS n FROM notifications WHERE order_id = ? AND type = 'order_status'"),
      cancelNotices: await count("SELECT COUNT(*) AS n FROM notifications WHERE order_id = ? AND title = 'Pesanan dibatalkan'"),
      pointNotices: await count("SELECT COUNT(*) AS n FROM notifications WHERE order_id = ? AND type = 'points'"),
      refunds: await count("SELECT COUNT(*) AS n FROM point_transactions WHERE order_id = ? AND type = 'refund'"),
    };
  }

  /** Dibatalkan JOB tepat sekali dengan alasan & status pembayaran tertentu */
  function assertAutoCancelledOnce(t, reason, label) {
    assert.deepEqual([t.status, t.payment, t.paymentRow, t.reason], ['dibatalkan', 'unpaid', 'expired', reason], label);
    assert.deepEqual([t.cancelHistories, t.systemCancel, t.cancelNotices], [1, 1, 1], `${label}: 1 riwayat sistem & 1 notifikasi`);
    assert.equal(t.histories, t.statusNotices, `${label}: riwayat = notifikasi status`);
    assert.equal(t.refunds, t.pointsUsed > 0 ? 1 : 0, `${label}: refund poin tepat sekali`);
    assert.equal(t.pointNotices, t.pointsUsed > 0 ? 1 : 0, `${label}: notifikasi poin tepat sekali`);
  }

  /** Pegang kunci X baris pesanan (transaksi lain sedang memproses pesanan itu) */
  const holdOrder = (number) => holdTransaction((tx) => tx.$queryRawUnsafe('SELECT order_id FROM orders WHERE order_number = ? FOR UPDATE', number));

  /**
   * Meniru checkout pelanggan LAIN (orderCreate.service: takeReadyStock lalu writeOrder): langkah awal memegang kunci X
   * baris daily_stocks produk uji hari ini; `finish` lalu INSERT orders + payments (insert intention indeks payments).
   */
  function holdCheckoutStock(otherCustomer) {
    const hold = holdTransaction((tx) => tx.$executeRawUnsafe(
      'UPDATE daily_stocks SET qty_sold = qty_sold + 1 WHERE product_id = ? AND stock_date = ?', state.readyProduct, today(),
    ));
    const finish = () => hold.release(async (tx) => {
      await tx.$executeRawUnsafe(`INSERT INTO orders (order_number, user_id, fulfillment_type, ready_date, time_slot, subtotal,
        shipping_fee, voucher_discount, points_used, points_discount, total, payment_option, payment_status, order_status, created_at)
        VALUES (?, ?, 'pickup', CURDATE(), '09.00–11.00', 10000, 0, 0, 0, 0, 10000, 'online', 'unpaid', 'menunggu_pembayaran', NOW())`,
      unique('Q-').slice(0, 20), otherCustomer);
      const [{ id }] = await tx.$queryRawUnsafe('SELECT LAST_INSERT_ID() AS id');
      await tx.$executeRawUnsafe(`INSERT INTO payments (order_id, method_code, amount, status, expired_at)
        VALUES (?, 'qris', 10000, 'pending', NOW() + INTERVAL 30 MINUTE)`, id);
    }).then(() => { state.harnessStock += 1; return 'commit'; }, (e) => `ERR ${String(e.meta?.message ?? e.message).replace(/\s+/g, ' ').slice(-160)}`);
    return { ready: hold.ready, finish };
  }

  /** Job di proses anak terpisah → ringkasan runAutoCancel */
  function runJobProcess(now) {
    const code = `const job = require('./src/jobs/autoCancelOrders');
      job.runAutoCancel({ now: new Date(${JSON.stringify(now.toISOString())}) })
        .then((s) => { process.stdout.write('RESULT ' + JSON.stringify(s) + '\\n'); return require('./src/lib/prisma').$disconnect(); })
        .then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });`;
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['-e', code], { cwd: SERVER_DIR, env: { ...process.env, DATABASE_URL: APP_URL, NODE_ENV: 'test' } });
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { err += d; });
      child.on('exit', (exitCode) => {
        const line = out.split('\n').find((l) => l.startsWith('RESULT '));
        if (exitCode !== 0 || !line) return reject(new Error(`proses job gagal (${exitCode}): ${err.slice(0, 500)}`));
        return resolve(JSON.parse(line.slice(7)));
      });
    });
  }

  /** DDL lewat klien mysql di container (CREATE/DROP TRIGGER tidak didukung protokol prepared statement — 1295) */
  function mysqlCli(sql) {
    const password = decodeURIComponent(new URL(process.env.ROOT_DATABASE_URL).password);
    const result = spawnSync('docker', ['exec', '-i', CONTAINER, 'mysql', '-uroot', `-p${password}`, DATABASE], { input: sql, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`mysql gagal: ${result.stderr}`);
  }

  /** Server API asli dengan penjadwal aktif (NODE_ENV=development) */
  function startSchedulerServer(name) {
    const logPath = path.join(ARTIFACT_DIR, `server-${label}-${name}.log`);
    const log = fs.openSync(logPath, 'w');
    const port = 30000 + Math.floor(Math.random() * 20000);
    const child = spawn(process.execPath, ['src/server.js'], {
      cwd: SERVER_DIR,
      env: { ...process.env, DATABASE_URL: APP_URL, PORT: String(port), JWT_SECRET: `${name}-only`, NODE_ENV: 'development' },
      stdio: ['ignore', log, log],
    });
    const exited = new Promise((resolve) => child.once('exit', (code, signal) => { fs.closeSync(log); resolve({ code, signal }); }));
    return { child, exited, readLog: () => fs.readFileSync(logPath, 'utf8') };
  }

  return {
    state, today, setup, customerWithBenefits, orderBody, placeOrder, orderIdOf, setExpiry, makePayAtStore,
    stockSold, quota, balance, claimUsed, benefits, trail, assertAutoCancelledOnce, holdOrder, holdCheckoutStock,
    runJobProcess, mysqlCli, startSchedulerServer,
  };
}

module.exports = { createAutoCancelFixtures };
