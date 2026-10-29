// tests/helpers/orderDb.js
// Basis data pesanan di memori untuk tes /api/orders & /api/payments (Prisma dipalsukan, BUKAN MySQL).
// - `where` dinilai dengan whereMatch agar tes memeriksa hasil filter, bukan bentuk query.
// - $executeRaw meniru UPDATE stok bersyarat (qty_planned - qty_sold >= qty) dan mengembalikan jumlah baris.
// - $transaction mengembalikan seluruh tabel bila callback gagal (meniru rollback); kunci FOR UPDATE dicatat.
// Tidak membuktikan perilaku locking/transaksi/foreign key MySQL yang sebenarnya.

const { matchesWhere } = require('./whereMatch');

const STORE = { lat: -6.2, lng: 106.8 };

function baseTables(today, plusDays) {
  const product = (overrides) => ({
    categoryId: 1, description: null, leadTimeDays: 0, isActive: true, availabilityType: 'ready',
    images: [{ imageUrl: `/img/${overrides.productId}.webp`, sortOrder: 0, imageId: 1n }], variants: [], ...overrides,
  });
  const voucher = (overrides) => ({
    title: 'Voucher', discountType: 'amount', discountValue: '10000.00', productId: null, quota: 5,
    validFrom: plusDays(-5), validTo: plusDays(10), isActive: true, ...overrides,
  });

  return {
    users: {
      1: { userId: 1n, role: 'customer', isActive: true },
      2: { userId: 2n, role: 'customer', isActive: true },
      3: { userId: 3n, role: 'staf', isActive: true },
      4: { userId: 4n, role: 'owner', isActive: true },
      5: { userId: 5n, role: 'customer', isActive: false },
    },
    storeSetting: {
      settingId: 1, storeName: 'Oven & Co.', address: 'Jl. Toko 1', latitude: String(STORE.lat), longitude: String(STORE.lng),
      whatsappNumber: '+6281200000000', preorderCutoffTime: null, deliveryRadiusKm: '10.00', deliveryFeePerKm: '2500.00',
      paymentTimeoutMinutes: 30, earnAmountPerPoint: '1000.00', redeemPointsUnit: 100, redeemValue: '5000.00',
      goldMinPoints: 500, platinumMinPoints: 2000, reviewBonusPoints: 20,
    },
    products: [
      product({ productId: 1n, name: 'Classic Butter Croissant', price: '28000.00' }),
      product({
        productId: 2n, name: 'Cinnamon Roll', price: '25000.00',
        variants: [{ variantId: 21n, productId: 2n, name: 'Extra Glaze', extraPrice: '5000.00', isActive: true }],
      }),
      product({ productId: 3n, name: 'Sourdough', price: '60000.00', availabilityType: 'preorder', leadTimeDays: 1 }),
      product({ productId: 4n, name: 'Roti Nonaktif', price: '10000.00', isActive: false }),
      product({ productId: 6n, name: 'Custom Celebration Cake', price: '450000.00', availabilityType: 'custom', leadTimeDays: 3 }),
    ],
    dailyStocks: [
      { productId: 1n, stockDate: today, qtyPlanned: 10, qtySold: 2 },
      { productId: 2n, stockDate: today, qtyPlanned: 5, qtySold: 4 },
      { productId: 4n, stockDate: today, qtyPlanned: 10, qtySold: 0 },
    ],
    designs: [
      { designId: 60n, productId: 6n, userId: 1n, readyDate: plusDays(3), price: '480000.00', writingText: null, writingColor: null, referencePhotoUrl: null, options: [] },
      { designId: 61n, productId: 6n, userId: 2n, readyDate: plusDays(3), price: '480000.00', writingText: null, writingColor: null, referencePhotoUrl: null, options: [] },
    ],
    paymentMethods: [
      { methodCode: 'qris', name: 'QRIS', methodGroup: 'qris', isActive: true },
      { methodCode: 'bca_va', name: 'BCA Virtual Account', methodGroup: 'va', isActive: true },
      { methodCode: 'ovo', name: 'OVO', methodGroup: 'ewallet', isActive: false },
      { methodCode: 'pay_at_store', name: 'Bayar di Toko', methodGroup: 'store', isActive: true },
    ],
    operatingHours: [],
    addresses: [
      { addressId: 10n, userId: 1n, label: 'Rumah', recipientName: 'Anisa', recipientPhone: '+6281234567890', fullAddress: 'Jl. Dekat 1', latitude: String(STORE.lat + 0.02), longitude: String(STORE.lng), courierNote: null, isPrimary: true },
      { addressId: 11n, userId: 1n, label: 'Jauh', recipientName: 'Anisa', recipientPhone: '+6281234567890', fullAddress: 'Jl. Jauh 9', latitude: String(STORE.lat + 0.5), longitude: String(STORE.lng), courierNote: null, isPrimary: false },
      { addressId: 20n, userId: 2n, label: 'Rumah B', recipientName: 'Budi', recipientPhone: '+6281234567899', fullAddress: 'Jl. B', latitude: String(STORE.lat + 0.01), longitude: String(STORE.lng), courierNote: null, isPrimary: true },
    ],
    vouchers: [
      voucher({ voucherId: 1n, code: 'HEMAT10' }),
      voucher({ voucherId: 2n, code: 'CAKE15', discountType: 'percent', discountValue: '15.00', productId: 6n }),
      voucher({ voucherId: 3n, code: 'HABIS', quota: 0 }),
      voucher({ voucherId: 4n, code: 'TERPAKAI' }),
      voucher({ voucherId: 5n, code: 'BELUMKLAIM' }),
    ],
    userVouchers: [
      { userId: 1n, voucherId: 1n, claimedAt: plusDays(-1), usedAt: null },
      { userId: 1n, voucherId: 2n, claimedAt: plusDays(-1), usedAt: null },
      { userId: 1n, voucherId: 3n, claimedAt: plusDays(-1), usedAt: null },
      { userId: 1n, voucherId: 4n, claimedAt: plusDays(-1), usedAt: plusDays(-1) },
      { userId: 2n, voucherId: 1n, claimedAt: plusDays(-1), usedAt: null },
    ],
    pointTransactions: [
      { pointTxId: 1n, userId: 1n, type: 'earn', points: 1250, orderId: null, reviewId: null, createdAt: plusDays(-30) },
      { pointTxId: 2n, userId: 2n, type: 'earn', points: 300, orderId: null, reviewId: null, createdAt: plusDays(-30) },
    ],
    orders: [],
    orderItems: [],
    payments: [],
    statusHistories: [],
    reviews: [],
  };
}

