// constants/purchasing.js
// CR-04a · FR-41 – FR-44 — konstanta pembelian & buku mutasi, IDENTIK dengan server utils/businessConstants.js (diuji
// silang di tests/vitest/purchasingRules.test.mjs). Dipakai aturan murni utils/rules/{purchasing,stockLedger,...}.js.

// CR-04a · FR-41 – FR-44 · BR-17 – BR-24, BR-30, BR-31, BR-35 (SPEC §5, §6, §10; Draft 0.8.3 §3 – §7, §14) — pembelian
// & buku mutasi. Batas ditulis sebagai teks desimal (dibaca lewat BigInt, tidak pernah float).
export const PO_MAX_ITEMS = 30; // asumsi prototype SPEC §10
export const PO_NUMBER_PREFIX = 'PO'; // nomor PO-YYMMDD-NNN (SPEC §10), tanggal WIB saat PO dibuat
export const STOCK_QTY_MAX = '99999999.99'; // DECIMAL(10,2)
export const PURCHASE_PRICE_MAX = '9999999999.99'; // DECIMAL(12,2); juga batas nilai baris & nilai PO
export const DOCUMENT_REASON_MAX = 255;
export const PO_STATUS = Object.freeze({
  DRAFT: 'draft', DIPESAN: 'dipesan', DITERIMA_SEBAGIAN: 'diterima_sebagian', DITERIMA: 'diterima', DIBATALKAN: 'dibatalkan',
});
// Transisi manual PO (BR-19): pesan dari Draft; batal dari Draft/Dipesan/Diterima Sebagian. Diterima Sebagian &
// Diterima dihitung dari jumlah bersih diterima (bukan transisi manual). Diterima & Dibatalkan final.
export const PO_MANUAL_TRANSITIONS = Object.freeze({
  draft: Object.freeze(['dipesan', 'dibatalkan']),
  dipesan: Object.freeze(['dibatalkan']),
  diterima_sebagian: Object.freeze(['dibatalkan']),
  diterima: Object.freeze([]),
  dibatalkan: Object.freeze([]),
});
export const PO_RECEIVABLE_STATUSES = Object.freeze(['dipesan', 'diterima_sebagian']);
export const SUPPLIER_FIELD_MAX = Object.freeze({ name: 100, phone: 20, email: 100, address: 255, contactPerson: 100, note: 255 });
export const LEDGER_ERROR_CODE = Object.freeze({
  REQUEST_ID_REUSED: 'REQUEST_ID_REUSED',
  REQUEST_IN_PROGRESS: 'REQUEST_IN_PROGRESS',
  DOCUMENT_ALREADY_SUPERSEDED: 'DOCUMENT_ALREADY_SUPERSEDED',
  STOCK_OUT_OF_RANGE: 'STOCK_OUT_OF_RANGE',
  STOCK_CHANGED: 'STOCK_CHANGED',
});
// Allowlist request_id (Draft §5.1, bagian CR-04a): operasi → wajib/opsional. Operasi lain menolak request_id.
export const REQUEST_ID_POLICY = Object.freeze({
  create_supplier: 'required',
  update_supplier: 'optional',
  set_supplier_active: 'optional',
  create_purchase_order: 'required',
  update_purchase_order: 'optional',
  transition_purchase_order: 'required',
  receive_purchase_order: 'required',
  reverse_goods_receipt: 'required',
  correct_goods_receipt: 'required',
  create_raw_material: 'optional',
  update_raw_material: 'optional',
  raw_material_stock_in: 'optional',
  count_stock: 'required',
  reverse_stock_in: 'required',
  correct_stock_in: 'required',
});

// CR-04a CP6 · AD-12 Pembelian — tab (?tab=supplier), label & badge status PO, label jenis dokumen & mutasi (tampilan)
export const PURCHASING_TAB = Object.freeze({ PO: 'po', SUPPLIER: 'supplier' });
export const PURCHASING_TABS = Object.freeze([
  { key: PURCHASING_TAB.PO, label: 'Purchase Order' },
  { key: PURCHASING_TAB.SUPPLIER, label: 'Supplier' },
]);
export const PO_STATUS_META = Object.freeze({
  draft: { label: 'Draft', variant: 'neutral' },
  dipesan: { label: 'Dipesan', variant: 'preorder' },
  diterima_sebagian: { label: 'Diterima Sebagian', variant: 'custom' },
  diterima: { label: 'Diterima', variant: 'ready' },
  dibatalkan: { label: 'Dibatalkan', variant: 'error' },
});
export const RECEIPT_KIND_LABEL = Object.freeze({ normal: 'Penerimaan', pembalik: 'Pembalik', pengganti: 'Koreksi (pengganti)' });
export const MOVEMENT_TYPE_LABEL = Object.freeze({
  saldo_awal: 'Saldo awal', stok_masuk: 'Stok masuk', pembalik_stok_masuk: 'Pembalik stok masuk', koreksi_stok_masuk: 'Koreksi stok masuk',
  stock_opname: 'Stock opname', penerimaan: 'Penerimaan PO', pembalik_penerimaan: 'Pembalik penerimaan', koreksi_penerimaan: 'Koreksi penerimaan',
});
/** Dokumen stok masuk yang dapat dibalik/dikoreksi dari riwayat mutasi AD-07 (BR-30) */
export const REVERSIBLE_STOCK_KINDS = Object.freeze(['stok_masuk', 'pengganti_stok_masuk']);
