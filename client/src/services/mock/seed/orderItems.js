// services/mock/seed/orderItems.js
// Step 4 · Pemilihan item pesanan contoh (ready, pre-order, custom cake)

import { AVAILABILITY_TYPE } from '../../../constants/product';

/** Bobot popularitas produk ready (data contoh) */
const READY_WEIGHTS = { 1: 6, 2: 4, 3: 3, 4: 2, 7: 3, 8: 5, 10: 2, 12: 2 };

const WRITINGS = ['Happy Birthday!', 'Selamat Ulang Tahun', 'Happy Anniversary', 'Congrats!', 'Selamat & Sukses'];
const WRITING_COLORS = ['Cokelat', 'Putih', 'Pink', 'Emas'];

/**
 * Pilih 1–3 produk ready yang masih punya stok.
 * @param {Function} remainingOf — (productId) → sisa stok hari itu
 * @returns {Array<{product, quantity}>}
 */
export function pickReadyItems(rng, products, remainingOf) {
  const pool = products.filter((p) => p.is_active && p.availability_type === AVAILABILITY_TYPE.READY);
  const wanted = rng.weighted([{ value: 1, weight: 5 }, { value: 2, weight: 4 }, { value: 3, weight: 2 }]);
  const chosen = [];
  for (let i = 0; i < wanted; i++) {
    const candidates = pool.filter((p) => !chosen.some((c) => c.product.product_id === p.product_id));
    const product = rng.weighted(candidates.map((p) => ({ value: p, weight: READY_WEIGHTS[p.product_id] ?? 1 })));
    const desired = product.price >= 100000 ? 1 : rng.int(1, 3);
    const quantity = Math.min(desired, remainingOf(product.product_id));
    if (quantity > 0) chosen.push({ product, quantity });
  }
  return chosen;
}

/** Satu produk pre-order (H-1) */
export function pickPreorderItem(rng, products) {
  const pool = products.filter((p) => p.is_active && p.availability_type === AVAILABILITY_TYPE.PREORDER);
  const product = rng.pick(pool);
  return { product, quantity: product.price >= 200000 ? 1 : rng.int(1, 2) };
}

/**
 * Desain custom cake: satu opsi per kelompok (asumsi TF-08); harga = harga dasar + Σ extra_price.
 * @returns {{design, optionIds}}
 */
export function buildCustomDesign(rng, product, options, { designId, userId, readyDate }) {
  const groups = ['ukuran', 'bentuk', 'rasa', 'krim_topping'];
  const picked = groups.map((g) => rng.pick(options.filter((o) => o.option_group === g && o.is_active)));
  const price = product.price + picked.reduce((s, o) => s + o.extra_price, 0);
  return {
    design: {
      design_id: designId,
      product_id: product.product_id,
      user_id: userId,
      writing_text: rng.pick(WRITINGS),
      writing_color: rng.pick(WRITING_COLORS),
      reference_photo_url: null,
      ready_date: readyDate,
      price,
    },
    optionIds: picked.map((o) => o.option_id),
  };
}
