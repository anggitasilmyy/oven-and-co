// utils/rules/cartSync.js
// Step 6.6 (CP3) · FR-04 · FR-11 · BR-04 — aturan murni sinkronisasi keranjang akun (dipakai services/cartSync*).
//   - lineKey (identitas lintas perangkat & server) TIDAK memakai design_token: desain = `d:{design_id}` (design_id tidak
//     berubah saat desain tamu diklaim; hanya user_id); baris lain = produk + varian + tanggal pre-order + catatan, sama
//     dengan server savedCartRules.cartItemKey.
//   - contentSignature mencakup SEMUA field bisnis (product_id, variant_id, design_id, design_token, quantity,
//     preferred_date, note), diurutkan menurut lineKey (tidak bergantung urutan respons). Id lokal & data tampilan
//     (nama, harga, gambar) tidak ikut.
//   - merge3 per baris: hanya lokal berubah → lokal; hanya server berubah → server; keduanya berubah → lokal menang
//     (termasuk hapus lokal vs ubah server, dan ubah lokal vs hapus server). Best-effort: tanpa versi di server,
//     penulisan dua perangkat yang tumpang tindih tetap bisa last-write-wins.

import { nextCartItemId } from './cart';

const text = (value) => (value == null || value === '' ? null : String(value));

/** Field bisnis yang dinormalisasi (id string, kosong → null, catatan di-trim, jumlah angka) */
export function normalizeLine(line) {
  return {
    product_id: String(line.product_id),
    variant_id: text(line.variant_id),
    design_id: text(line.design_id),
    design_token: text(line.design_token),
    quantity: Number(line.quantity) || 0,
    preferred_date: text(line.preferred_date),
    note: String(line.note ?? '').trim(),
  };
}

/** Identitas stabil baris (tanpa design_token) */
export function lineKey(line) {
  const n = normalizeLine(line);
  if (n.design_id != null) return `d:${n.design_id}`;
  return JSON.stringify(['p', n.product_id, n.variant_id, n.preferred_date, n.note]);
}

/**
 * Baris per lineKey; baris berkunci sama dijumlahkan (sama dengan server). Baris pertama menentukan id lokal &
 * data tampilan; token diambil dari baris mana pun yang memilikinya.
 * @returns {Map<string, {line: object, quantity: number}>}
 */
export function aggregateByKey(lines = []) {
  const map = new Map();
  for (const line of lines) {
    const key = lineKey(line);
    const quantity = Number(line.quantity) || 0;
    const entry = map.get(key);
    if (entry) {
      entry.quantity += quantity;
      if (!entry.line.design_token && line.design_token) entry.line = { ...entry.line, design_token: line.design_token };
    } else {
      map.set(key, { line: { ...line }, quantity });
    }
  }
  return map;
}

/** Signature kanonik isi bisnis keranjang */
export function contentSignature(lines = []) {
  const rows = [...aggregateByKey(lines)].map(([key, { line, quantity }]) => {
    const n = normalizeLine({ ...line, quantity });
    return [key, n.product_id, n.variant_id, n.design_id, n.design_token, n.quantity, n.preferred_date, n.note];
  });
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return JSON.stringify(rows.filter((row) => row[5] > 0));
}

/** Baris dari server: token tidak pernah dikembalikan (desain akun) → null */
export const serverView = (lines = []) => lines.map((line) => ({ ...line, design_token: null }));

/** Bentuk item untuk PUT/merge (kontrak validators/cart.validator.js) */
export function toPayload(lines = []) {
  return lines.map((line) => ({
    cart_item_id: line.cart_item_id ?? null,
    product_id: line.product_id,
    variant_id: line.variant_id ?? null,
    design_id: line.design_id ?? null,
    design_token: line.design_token ?? null,
    quantity: line.quantity,
    preferred_date: line.preferred_date ?? null,
    note: line.note ?? '',
  }));
}

/** Beri id lokal unik untuk baris baru (id dari server tidak dipakai bila bentrok) */
function assignIds(lines) {
  const result = [];
  for (const line of lines) {
    const taken = line.cart_item_id == null || result.some((r) => r.cart_item_id === line.cart_item_id);
    result.push(taken ? { ...line, cart_item_id: nextCartItemId(result) } : line);
  }
  return result;
}

const quantityOf = (map, key) => map.get(key)?.quantity ?? 0;

