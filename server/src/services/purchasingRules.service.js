// services/purchasingRules.service.js
// CR-04a CP3 · FR-41 – FR-43 · UC-33 – UC-35 · BR-17 – BR-21 · K02 + T-01, K03 – K05 (SPEC §5, §6; Draft 0.8.3 §4.4, §7)
// Aturan murni supplier, purchase order, transisi status, sisa item, penerimaan, dan pembatalan. Tanpa database: data
// yang dibutuhkan (bahan terdaftar, status supplier, jumlah bersih diterima) diberikan pemanggil setelah mengunci baris
// (CP4/CP5). Kuantitas & harga sebagai teks desimal → BigInt sen. Client setara: utils/rules/purchasing.js.

const {
  PO_MAX_ITEMS, PO_NUMBER_PREFIX, STOCK_QTY_MAX, PURCHASE_PRICE_MAX, PO_STATUS, PO_MANUAL_TRANSITIONS, PO_RECEIVABLE_STATUSES,
  SUPPLIER_FIELD_MAX, DOCUMENT_REASON_MAX,
} = require('../utils/businessConstants');
const { parseDecimalInput, decimalToCents, centsToDecimalString } = require('./decimalInputRules.service');
const { lineValueCents, VALUE_MAX_CENTS } = require('./purchaseValueRules.service');

