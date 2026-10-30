// services/savedCart.service.js
// FR-04 · FR-11 · BR-04 · C-12 — keranjang AKUN pelanggan yang tersimpan di database (carts.user_id, cart_items).
// Keranjang tamu tetap di localStorage frontend (carts.session_token tidak dipakai). Saat login, frontend mengirim item
// tamu ke POST /api/cart/merge; desain custom cake tamu diklaim hanya dengan design_token yang valid, belum pernah
// dipesan, dan masih tanpa pemilik (updateMany bersyarat user_id IS NULL). Harga TIDAK disimpan: tampilan & harga
// terbaru tetap dari POST /api/cart. userId SELALU dari req.user (middleware auth), tidak pernah dari body/URL.

const prisma = require('../lib/prisma');
const { CART_REQUEST_MAX_ITEMS } = require('../utils/businessConstants');
const { dateKeyToDbDate, dbDateToKey } = require('../utils/jakartaDate');
const { selectClaimableGuestDesignIds } = require('./designAccess.service');
const { mergeSavedCartItems, getSkipReason } = require('./savedCartRules.service');

// cart_items.quantity INT (MySQL) — batas penyimpanan, bukan aturan bisnis (> 99 tetap ditandai tampilan keranjang)
const DB_INT_MAX = 2147483647;

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const uniqueIds = (values) => [...new Set(values.filter((value) => value != null).map(String))];

/** Baris cart_items → bentuk item useCartStore (cart_item_id angka, id lain string) */
function toCartItemView(row) {
  return {
    cart_item_id: Number(row.cartItemId),
    product_id: String(row.productId),
    variant_id: row.variantId == null ? null : String(row.variantId),
    design_id: row.designId == null ? null : String(row.designId),
    // Desain di keranjang akun selalu milik pelanggan, jadi token tamu tidak diperlukan lagi
    design_token: null,
    quantity: row.quantity,
    preferred_date: row.preferredDate ? dbDateToKey(row.preferredDate) : null,
    note: row.note ?? null,
  };
}

const ITEM_ORDER = [{ cartItemId: 'asc' }];

/** Keranjang akun tertua milik pelanggan (SPEC §8 tidak memberi UNIQUE pada carts.user_id) */
function findAccountCart(client, userId, withItems = false) {
  return client.cart.findFirst({
    where: { userId: BigInt(userId) },
    orderBy: { cartId: 'asc' },
    ...(withItems ? { include: { items: { orderBy: ITEM_ORDER } } } : {}),
  });
}

/** GET /api/cart/items — isi keranjang akun; belum pernah menyimpan → [] */
async function getAccountCart(userId) {
  const cart = await findAccountCart(prisma, userId, true);
  return { items: (cart?.items ?? []).map(toCartItemView) };
}

/** Desain yang masih tanpa pemilik dan aman diklaim → dikunci lalu ditulis user_id-nya (dalam transaksi) */
async function claimGuestDesigns(tx, userId, items) {
  const candidateIds = uniqueIds(items.filter((item) => item.design_token).map((item) => item.design_id));
  if (candidateIds.length === 0) return;

  // Urutan kunci tetap (id naik) seperti pembuatan pesanan agar tidak saling menunggu
  for (const designId of [...candidateIds].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1))) {
    await tx.$queryRaw`SELECT design_id FROM custom_cake_designs WHERE design_id = ${BigInt(designId)} FOR UPDATE`;
  }

  const designs = await tx.customCakeDesign.findMany({
    where: { designId: { in: candidateIds.map((id) => BigInt(id)) } },
    select: { designId: true, userId: true, orderItems: { select: { orderItemId: true }, take: 1 } },
  });
  const claimable = selectClaimableGuestDesignIds(items, new Map(designs.map((d) => [String(d.designId), d])));

  if (claimable.length > 0) {
    await tx.customCakeDesign.updateMany({
      where: { designId: { in: claimable.map((id) => BigInt(id)) }, userId: null },
      data: { userId: BigInt(userId) },
    });
  }
}

