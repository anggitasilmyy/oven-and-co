// Uji Step 6.6 (CP3) — aturan murni sinkronisasi keranjang akun (utils/rules/cartSync.js & cartSyncErrors.js).

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  lineKey, contentSignature, merge3, splitGuest, predictServerMerge, choosePutAncestor, withGuest, serverView, toPayload,
} = await import('../../src/utils/rules/cartSync.js');
const { classifySyncError, SYNC_OUTCOME } = await import('../../src/utils/rules/cartSyncErrors.js');
const { createApiError } = await import('../../src/utils/apiErrors.js');
const { CLIENT_ERROR_CODE, CLIENT_REQUEST_ERROR_CODE } = await import('../../src/constants/apiErrors.js');

const line = (over) => ({ cart_item_id: 1, product_id: '1', variant_id: null, design_id: null, design_token: null,
  quantity: 1, preferred_date: null, note: '', ...over });
const qty = (lines, key) => lines.filter((l) => lineKey(l) === key).reduce((s, l) => s + l.quantity, 0);

test('lineKey: desain = d:{design_id} tanpa token (token → null setelah klaim tidak mengubah identitas)', () => {
  const guest = line({ product_id: '6', design_id: '2', design_token: 'tok' });
  const claimed = line({ product_id: '6', design_id: 2, design_token: null, cart_item_id: 99 });
  assert.equal(lineKey(guest), 'd:2');
  assert.equal(lineKey(guest), lineKey(claimed));
  assert.notEqual(lineKey(line({ preferred_date: '2026-11-10' })), lineKey(line({ preferred_date: '2026-11-11' })));
  assert.notEqual(lineKey(line({ note: 'a' })), lineKey(line({ note: 'b' })));
  assert.equal(lineKey(line({ product_id: 1, note: ' a ' })), lineKey(line({ product_id: '1', note: 'a' })));
});

test('content signature mendeteksi ketujuh field bisnis, mengabaikan id/tampilan, dan tidak bergantung urutan', () => {
  const base = [line({ cart_item_id: 1, name: 'A', price: 1 }), line({ cart_item_id: 2, product_id: '6', design_id: '5', design_token: 't' })];
  const sig = contentSignature(base);
  for (const change of [{ product_id: '2' }, { variant_id: '3' }, { design_id: '7' }, { design_token: 'x' }, { quantity: 2 },
    { preferred_date: '2026-11-10' }, { note: 'pakai lilin' }]) {
    assert.notEqual(contentSignature([{ ...base[0], ...change }, base[1]]), sig, JSON.stringify(change));
  }
  assert.equal(contentSignature([{ ...base[1], cart_item_id: 77 }, { ...base[0], name: 'Lain', price: 9, image_url: 'x' }]), sig);
  assert.equal(contentSignature([line({ note: null })]), contentSignature([line({ note: '' })])); // server null = client ''
});

test('merge3: tabel konflik per baris (best-effort, lokal menang bila keduanya berubah)', () => {
  const a = [line({ quantity: 2 })];
  const k = lineKey(a[0]);
  assert.equal(qty(merge3(a, [line({ quantity: 2 })], [line({ quantity: 5 })]), k), 5, 'hanya server berubah → server');
  assert.equal(qty(merge3(a, [line({ quantity: 3 })], [line({ quantity: 2 })]), k), 3, 'hanya lokal berubah → lokal');
  assert.equal(qty(merge3(a, [line({ quantity: 3 })], [line({ quantity: 5 })]), k), 3, 'keduanya berubah → lokal (tidak dijumlah)');
  assert.equal(qty(merge3(a, [], [line({ quantity: 5 })]), k), 0, 'lokal hapus, server ubah → terhapus');
  assert.equal(qty(merge3(a, [line({ quantity: 4 })], []), k), 4, 'server hapus, lokal ubah → lokal');
  assert.equal(qty(merge3(a, [line({ quantity: 2 })], []), k), 0, 'server hapus, lokal tetap → terhapus');
  assert.equal(qty(merge3([], [line({ quantity: 1 })], [line({ quantity: 4 })]), k), 1, 'sama-sama menambah → lokal');
  // Ganti tanggal (identitas berubah) di perangkat A, jumlah diubah di perangkat B → baris baru A, perubahan B hilang
  const result = merge3(a, [line({ quantity: 2, preferred_date: '2026-11-12' })], [line({ quantity: 6 })]);
  assert.equal(qty(result, k), 0);
  assert.equal(qty(result, lineKey(line({ preferred_date: '2026-11-12' }))), 2);
});

test('merge3 mempertahankan id lokal & data tampilan; baris khusus server mendapat id baru yang unik', () => {
  const local = [line({ cart_item_id: 1700000000001, name: 'Croissant', quantity: 1 })];
  const server = [{ ...local[0], cart_item_id: 1, quantity: 3, name: undefined }, line({ cart_item_id: 1700000000001, product_id: '9' })];
  const result = merge3(local, local, server);
  assert.equal(result[0].cart_item_id, 1700000000001);
  assert.equal(result[0].name, 'Croissant');
  assert.equal(result[0].quantity, 3);
  assert.equal(new Set(result.map((l) => l.cart_item_id)).size, result.length);
});

