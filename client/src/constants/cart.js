// constants/cart.js
// Step 6.3 · FR-11 · FR-04 · C-12 — batas keranjang & pesan alasan item tidak bisa dipesan.
// Batas di sini adalah asumsi prototype (tidak diatur dokumen) dan sama dengan
// server/src/utils/businessConstants.js. Lihat catatan Step 6.3 di docs/ROADMAP.md.

import { NON_STOCK_MAX_QUANTITY } from './productDetail';

/** Maksimal unit per baris keranjang (sama dengan batas stepper produk tanpa stok harian) */
export const CART_LINE_MAX_QUANTITY = NON_STOCK_MAX_QUANTITY;

/** Maksimal baris (item berbeda) dalam satu keranjang */
export const CART_MAX_LINES = 50;

export const CART_LINE_LIMIT_MESSAGE =
  `Keranjang maksimal berisi ${CART_MAX_LINES} item berbeda. Hapus item lain atau tambah jumlah item yang sudah ada.`;

/** Kode `unavailable_reason` dari POST /api/cart (server/src/services/cart.service.js) */
export const CART_UNAVAILABLE_REASON = {
  PRODUCT_UNAVAILABLE: 'product_unavailable',
  VARIANT_UNAVAILABLE: 'variant_unavailable',
  DESIGN_REQUIRED: 'design_required',
  DESIGN_NOT_FOUND: 'design_not_found',
  DESIGN_MISMATCH: 'design_mismatch',
  DESIGN_ALREADY_ORDERED: 'design_already_ordered',
  DESIGN_EXPIRED: 'design_expired',
  DATE_OUT_OF_RANGE: 'date_out_of_range',
  QUANTITY_EXCEEDS_LIMIT: 'quantity_exceeds_limit',
  DESIGN_DUPLICATE_LINE: 'design_duplicate_line',
};

const REDESIGN = 'Hapus dari keranjang lalu desain ulang custom cake.';

/** Pesan per alasan; alasan lain/kosong memakai CART_UNAVAILABLE_DEFAULT_MESSAGE */
export const CART_UNAVAILABLE_MESSAGE = {
  [CART_UNAVAILABLE_REASON.VARIANT_UNAVAILABLE]: 'Varian ini sudah tidak tersedia. Hapus dari keranjang.',
  [CART_UNAVAILABLE_REASON.DESIGN_REQUIRED]: `Desain custom cake tidak ditemukan. ${REDESIGN}`,
  [CART_UNAVAILABLE_REASON.DESIGN_NOT_FOUND]: `Desain custom cake tidak ditemukan. ${REDESIGN}`,
  [CART_UNAVAILABLE_REASON.DESIGN_MISMATCH]: `Desain custom cake tidak sesuai produk. ${REDESIGN}`,
  [CART_UNAVAILABLE_REASON.DESIGN_ALREADY_ORDERED]: `Desain ini sudah dipakai pada pesanan sebelumnya. ${REDESIGN}`,
  [CART_UNAVAILABLE_REASON.DESIGN_EXPIRED]: `Tanggal siap desain ini sudah tidak memenuhi minimal H+3. ${REDESIGN}`,
  [CART_UNAVAILABLE_REASON.DATE_OUT_OF_RANGE]:
    'Tanggal ambil/antar di luar rentang yang bisa dipilih. Hapus lalu tambahkan lagi dengan tanggal baru.',
  [CART_UNAVAILABLE_REASON.DESIGN_DUPLICATE_LINE]:
    'Desain ini sudah ada di baris lain. Hapus baris ini dan ubah jumlah pada baris pertama, atau buat desain terpisah.',
  [CART_UNAVAILABLE_REASON.QUANTITY_EXCEEDS_LIMIT]:
    `Jumlah melebihi batas ${CART_LINE_MAX_QUANTITY} per item. Kurangi jumlah sebelum checkout.`,
};

export const CART_UNAVAILABLE_DEFAULT_MESSAGE = 'Produk ini sudah tidak tersedia. Hapus dari keranjang.';
