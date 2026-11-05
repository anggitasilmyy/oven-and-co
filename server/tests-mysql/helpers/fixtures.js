// tests-mysql/helpers/fixtures.js
// Integrasi MySQL 8 — Validasi AD-11 (C3), dengan smoke test C2. Data uji: akun admin/pelanggan baru per skenario
// (email unik), snapshot seluruh kolom users, checkout lewat HTTP asli, dan penyiapan pesanan untuk AD-04.
// Penyiapan kondisi awal boleh lewat SQL langsung (bukan kode yang diuji); AKSI yang diuji selalu lewat HTTP.

const { TIME_SLOTS, ORDER_STATUS } = require('../../src/utils/businessConstants');
const { formatTimeSlot } = require('../../src/services/operatingHours.service');
const { db, rows } = require('./context');
const { call } = require('./server');

let sequence = 0;
const unique = (prefix) => `${prefix}${Date.now().toString(36)}${(sequence += 1)}`;
let phoneSequence = 0;
const uniquePhone = () => `+62877${String(Date.now() % 1e6).padStart(6, '0')}${String((phoneSequence += 1) % 100).padStart(2, '0')}`;

/** Akun baru langsung di database (hash tiruan — login memakai JWT uji) */
async function createUser(role, { active = true, prefix = role } = {}) {
  const row = await db.user.create({
    data: { name: `C4 ${prefix}`, email: `${unique(prefix)}@c4.test`, phone: uniquePhone(), passwordHash: 'x', role, isActive: active },
    select: { userId: true },
  });
  return String(row.userId);
}

/** Setup: hanya Owner yang disebut yang aktif (Owner lain dinonaktifkan lewat SQL, bukan lewat endpoint) */
async function onlyTheseOwnersActive(ownerIds) {
  await db.$executeRawUnsafe(
    `UPDATE users SET is_active = (user_id IN (${ownerIds.map(() => '?').join(',')})) WHERE role = 'owner'`,
    ...ownerIds,
  );
}

const activeOwnerIds = async () => (await rows("SELECT user_id FROM users WHERE role='owner' AND is_active=1 ORDER BY user_id")).map((r) => r.user_id);
const isActive = async (userId) => (await rows('SELECT is_active FROM users WHERE user_id = ?', userId))[0].is_active === 1;

/** Seluruh kolom seluruh baris users (untuk membuktikan hanya is_active target yang berubah) */
const usersSnapshot = () => rows('SELECT * FROM users ORDER BY user_id');

/** Checkout pre-order pickup (produk 9, tanpa stok harian) → {status, body} */
async function checkout(server, customerId, { methodCode = 'qris' } = {}) {
  const items = [{ cart_item_id: unique('ci'), product_id: '9', quantity: 1 }];
  const cart = await call(server, 'POST', '/api/cart', { userId: customerId, body: { items } });
  if (cart.status !== 200) throw new Error(`cart gagal: ${JSON.stringify(cart.body)}`);
  return call(server, 'POST', '/api/orders', {
    userId: customerId,
    body: {
      items, fulfillment: 'pickup', address_id: null, ready_date: cart.body.data.ready_date,
      time_slot: formatTimeSlot(TIME_SLOTS[1]), voucher_code: null, use_points: false, method_code: methodCode,
    },
  });
}

/** Siapkan pesanan (hasil checkout asli) di status tertentu + lunas, untuk dilanjutkan AD-04 */
async function prepareOrder(orderNumber, status) {
  await db.$executeRawUnsafe("UPDATE orders SET order_status = ?, payment_status = 'paid' WHERE order_number = ?", status, orderNumber);
  return (await rows('SELECT order_id, user_id, pickup_code FROM orders WHERE order_number = ?', orderNumber))[0];
}

/** Body AD-04 untuk langkah berikutnya pesanan pickup */
function nextStepBody(fromStatus, pickupCode) {
  if (fromStatus === ORDER_STATUS.DIKONFIRMASI) return { from: fromStatus, to: ORDER_STATUS.SEDANG_DISIAPKAN };
  if (fromStatus === ORDER_STATUS.SEDANG_DISIAPKAN) return { from: fromStatus, to: ORDER_STATUS.SIAP_DIAMBIL };
  return { from: fromStatus, to: ORDER_STATUS.SELESAI, pickup_code: pickupCode };
}

const changeStatus = (server, adminId, orderNumber, body) =>
  call(server, 'PATCH', `/api/admin/orders/${orderNumber}/status`, { userId: adminId, body });

/** Hitung status HTTP: {200: 3, 401: 1} */
const tally = (results) => results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});

module.exports = {
  ORDER_STATUS, unique, createUser, onlyTheseOwnersActive, activeOwnerIds, isActive, usersSnapshot,
  checkout, prepareOrder, nextStepBody, changeStatus, tally,
};