/** Konteks pemeriksaan baris: produk (beserta id varian) dan desain yang SUDAH milik pelanggan */
async function loadSaveContext(tx, userId, items) {
  const productIds = uniqueIds(items.map((item) => item.product_id));
  const designIds = uniqueIds(items.map((item) => item.design_id));

  const [products, ownedDesigns] = await Promise.all([
    productIds.length === 0
      ? []
      : tx.product.findMany({
          where: { productId: { in: productIds.map((id) => BigInt(id)) } },
          select: { productId: true, variants: { select: { variantId: true } } },
        }),
    designIds.length === 0
      ? []
      : tx.customCakeDesign.findMany({
          where: { designId: { in: designIds.map((id) => BigInt(id)) }, userId: BigInt(userId) },
          select: { designId: true },
        }),
  ]);

  return {
    products: new Map(products.map((p) => [String(p.productId), p])),
    ownedDesignIds: new Set(ownedDesigns.map((d) => String(d.designId))),
  };
}

/**
 * Simpan isi keranjang akun (ganti seluruhnya). `mergeWithSaved` = gabung dulu dengan isi tersimpan (login).
 * Satu transaksi; baris users dikunci FOR UPDATE agar dua simpan bersamaan untuk pelanggan yang sama berurutan.
 * @returns {Promise<{items: Array, skipped: Array<{cart_item_id, product_id, design_id, reason}>}>}
 */
async function saveAccountCart(userId, incoming, { mergeWithSaved = false } = {}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT user_id FROM users WHERE user_id = ${BigInt(userId)} FOR UPDATE`;

    const existing = await findAccountCart(tx, userId, true);
    const savedItems = mergeWithSaved ? (existing?.items ?? []).map(toCartItemView) : [];
    // Baris beridentitas sama dalam satu request juga dijumlahkan (sama dengan useCartStore.addItem)
    const items = mergeSavedCartItems(mergeSavedCartItems([], savedItems), incoming);

    if (items.length > CART_REQUEST_MAX_ITEMS) {
      throw httpError(400, `Keranjang maksimal berisi ${CART_REQUEST_MAX_ITEMS} item.`);
    }
    if (items.some((item) => item.quantity > DB_INT_MAX)) {
      throw httpError(400, 'Jumlah item terlalu besar.');
    }

    await claimGuestDesigns(tx, userId, items);
    const context = await loadSaveContext(tx, userId, items);

    const kept = [];
    const skipped = [];
    for (const item of items) {
      const reason = getSkipReason(item, context);
      if (reason) {
        skipped.push({
          cart_item_id: item.cart_item_id ?? null,
          product_id: String(item.product_id),
          design_id: item.design_id == null ? null : String(item.design_id),
          reason,
        });
      } else {
        kept.push(item);
      }
    }

    const cart = existing
      ? await tx.cart.update({ where: { cartId: existing.cartId }, data: { updatedAt: new Date() } })
      : await tx.cart.create({ data: { userId: BigInt(userId) } });

    await tx.cartItem.deleteMany({ where: { cartId: cart.cartId } });
    if (kept.length > 0) {
      await tx.cartItem.createMany({
        data: kept.map((item) => ({
          cartId: cart.cartId,
          productId: BigInt(item.product_id),
          variantId: item.variant_id == null ? null : BigInt(item.variant_id),
          designId: item.design_id == null ? null : BigInt(item.design_id),
          quantity: item.quantity,
          note: String(item.note ?? '').trim() || null,
          preferredDate: item.preferred_date ? dateKeyToDbDate(item.preferred_date) : null,
        })),
      });
    }

    const rows = await tx.cartItem.findMany({ where: { cartId: cart.cartId }, orderBy: ITEM_ORDER });
    return { items: rows.map(toCartItemView), skipped };
  });
}

module.exports = {
  getAccountCart,
  saveAccountCart,
};
