// components/admin/PurchaseOrderFormModal.jsx
// CR-04a CP6 · FR-42 · UC-34 · BR-18, BR-22 · K05 – K06 · AD-12 — buat PO (Draft) atau ubah PO Draft: supplier aktif
// berbahan, 1 – 30 item bahan terdaftar sekali, qty & harga teks desimal (koma diterima, dikirim bertitik), catatan.
// Validasi & nilai (pembulatan per baris) memakai aturan murni yang sama dengan server; request_id per percobaan simpan.

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FormError from '../ui/FormError';
import FormField from './FormField';
import { fieldClass } from './fieldClass';
import { validatePurchaseOrderItems } from '../../utils/rules/purchasing';
import { purchaseOrderValue } from '../../utils/rules/purchaseValue';
import { savePurchaseOrder } from '../../services/purchasingService';
import useRequestId from '../../hooks/useRequestId';
import { PO_MAX_ITEMS } from '../../constants/purchasing';
import { formatRupiah } from '../../utils/format';

const text = (v) => String(v ?? '').trim().replace(',', '.');
let rowKey = 0;
const row = (i = {}) => ({ key: `po${(rowKey += 1)}`, material_id: i.material_id ?? '', qty_ordered: i.qty_ordered ?? '', unit_price: i.unit_price ?? '' });

/**
 * @param {object|null} order — detail PO Draft (null = buat baru)
 * @param {Array} suppliers — dari getSuppliers
 * @param {Function} onClose
 * @param {Function} onSaved — (po, message) → void
 */
export default function PurchaseOrderFormModal({ order, suppliers, onClose, onSaved }) {
  const choices = suppliers.filter((s) => s.is_active || s.supplier_id === order?.supplier_id);
  const [supplierId, setSupplierId] = useState(order?.supplier_id ?? choices[0]?.supplier_id ?? '');
  const [note, setNote] = useState(order?.note ?? '');
  const [rows, setRows] = useState(order ? order.items.map((i) => row({ material_id: i.material_id, qty_ordered: String(i.qty_ordered), unit_price: String(i.unit_price) })) : [row()]);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { requestId, renew } = useRequestId();
  const supplier = suppliers.find((s) => s.supplier_id === supplierId);
  const items = rows.map((r) => ({ material_id: r.material_id, qty_ordered: text(r.qty_ordered), unit_price: text(r.unit_price) }));
  const { errors } = validatePurchaseOrderItems(items, { supplierActive: Boolean(supplier?.is_active), supplierMaterialIds: new Set((supplier?.materials ?? []).map((m) => m.material_id)) });
  const all = { ...errors, ...serverErrors };
  const errorOf = (k) => (submitted || serverErrors[k] ? all[k] : undefined);
  const total = Object.keys(errors).some((k) => k.startsWith('items')) ? null : purchaseOrderValue(items).total;
  const touch = () => { setServerErrors({}); setError(''); renew(); };
  const update = (key, patch) => { setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r))); touch(); };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const po = await savePurchaseOrder(order?.po_id ?? null, { supplier_id: supplierId, note, items }, order ? undefined : requestId);
      onSaved(po, order ? `PO ${po.po_number} diperbarui` : `PO ${po.po_number} dibuat (Draft)`);
    } catch (err) {
      setServerErrors(err.fieldErrors ?? {});
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal isOpen size="lg" onClose={saving ? undefined : onClose} title={order ? `Ubah ${order.po_number}` : 'Buat purchase order'}
      footer={(<><Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Batal</Button><Button type="submit" form="po-form" size="sm" loading={saving}>Simpan Draft</Button></>)}>
      <form id="po-form" noValidate className="space-y-4" onSubmit={submit}>
        <FormField id="po-supplier" label="Supplier" error={errorOf('supplier_id')}>
          <select className={fieldClass(errorOf('supplier_id'))} value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setRows([row()]); touch(); }}>
            {choices.length === 0 && <option value="">Belum ada supplier aktif</option>}
            {choices.map((s) => <option key={s.supplier_id} value={s.supplier_id}>{s.name}{s.is_active ? '' : ' (nonaktif)'}</option>)}
          </select>
        </FormField>
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-cocoa">Item ({rows.length}/{PO_MAX_ITEMS})</legend>
          {rows.map((r, i) => (
            <div key={r.key} className="grid gap-2 rounded-btn border border-beige p-3 sm:grid-cols-[1fr_120px_150px_44px] sm:items-start">
              <FormField id={`po-item-${r.key}-material`} label="Bahan" error={errorOf(`items.${i}.material_id`)}>
                <select className={fieldClass(errorOf(`items.${i}.material_id`))} value={r.material_id} onChange={(e) => update(r.key, { material_id: e.target.value })}>
                  <option value="">Pilih bahan</option>
                  {(supplier?.materials ?? []).map((m) => <option key={m.material_id} value={m.material_id}>{m.name} ({m.unit})</option>)}
                </select>
              </FormField>
              <FormField id={`po-item-${r.key}-qty`} label="Jumlah" error={errorOf(`items.${i}.qty_ordered`)}>
                <input inputMode="decimal" className={`${fieldClass(errorOf(`items.${i}.qty_ordered`))} tabular-nums`} value={r.qty_ordered} onChange={(e) => update(r.key, { qty_ordered: e.target.value })} />
              </FormField>
              <FormField id={`po-item-${r.key}-price`} label="Harga satuan (Rp)" error={errorOf(`items.${i}.unit_price`)}>
                <input inputMode="decimal" className={`${fieldClass(errorOf(`items.${i}.unit_price`))} tabular-nums`} value={r.unit_price} onChange={(e) => update(r.key, { unit_price: e.target.value })} />
              </FormField>
              <button type="button" className="mt-0 inline-flex h-11 w-11 items-center justify-center self-end rounded-lg text-error hover:bg-red-50 disabled:opacity-40 sm:mt-7"
                onClick={() => { setRows((list) => list.filter((x) => x.key !== r.key)); touch(); }} disabled={rows.length === 1} aria-label={`Hapus item ${i + 1}`}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
          {errorOf('items') && <p className="text-xs text-error">{errorOf('items')}</p>}
          <Button type="button" size="sm" variant="ghost" onClick={() => { setRows((list) => [...list, row()]); touch(); }} disabled={rows.length >= PO_MAX_ITEMS} leftIcon={<Plus size={16} aria-hidden="true" />}>Tambah item</Button>
        </fieldset>
        <FormField id="po-note" label="Catatan" optional error={errorOf('note')}>
          <textarea className={fieldClass(errorOf('note'), 'textarea')} value={note} onChange={(e) => { setNote(e.target.value); touch(); }} />
        </FormField>
        <p className="text-sm text-cocoa" aria-live="polite">Nilai PO (informasi, bukan tagihan): <span className="font-semibold tabular-nums">{total == null ? '-' : formatRupiah(Number(total))}</span></p>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