// Draft 0.8.3 §7: "format telepon yang dipakai project, ≤ 20" = format HP project (SPEC §6 Registrasi "HP diawali
// +62"; auth.service/profile.validator +62 diikuti 8 – 13 digit, maks. 16 karakter ≤ 20)
const SUPPLIER_PHONE_PATTERN = /^\+62\d{8,13}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_PATTERN = /^[1-9]\d*$/;

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const idOf = (value) => (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' ? String(value).trim() : '');

function requiredText(errors, field, value, max, label) {
  const v = text(value);
  if (!v) errors[field] = `${label} wajib diisi.`;
  else if (v.length > max) errors[field] = `${label} maks. ${max} karakter.`;
  return v;
}

/**
 * Supplier (BR-17, K02 + T-01, K03): nama, telepon/WA, alamat, email, kontak person wajib; catatan opsional; daftar
 * bahan opsional, dari master AD-07, tanpa duplikat. Keunikan nama ditegakkan database (kolasi tanpa beda huruf).
 * @param {object} input
 * @param {Set<string>} materialIds — material_id master AD-07
 */
function validateSupplier(input, materialIds) {
  const errors = {};
  const phone = text(input.phone).replace(/[\s()-]/g, '');
  const value = {
    name: requiredText(errors, 'name', input.name, SUPPLIER_FIELD_MAX.name, 'Nama supplier'),
    phone,
    address: requiredText(errors, 'address', input.address, SUPPLIER_FIELD_MAX.address, 'Alamat'),
    email: requiredText(errors, 'email', input.email, SUPPLIER_FIELD_MAX.email, 'Email'),
    contact_person: requiredText(errors, 'contact_person', input.contact_person, SUPPLIER_FIELD_MAX.contactPerson, 'Kontak person'),
    note: text(input.note) || null,
    material_ids: [],
  };
  if (!phone) errors.phone = 'Telepon/WhatsApp wajib diisi.';
  else if (!SUPPLIER_PHONE_PATTERN.test(phone) || phone.length > SUPPLIER_FIELD_MAX.phone) errors.phone = 'Nomor telepon tidak valid (awali +62).';
  if (value.email && !errors.email && !EMAIL_PATTERN.test(value.email)) errors.email = 'Format email tidak valid.';
  if (value.note && value.note.length > SUPPLIER_FIELD_MAX.note) errors.note = `Catatan maks. ${SUPPLIER_FIELD_MAX.note} karakter.`;
  const ids = input.material_ids ?? [];
  if (!Array.isArray(ids)) errors.material_ids = 'Daftar bahan tidak valid.';
  else {
    const seen = new Set();
    ids.forEach((raw, i) => {
      const id = idOf(raw);
      if (!ID_PATTERN.test(id) || !materialIds.has(id)) errors[`material_ids.${i}`] = 'Bahan tidak terdaftar di master bahan.';
      else if (seen.has(id)) errors[`material_ids.${i}`] = 'Bahan sudah ada di daftar.';
      seen.add(id);
    });
    value.material_ids = [...seen].filter((id) => ID_PATTERN.test(id) && materialIds.has(id)).sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
  }
  return { errors, value };
}

/**
 * Item PO (BR-18, K06, SPEC §6): supplier aktif & ≥ 1 bahan terdaftar; 1 – 30 item; bahan terdaftar sekali; qty & harga
 * teks desimal > 0 (≤ 2 desimal, ≤ batas); nilai baris & nilai PO ≤ 9.999.999.999,99.
 * @param {{supplierActive: boolean, supplierMaterialIds: Set<string>}} supplier
 */
function validatePurchaseOrderItems(items, supplier) {
  const errors = {};
  const value = [];
  if (!supplier.supplierActive) errors.supplier_id = 'Supplier tidak aktif.';
  else if (supplier.supplierMaterialIds.size === 0) errors.supplier_id = 'Supplier belum punya daftar bahan.';
  if (!Array.isArray(items) || items.length === 0) errors.items = 'Minimal 1 item.';
  else if (items.length > PO_MAX_ITEMS) errors.items = `Maksimal ${PO_MAX_ITEMS} item per PO.`;
  if (errors.items || !Array.isArray(items)) return { errors, value };
  const seen = new Set();
  let total = 0n;
  items.forEach((item, i) => {
    const id = idOf(item?.material_id);
    if (!supplier.supplierMaterialIds.has(id)) errors[`items.${i}.material_id`] = 'Bahan tidak terdaftar pada supplier ini.';
    else if (seen.has(id)) errors[`items.${i}.material_id`] = 'Bahan sudah ada di PO.';
    seen.add(id);
    const qty = parseDecimalInput(item?.qty_ordered, { max: STOCK_QTY_MAX });
    const price = parseDecimalInput(item?.unit_price, { max: PURCHASE_PRICE_MAX });
    if (qty.error) errors[`items.${i}.qty_ordered`] = qty.error;
    if (price.error) errors[`items.${i}.unit_price`] = price.error;
    if (qty.error || price.error) return;
    const line = lineValueCents(centsToDecimalString(qty.cents), centsToDecimalString(price.cents));
    if (line > VALUE_MAX_CENTS) errors[`items.${i}.unit_price`] = 'Nilai baris melebihi batas maksimum.';
    total += line;
    value.push({ material_id: id, qty_ordered: centsToDecimalString(qty.cents), unit_price: centsToDecimalString(price.cents) });
  });
  if (total > VALUE_MAX_CENTS) errors.items = 'Nilai PO melebihi batas maksimum.';
  value.sort((a, b) => (BigInt(a.material_id) < BigInt(b.material_id) ? -1 : 1));
  return { errors, value };
}

/** Transisi manual {from, to} (BR-19). → null bila sah, selain itu {status: 409, message} */
function purchaseOrderTransitionError(current, from, to) {
  if (current !== from) return { status: 409, message: 'Status PO sudah berubah. Muat ulang data.' };
  if (!(PO_MANUAL_TRANSITIONS[from] ?? []).includes(to)) return { status: 409, message: 'Perubahan status PO tidak diizinkan.' };
  return null;
}

/** Sisa item = dipesan − dibatalkan − bersih diterima (sen) */
const itemRemainingCents = (item) => decimalToCents(item.qty_ordered) - decimalToCents(item.qty_cancelled ?? '0')
  - decimalToCents(item.net_received ?? '0');

/** Status PO dari jumlah bersih diterima (§4.4). PO Dibatalkan tetap Dibatalkan. */
function purchaseOrderStatusFromReceipts(currentStatus, items) {
  if (currentStatus === PO_STATUS.DIBATALKAN || currentStatus === PO_STATUS.DRAFT) return currentStatus;
  const received = items.map((i) => decimalToCents(i.net_received ?? '0'));
  if (received.every((r) => r === 0n)) return PO_STATUS.DIPESAN;
  if (items.every((i, k) => received[k] === decimalToCents(i.qty_ordered))) return PO_STATUS.DITERIMA;
  return PO_STATUS.DITERIMA_SEBAGIAN;
}

/**
 * Penerimaan (BR-20, K05, SPEC §6): PO Dipesan/Diterima Sebagian; ≥ 1 baris qty > 0 (≤ 2 desimal); item milik PO, sekali;
 * qty ≤ sisa (kelebihan ditolak 409).
 * @param {string} poStatus
 * @param {Map<string, object>} poItems — po_item_id → {qty_ordered, qty_cancelled, net_received, material_id}
 */
function validateReceiptLines(poStatus, poItems, lines) {
  if (!PO_RECEIVABLE_STATUSES.includes(poStatus)) return { status: 409, message: 'PO tidak dalam status yang dapat diterima.' };
  return validateDocumentLines(poItems, lines, (item, cents) => cents > itemRemainingCents(item));
}

function validateDocumentLines(poItems, lines, exceeds) {
  const errors = {};
  if (!Array.isArray(lines) || lines.length === 0) return { status: 400, errors: { lines: 'Minimal 1 baris.' } };
  const value = [];
  const seen = new Set();
  let over = false;
  lines.forEach((line, i) => {
    const id = idOf(line?.po_item_id);
    const item = poItems.get(id);
    if (!item) errors[`lines.${i}.po_item_id`] = 'Item bukan bagian dari PO ini.';
    else if (seen.has(id)) errors[`lines.${i}.po_item_id`] = 'Item sudah ada di dokumen.';
    seen.add(id);
    const qty = parseDecimalInput(line?.qty, { max: STOCK_QTY_MAX });
    if (qty.error) errors[`lines.${i}.qty`] = qty.error;
    if (!item || errors[`lines.${i}.po_item_id`] || qty.error) return;
    if (exceeds(item, qty.cents)) over = true;
    value.push({ po_item_id: id, material_id: String(item.material_id), qty: centsToDecimalString(qty.cents) });
  });
  if (Object.keys(errors).length) return { status: 400, errors };
  if (over) return { status: 409, message: 'Jumlah melebihi sisa yang belum diterima.' };
  value.sort((a, b) => (BigInt(a.po_item_id) < BigInt(b.po_item_id) ? -1 : 1));
  return { status: 200, value };
}

/**
 * Pengganti P pada koreksi penerimaan (§4.2): item dari PO yang sama; bersih diterima item tanpa O + P ≤ dipesan −
 * dibatalkan; pada PO Dibatalkan P hanya boleh mengurangi per item dibanding O. net_received di poItems termasuk O.
 */
function validateReceiptCorrection(poStatus, poItems, originalLines, replacementLines) {
  const originalQty = new Map(originalLines.map((l) => [String(l.po_item_id), decimalToCents(l.qty)]));
  const cancelled = poStatus === PO_STATUS.DIBATALKAN;
  return validateDocumentLines(poItems, replacementLines, (item, cents) => {
    const inO = originalQty.get(String(item.po_item_id)) ?? 0n;
    return cancelled ? cents > inO : cents > itemRemainingCents(item) + inO;
  });
}

/** Pembatalan PO: qty_cancelled per item = dipesan − bersih diterima saat batal (historis, BR-21) */
function cancellationQuantities(items) {
  return items.map((i) => ({
    po_item_id: String(i.po_item_id),
    qty_cancelled: centsToDecimalString(decimalToCents(i.qty_ordered) - decimalToCents(i.net_received ?? '0')),
  }));
}

/** Nomor PO-YYMMDD-NNN untuk kunci tanggal WIB "YYYY-MM-DD" (SPEC §10) */
function formatPurchaseOrderNumber(dateKey, seq) {
  const [y, m, d] = dateKey.split('-');
  return `${PO_NUMBER_PREFIX}-${y.slice(2)}${m}${d}-${String(seq).padStart(3, '0')}`;
}

/** Nomor PO berikutnya untuk tanggal itu = urutan terbesar + 1 (pemanggil menyerialkan penomoran) */
function nextPurchaseOrderNumber(existingNumbers, dateKey) {
  const prefix = formatPurchaseOrderNumber(dateKey, 0).slice(0, -3);
  const maxSeq = existingNumbers.filter((n) => n.startsWith(prefix))
    .reduce((max, n) => (/^\d+$/.test(n.slice(prefix.length)) && Number(n.slice(prefix.length)) > max ? Number(n.slice(prefix.length)) : max), 0);
  return formatPurchaseOrderNumber(dateKey, maxSeq + 1);
}

/** Alasan pembalik/koreksi (wajib) atau catatan (opsional): 1 – 255 karakter setelah trim */
function reasonError(value, { required = true } = {}) {
  const v = text(value);
  if (!v) return required ? 'Alasan wajib diisi.' : null;
  return v.length > DOCUMENT_REASON_MAX ? `Maks. ${DOCUMENT_REASON_MAX} karakter.` : null;
}

module.exports = {
  validateSupplier, validatePurchaseOrderItems, purchaseOrderTransitionError, itemRemainingCents,
  purchaseOrderStatusFromReceipts, validateReceiptLines, validateReceiptCorrection, validateDocumentLines,
  cancellationQuantities, reasonError, formatPurchaseOrderNumber, nextPurchaseOrderNumber,
};