/**
 * 3-way merge per lineKey. `ancestor` = common ancestor operasi (lihat services/cartSyncReconcile).
 * Baris lokal mempertahankan id & data tampilan; baris yang hanya ada di server memakai id baru.
 * @returns {Array} baris hasil (jumlah ≤ 0 dibuang)
 */
export function merge3(ancestor, local, server) {
  const A = aggregateByKey(ancestor);
  const L = aggregateByKey(local);
  const S = aggregateByKey(server);
  const decide = (key) => {
    const a = quantityOf(A, key);
    const l = quantityOf(L, key);
    const s = quantityOf(S, key);
    if (l === a) return s;
    if (s === a) return l;
    return l; // keduanya berubah → lokal menang
  };
  const result = [];
  for (const [key, { line }] of L) {
    const quantity = decide(key);
    if (quantity > 0) result.push({ ...line, quantity });
  }
  for (const [key, { line }] of S) {
    if (L.has(key)) continue;
    const quantity = decide(key);
    if (quantity > 0) result.push({ ...line, quantity, cart_item_id: null });
  }
  return assignIds(result);
}

/** Gabungkan baris tamu ke baris akun per lineKey (jumlah ditambah, token tamu dibawa) */
export function withGuest(lines = [], guestLines = []) {
  const merged = aggregateByKey([...lines, ...guestLines]);
  return [...merged.values()].map(({ line, quantity }) => ({ ...line, quantity }));
}

/**
 * Pisahkan keranjang lokal menjadi bagian akun & bagian tamu (provenance per id lokal).
 * Bagian tamu = min(jumlah baris sekarang, guestQty) — tamu yang sudah dikurangi/dihapus pengguna ikut menyusut.
 * @param {Array} local
 * @param {Record<string, {guestQty: number, design_token?: string|null}>} provenance
 * @returns {{account: Array, guest: Array}}
 */
export function splitGuest(local = [], provenance = {}) {
  const account = [];
  const guest = [];
  for (const line of local) {
    const prov = provenance[String(line.cart_item_id)];
    const guestQty = Math.min(Number(line.quantity) || 0, prov?.guestQty ?? 0);
    const accountQty = (Number(line.quantity) || 0) - guestQty;
    if (accountQty > 0) account.push({ ...line, quantity: accountQty, design_token: guestQty > 0 ? null : line.design_token ?? null });
    if (guestQty > 0) guest.push({ ...line, quantity: guestQty, design_token: prov?.design_token ?? line.design_token ?? null });
  }
  return { account, guest };
}

/**
 * Perkiraan hasil akhir server setelah POST /cart/merge (port savedCart.service + savedCartRules): isi tersimpan
 * digabung dulu, lalu item kiriman ditambahkan per kunci (jumlah dijumlah), token selalu null. Baris yang dilewati server
 * (produk/desain tidak tersedia) tidak bisa diperkirakan → hasil GET tidak akan cocok → aman (tetap UNCONFIRMED).
 */
export function predictServerMerge(savedLines = [], sentLines = []) {
  return serverView(withGuest(withGuest([], savedLines), sentLines));
}

/**
 * Ancestor per baris untuk recovery PUT yang hasilnya tidak diketahui (laporan desain CP3):
 *   server = P → PUT diterapkan (ancestor P); server = B0 dan P ≠ B0 → PUT tidak diterapkan (ancestor B0, perubahan
 *   lokal tidak dibatalkan); selain itu → ancestor P (server berubah oleh perangkat lain → server menang, kecuali baris
 *   lokal berubah setelah dikirim → lokal menang lewat merge3).
 * @returns {Array} baris ancestor (jumlah per kunci)
 */
export function choosePutAncestor(before = [], payload = [], server = []) {
  const B = aggregateByKey(before);
  const P = aggregateByKey(payload);
  const S = aggregateByKey(server);
  const keys = new Set([...B.keys(), ...P.keys(), ...S.keys()]);
  const ancestor = [];
  for (const key of keys) {
    const b = quantityOf(B, key);
    const p = quantityOf(P, key);
    const s = quantityOf(S, key);
    const quantity = s === p ? p : s === b && p !== b ? b : p;
    const line = P.get(key)?.line ?? B.get(key)?.line ?? S.get(key)?.line;
    if (quantity > 0) ancestor.push({ ...line, quantity });
  }
  return ancestor;
}
