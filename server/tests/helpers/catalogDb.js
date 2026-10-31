// tests/helpers/catalogDb.js
// Basis data katalog admin di memori untuk tes AD-06/AD-07 (Prisma dipalsukan, BUKAN MySQL): kategori, produk, foto,
// varian, opsi custom cake, stok harian, bahan baku. $transaction mengembalikan tabel bila callback gagal (meniru
// rollback); `ops` mencatat urutan tx:begin / lock:<tabel> agar tes bisa memeriksa kunci = pembacaan pertama.
// Tidak membuktikan locking/transaksi MySQL yang sebenarnya (lihat uji integrasi MySQL 8).

const { matchesWhere } = require('./whereMatch');

function baseTables(today) {
  return {
    users: {
      1: { userId: 1n, role: 'customer', isActive: true },
      3: { userId: 3n, role: 'staf', isActive: true },
      4: { userId: 4n, role: 'owner', isActive: true },
    },
    storeSetting: { settingId: 1 },
    categories: [
      { categoryId: 1, name: 'Roti', sortOrder: 1 },
      { categoryId: 2, name: 'Cake', sortOrder: 2 },
      { categoryId: 3, name: 'Pastry', sortOrder: 3 },
      { categoryId: 5, name: 'Custom Cake', sortOrder: 5 },
    ],
    products: [
      { productId: 1n, categoryId: 3, name: 'Classic Butter Croissant', description: 'Renyah', ingredients: null, allergens: 'Gluten', price: '28000.00', availabilityType: 'ready', leadTimeDays: 0, isActive: true },
      { productId: 2n, categoryId: 1, name: 'Signature Cinnamon Roll', description: '', ingredients: null, allergens: null, price: '32000.00', availabilityType: 'ready', leadTimeDays: 0, isActive: true },
      { productId: 3n, categoryId: 2, name: 'Premium Birthday Cake', description: '', ingredients: null, allergens: null, price: '350000.00', availabilityType: 'preorder', leadTimeDays: 1, isActive: true },
      { productId: 4n, categoryId: 1, name: 'Roti Lama', description: '', ingredients: null, allergens: null, price: '10000.00', availabilityType: 'ready', leadTimeDays: 0, isActive: false },
      { productId: 6n, categoryId: 5, name: 'Custom Celebration Cake', description: '', ingredients: null, allergens: null, price: '450000.00', availabilityType: 'custom', leadTimeDays: 3, isActive: true },
    ],
    images: [
      { imageId: 11n, productId: 1n, imageUrl: '/images/products/croissant.webp', sortOrder: 1 },
      { imageId: 12n, productId: 1n, imageUrl: '/uploads/products/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg', sortOrder: 2 },
      { imageId: 31n, productId: 3n, imageUrl: '/images/products/birthday.webp', sortOrder: 1 },
    ],
    variants: [
      { variantId: 21n, productId: 2n, name: 'Extra Glaze', extraPrice: '5000.00', isActive: true },
      { variantId: 22n, productId: 2n, name: 'Lama', extraPrice: '0.00', isActive: false },
    ],
    options: [
      { optionId: 1, optionGroup: 'ukuran', name: 'Diameter 20 cm', description: null, extraPrice: '0.00', imageUrl: null, isActive: true },
      { optionId: 2, optionGroup: 'ukuran', name: 'Diameter 24 cm', description: null, extraPrice: '50000.00', imageUrl: null, isActive: true },
      { optionId: 5, optionGroup: 'bentuk', name: 'Bulat', description: null, extraPrice: '0.00', imageUrl: '/img/bulat.png', isActive: true },
      { optionId: 9, optionGroup: 'rasa', name: 'Cokelat', description: null, extraPrice: '0.00', imageUrl: null, isActive: true },
      { optionId: 13, optionGroup: 'krim_topping', name: 'Buttercream', description: null, extraPrice: '0.00', imageUrl: null, isActive: true },
      { optionId: 14, optionGroup: 'krim_topping', name: 'Stroberi', description: null, extraPrice: '15000.00', imageUrl: null, isActive: false },
    ],
    dailyStocks: [
      { stockId: 1n, productId: 1n, stockDate: today, qtyPlanned: 20, qtySold: 5 },
      { stockId: 2n, productId: 2n, stockDate: today, qtyPlanned: 0, qtySold: 0 },
    ],
    materials: [
      { materialId: 1n, name: 'Tepung Terigu', unit: 'kg', stock: '25.00', minStock: '10.00' },
      { materialId: 2n, name: 'Butter', unit: 'kg', stock: '4.50', minStock: '5.00' },
      { materialId: 3n, name: 'Telur', unit: 'butir', stock: '0.00', minStock: '30.00' },
    ],
    reviews: [{ productId: 1n, rating: 5, isHidden: false }, { productId: 1n, rating: 4, isHidden: false }, { productId: 1n, rating: 1, isHidden: true }],
  };
}

