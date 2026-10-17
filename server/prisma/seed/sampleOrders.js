// prisma/seed/sampleOrders.js
// Step 6.1 · Pesanan contoh representatif (seed pilihan A): setiap status SPEC §4, pickup & delivery, Bayar di Toko,
// pre-order, custom cake, pembatalan otomatis BR-06. Termasuk contoh nomor SPEC §9 OVC-261012-018.
// Turunannya ikut dibuat konsisten: order_items, payments, order_status_histories, review + bonus poin, poin,
// notifikasi, desain custom cake, dan daily_stocks (stok ready terjual saat pesanan dibuat, kembali bila batal — TF-12).
// Saldo 1.250 poin akun demo (SPEC §9) dibentuk dari point_transactions (saldo tidak disimpan sebagai kolom).

const {
  ANCHOR_DATE, PRODUCTS, PRODUCT_VARIANTS, CUSTOM_OPTIONS, DAILY_STOCK_PLAN, STORE_SETTINGS, ADDRESSES,
  DEMO_CUSTOMER_ID, DEMO_POINT_BALANCE,
} = require('./catalog');

const STAF_ID = 2;
const pad = (n, w = 2) => String(n).padStart(w, '0');
/** Kunci tanggal ANCHOR_DATE + n hari */
const dayKey = (offset) => {
  const d = new Date(`${ANCHOR_DATE}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
/** Waktu lokal WIB (UTC+7) → Date; DATETIME disimpan Prisma dalam UTC */
const at = (offset, hhmm) => new Date(`${dayKey(offset)}T${hhmm}:00+07:00`);
const plusMinutes = (date, m) => new Date(date.getTime() + m * 60000);
const dateOnly = (offset) => new Date(`${dayKey(offset)}T00:00:00Z`);
const orderNumber = (offset, seq) => `OVC-${dayKey(offset).slice(2).replace(/-/g, '')}-${pad(seq, 3)}`;

/** Jarak haversine (km, 2 desimal) — sama dengan distanceKm di client/src/utils/rules/checkout.js */
function distanceKm(a, b) {
  const rad = (d) => (Number(d) * Math.PI) / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 100) / 100;
}
/** BR-12: ongkir = jarak dibulatkan ke atas × tarif per km */
const shippingFor = (km) => Math.ceil(km) * STORE_SETTINGS.deliveryFeePerKm;

const price = (productId, variantId) => PRODUCTS.find((p) => p.productId === productId).price
  + (variantId ? PRODUCT_VARIANTS.find((v) => v.variantId === variantId).extraPrice : 0);

// Desain custom cake contoh: 20 cm + Bulat + Cokelat + Buttercream (harga = dasar + Σ extra_price opsi)
const DESIGN_OPTION_IDS = [2, 4, 8, 10];
const DESIGN = {
  designId: 1, productId: 6, userId: 101, writingText: 'Happy Birthday Rina', writingColor: 'Cokelat', referencePhotoUrl: null,
  readyDate: dateOnly(2),
  price: price(6) + DESIGN_OPTION_IDS.reduce((s, id) => s + CUSTOM_OPTIONS.find((o) => o.optionId === id).extraPrice, 0),
};

const demoAddress = ADDRESSES[0];
const delivery = (snapshot, km) => ({ snapshot, km });

/**
 * Definisi pesanan contoh. status = jalur status berurutan (SPEC §4) beserta menit setelah pesanan dibuat
 * dan pengubah ('customer' | 'system' | 'staf').
 */
const ORDER_DEFS = [
  { id: 1, day: -4, time: '10:15', seq: 18, userId: DEMO_CUSTOMER_ID, fulfillment: 'delivery', address: demoAddress,
    items: [{ productId: 5, variantId: 8, quantity: 1 }], readyDay: -3, slot: '13.00–15.00', pointsUsed: 100,
    payment: { method: 'qris', option: 'online', paid: true },
    path: [['menunggu_pembayaran', 0, 'customer'], ['dikonfirmasi', 3, 'system'], ['sedang_disiapkan', 1260, 'staf'], ['dalam_pengiriman', 1650, 'staf', 'Kurir: Andi Kurniawan'], ['selesai', 1720, 'staf']],
    courier: 'Andi Kurniawan' },
  { id: 2, day: -2, time: '08:40', seq: 5, userId: DEMO_CUSTOMER_ID, fulfillment: 'pickup', pickupCode: 'PK4821',
    items: [{ productId: 1, variantId: 1, quantity: 2 }, { productId: 2, variantId: 5, quantity: 1 }], readyDay: -2, slot: '09.00–11.00',
    payment: { method: 'pay_at_store', option: 'pay_at_store', paid: true, paidAfter: 95 },
    path: [['dikonfirmasi', 0, 'customer'], ['sedang_disiapkan', 20, 'staf'], ['siap_diambil', 60, 'staf'], ['selesai', 95, 'staf', 'Kode pickup terverifikasi']],
    review: { itemIndex: 0, rating: 5, tags: 'Fresh, Lembut', comment: 'Croissant-nya renyah dan wangi butter. Pasti pesan lagi!', after: 300 } },
  { id: 3, day: -1, time: '11:20', seq: 9, userId: 101, fulfillment: 'pickup', pickupCode: 'PK1937',
    items: [{ productId: 6, designId: 1, quantity: 1 }], readyDay: 2, slot: '15.00–17.00',
    payment: { method: 'va_bca', option: 'online', paid: true },
    path: [['menunggu_pembayaran', 0, 'customer'], ['dikonfirmasi', 6, 'system'], ['sedang_disiapkan', 1180, 'staf']] },
  { id: 4, day: -1, time: '14:10', seq: 11, userId: 106, fulfillment: 'pickup', pickupCode: 'PK2650',
    items: [{ productId: 2, variantId: 5, quantity: 2 }], readyDay: -1, slot: '17.00–19.00',
    payment: { method: 'dana', option: 'online', paid: false, expired: true },
    path: [['menunggu_pembayaran', 0, 'customer'], ['dibatalkan', 30, 'system', 'Tidak dibayar dalam 30 menit (BR-06)']],
    cancelReason: 'Tidak dibayar dalam 30 menit (BR-06)' },
  { id: 5, day: -3, time: '15:30', seq: 12, userId: 107, fulfillment: 'pickup', pickupCode: 'PK3408',
    items: [{ productId: 9, quantity: 1 }], readyDay: -2, slot: '11.00–13.00',
    payment: { method: 'va_mandiri', option: 'online', paid: true },
    path: [['menunggu_pembayaran', 0, 'customer'], ['dikonfirmasi', 4, 'system'], ['sedang_disiapkan', 960, 'staf'], ['siap_diambil', 1140, 'staf'], ['selesai', 1230, 'staf', 'Kode pickup terverifikasi']] },
  { id: 6, day: 0, time: '07:35', seq: 1, userId: 102, fulfillment: 'pickup', pickupCode: 'PK5306',
    items: [{ productId: 1, variantId: 2, quantity: 3 }], readyDay: 0, slot: '09.00–11.00',
    payment: { method: 'shopeepay', option: 'online', paid: true },
    path: [['menunggu_pembayaran', 0, 'customer'], ['dikonfirmasi', 3, 'system'], ['sedang_disiapkan', 25, 'staf'], ['siap_diambil', 70, 'staf']] },
  { id: 7, day: 0, time: '08:10', seq: 2, userId: 105, fulfillment: 'delivery',
    address: { snapshot: 'Jl. Anggrek No. 8, Kel. Contoh Dua, Kota Contoh', km: 5.4 }, // data contoh
    items: [{ productId: 4, quantity: 1 }, { productId: 12, quantity: 1 }], readyDay: 0, slot: '09.00–11.00',
    payment: { method: 'gopay', option: 'online', paid: true },
    path: [['menunggu_pembayaran', 0, 'customer'], ['dikonfirmasi', 2, 'system'], ['sedang_disiapkan', 30, 'staf'], ['dalam_pengiriman', 95, 'staf', 'Kurir: Rudi Hartono']],
    courier: 'Rudi Hartono' },
  { id: 8, day: 0, time: '09:05', seq: 3, userId: 103, fulfillment: 'pickup', pickupCode: 'PK7714',
    items: [{ productId: 8, quantity: 2 }, { productId: 10, quantity: 1 }], readyDay: 0, slot: '11.00–13.00',
    payment: { method: 'pay_at_store', option: 'pay_at_store', paid: false },
    path: [['dikonfirmasi', 0, 'customer']] },
  { id: 9, day: 0, time: '09:48', seq: 4, userId: 104, fulfillment: 'delivery',
    address: { snapshot: 'Jl. Flamboyan No. 21, Kota Contoh', km: 2.3 }, // data contoh
    items: [{ productId: 3, quantity: 2 }], readyDay: 0, slot: '13.00–15.00',
    payment: { method: 'qris', option: 'online', paid: false },
    path: [['menunggu_pembayaran', 0, 'customer']] },
];

const NOTIFY = {
  menunggu_pembayaran: ['Pesanan dibuat', 'Pesanan {order} menunggu pembayaran. Selesaikan pembayaran sebelum batas waktu.'],
  dikonfirmasi: ['Pesanan dikonfirmasi', 'Pesanan {order} sudah kami terima dan akan segera diproses.'],
  sedang_disiapkan: ['Pesanan sedang disiapkan', 'Pesanan {order} sedang disiapkan oleh tim dapur Oven & Co.'],
  siap_diambil: ['Pesanan siap diambil', 'Pesanan {order} siap diambil di toko. Tunjukkan kode pickup saat mengambil.'],
  dalam_pengiriman: ['Pesanan dalam pengiriman', 'Pesanan {order} sedang diantar kurir ke alamatmu.'],
  selesai: ['Pesanan selesai', 'Pesanan {order} selesai. Terima kasih! Beri ulasan untuk mendapatkan bonus poin.'],
  dibatalkan: ['Pesanan dibatalkan', 'Pesanan {order} dibatalkan.'],
};

function buildSampleOrders() {
  const out = { orders: [], orderItems: [], payments: [], histories: [], reviews: [], pointTransactions: [], notifications: [] };
  const ready = new Set(PRODUCTS.filter((p) => p.availabilityType === 'ready').map((p) => p.productId));
  const sold = {}; // { dateKey: { productId: qty } }
  let itemId = 0; let historyId = 0; let pointTxId = 0; let notificationId = 0;
  const notify = (row) => out.notifications.push({ notificationId: ++notificationId, isRead: row.createdAt < at(0, '00:00'), ...row });

  for (const def of ORDER_DEFS) {
    const createdAt = at(def.day, def.time);
    const number = orderNumber(def.day, def.seq);
    const items = def.items.map((it) => ({
      orderItemId: ++itemId, orderId: def.id, productId: it.productId, variantId: it.variantId ?? null, designId: it.designId ?? null,
      quantity: it.quantity, unitPrice: it.designId ? DESIGN.price : price(it.productId, it.variantId), note: null,
    }));
    const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const km = def.fulfillment === 'delivery' ? (def.address.addressId ? distanceKm(STORE_SETTINGS, def.address) : def.address.km) : null;
    const shippingFee = km == null ? 0 : shippingFor(km);
    const pointsUsed = def.pointsUsed ?? 0;
    const pointsDiscount = (pointsUsed / STORE_SETTINGS.redeemPointsUnit) * STORE_SETTINGS.redeemValue;
    const total = subtotal + shippingFee - pointsDiscount;
    const finalStatus = def.path[def.path.length - 1][0];
    const paidAt = def.payment.paid ? plusMinutes(createdAt, def.payment.paidAfter ?? def.path.find((p) => p[0] === 'dikonfirmasi')?.[1] ?? 0) : null;

    out.orders.push({
      orderId: def.id, orderNumber: number, userId: def.userId, fulfillmentType: def.fulfillment,
      addressId: def.address?.addressId ?? null,
      deliveryAddressSnapshot: def.fulfillment === 'delivery' ? (def.address.fullAddress ?? def.address.snapshot) : null,
      distanceKm: km, readyDate: dateOnly(def.readyDay), timeSlot: def.slot, subtotal, shippingFee,
      voucherId: null, voucherDiscount: 0, pointsUsed, pointsDiscount, total,
      paymentOption: def.payment.option, paymentStatus: def.payment.paid ? 'paid' : 'unpaid', orderStatus: finalStatus,
      pickupCode: def.pickupCode ?? null, courierName: def.courier ?? null, cancelReason: def.cancelReason ?? null, createdAt,
    });
    out.orderItems.push(...items);
    out.payments.push({
      paymentId: def.id, orderId: def.id, methodCode: def.payment.method, amount: total,
      gatewayRef: def.payment.option === 'online' ? `SIM-${number}` : null, paymentCode: null,
      status: def.payment.paid ? 'paid' : def.payment.expired ? 'expired' : 'pending',
      expiredAt: plusMinutes(createdAt, STORE_SETTINGS.paymentTimeoutMinutes), paidAt,
    });

    for (const [status, minutes, by, note] of def.path) {
      const changedAt = plusMinutes(createdAt, minutes);
      const changedBy = by === 'customer' ? def.userId : by === 'staf' ? STAF_ID : null;
      out.histories.push({ historyId: ++historyId, orderId: def.id, status, changedBy, note: note ?? null, changedAt });
      if (def.userId === DEMO_CUSTOMER_ID) {
        const [title, body] = NOTIFY[status];
        notify({ userId: def.userId, type: 'order_status', title, body: body.replace('{order}', number), orderId: def.id, createdAt: changedAt });
      }
    }

    if (pointsUsed) out.pointTransactions.push({ pointTxId: ++pointTxId, userId: def.userId, type: 'redeem', points: -pointsUsed, orderId: def.id, reviewId: null, createdAt });
    if (finalStatus === 'selesai') {
      const completedAt = plusMinutes(createdAt, def.path[def.path.length - 1][1]);
      const points = Math.floor(total / STORE_SETTINGS.earnAmountPerPoint); // BR-09
      out.pointTransactions.push({ pointTxId: ++pointTxId, userId: def.userId, type: 'earn', points, orderId: def.id, reviewId: null, createdAt: completedAt });
      if (def.userId === DEMO_CUSTOMER_ID) notify({ userId: def.userId, type: 'points', title: `+${points} poin`, body: `Poin bertambah dari pesanan ${number}.`, orderId: def.id, createdAt: completedAt });
    }
    if (def.review) {
      const reviewId = out.reviews.length + 1;
      const createdReview = plusMinutes(createdAt, def.review.after);
      out.reviews.push({
        reviewId, userId: def.userId, orderItemId: items[def.review.itemIndex].orderItemId, rating: def.review.rating,
        tags: def.review.tags, comment: def.review.comment, isHidden: false, adminReply: 'Terima kasih sudah berbelanja di Oven & Co.! Ditunggu pesanan berikutnya.', createdAt: createdReview,
      });
      const bonus = STORE_SETTINGS.reviewBonusPoints; // BR-11
      out.pointTransactions.push({ pointTxId: ++pointTxId, userId: def.userId, type: 'review_bonus', points: bonus, orderId: null, reviewId, createdAt: createdReview });
      if (def.userId === DEMO_CUSTOMER_ID) notify({ userId: def.userId, type: 'points', title: `+${bonus} poin`, body: 'Poin bertambah dari ulasan.', orderId: null, createdAt: createdReview });
    }
    if (finalStatus !== 'dibatalkan') {
      const key = dayKey(def.day);
      for (const i of items.filter((x) => ready.has(x.productId))) {
        sold[key] = sold[key] ?? {};
        sold[key][i.productId] = (sold[key][i.productId] ?? 0) + i.quantity;
      }
    }
  }

  // Saldo awal akun demo (riwayat sebelum data contoh) agar saldo = 1.250 poin (SPEC §9) & Gold (≥ 500 tahun ini)
  const demoSum = out.pointTransactions.filter((t) => t.userId === DEMO_CUSTOMER_ID).reduce((s, t) => s + t.points, 0);
  out.pointTransactions.unshift({
    pointTxId: 0, userId: DEMO_CUSTOMER_ID, type: 'earn', points: DEMO_POINT_BALANCE - demoSum, orderId: null, reviewId: null,
    createdAt: new Date(`${ANCHOR_DATE.slice(0, 4)}-01-05T09:00:00+07:00`),
  });
  out.pointTransactions = out.pointTransactions.map((t, i) => ({ ...t, pointTxId: i + 1 }));

  // daily_stocks 3 hari terakhir: rencana contoh + terjual dari pesanan contoh pada tanggal dibuat
  let stockId = 0;
  out.dailyStocks = [-2, -1, 0].flatMap((offset) => Object.entries(DAILY_STOCK_PLAN).map(([pid, planned]) => ({
    stockId: ++stockId, productId: Number(pid), stockDate: dateOnly(offset), qtyPlanned: planned,
    qtySold: sold[dayKey(offset)]?.[pid] ?? 0,
  })));
  return out;
}

module.exports = { buildSampleOrders, DESIGN, DESIGN_OPTION_IDS, dayKey, at, dateOnly };