test('splitGuest: bagian tamu = min(jumlah, guestQty) per id lokal; tanggal/catatan berubah tetap terhubung; token dari provenance', () => {
  const local = [line({ cart_item_id: 10, quantity: 3 }), line({ cart_item_id: 11, product_id: '6', design_id: '5', quantity: 1, note: 'baru' })];
  const prov = { 10: { guestQty: 2 }, 11: { guestQty: 1, design_token: 'tok-5' } };
  const { account, guest } = splitGuest(local, prov);
  assert.deepEqual(account.map((l) => [l.cart_item_id, l.quantity]), [[10, 1]]);
  assert.deepEqual(guest.map((l) => [l.cart_item_id, l.quantity, l.design_token, l.note]), [[10, 2, null, ''], [11, 1, 'tok-5', 'baru']]);
  // Baris tamu dikurangi pengguna → bagian tamu ikut menyusut
  assert.equal(splitGuest([line({ cart_item_id: 10, quantity: 1 })], prov).guest[0].quantity, 1);
  assert.equal(splitGuest([], prov).guest.length, 0);
});

test('predictServerMerge: port aturan server — isi tersimpan + kiriman dijumlah per kunci, token null, normalisasi catatan/tanggal', () => {
  const saved = [line({ cart_item_id: 1, quantity: 1, note: null }), line({ cart_item_id: 2, product_id: '9', preferred_date: '2026-11-08' })];
  const sent = [line({ cart_item_id: 50, quantity: 2, note: '  ' }), line({ cart_item_id: 51, product_id: '6', design_id: '4', design_token: 'tok' })];
  const predicted = predictServerMerge(saved, sent);
  assert.equal(qty(predicted, lineKey(line())), 3);
  assert.equal(predicted.find((l) => l.design_id === '4').design_token, null);
  // Respons server dengan urutan berbeda & id baru → signature sama
  const serverOrder = serverView([predicted[2], predicted[0], predicted[1]].map((l, i) => ({ ...l, cart_item_id: i + 1, note: l.note || null })));
  assert.equal(contentSignature(serverOrder), contentSignature(predicted));
});

test('choosePutAncestor per baris: diterapkan → P; tidak diterapkan → B0 (perubahan lokal tidak dibatalkan); berubah lain → P', () => {
  const B0 = [line({ quantity: 1 })];
  const P = [line({ quantity: 3 })];
  const k = lineKey(P[0]);
  // PUT tidak di-commit: server = B0 → ancestor B0 → lokal 3 dipertahankan
  const notApplied = choosePutAncestor(B0, P, B0);
  assert.equal(qty(merge3(notApplied, P, B0), k), 3);
  // PUT di-commit: server = P → ancestor P
  assert.equal(qty(choosePutAncestor(B0, P, P), k), 3);
  // Perangkat lain mengubah setelah commit: server 7 → ancestor P → server menang (lokal tidak berubah sejak kirim)
  assert.equal(qty(merge3(choosePutAncestor(B0, P, [line({ quantity: 7 })]), P, [line({ quantity: 7 })]), k), 7);
  // ...kecuali lokal berubah lagi setelah dikirim → lokal menang
  assert.equal(qty(merge3(choosePutAncestor(B0, P, [line({ quantity: 7 })]), [line({ quantity: 4 })], [line({ quantity: 7 })]), k), 4);
});

test('withGuest & toPayload: bentuk kontrak validator server', () => {
  const merged = withGuest([line({ quantity: 1 })], [line({ cart_item_id: 9, quantity: 2, design_token: null })]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].quantity, 3);
  assert.deepEqual(Object.keys(toPayload(merged)[0]).sort(),
    ['cart_item_id', 'design_id', 'design_token', 'note', 'preferred_date', 'product_id', 'quantity', 'variant_id']);
});

test('klasifikasi error: hanya 4xx dari server kita yang pasti gagal; 5xx/jaringan/gateway/tidak terbaca = UNKNOWN', () => {
  const cases = [
    [createApiError('Tidak dapat terhubung', 0, CLIENT_REQUEST_ERROR_CODE.NETWORK_ERROR), SYNC_OUTCOME.UNKNOWN],
    [createApiError('Respons server tidak dapat dibaca.', 200, CLIENT_REQUEST_ERROR_CODE.INVALID_RESPONSE), SYNC_OUTCOME.UNKNOWN],
    [createApiError('Terjadi kesalahan pada server.', 500), SYNC_OUTCOME.UNKNOWN],
    [createApiError('HTTP 502', 502), SYNC_OUTCOME.UNKNOWN],
    [createApiError('HTTP 504', 504), SYNC_OUTCOME.UNKNOWN],
    [createApiError('HTTP 400', 400), SYNC_OUTCOME.UNKNOWN], // 4xx tanpa body server kita (gateway)
    [createApiError('Too many', 429), SYNC_OUTCOME.UNKNOWN],
    [createApiError('Item 1: catatan tidak valid.', 400), SYNC_OUTCOME.FAILED],
    [createApiError('Ukuran data permintaan terlalu besar.', 413), SYNC_OUTCOME.FAILED],
    [createApiError('Anda tidak memiliki izin.', 403), SYNC_OUTCOME.FAILED],
    [createApiError('Autentikasi diperlukan.', 401), SYNC_OUTCOME.SESSION],
    [createApiError('Sesi berakhir', 401, CLIENT_ERROR_CODE.SESSION_EXPIRED), SYNC_OUTCOME.SESSION],
    [createApiError('Sesi berganti', 401, CLIENT_ERROR_CODE.SESSION_CHANGED), SYNC_OUTCOME.UNKNOWN],
    [Object.assign(new Error('aborted'), { name: 'AbortError' }), SYNC_OUTCOME.UNKNOWN],
  ];
  for (const [error, expected] of cases) assert.equal(classifySyncError(error), expected, `${error.status} ${error.message}`);
});
