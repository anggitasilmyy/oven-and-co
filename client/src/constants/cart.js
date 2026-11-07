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

/** Desain custom cake ditambahkan ke keranjang aktif (identitas tidak berubah) */
export const DESIGN_ADDED_MESSAGE = 'Ditambahkan ke keranjang';

/**
 * Step 6.3 (temuan H1, M-A, L2, L3): pesan hasil simpan desain bila identitas berganti selama penyimpanan.
 * Kunci = DESIGN_CART_TARGET / GUEST_CART_REASON (services/customCakeCartService.js).
 */
export const DESIGN_CART_NOTICE = {
  /** Desain tamu digabung ke keranjang pelanggan yang baru masuk (FR-04) */
  account_merged: 'Kamu masuk saat desain disimpan. Desain sudah ditambahkan ke keranjang akunmu.',
  /** Desain akun → keranjang akun pembuatnya (bukan akun yang aktif sekarang) */
  original_owner:
    'Sesi akun berganti saat desain disimpan. Desain dimasukkan ke keranjang akun yang membuatnya, bukan akun yang aktif sekarang.',
  /** Sesi akun berakhir (token ditolak) → desain disimpan sebagai tamu */
  session_expired:
    'Sesi akunmu berakhir saat desain disimpan. Desain disimpan sebagai tamu di keranjang perangkat ini dan akan digabung ke keranjang akunmu setelah kamu masuk kembali.',
  /** Yang aktif akun staf/owner → desain tetap desain tamu */
  staff_session:
    'Desain disimpan sebagai desain tamu di keranjang tamu perangkat ini dan tidak dimasukkan ke akun staf/owner.',
  /** Akun lain sempat aktif selama penyimpanan → tidak digabung diam-diam */
  not_merged:
    'Akun berganti saat desain disimpan. Desain disimpan di keranjang tamu perangkat ini dan belum digabung ke keranjang akun yang aktif. Keranjang tamu digabung saat masuk berikutnya di perangkat ini.',
};

/** Desain tersimpan di server, tetapi keranjang tujuan sudah penuh → tidak diklaim berhasil */
export const DESIGN_SAVED_CART_FULL_MESSAGE =
  `Desain tersimpan, tetapi belum masuk keranjang karena keranjang tujuan sudah berisi ${CART_MAX_LINES} item berbeda. Hapus item lain lalu tambahkan desain lagi.`;

/** Desain tersimpan di server, tetapi keranjang gagal ditulis ke perangkat */
export const DESIGN_SAVED_STORAGE_FAILED_MESSAGE =
  'Desain tersimpan, tetapi gagal dimasukkan ke keranjang karena penyimpanan perangkat penuh. Kosongkan ruang lalu desain ulang.';

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

/**
 * Step 6.6 (CP3) · FR-04 · BR-04 — sinkronisasi keranjang akun (mode API). Nilai waktu = asumsi prototype.
 */
export const CART_SYNC = {
  /** Jeda setelah perubahan lokal sebelum dikirim (perubahan beruntun digabung) */
  DEBOUNCE_MS: 300,
  /** Batas tunggu sinkronisasi saat login/registrasi sebelum redirect (gagal/lewat → pending, login tetap berhasil) */
  LOGIN_TIMEOUT_MS: 8000,
  /** Batas tunggu flushCartSync setelah checkout berhasil */
  FLUSH_TIMEOUT_MS: 5000,
  /** Putaran rekonsiliasi maksimum dalam satu kunci */
  MAX_ROUNDS: 3,
  /** Jeda percobaan ulang otomatis bila tertunda (bukan paused) */
  RETRY_DELAYS_MS: [5000, 15000, 45000],
};

/** Status hasil sinkronisasi keranjang akun */
export const CART_SYNC_STATUS = {
  SYNCED: 'synced',
  PENDING: 'pending',
  /** Hasil merge tamu tidak bisa dipastikan → tidak ada PUT/POST otomatis */
  PAUSED: 'paused',
  /** Tidak ada sinkronisasi (mode mock, tamu, staf/owner) */
  IDLE: 'idle',
};

export const CART_SYNC_MESSAGE = {
  SKIPPED: 'Sebagian item tidak bisa disimpan ke keranjang akun karena produk atau desain tidak tersedia, dan dihapus dari keranjang.',
  BLOCKED: 'Isi keranjang tidak bisa disimpan ke akun. Periksa catatan atau jumlah item, lalu ubah keranjang.',
  PAUSED:
    'Sinkronisasi keranjang akun dihentikan sementara karena hasil penggabungan keranjang belum bisa dipastikan. Isi keranjang di perangkat ini tetap tersimpan.',
};
