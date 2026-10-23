// services/customCakeService.js
// FR-10 · UC-06 · BR-02 · C-11 Custom Cake Builder — data builder & penyimpanan desain
// Tabel: products (availability_type custom), product_images, custom_options (hanya is_active = true),
// custom_cake_designs, custom_cake_design_options. Harga & tanggal dihitung ulang di sini (tidak percaya UI).

import { apiClient, USE_MOCK } from './apiClient';
import { dataUrlToBlob } from '../utils/image';
import { getTables, updateTable, nextUserRowId } from './mock/db';
import { getMockTodayKey, getMockCurrentTime } from './mock/mockClock';
import { getCartOwnerId } from '../utils/sessionIdentity';
import {
  getEarliestReadyDate, groupCustomOptions, getSelectedOptions, calculateCustomCakePrice, validateCustomCakeDesign,
} from '../utils/businessRules';
import { AVAILABILITY_TYPE } from '../constants/product';

/** Produk Custom Celebration Cake yang aktif */
const findCustomProduct = (products) =>
  products.find((p) => p.is_active && p.availability_type === AVAILABILITY_TYPE.CUSTOM) ?? null;

/** Konteks validasi: opsi aktif per kelompok + tanggal siap tercepat (H+3) */
function buildContext(tables, product) {
  return {
    groupedOptions: groupCustomOptions(tables.custom_options),
    earliestKey: getEarliestReadyDate(product, getMockCurrentTime(), tables.store_settings),
  };
}

/**
 * Data Custom Cake Builder.
 * @returns {Promise<object|null>} null bila produk custom tidak tersedia
 */
export function getCustomCakeBuilder() {
  return apiClient('/custom-options', {
    mockHandler: () => {
      const tables = getTables('products', 'product_images', 'custom_options', 'store_settings');
      const product = findCustomProduct(tables.products);
      if (!product) return null;
      const ctx = buildContext(tables, product);
      const image = tables.product_images
        .filter((img) => img.product_id === product.product_id)
        .sort((a, b) => a.sort_order - b.sort_order)[0];
      return {
        product: {
          product_id: product.product_id,
          name: product.name,
          description: product.description,
          price: product.price,
          lead_time_days: product.lead_time_days,
          image_url: image?.image_url ?? null,
        },
        options: ctx.groupedOptions,
        today_key: getMockTodayKey(),
        earliest_ready_date: ctx.earliestKey,
      };
    },
  });
}

/**
 * Mode API (Step 6.3): foto referensi (data URL hasil kompresi) dikirim sebagai file multipart `referencePhoto`,
 * data desain lainnya sebagai string JSON `design`. Tanpa foto tetap JSON biasa.
 */
const PHOTO_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function toDesignRequestBody(design) {
  const fields = { ...design, referencePhoto: null };
  if (!design.referencePhoto) return fields;
  const photo = dataUrlToBlob(design.referencePhoto);
  const extension = PHOTO_EXTENSIONS[photo?.type];
  if (!extension) throw new Error('Foto referensi tidak bisa dibaca. Pilih ulang foto.');
  const form = new FormData();
  form.append('design', JSON.stringify(fields));
  form.append('referencePhoto', photo, `referensi.${extension}`);
  return form;
}

/**
 * Simpan desain custom cake (dipanggil saat Tambah ke Keranjang).
 * Pengunjung boleh mendesain (user_id kosong bila tamu).
 * @param {{selections, writingText, writingColor, referencePhoto, readyDate}} design
 * @returns {Promise<{design_id, price, ready_date, design_token}>} design_token hanya untuk desain tamu (mode API)
 */
export function createCustomCakeDesign(design) {
  return apiClient('/custom-cake-designs', {
    method: 'POST',
    body: USE_MOCK ? design : toDesignRequestBody(design),
    // Step 6.3: kebijakan eksplisit — desain tidak terikat akun, jadi bila sesi INI kedaluwarsa desain disimpan
    // sekali sebagai desain tamu (dengan design_token). Tidak pernah dikirim ulang dengan token pengguna lain.
    guestFallback: true,
    mockHandler: (_body, { sessionUser = null } = {}) => createMockCustomCakeDesign(design, sessionUser),
  });
}

/**
 * Handler mode mock untuk createCustomCakeDesign (diekspor agar jalur aslinya bisa diuji).
 * Step 6.3 (temuan H1): pemilik desain = `sessionUser`, yaitu pengguna saat request DIMULAI (dari runMockRequest),
 * bukan pengguna yang kebetulan login saat handler berjalan — desain tamu tetap milik tamu.
 * @param {object} design
 * @param {object|null} sessionUser
 */
export function createMockCustomCakeDesign(design, sessionUser) {
  const tables = getTables('products', 'custom_options', 'store_settings', 'custom_cake_designs');
  const product = findCustomProduct(tables.products);
  if (!product) throw new Error('Custom cake sedang tidak tersedia');
  const ctx = buildContext(tables, product);
  const error = validateCustomCakeDesign(design, ctx);
  if (error) throw new Error(error);

  const selected = getSelectedOptions(ctx.groupedOptions, design.selections);
  const writingText = String(design.writingText ?? '').trim();
  const row = {
    design_id: nextUserRowId(tables.custom_cake_designs, 'design_id'),
    product_id: product.product_id,
    // Pemilik = pelanggan sah saat request DIMULAI; tamu/staf → tanpa pemilik (helper bersama sessionIdentity)
    user_id: getCartOwnerId(sessionUser) === null ? null : sessionUser.user_id,
    writing_text: writingText || null,
    writing_color: writingText ? design.writingColor : null,
    // Mode mock: data URL hasil kompresi; mode API: URL hasil upload (Step 6)
    reference_photo_url: design.referencePhoto || null,
    ready_date: design.readyDate,
    price: calculateCustomCakePrice(product.price, selected),
  };
  try {
    updateTable('custom_cake_designs', (rows) => [...rows, row]);
  } catch {
    throw new Error('Penyimpanan perangkat penuh. Coba tanpa foto referensi.');
  }
  updateTable('custom_cake_design_options', (rows) => [
    ...rows,
    ...selected.map((o) => ({ design_id: row.design_id, option_id: o.option_id })),
  ]);
  // Mode mock tidak memakai token akses desain tamu (mode API: string HMAC untuk desain tamu)
  return { design_id: row.design_id, price: row.price, ready_date: row.ready_date, design_token: null };
}
