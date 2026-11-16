// components/admin/WorkOrderFormModal.jsx
// CR-04b · FR-45 · UC-36 · BR-25 · K10 · AD-13 — buat WO (Draft) atau ubah WO Draft: produk aktif, tanggal produksi hari
// ini s.d. 29 hari ke depan (WIB), jumlah rencana bilangan bulat 1 – 10.000, catatan opsional. Acuan perencanaan hanya
// baca (WorkOrderPlanSource). Validasi = aturan murni server (validateWorkOrder); request_id per percobaan simpan.

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FormError from '../ui/FormError';
import FormField from './FormField';
import WorkOrderPlanSource from './WorkOrderPlanSource';
import { fieldClass } from './fieldClass';
import { validateWorkOrder } from '../../utils/rules/workOrder';
import { getRequirementWindow } from '../../utils/rules/materialRequirement';
import { getPlanSource, saveWorkOrder } from '../../services/workOrderService';
import useServiceQuery from '../../hooks/useServiceQuery';
import useRequestId from '../../hooks/useRequestId';
import { WO_QTY_MAX } from '../../constants/workOrder';

/**
 * @param {object|null} order — detail WO Draft (null = buat baru)
 * @param {Array} products — baris getAdminProducts
 * @param {Function} onClose
 * @param {Function} onSaved — (wo, message) → void
 */
export default function WorkOrderFormModal({ order, products, onClose, onSaved }) {
  const choices = products.filter((p) => p.is_active || String(p.product_id) === order?.product_id);
  const [productId, setProductId] = useState(order?.product_id ?? String(choices[0]?.product_id ?? ''));
  const [date, setDate] = useState(order?.production_date ?? '');
  const [qty, setQty] = useState(order ? String(order.qty_planned) : '');
  const [note, setNote] = useState(order?.note ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { requestId, renew } = useRequestId();
  const base = useServiceQuery(() => getPlanSource(''), []); // hari ini WIB (server) + acuan hari ini
  const todayKey = base.data?.today_key;
  const picked = useServiceQuery(() => (date && date !== todayKey ? getPlanSource(date) : Promise.resolve(null)), [date, todayKey]);
  const source = !date || date === todayKey ? base : picked;
  const window = todayKey ? getRequirementWindow(todayKey) : null;
  const productMap = new Map(products.map((p) => [String(p.product_id), { is_active: p.is_active }]));
  const input = { product_id: productId, production_date: date || todayKey || '', qty_planned: qty.trim(), note };
  const { errors } = todayKey ? validateWorkOrder(input, { products: productMap, todayKey }) : { errors: {} };
  const all = { ...errors, ...serverErrors };
  const errorOf = (k) => (submitted || serverErrors[k] ? all[k] : undefined);
  const touch = () => { setServerErrors({}); setError(''); renew(); };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (!todayKey || Object.keys(errors).length) return;
    setSaving(true);
    try {
      const wo = await saveWorkOrder(order?.wo_id ?? null, { ...input, note: note.trim() ? note : null }, order ? undefined : requestId);
      onSaved(wo, order ? `${wo.wo_number} diperbarui` : `${wo.wo_number} dibuat (Draft)`);
    } catch (err) {
      setServerErrors(err.fieldErrors ?? {});
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal isOpen size="lg" onClose={saving ? undefined : onClose} title={order ? `Ubah ${order.wo_number}` : 'Buat work order'}
      footer={(<><Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Batal</Button><Button type="submit" form="wo-form" size="sm" loading={saving} disabled={!todayKey}>Simpan Draft</Button></>)}>
      <form id="wo-form" noValidate className="space-y-4" onSubmit={submit}>
        <FormField id="wo-product" label="Produk" error={errorOf('product_id')}>
          <select className={fieldClass(errorOf('product_id'))} value={productId} onChange={(e) => { setProductId(e.target.value); touch(); }}>
            {choices.length === 0 && <option value="">Belum ada produk aktif</option>}
            {choices.map((p) => <option key={p.product_id} value={String(p.product_id)}>{p.name}{p.is_active ? '' : ' (nonaktif)'}</option>)}
          </select>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="wo-date" label="Tanggal produksi" hint="Hari ini s.d. 29 hari ke depan" error={errorOf('production_date')}>
            <input type="date" className={fieldClass(errorOf('production_date'))} value={date || todayKey || ''} min={window?.from} max={window?.to}
              onChange={(e) => { setDate(e.target.value); touch(); }} />
          </FormField>
          <FormField id="wo-qty" label="Jumlah rencana" hint={`Bilangan bulat 1 – ${WO_QTY_MAX.toLocaleString('id-ID')}`} error={errorOf('qty_planned')}>
            <input inputMode="numeric" className={`${fieldClass(errorOf('qty_planned'))} tabular-nums`} value={qty} onChange={(e) => { setQty(e.target.value); touch(); }} />
          </FormField>
        </div>
        <FormField id="wo-note" label="Catatan" optional error={errorOf('note')}>
          <input className={fieldClass(errorOf('note'))} value={note} onChange={(e) => { setNote(e.target.value); touch(); }} />
        </FormField>
        <WorkOrderPlanSource source={source.data} loading={!source.data && !source.error} error={source.error?.message} />
        <FormError message={error} />
      </form>
    </Modal>
  );
}
