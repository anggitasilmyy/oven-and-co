// utils/rules/cart.js
// Step 5.1 (review PR #5) · FR-04 · FR-08 · FR-11 — identitas & penggabungan item keranjang (fungsi murni)
//
// Identitas item = produk + varian + desain custom + tanggal ambil/antar (pre-order) + catatan.
//   - Tanggal pre-order berbeda → item terpisah (tanggal kedua tidak boleh hilang).
//   - Catatan berbeda → item terpisah, agar catatan tidak tertimpa atau tercampur saat digabung.
//   - Semua atribut sama → jumlah dijumlahkan.
// Item lama di localStorage (tanpa preferred_date/note) dibaca sebagai null/'' sehingga tetap kompatibel.

/** Lengkapi field opsional dengan nilai default (kompatibel dengan keranjang lama) */
export function normalizeCartItem(item) {
  return {
    ...item,
    variant_id: item.variant_id ?? null,
    design_id: item.design_id ?? null,
    preferred_date: item.preferred_date ?? null,
    note: String(item.note ?? '').trim(),
  };
}

/** Kunci identitas item keranjang */
export function cartItemKey(item) {
  const i = normalizeCartItem(item);
  return JSON.stringify([i.product_id, i.variant_id, i.design_id, i.preferred_date, i.note]);
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
      result[idx] = { ...result[idx], quantity: result[idx].quantity + (item.quantity ?? 1) };
    } else {
      const idTaken = !Number.isFinite(item.cart_item_id) || result.some((r) => r.cart_item_id === item.cart_item_id);
      result.push({ ...item, quantity: item.quantity ?? 1, cart_item_id: idTaken ? nextCartItemId(result) : item.cart_item_id });
    }
  }
  return result;
}
