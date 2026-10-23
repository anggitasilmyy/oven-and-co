// utils/rules/cart.js
// Step 5.1 (review PR #5) · FR-04 · FR-08 · FR-11 — identitas & penggabungan item keranjang (fungsi murni)
//
// Identitas item = produk + varian + desain custom + tanggal ambil/antar (pre-order) + catatan.
//   - Tanggal pre-order berbeda → item terpisah (tanggal kedua tidak boleh hilang).
//   - Catatan berbeda → item terpisah, agar catatan tidak tertimpa atau tercampur saat digabung.
//   - Semua atribut sama → jumlah dijumlahkan.
// Item lama di localStorage (tanpa preferred_date/note) dibaca sebagai null/'' sehingga tetap kompatibel.
//
// Step 6.3: design_token (bukti akses desain custom cake tamu) ikut disimpan, bukan bagian identitas item.
// Penggabungan TIDAK memotong jumlah > CART_LINE_MAX_QUANTITY maupun baris > CART_MAX_LINES; keranjang menandai
// baris/keranjang tersebut agar pelanggan menyesuaikan sendiri sebelum checkout.

import { CART_LINE_MAX_QUANTITY, CART_MAX_LINES, CART_UNAVAILABLE_REASON } from '../../constants/cart';

/** Lengkapi field opsional dengan nilai default (kompatibel dengan keranjang lama) */
export function normalizeCartItem(item) {
  return {
    ...item,
    variant_id: item.variant_id ?? null,
    design_id: item.design_id ?? null,
    design_token: item.design_token ?? null,
    preferred_date: item.preferred_date ?? null,
    note: String(item.note ?? '').trim(),
  };
}

/**
 * Kunci identitas item keranjang.
 * Step 6.3: item custom cake diidentifikasi oleh design_id saja — satu desain hanya boleh ada di satu baris
 * (jumlah > 1 untuk kue identik); catatan/tanggal berbeda tidak membuat baris kedua untuk desain yang sama.
 */
export function cartItemKey(item) {
  const i = normalizeCartItem(item);
  if (i.design_id != null) return JSON.stringify(['design', String(i.design_id)]);
  return JSON.stringify([i.product_id, i.variant_id, i.design_id, i.preferred_date, i.note]);
}

/** Indeks baris yang memakai design_id yang sudah muncul di baris sebelumnya (sama dengan server) */
export function findDuplicateDesignLines(items) {
  const seen = new Set();
  const duplicates = new Set();
  items.forEach((item, index) => {
    if (item.design_id == null) return;
    const key = String(item.design_id);
    if (seen.has(key)) duplicates.add(index);
    seen.add(key);
  });
  return duplicates;
}

/** cart_item_id baru yang tidak dipakai item mana pun (aman untuk klik beruntun di milidetik yang sama) */
export function nextCartItemId(items, now = Date.now()) {
  const maxId = items.reduce((m, i) => (Number.isFinite(i.cart_item_id) ? Math.max(m, i.cart_item_id) : m), 0);
  return Math.max(now, maxId + 1);
}

/**
 * Rapikan keranjang hasil baca localStorage: field default + cart_item_id unik.
 * Item dengan id kosong/ganda (data lama atau rusak) diberi id baru; urutan & jumlah tidak berubah.
 */
export function normalizeCartItems(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const result = [];
  for (const raw of items) {
    if (!raw || raw.product_id == null) continue;
    const item = normalizeCartItem(raw);
    if (!Number.isFinite(item.cart_item_id) || seen.has(item.cart_item_id)) {
      item.cart_item_id = nextCartItemId([...result, ...items.filter((i) => Number.isFinite(i?.cart_item_id))]);
    }
    seen.add(item.cart_item_id);
    result.push(item);
  }
  return result;
}

/**
 * Gabungkan `incoming` ke `base` (tambah item dan gabung keranjang tamu memakai aturan yang sama).
 * Item beridentitas sama dijumlahkan; item baru tetap terpisah dengan cart_item_id unik.
 * @returns {Array} keranjang baru (array asal tidak diubah)
 */
export function mergeCartItems(base, incoming) {
  const result = normalizeCartItems(base);
  for (const raw of incoming) {
    const item = normalizeCartItem(raw);
    const idx = result.findIndex((r) => cartItemKey(r) === cartItemKey(item));
    if (idx !== -1) {
      result[idx] = {
        ...result[idx],
        quantity: result[idx].quantity + (item.quantity ?? 1),
        design_token: result[idx].design_token ?? item.design_token,
      };
    } else {
      const idTaken = !Number.isFinite(item.cart_item_id) || result.some((r) => r.cart_item_id === item.cart_item_id);
      result.push({ ...item, quantity: item.quantity ?? 1, cart_item_id: idTaken ? nextCartItemId(result) : item.cart_item_id });
    }
  }
  return result;
}

/** true bila menambah `item` membuat baris baru melewati CART_MAX_LINES (menambah jumlah baris lama tetap boleh) */
export function wouldExceedLineLimit(items, item, maxLines = CART_MAX_LINES) {
  const current = normalizeCartItems(items);
  const key = cartItemKey(item);
  return !current.some((i) => cartItemKey(i) === key) && current.length >= maxLines;
}

/** Keranjang (mis. hasil gabung keranjang tamu) berisi lebih dari CART_MAX_LINES baris */
export function exceedsLineLimit(items, maxLines = CART_MAX_LINES) {
  return Array.isArray(items) && items.length > maxLines;
}

/**
 * Terapkan jumlah terbaru dari store pada baris hasil service (service bisa masih memuat ulang):
 * jumlah > CART_LINE_MAX_QUANTITY langsung ditandai; tanda batas jumlah lama dilepas bila sudah disesuaikan.
 */
export function applyLineQuantity(line, quantity, maxQuantity = CART_LINE_MAX_QUANTITY) {
  const next = { ...line, quantity, line_total: line.unit_price * quantity };
  const overLimit = quantity > maxQuantity;
  if (overLimit && line.available) {
    return { ...next, available: false, unavailable_reason: CART_UNAVAILABLE_REASON.QUANTITY_EXCEEDS_LIMIT };
  }
  if (!overLimit && line.unavailable_reason === CART_UNAVAILABLE_REASON.QUANTITY_EXCEEDS_LIMIT) {
    return { ...next, available: true, unavailable_reason: null };
  }
  return next;
}

/**
 * Kontrol jumlah kartu keranjang (Step 6.3, C-12).
 * @param {{available, quantity, availability_type, unavailable_reason}} line
 * @param {number} maxQuantity — batas dari useCartView.maxQuantityOf (ready: sisa stok untuk baris ini)
 * @returns {{stepperMax: number, adjustTo: number|null, soldOut: boolean}}
 *   adjustTo: jumlah tujuan tombol "Ubah jumlah" (null = tidak ditampilkan);
 *   soldOut: baris melebihi batas tetapi stok hari ini habis → hanya bisa dihapus.
 */
export function getCartLineQuantityControl(line, maxQuantity) {
  const overQuantity = line.unavailable_reason === CART_UNAVAILABLE_REASON.QUANTITY_EXCEEDS_LIMIT;
  if (overQuantity) {
    const target = Math.min(maxQuantity, CART_LINE_MAX_QUANTITY);
    return { stepperMax: target, adjustTo: target > 0 ? target : null, soldOut: target <= 0 };
  }
  return { stepperMax: line.available ? Math.max(maxQuantity, line.quantity) : 0, adjustTo: null, soldOut: false };
}