const pick = (row, select) => (select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) : { ...row });

const sortBy = (rows, orderBy = []) =>
  [...rows].sort((a, b) => {
    for (const clause of [].concat(orderBy)) {
      const [field, dir] = Object.entries(clause)[0];
      if (a[field] < b[field]) return dir === 'asc' ? -1 : 1;
      if (a[field] > b[field]) return dir === 'asc' ? 1 : -1;
    }
    return 0;
  });

const clone = (tables) => {
  const copy = {};
  for (const [name, value] of Object.entries(tables)) {
    copy[name] = Array.isArray(value) ? value.map((row) => ({ ...row })) : value;
  }
  return copy;
};

/**
 * Pasang tabel palsu ke fakePrisma.
 * @param {object} fakePrisma
 * @param {{today: Date, plusDays: (n: number) => Date}} dates — tanggal @db.Date (UTC tengah malam)
 */
function installOrderDb(fakePrisma, dates) {
  const state = {
    t: baseTables(dates.today, dates.plusDays), locks: [], raw: [], failOn: null, hooks: {}, committedElsewhere: [],
  };
  let nextId = { order: 100n, item: 1000n, payment: 500n, history: 700n, point: 900n };
  const id = (key) => (nextId[key] += 1n);
  const fail = (op) => {
    if (state.failOn === op) throw Object.assign(new Error('Can\'t reach database server'), { code: 'P1001' });
  };

  const orderView = (row, include = {}) => {
    const out = { ...row };
    if (include.payments) {
      const rows = sortBy(state.t.payments.filter((p) => p.orderId === row.orderId), include.payments.orderBy);
      out.payments = rows.slice(0, include.payments.take ?? rows.length).map((p) => ({
        ...p, method: include.payments.include?.method ? state.t.paymentMethods.find((m) => m.methodCode === p.methodCode) : undefined,
      }));
    }
    if (include.items) {
      out.items = sortBy(state.t.orderItems.filter((i) => i.orderId === row.orderId), include.items.orderBy).map((i) => {
        const product = state.t.products.find((p) => p.productId === i.productId);
        return {
          ...i,
          product: {
            ...product,
            dailyStocks: state.t.dailyStocks.filter((d) => d.productId === i.productId && d.stockDate.getTime() === dates.today.getTime()),
          },
          variant: i.variantId ? product.variants.find((v) => v.variantId === i.variantId) ?? null : null,
          design: i.designId ? state.t.designs.find((d) => d.designId === i.designId) ?? null : null,
          review: state.t.reviews.find((r) => r.orderItemId === i.orderItemId) ?? null,
        };
      });
    }
    if (include.statusHistories) {
      out.statusHistories = sortBy(state.t.statusHistories.filter((h) => h.orderId === row.orderId), include.statusHistories.orderBy);
    }
    return out;
  };

  Object.assign(fakePrisma, {
    user: { findUnique: async ({ where }) => state.t.users[String(where.userId)] ?? null },
    storeSetting: { findFirst: async () => state.t.storeSetting },
    paymentMethod: {
      findMany: async ({ where }) => sortBy(state.t.paymentMethods.filter((m) => matchesWhere(m, where)), [{ methodGroup: 'asc' }]),
    },
    operatingHour: { findMany: async () => state.t.operatingHours },
    address: { findFirst: async ({ where }) => state.t.addresses.find((a) => matchesWhere(a, where)) ?? null },
    product: {
      findMany: async ({ where }) => {
        fail('product.findMany');
        return state.t.products.filter((p) => matchesWhere(p, where)).map((p) => ({
          ...p,
          dailyStocks: state.t.dailyStocks.filter((s) => s.productId === p.productId && s.stockDate.getTime() === dates.today.getTime()),
        }));
      },
    },
    customCakeDesign: {
      findMany: async ({ where }) => state.t.designs.filter((d) => matchesWhere(d, where)).map((d) => ({
        ...d, orderItems: state.t.orderItems.filter((i) => i.designId === d.designId).slice(0, 1),
      })),
    },
    orderItem: { count: async ({ where }) => state.t.orderItems.filter((i) => matchesWhere(i, where)).length },
    voucher: {
      findUnique: async ({ where }) => state.t.vouchers.find((v) => v.code === where.code) ?? null,
      updateMany: async ({ where, data }) => {
        const rows = state.t.vouchers.filter((v) => matchesWhere(v, where));
        rows.forEach((v) => { v.quota -= data.quota.decrement; });
        return { count: rows.length };
      },
    },
    userVoucher: {
      findUnique: async ({ where }) => {
        const { userId, voucherId } = where.userId_voucherId;
        return state.t.userVouchers.find((c) => c.userId === userId && c.voucherId === voucherId) ?? null;
      },
      updateMany: async ({ where, data }) => {
        const rows = state.t.userVouchers.filter((c) => matchesWhere(c, where));
        rows.forEach((c) => Object.assign(c, data));
        return { count: rows.length };
      },
    },
    pointTransaction: {
      findMany: async ({ where, select }) => state.t.pointTransactions.filter((p) => matchesWhere(p, where)).map((p) => pick(p, select)),
      create: async ({ data }) => {
        const row = { pointTxId: id('point'), reviewId: null, ...data };
        state.t.pointTransactions.push(row);
        return row;
      },
    },
    order: {
      findMany: async ({ where, select, include, orderBy }) => {
        fail('order.findMany');
        return sortBy(state.t.orders.filter((o) => matchesWhere(o, where)), orderBy)
          .map((o) => (select ? pick(o, select) : orderView(o, include)));
      },
      findFirst: async ({ where, include }) => {
        fail('order.findFirst');
        const row = state.t.orders.find((o) => matchesWhere(o, where));
        return row ? orderView(row, include) : null;
      },
      update: async ({ where, data }) => {
        fail('order.update');
        const row = state.t.orders.find((o) => o.orderId === where.orderId);
        Object.assign(row, data);
        return { ...row };
      },
      updateMany: async ({ where, data }) => {
        const rows = state.t.orders.filter((o) => matchesWhere(o, where));
        rows.forEach((o) => Object.assign(o, data));
        return { count: rows.length };
      },
      create: async ({ data, select }) => {
        fail('order.create');
        state.hooks.beforeOrderCreate?.(data);
        if (state.t.orders.some((o) => o.orderNumber === data.orderNumber)) {
          throw Object.assign(new Error('Unique constraint failed on orders_order_number_key'), { code: 'P2002' });
        }
        const { items, payments, statusHistories, ...columns } = data;
        const row = {
          orderId: id('order'), voucherId: null, courierName: null, cancelReason: null, pickupCode: null, addressId: null,
          deliveryAddressSnapshot: null, distanceKm: null, ...columns,
        };
        state.t.orders.push(row);
        items.create.forEach((item) => state.t.orderItems.push({ orderItemId: id('item'), orderId: row.orderId, ...item }));
        state.t.payments.push({ paymentId: id('payment'), orderId: row.orderId, paidAt: null, ...payments.create });
        state.t.statusHistories.push({ historyId: id('history'), orderId: row.orderId, note: null, ...statusHistories.create });
        return pick(row, select);
      },
    },
    payment: {
      update: async ({ where, data }) => {
        fail('payment.update');
        const row = state.t.payments.find((p) => p.paymentId === where.paymentId);
        Object.assign(row, data);
        return { ...row };
      },
      updateMany: async ({ where, data }) => {
        const rows = state.t.payments.filter((p) => matchesWhere(p, where));
        rows.forEach((p) => Object.assign(p, data));
        return { count: rows.length };
      },
    },
    orderStatusHistory: {
      create: async ({ data }) => {
        const row = { historyId: id('history'), note: null, ...data };
        state.t.statusHistories.push(row);
        return row;
      },
    },
    $queryRaw: async (strings, ...values) => {
      const sql = strings.join('?');
      state.locks.push({ sql, values });
      // Request lain yang memegang kunci selesai lebih dulu (dijalankan saat "menunggu" kunci baris pesanan)
      if (/FROM orders WHERE order_id = \? FOR UPDATE/.test(sql)) state.hooks.whileWaitingOrderLock?.();
      return [];
    },
    $executeRaw: async (strings, ...values) => {
      const sql = strings.join('?');
      state.raw.push({ sql, values });
      state.hooks.beforeStockUpdate?.();
      if (!/UPDATE daily_stocks SET qty_sold = qty_sold \+ \?\s+WHERE product_id = \? AND stock_date = \? AND qty_planned - qty_sold >= \?/.test(sql)) {
        throw new Error(`orderDb: SQL tidak dikenal: ${sql}`);
      }
      const [quantity, productId, stockDate, minimum] = values;
      const row = state.t.dailyStocks.find((s) => s.productId === productId && s.stockDate.getTime() === stockDate.getTime());
      if (!row || row.qtyPlanned - row.qtySold < minimum) return 0;
      row.qtySold += quantity;
      return 1;
    },
    $transaction: async (callback) => {
      const snapshot = clone(state.t);
      try {
        return await callback(fakePrisma);
      } catch (error) {
        state.t = snapshot;
        // Baris yang di-commit transaksi LAIN (pesanan bersamaan) tidak ikut dibatalkan
        state.t.orders.push(...state.committedElsewhere.splice(0));
        throw error;
      }
    },
  });

  return state;
}

module.exports = { installOrderDb, STORE };
