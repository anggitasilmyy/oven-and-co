// components/admin/StockCountModal.jsx
// CR-04a CP6 · FR-44 · UC-35 · BR-35 · AD-07 — "Stock opname": catat stok fisik absolut (boleh 0). Stok sistem saat form
// dibuka dikirim sebagai `expected_stock`; bila stok sudah berubah → 409 STOCK_CHANGED → onConflict memuat ulang data.
// Selisih 0 tetap dicatat sebagai dokumen (tanpa mutasi). Pengganti koreksi stok lewat form ubah bahan (SPEC §12).

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FormError from '../ui/FormError';
import FormField from './FormField';
import { fieldClass } from './fieldClass';
import { parseDecimalInput, decimalToCents, centsToDecimalString } from '../../utils/rules/decimalInput';
import { reasonError } from '../../utils/rules/purchasing';
import { countStock } from '../../services/stockService';
import useRequestId from '../../hooks/useRequestId';
import { STOCK_QTY_MAX } from '../../constants/purchasing';
import { HTTP_STATUS_CONFLICT } from '../../constants/apiErrors';
import { formatNumber } from '../../utils/format';

const text = (v) => String(v ?? '').trim().replace(',', '.');

/**
 * @param {{material_id, name, unit, stock}} material
 * @param {Function} onClose
 * @param {Function} onSaved — (message) → void
 * @param {Function} [onConflict] — 409 (stok berubah sejak dibuka)
 */
export default function StockCountModal({ material, onClose, onSaved, onConflict }) {
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [serverErrors, setServerErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const { requestId, renew } = useRequestId();
  const expected = centsToDecimalString(decimalToCents(String(material.stock)));
  const parsed = parseDecimalInput(text(counted), { max: STOCK_QTY_MAX, allowZero: true });
  const countError = serverErrors.counted_stock || ((submitted || counted !== '') ? parsed.error : undefined);
  const reasonInvalid = serverErrors.reason || reasonError(reason, { required: false });
  const delta = parsed.error ? null : parsed.cents - decimalToCents(expected);
  const touch = () => { setError(''); setServerErrors({}); renew(); };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (parsed.error || reasonInvalid) return;
    setSaving(true);
    try {
      const body = { counted_stock: text(counted), expected_stock: expected, ...(reason.trim() ? { reason: reason.trim() } : {}) };
      const result = await countStock(material.material_id, body, requestId);
      onSaved(`Stock opname ${result.material.name} dicatat; stok kini ${formatNumber(result.material.stock)} ${result.material.unit}`);
    } catch (err) {
      setServerErrors(err.fieldErrors ?? {});
      setError(err.message);
      setSaving(false);
      if (err.status === HTTP_STATUS_CONFLICT) onConflict?.();
    }
  };

  return (
    <Modal isOpen size="sm" onClose={saving ? undefined : onClose} title="Stock opname"
      footer={(<><Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Batal</Button><Button type="submit" form="stock-count-form" size="sm" loading={saving}>Simpan opname</Button></>)}>
      <form id="stock-count-form" noValidate className="space-y-4" onSubmit={submit}>
        <p>
          <span className="font-semibold text-cocoa">{material.name}</span> · stok sistem{' '}
          <span className="tabular-nums">{formatNumber(material.stock)} {material.unit}</span>
        </p>
        <FormField id="stock-count-qty" label={`Stok fisik hasil hitung (${material.unit})`} error={countError}>
          <input inputMode="decimal" autoFocus className={`${fieldClass(countError)} tabular-nums`} value={counted} onChange={(e) => { setCounted(e.target.value); touch(); }} />
        </FormField>
        {delta !== null && (
          <p className="text-sm text-cocoa" aria-live="polite">
            Selisih: <span className="font-semibold tabular-nums">{delta > 0n ? '+' : ''}{formatNumber(Number(centsToDecimalString(delta)))} {material.unit}</span>
            {delta === 0n ? ' (dokumen tetap dicatat tanpa perubahan stok)' : ''}
          </p>
        )}
        <FormField id="stock-count-reason" label="Alasan" optional error={submitted ? reasonInvalid : undefined}>
          <textarea className={fieldClass(submitted ? reasonInvalid : undefined, 'textarea')} value={reason} onChange={(e) => { setReason(e.target.value); touch(); }} />
        </FormField>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
