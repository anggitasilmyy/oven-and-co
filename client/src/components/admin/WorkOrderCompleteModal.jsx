// components/admin/WorkOrderCompleteModal.jsx
// CR-04b · FR-46 · UC-37 · BR-27, BR-28 · K13 · AD-13 — "Selesaikan WO": jumlah hasil bilangan bulat 0 – 10.000 (0 boleh,
// mis. gagal produksi) dan pengeluaran terakhir opsional dalam transaksi yang sama. Hasil hanya dicatat; tidak menambah
// stok produk siap jual (K13). Validasi = aturan murni server; request_id per percobaan simpan.

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FormError from '../ui/FormError';
import FormField from './FormField';
import IssueLinesEditor from './IssueLinesEditor';
import { fieldClass } from './fieldClass';
import { parseWorkOrderQty, validateIssueLines } from '../../utils/rules/workOrder';
import { completeWorkOrder } from '../../services/workOrderService';
import useRequestId from '../../hooks/useRequestId';
import { PRODUCTION_OUTPUT_NOTE, WO_QTY_MAX } from '../../constants/workOrder';

const text = (v) => String(v ?? '').trim().replace(',', '.');

/**
 * @param {object} order — detail WO Diproses
 * @param {Array} materials — bahan master
 * @param {Function} onClose
 * @param {Function} onSaved — (message) → void
 */
export default function WorkOrderCompleteModal({ order, materials, onClose, onSaved }) {
  const [qty, setQty] = useState(String(order.qty_planned));
  const [rows, setRows] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { requestId, renew } = useRequestId();
  const lines = rows.map((r) => ({ material_id: r.material_id, qty: text(r.qty) }));
  const qtyError = parseWorkOrderQty(qty.trim(), { min: 0 }).error;
  const lineErrors = lines.length ? (validateIssueLines(new Set(materials.map((m) => String(m.material_id))), lines).errors ?? {}) : {};
  const errors = { ...lineErrors, ...(qtyError ? { qty_output: qtyError } : {}) };
  const all = { ...errors, ...serverErrors };
  const errorOf = (k) => (submitted || serverErrors[k] ? all[k] : undefined);
  const touch = () => { setServerErrors({}); setError(''); renew(); };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      await completeWorkOrder(order.wo_id, { qty_output: Number(qty.trim()), ...(lines.length ? { lines } : {}) }, requestId);
      onSaved(`${order.wo_number} selesai; hasil ${qty.trim()} dicatat`);
    } catch (err) {
      setServerErrors(err.fieldErrors ?? {});
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal isOpen size="lg" onClose={saving ? undefined : onClose} title={`Selesaikan ${order.wo_number}`}
      footer={(<><Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Batal</Button><Button type="submit" form="complete-form" size="sm" loading={saving}>Selesaikan WO</Button></>)}>
      <form id="complete-form" noValidate className="space-y-4" onSubmit={submit}>
        <p className="text-sm text-cocoa-muted">{PRODUCTION_OUTPUT_NOTE} Setelah selesai, WO tidak dapat diubah; kesalahan dibetulkan lewat pembalik atau koreksi.</p>
        <FormField id="complete-qty" label={`Jumlah hasil (rencana ${order.qty_planned})`} hint={`Bilangan bulat 0 – ${WO_QTY_MAX.toLocaleString('id-ID')}`} error={errorOf('qty_output')}>
          <input inputMode="numeric" className={`${fieldClass(errorOf('qty_output'))} tabular-nums`} value={qty} onChange={(e) => { setQty(e.target.value); touch(); }} />
        </FormField>
        <div className="space-y-2">
          <p className="text-sm text-cocoa-muted">Pengeluaran bahan terakhir (opsional) dicatat bersamaan dengan penyelesaian.</p>
          <IssueLinesEditor idPrefix="complete" rows={rows} setRows={setRows} materials={materials} recipeIds={new Set(order.recipe.map((r) => r.material_id))} errorOf={errorOf} onTouch={touch} minRows={0} />
        </div>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
