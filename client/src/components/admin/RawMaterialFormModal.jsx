// components/admin/RawMaterialFormModal.jsx
// Step 5.7 · FR-32 · AD-07 — modal tambah/ubah bahan baku (raw_materials: name, unit, stock, min_stock)
// Stok tidak boleh negatif; peringatan tampil bila stok ≤ batas minimum (validation rule Stok).

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FormError from '../ui/FormError';
import FormField from './FormField';
import { fieldClass } from './fieldClass';
import { validateMaterial, isLowStock } from '../../utils/businessRules';
import { saveMaterial } from '../../services/stockService';
import { PRODUCT_FIELD_MAX, MAX_MATERIAL_QTY, MATERIAL_UNIT_SUGGESTIONS } from '../../constants/adminCatalog';

const LIMITS = { nameMax: PRODUCT_FIELD_MAX.materialName, unitMax: PRODUCT_FIELD_MAX.materialUnit, qtyMax: MAX_MATERIAL_QTY };

/**
 * @param {object|null} material — null = tambah bahan baru
 * @param {Array} materials — semua bahan (cek nama ganda)
 * @param {Function} onClose
 * @param {Function} onSaved — (message) → void
 */
export default function RawMaterialFormModal({ material, materials, onClose, onSaved }) {
  const [values, setValues] = useState({
    name: material?.name ?? '', unit: material?.unit ?? '',
    stock: material ? String(material.stock) : '', min_stock: material ? String(material.min_stock) : '',
  });
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const errors = validateMaterial(values, materials, material?.material_id ?? null, LIMITS);
  const errorOf = (f) => ((submitted || touched[f]) ? errors[f] : undefined);
  const bind = (f) => ({
    value: values[f],
    onChange: (e) => { setValues((v) => ({ ...v, [f]: e.target.value })); setError(''); },
    onBlur: () => setTouched((t) => ({ ...t, [f]: true })),
  });
  const showLowWarning = !errors.stock && !errors.min_stock && isLowStock({ stock: values.stock, min_stock: values.min_stock });

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const saved = await saveMaterial(material?.material_id ?? null, values);
      onSaved(`${saved.name} ${material ? 'diperbarui' : 'ditambahkan'}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={saving ? undefined : onClose}
      title={material ? 'Ubah bahan baku' : 'Tambah bahan baku'}
      footer={(
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Batal</Button>
          <Button type="submit" form="material-form" size="sm" loading={saving}>Simpan bahan</Button>
        </>
      )}
    >
      <form id="material-form" noValidate className="space-y-4" onSubmit={submit}>
        <FormField id="material-name" label="Nama bahan" error={errorOf('name')}>
          <input className={fieldClass(errorOf('name'))} maxLength={LIMITS.nameMax} {...bind('name')} />
        </FormField>
        <FormField id="material-unit" label="Satuan" error={errorOf('unit')} hint="Contoh: gram, kg, ml, pcs">
          <input className={fieldClass(errorOf('unit'))} maxLength={LIMITS.unitMax} list="material-unit-options" {...bind('unit')} />
        </FormField>
        <datalist id="material-unit-options">
          {MATERIAL_UNIT_SUGGESTIONS.map((u) => <option key={u} value={u} />)}
        </datalist>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="material-stock" label="Stok saat ini" error={errorOf('stock')} hint={material ? 'Untuk koreksi hasil hitung stok.' : undefined}>
            <input type="number" inputMode="decimal" min="0" step="0.01" className={`${fieldClass(errorOf('stock'))} tabular-nums`} {...bind('stock')} />
          </FormField>
          <FormField id="material-min" label="Batas minimum" error={errorOf('min_stock')}>
            <input type="number" inputMode="decimal" min="0" step="0.01" className={`${fieldClass(errorOf('min_stock'))} tabular-nums`} {...bind('min_stock')} />
          </FormField>
        </div>
        {showLowWarning && (
          <p className="flex items-start gap-2 rounded-btn bg-peach/40 px-3 py-2 text-xs text-cocoa" role="status">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
            Stok berada pada atau di bawah batas minimum, sehingga bahan ini ditandai {Number(values.stock) <= 0 ? 'Habis' : 'Menipis'} dan muncul di peringatan Stok Menipis.
          </p>
        )}
        <FormError message={error} />
      </form>
    </Modal>
  );
}
