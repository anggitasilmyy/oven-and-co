// constants/recipe.js
// CR-03 · FR-39/FR-40 · BR-13 – BR-15 (SPEC §5, §6, §10) — konstanta komposisi bahan & estimasi kebutuhan bahan.
// Sama dengan server utils/businessConstants.js (MATERIAL_DEMAND_STATUSES, RECIPE_MAX_ITEMS, …).

import { ORDER_STATUS } from './orderStatus';

/** Status pesanan yang masih membutuhkan bahan (terpisah dari PRODUCTION_STATUSES AD-05) */
export const MATERIAL_DEMAND_STATUSES = Object.freeze([ORDER_STATUS.DIKONFIRMASI, ORDER_STATUS.SEDANG_DISIAPKAN]);

/** Maks. bahan per produk (asumsi prototype, SPEC §10) */
export const RECIPE_MAX_ITEMS = 30;

/** Takaran DECIMAL(10,3) — maks. 9.999.999,999 */
export const RECIPE_QTY_DECIMALS = 3;

/** Jendela tanggal target estimasi: hari ini s.d. hari ini + 29 */
export const MATERIAL_REQUIREMENT_WINDOW_DAYS = 30;

/** Status kebutuhan per bahan (dinilai dari sisa setelah dialokasikan) */
export const MATERIAL_DEMAND_STATUS = Object.freeze({ KURANG: 'kurang', MENIPIS: 'menipis', CUKUP: 'cukup' });

/** K-06 (CR-03 §B8): peringatan teks di form ubah bahan AD-07 saat satuan diubah — tidak memblokir Simpan */
export const MATERIAL_UNIT_CHANGE_WARNING =
  'Satuan ini juga menjadi satuan takaran di komposisi produk. Mengubah satuan tidak mengubah angka takaran yang sudah tersimpan; periksa kembali komposisi produk yang memakai bahan ini.';

/** CR-03 §B3.8: label & badge status kebutuhan (menilai sisa setelah dialokasikan; beda dari Aman/Menipis/Habis) */
export const MATERIAL_DEMAND_STATUS_META = Object.freeze({
  [MATERIAL_DEMAND_STATUS.KURANG]: { label: 'Kurang', variant: 'error' },
  [MATERIAL_DEMAND_STATUS.MENIPIS]: { label: 'Menipis', variant: 'preorder' },
  [MATERIAL_DEMAND_STATUS.CUKUP]: { label: 'Cukup', variant: 'ready' },
});

/** K-14 (CR-03 §B3.7): teks keterangan wajib tab Kebutuhan Bahan — memuat E-1 – E-10, selalu tampil, tidak dapat disembunyikan */
export const MATERIAL_REQUIREMENT_NOTE =
  'Angka ini estimasi, bukan catatan pemakaian bahan. Dihitung dari pesanan pre-order & custom yang sudah dikonfirmasi '
  + 'atau sedang disiapkan — pesanan yang sedang disiapkan dihitung penuh — ditambah seluruh rencana produk ready hari '
  + 'ini, termasuk yang mungkin sudah dibuat. Produk ready untuk tanggal mendatang belum termasuk. Produk ready dalam '
  + 'pesanan campuran dihitung pada tanggal pesanan dibuat, bukan tanggal siap. Custom cake dihitung dengan ukuran '
  + 'standar, dan varian produk tidak dihitung terpisah. Produk tanpa komposisi tidak dihitung dan ditampilkan terpisah. '
  + 'Jenis produk dibaca dari data produk saat ini; bila diubah setelah pesanan dibuat, estimasi dapat kurang atau '
  + 'berlebih. Stok bahan tidak dikurangi otomatis; perbarui lewat Catat Stok Masuk atau koreksi stok.';

/** SPEC §5 fail-safe presisi — pesan aman sama dengan server (CR-03 CP5) */
export const MILLI_PRECISION_LOST_TEXT = 'Hasil perhitungan tidak dapat direpresentasikan secara aman.';
