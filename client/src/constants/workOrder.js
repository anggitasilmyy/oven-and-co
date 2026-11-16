// constants/workOrder.js
// CR-04b · FR-45, FR-46 · BR-25 – BR-29, BR-36 (SPEC §5, §6, §10; Draft 0.8.3 §8, §14) — Work Order & hasil produksi.
// Nilai sama dengan server utils/businessConstants.js (uji silang client tests/vitest/workOrderRules.test.mjs).

export const WO_STATUS = Object.freeze({ DRAFT: 'draft', DIPROSES: 'diproses', SELESAI: 'selesai', DIBATALKAN: 'dibatalkan' });
// Transisi manual WO (BR-25): mulai dari Draft; batal dari Draft/Diproses. Selesai hanya lewat Selesaikan WO. Final.
export const WO_MANUAL_TRANSITIONS = Object.freeze({
  draft: Object.freeze(['diproses', 'dibatalkan']),
  diproses: Object.freeze(['dibatalkan']),
  selesai: Object.freeze([]),
  dibatalkan: Object.freeze([]),
});
export const WO_NUMBER_PREFIX = 'WO'; // nomor WO-YYMMDD-NNN (SPEC §10), tanggal WIB saat WO dibuat
export const WO_QTY_MAX = 10000; // rencana & hasil bilangan bulat (Draft §14)
export const WO_MAX_ISSUE_LINES = 30; // asumsi prototype SPEC §10

// CR-04b · AD-13 Produksi — label & badge status WO, jenis dokumen pengeluaran & hasil (tampilan)
export const WO_STATUS_META = Object.freeze({
  draft: { label: 'Draft', variant: 'neutral' },
  diproses: { label: 'Diproses', variant: 'preorder' },
  selesai: { label: 'Selesai', variant: 'ready' },
  dibatalkan: { label: 'Dibatalkan', variant: 'error' },
});
export const ISSUE_KIND_LABEL = Object.freeze({ normal: 'Pengeluaran', pembalik: 'Pembalik pengeluaran', pengganti: 'Koreksi (pengganti)' });
export const OUTPUT_KIND_LABEL = Object.freeze({ normal: 'Hasil', pembalik: 'Pembalik hasil', pengganti: 'Koreksi hasil (pengganti)' });
// K13 / R-15: hasil produksi tidak menambah stok jual — keterangan wajib di AD-13
export const PRODUCTION_OUTPUT_NOTE = 'Hasil produksi hanya dicatat dan tidak menambah stok produk siap jual. Rencana stok produk ready tetap diisi di menu Stok.';