const clone = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Array.isArray(v) ? v.map((r) => ({ ...r })) : (v && typeof v === 'object' ? { ...v } : v)]));
const pick = (row, select) => (select ? Object.fromEntries(Object.keys(select).filter((k) => typeof select[k] !== 'object').map((k) => [k, row[k]])) : { ...row });
const sortBy = (rows, orderBy = []) => [...rows].sort((a, b) => {
  for (const clause of [].concat(orderBy)) {
    const [field, dir] = Object.entries(clause)[0];
    if (a[field] < b[field]) return dir === 'asc' ? -1 : 1;
    if (a[field] > b[field]) return dir === 'asc' ? 1 : -1;
  }
  return 0;
});

/**
 * @param {object} fakePrisma
 * @param {Date} today — tanggal @db.Date hari ini (UTC tengah malam)
 */
function installCatalogDb(fakePrisma, today) {
  const state = { t: baseTables(today), ops: [], raw: [], failOn: null, hooks: {} };
  const next = { product: 100n, image: 500n, variant: 300n, option: 50, stock: 800n, material: 60n };
  const id = (k) => (typeof next[k] === 'bigint' ? (next[k] += 1n) : (next[k] += 1));
  const fail = (op) => {
    state.ops.push(op);
    if (state.failOn === op) throw Object.assign(new Error('Can\'t reach database server'), { code: 'P1001' });
  };

  const productView = (p, include = {}) => {
    const out = { ...p };
    if (include.category) out.category = state.t.categories.find((c) => c.categoryId === p.categoryId);
    if (include.images) {
      const rows = sortBy(state.t.images.filter((i) => i.productId === p.productId), include.images.orderBy);
      out.images = rows.slice(0, include.images.take ?? rows.length).map((r) => pick(r, include.images.select));
    }
    if (include.variants) out.variants = sortBy(state.t.variants.filter((v) => v.productId === p.productId), include.variants.orderBy ?? []);
    if (include.dailyStocks) {
      out.dailyStocks = state.t.dailyStocks.filter((s) => s.productId === p.productId && matchesWhere(s, include.dailyStocks.where));
    }
    return out;
  };

  Object.assign(fakePrisma, {
    user: { findUnique: async ({ where }) => state.t.users[String(where.userId)] ?? null },
    category: { findMany: async ({ orderBy } = {}) => { fail('category.findMany'); return sortBy(state.t.categories, orderBy); } },
    product: {
      findMany: async ({ where, include, select, orderBy } = {}) => {
        fail('product.findMany');
        const rows = sortBy(state.t.products.filter((p) => matchesWhere(p, where)), orderBy ?? [{ productId: 'asc' }]);
        return rows.map((p) => (select ? pick(p, select) : productView(p, include)));
      },
      findUnique: async ({ where, include }) => {
        fail('product.findUnique');
        const p = state.t.products.find((x) => x.productId === where.productId);
        return p ? productView(p, include) : null;
      },
      findFirst: async ({ where, orderBy, select }) => {
        const p = sortBy(state.t.products.filter((x) => matchesWhere(x, where)), orderBy)[0];
        return p ? pick(p, select) : null;
      },
      create: async ({ data }) => {
        fail('product.create');
        const row = { productId: id('product'), ...data };
        state.t.products.push(row);
        return { productId: row.productId };
      },
      update: async ({ where, data }) => {
        fail('product.update');
        const row = state.t.products.find((p) => p.productId === where.productId);
        Object.assign(row, data);
        return { productId: row.productId };
      },
    },
    productVariant: {
      create: async ({ data }) => { fail('productVariant.create'); state.t.variants.push({ variantId: id('variant'), ...data }); },
      update: async ({ where, data }) => { fail('productVariant.update'); Object.assign(state.t.variants.find((v) => v.variantId === where.variantId), data); },
    },
    productImage: {
      create: async ({ data }) => { fail('productImage.create'); state.t.images.push({ imageId: id('image'), ...data }); },
      update: async ({ where, data }) => { fail('productImage.update'); Object.assign(state.t.images.find((i) => i.imageId === where.imageId), data); },
      deleteMany: async ({ where }) => {
        fail('productImage.deleteMany');
        state.t.images = state.t.images.filter((i) => !where.imageId.in.includes(i.imageId));
      },
    },
    review: {
      // getProductRatings: ulasan tidak disembunyikan untuk produk tertentu
      findMany: async ({ where }) => state.t.reviews
        .filter((r) => r.isHidden === where.isHidden && where.orderItem.is.productId.in.includes(r.productId))
        .map((r) => ({ rating: r.rating, orderItem: { productId: r.productId } })),
    },
    customOption: {
      findMany: async ({ orderBy }) => { fail('customOption.findMany'); return sortBy(state.t.options, orderBy); },
      create: async ({ data }) => {
        fail('customOption.create');
        const row = { optionId: id('option'), ...data };
        state.t.options.push(row);
        return { optionId: row.optionId };
      },
      update: async ({ where, data }) => {
        fail('customOption.update');
        const row = state.t.options.find((o) => o.optionId === where.optionId);
        Object.assign(row, data);
        return { optionId: row.optionId };
      },
    },
    dailyStock: {
      update: async ({ where, data }) => {
        fail('dailyStock.update');
        const { productId, stockDate } = where.productId_stockDate;
        const row = state.t.dailyStocks.find((d) => d.productId === productId && d.stockDate.getTime() === stockDate.getTime());
        if (!row) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
        Object.assign(row, data);
        return row;
      },
      create: async ({ data }) => { fail('dailyStock.create'); state.t.dailyStocks.push({ stockId: id('stock'), ...data }); },
      updateMany: async ({ where, data }) => {
        fail('dailyStock.updateMany');
        const rows = state.t.dailyStocks.filter((s) => matchesWhere(s, where));
        rows.forEach((s) => Object.assign(s, data));
        return { count: rows.length };
      },
      findMany: async ({ where }) => state.t.dailyStocks.filter((s) => matchesWhere(s, where)),
    },
    rawMaterial: {
      findMany: async ({ orderBy } = {}) => { fail('rawMaterial.findMany'); return sortBy(state.t.materials, orderBy); },
      findUnique: async ({ where }) => ({ ...state.t.materials.find((m) => m.materialId === where.materialId) }),
      create: async ({ data }) => {
        fail('rawMaterial.create');
        const row = { materialId: id('material'), ...data, stock: String(data.stock), minStock: String(data.minStock) };
        state.t.materials.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        fail('rawMaterial.update');
        const row = state.t.materials.find((m) => m.materialId === where.materialId);
        // stock hanya ditulis bila ada di data (edit informasi tidak menulis stok)
        Object.assign(row, { ...data, ...('stock' in data ? { stock: String(data.stock) } : {}), minStock: String(data.minStock) });
        return { ...row };
      },
    },
    $queryRaw: async (strings, ...values) => {
      const sql = strings.join('?');
      const table = sql.match(/FROM (\w+)/)?.[1];
      state.ops.push(/FOR UPDATE/.test(sql) ? `lock:${table}` : `query:${table}`);
      state.raw.push({ sql, values });
      if (state.failOn === `lock:${table}`) throw Object.assign(new Error('Lock wait timeout'), { code: 'P2034' });
      state.hooks.onQuery?.(sql, values);
      if (/FROM store_settings/.test(sql)) return state.t.storeSetting ? [{ setting_id: 1 }] : [];
      if (/^SELECT qty_sold FROM daily_stocks\s+WHERE product_id = \? AND stock_date = \? FOR UPDATE$/.test(sql)) {
        const [productId, stockDate] = values;
        const row = state.t.dailyStocks.find((d) => d.productId === productId && d.stockDate.getTime() === stockDate.getTime());
        return row ? [{ qty_sold: row.qtySold }] : [];
      }
      if (/^SELECT stock FROM raw_materials WHERE material_id = \? FOR UPDATE$/.test(sql)) {
        const m = state.t.materials.find((x) => x.materialId === values[0]);
        return m ? [{ stock: m.stock }] : [];
      }
      throw new Error(`catalogDb: SQL tidak dikenal: ${sql}`);
    },
    $executeRaw: async (strings, ...values) => {
      const sql = strings.join('?');
      state.raw.push({ sql, values });
      state.ops.push('execute');
      state.hooks.onExecute?.(sql, values);
      // Rencana stok: baris hari ini dipastikan ada (dibuat 0/0) & terkunci
      if (/^INSERT INTO daily_stocks \(product_id, stock_date, qty_planned, qty_sold\)\s+VALUES \(\?, \?, 0, 0\) ON DUPLICATE KEY UPDATE stock_id = stock_id$/.test(sql)) {
        fail('dailyStock.upsert');
        const [productId, stockDate] = values;
        if (state.t.dailyStocks.some((d) => d.productId === productId && d.stockDate.getTime() === stockDate.getTime())) return 2;
        state.t.dailyStocks.push({ stockId: id('stock'), productId, stockDate, qtyPlanned: 0, qtySold: 0 });
        return 1;
      }
      // Stok masuk: stock = stock + qty (DECIMAL)
      if (/^UPDATE raw_materials SET stock = stock \+ CAST\(\? AS DECIMAL\(10,2\)\)\s+WHERE material_id = \?$/.test(sql)) {
        fail('rawMaterial.stockIn');
        const [qty, materialId] = values;
        const m = state.t.materials.find((x) => x.materialId === materialId);
        m.stock = ((Math.round(Number(m.stock) * 100) + Math.round(Number(qty) * 100)) / 100).toFixed(2);
        return 1;
      }
      throw new Error(`catalogDb: SQL tidak dikenal: ${sql}`);
    },
    $transaction: async (callback) => {
      state.ops.push('tx:begin');
      const snapshot = clone(state.t);
      try {
        return await callback(fakePrisma);
      } catch (error) {
        state.t = snapshot;
        throw error;
      }
    },
  });

  return state;
}

module.exports = { installCatalogDb };
