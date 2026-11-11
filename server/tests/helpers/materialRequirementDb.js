// tests/helpers/materialRequirementDb.js
// CR-03 CP5 · basis data di memori untuk tes rute GET /api/admin/material-requirements (Prisma dipalsukan, BUKAN
// MySQL). Data = skenario CR-03 §B3.6 (helpers/recipeFixtures.js) dalam bentuk baris Prisma: orders + order_items,
// daily_stocks, product_materials, raw_materials. Filter `where` service ditafsirkan apa adanya (status ∈, ready_date ≤,
// tipe produk) agar salah filter terdeteksi; `ops` mencatat urutan pembacaan & tx:begin (satu snapshot, tanpa tulis).
// Perilaku filter/tanggal MySQL sebenarnya dibuktikan di tests-mysql/18-material-requirements.it.test.js.

const { B36_ORDER_ITEMS, B36_READY_PLANS, RECIPES, BUTTER, FLOUR } = require('./recipeFixtures');

const dbDate = (key) => new Date(`${key}T00:00:00.000Z`);
const PRODUCT_TYPES = { 1: 'ready', 4: 'ready', 5: 'preorder', 6: 'custom', 7: 'preorder' };
const PRODUCT_NAMES = {
  1: 'Classic Butter Croissant', 4: 'Assorted Cookies Box', 5: 'Premium Birthday Cake', 6: 'Custom Celebration Cake', 7: 'Tart Buah',
};
const toMaterialRow = (m) => ({
  materialId: BigInt(m.material_id), name: m.name, unit: m.unit, stock: m.stock, minStock: m.min_stock,
});

function baseTables() {
  return {
    users: {
      1: { userId: 1n, role: 'customer', isActive: true },
      3: { userId: 3n, role: 'staf', isActive: true },
      4: { userId: 4n, role: 'owner', isActive: true },
    },
    products: Object.entries(PRODUCT_TYPES).map(([id, type]) => ({ productId: BigInt(id), name: PRODUCT_NAMES[id], availabilityType: type })),
    orderItems: B36_ORDER_ITEMS.map((i) => ({
      productId: BigInt(i.product_id), quantity: i.quantity, orderStatus: i.order_status, readyDate: dbDate(i.ready_date),
    })),
    dailyStocks: [
      ...B36_READY_PLANS.map((p) => ({ productId: BigInt(p.product_id), stockDate: dbDate(p.stock_date), qtyPlanned: p.qty_planned })),
      { productId: 1n, stockDate: dbDate('2026-11-12'), qtyPlanned: 99 }, // rencana besok — tidak dihitung (E-3)
      { productId: 1n, stockDate: dbDate('2026-11-10'), qtyPlanned: 77 }, // rencana kemarin — tidak dihitung
    ],
    productMaterials: RECIPES.map((r) => ({ productId: BigInt(r.product_id), materialId: BigInt(r.material_id), qtyPerUnit: r.qty_per_unit })),
    materials: [toMaterialRow(FLOUR), toMaterialRow(BUTTER)],
  };
}

function installMaterialRequirementDb(fakePrisma) {
  const state = { t: baseTables(), ops: [], failOn: null };
  const op = (name) => {
    state.ops.push(name);
    if (state.failOn === name) throw Object.assign(new Error('Can\'t reach database server'), { code: 'P1001' });
  };
  const typeOf = (productId) => state.t.products.find((p) => p.productId === productId)?.availabilityType;
  const forbidWrite = (name) => async () => { state.ops.push(`WRITE:${name}`); throw new Error(`tulis dilarang: ${name}`); };

  Object.keys(fakePrisma).forEach((k) => delete fakePrisma[k]);
  Object.assign(fakePrisma, {
    user: { findUnique: async ({ where }) => state.t.users[String(where.userId)] ?? null },
    orderItem: {
      findMany: async ({ where }) => {
        op('orderItem.findMany');
        const { orderStatus, readyDate } = where.order.is;
        const types = where.product.is.availabilityType.in;
        state.lastOrderItemWhere = where;
        return state.t.orderItems
          .filter((i) => orderStatus.in.includes(i.orderStatus) && i.readyDate <= readyDate.lte && types.includes(typeOf(i.productId)))
          .map((i) => ({
            productId: i.productId, quantity: i.quantity,
            order: { orderStatus: i.orderStatus, readyDate: i.readyDate },
            product: { availabilityType: typeOf(i.productId) },
          }));
      },
      update: forbidWrite('orderItem.update'),
    },
    dailyStock: {
      findMany: async ({ where }) => {
        op('dailyStock.findMany');
        return state.t.dailyStocks
          .filter((s) => s.stockDate.getTime() === where.stockDate.getTime() && typeOf(s.productId) === where.product.is.availabilityType)
          .map((s) => ({ ...s, product: { availabilityType: typeOf(s.productId) } }));
      },
      update: forbidWrite('dailyStock.update'),
      updateMany: forbidWrite('dailyStock.updateMany'),
    },
    productMaterial: {
      findMany: async () => { op('productMaterial.findMany'); return state.t.productMaterials.map((r) => ({ ...r })); },
      deleteMany: forbidWrite('productMaterial.deleteMany'),
      createMany: forbidWrite('productMaterial.createMany'),
    },
    rawMaterial: {
      findMany: async () => { op('rawMaterial.findMany'); return [...state.t.materials].sort((a, b) => (a.materialId < b.materialId ? -1 : 1)); },
      update: forbidWrite('rawMaterial.update'),
    },
    product: {
      findMany: async ({ where }) => {
        op('product.findMany');
        return state.t.products.filter((p) => where.productId.in.includes(p.productId)).map(({ productId, name }) => ({ productId, name }));
      },
    },
    auditLog: { create: forbidWrite('auditLog.create') },
    $executeRaw: forbidWrite('$executeRaw'),
    $transaction: async (callback, options) => {
      state.ops.push('tx:begin');
      state.txOptions = options;
      return callback(fakePrisma);
    },
  });
  return state;
}

module.exports = { installMaterialRequirementDb, dbDate };
