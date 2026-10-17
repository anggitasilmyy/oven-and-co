// components/admin/StockInModal.jsx
// Step 5.7 · FR-32 · AD-07 — "Catat Stok Masuk" (UI/UX Spec Batch 7): stok bahan bertambah sejumlah barang diterima

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FormField from './FormField';
import { fieldClass } from './fieldClass';
import { validateStockIn, addDecimal } from '../../utils/businessRules';
import { recordStockIn } from '../../services/stockService';
import { MAX_MATERIAL_QTY } from '../../constants/adminCatalog';
import { formatNumber } from '../../utils/format';

/**
 * @param {{material_id, name, unit, stock, min_stock}} material
 * @param {Function} onClose
 * @param {Function} onSaved — (message) → void
 */
export default function StockInModal({ material, onClose, onSaved }) {
  const [qty, setQty] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const error = validateStockIn(qty, material.stock, MAX_MATERIAL_QTY);
  const shownError = serverError || ((submitted || qty !== '') ? error : null);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (error) return;
    setSaving(true);
    try {
      const saved = await recordStockIn(material.material_id, qty);
      onSaved(`Stok ${saved.name} kini ${formatNumber(saved.stock)} ${saved.unit}`);
    } catch (err) {
      setServerError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      size="sm"
      onClose={saving ? undefined : onClose}
      title="Catat stok masuk"
      footer={(
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Batal</Button>
          <Button type="submit" form="stock-in-form" size="sm" loading={saving}>Simpan</Button>
        </>
      )}
    >
      <form id="stock-in-form" noValidate className="space-y-4" onSubmit={submit}>
        <p>
          <span className="font-semibold text-cocoa">{material.name}</span> · stok saat ini{' '}
          <span className="tabular-nums">{formatNumber(material.stock)} {material.unit}</span>
        </p>
        <FormField id="stock-in-qty" label={`Jumlah masuk (${material.unit})`} error={shownError}>
          <input
            type="number" inputMode="decimal" min="0.01" step="0.01" autoFocus
            className={`${fieldClass(shownError)} tabular-nums`}
            value={qty}
            onChange={(e) => { setQty(e.target.value); setServerError(''); }}
          />
        </FormField>
        {!error && (
          <p className="text-sm text-cocoa" aria-live="polite">
            Stok baru: <span className="font-semibold tabular-nums">{formatNumber(addDecimal(material.stock, qty))} {material.unit}</span>
          </p>
        )}
      </form>
    </Modal>
  );
}
