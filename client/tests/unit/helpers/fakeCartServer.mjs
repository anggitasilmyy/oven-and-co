// tests/unit/helpers/fakeCartServer.mjs — server keranjang akun tiruan untuk uji engine CP3.
// Meniru server/src/services/savedCart.service.js: isi diganti seluruhnya (PUT) atau digabung (merge) per kunci server
// (desain = design_id; selain itu produk+varian+tanggal+catatan), jumlah dijumlah, desain tamu diklaim dengan token,
// baris yang tidak bisa disimpan dikembalikan di `skipped`, id baris dibuat ulang, token selalu null di respons.
// Kegagalan bisa diatur per request: sebelum/sesudah commit, respons hilang, ditahan, atau HTTP error.

import { createApiError } from '../../../src/utils/apiErrors.js';
import { CLIENT_REQUEST_ERROR_CODE, NETWORK_ERROR_MESSAGE } from '../../../src/constants/apiErrors.js';

const serverKey = (item) => (item.design_id != null
  ? JSON.stringify(['design', String(item.design_id)])
  : JSON.stringify([String(item.product_id), item.variant_id == null ? null : String(item.variant_id), null,
    item.preferred_date ?? null, String(item.note ?? '').trim()]));

export const networkError = () => createApiError(NETWORK_ERROR_MESSAGE, 0, CLIENT_REQUEST_ERROR_CODE.NETWORK_ERROR);
export const http500 = () => createApiError('Terjadi kesalahan pada server.', 500);
export const http400 = () => createApiError('Item 1: catatan tidak valid.', 400);

/**
 * @param {{missingProducts?: string[]}} [options]
 * Plan per request (antrian `plan`): 'ok' | 'failBeforeCommit:network|500|400' | 'failAfterCommit:network|500|502'
 * | 'hold' (commit saat release()) | 'neverRespondAfterCommit' (commit lalu tidak pernah selesai — crash tab).
 */
export function createFakeCartServer({ missingProducts = [] } = {}) {
  let rows = [];
  let nextId = 1;
  const designs = new Map(); // design_id → { owner: string|null, token: string }
  const log = [];
  const plans = [];
  const held = [];
  const view = () => rows.map((row) => ({ ...row, design_token: null }));

  function save(owner, items, merge) {
    const result = [];
    for (const item of [...(merge ? view() : []), ...items]) {
      const key = serverKey(item);
      const existing = result.find((row) => serverKey(row) === key);
      if (existing) {
        existing.quantity += item.quantity;
        existing.design_token = existing.design_token ?? item.design_token ?? null;
      } else {
        result.push({ ...item });
      }
    }
    for (const item of result) {
      const design = item.design_id != null ? designs.get(String(item.design_id)) : null;
      if (design && design.owner == null && item.design_token === design.token) design.owner = owner;
    }
    const kept = [];
    const skipped = [];
    for (const item of result) {
      const design = item.design_id != null ? designs.get(String(item.design_id)) : null;
      const bad = missingProducts.includes(String(item.product_id)) || (item.design_id != null && design?.owner !== owner);
      if (bad) skipped.push({ cart_item_id: item.cart_item_id ?? null, product_id: String(item.product_id), reason: 'x' });
      else kept.push(item);
    }
    rows = kept.map((item) => ({
      cart_item_id: nextId++, product_id: String(item.product_id), variant_id: item.variant_id ?? null,
      design_id: item.design_id == null ? null : String(item.design_id), design_token: null, quantity: item.quantity,
      preferred_date: item.preferred_date ?? null, note: String(item.note ?? '').trim() || null,
    }));
    return { items: view(), skipped };
  }

  function respond(kind, commit) {
    const plan = plans.shift() ?? 'ok';
    log.push(kind);
    const [mode, detail] = plan.split(':');
    const errorOf = () => (detail === '500' ? http500() : detail === '400' ? http400()
      : detail === '502' ? createApiError('HTTP 502', 502) : networkError());
    if (mode === 'failBeforeCommit') return Promise.reject(errorOf());
    if (mode === 'failAfterCommit') {
      commit();
      return Promise.reject(errorOf());
    }
    if (mode === 'neverRespondAfterCommit') {
      commit();
      return new Promise(() => {});
    }
    if (mode === 'hold') {
      return new Promise((resolve) => { held.push(() => resolve(commit())); });
    }
    return Promise.resolve(commit());
  }

  const owner = { id: '1' };
  return {
    log,
    plan: (...entries) => plans.push(...entries),
    releaseHeld: () => held.shift()?.(),
    heldCount: () => held.length,
    setOwner: (id) => { owner.id = id; },
    rows: () => view(),
    setRows: (items) => { rows = items.map((item) => ({ ...item, cart_item_id: nextId++, design_token: null })); },
    addGuestDesign: (designId, token) => designs.set(String(designId), { owner: null, token }),
    designOwner: (designId) => designs.get(String(designId))?.owner ?? null,
    count: (kind) => log.filter((entry) => entry === kind).length,
    api: {
      getSavedCart: () => respond('GET', () => ({ items: view() })),
      saveCart: (items) => respond('PUT', () => save(owner.id, items, false)),
      mergeGuestCartToAccount: (items) => respond('POST', () => save(owner.id, items, true)),
      getCartView: async (items) => ({ lines: items.map((i) => ({ ...i, name: `Produk ${i.product_id}`, unit_price: 1000, image_url: null })) }),
    },
  };
}
