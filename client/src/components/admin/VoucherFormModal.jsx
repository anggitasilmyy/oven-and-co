// components/admin/VoucherFormModal.jsx
// Step 5.8 · FR-34 · BR-10 · AD-09 — form buat/ubah voucher (SPEC §8 vouchers) dengan validasi inline
// "Kuota" = sisa pemakaian (berkurang saat voucher dipakai di checkout, kembali bila pesanan dibatalkan).

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Switch from '../ui/Switch';
import FormError from '../ui/FormError';
import FormField from './FormField';
import { fieldClass } from './fieldClass';
import { normalizeVoucherInput, validateVoucher } from '../../utils/businessRules';
import { saveVoucher } from '../../services/adminPromoService';
import { DISCOUNT_TYPE, DISCOUNT_TYPE_LABEL, VOUCHER_FIELD_MAX } from '../../constants/adminPromo';
import { addDaysToKey } from '../../utils/date';

/**
 * @param {object|null} voucher — null = voucher baru
 * @param {{todayKey, rows, products}} board — data tabel voucher (cek kode ganda & pilihan produk)
 * @param {Function} onClose
 * @param {Function} onSaved — (message) → void
 */
export default function VoucherFormModal({ voucher, board, onClose, onSaved }) {
  const [values, setValues] = useState(() => ({
    code: voucher?.code ?? '', title: voucher?.title ?? '', discount_type: voucher?.discount_type ?? DISCOUNT_TYPE.PERCENT,
    discount_value: voucher ? String(voucher.discount_value) : '', product_id: voucher?.product_id != null ? String(voucher.product_id) : '',
    quota: voucher ? String(voucher.quota) : '', valid_from: voucher?.valid_from ?? board.todayKey,
    valid_to: voucher?.valid_to ?? addDaysToKey(board.todayKey, 7), is_active: voucher?.is_active ?? true,
  }));
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const errors = validateVoucher(normalizeVoucherInput(values), {
    vouchers: board.rows, voucherId: voucher?.voucher_id ?? null, products: board.products,
  });
  const errorOf = (f) => ((submitted || touched[f]) ? errors[f] : undefined);
  const set = (f, v) => { setValues((x) => ({ ...x, [f]: v })); setError(''); };
  const bind = (f) => ({ value: values[f], onChange: (e) => set(f, e.target.value), onBlur: () => setTouched((t) => ({ ...t, [f]: true })) });
  const products = board.products.filter((p) => p.is_active || String(p.product_id) === values.product_id);
  const isPercent = values.discount_type === DISCOUNT_TYPE.PERCENT;

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const saved = await saveVoucher(voucher?.voucher_id ?? null, values);
      onSaved(`Voucher ${saved.code} ${voucher ? 'disimpan' : 'dibuat'}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      size="lg"
      onClose={saving ? undefined : onClose}
      title={voucher ? `Ubah voucher ${voucher.code}` : 'Buat voucher'}
      footer={(
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Batal</Button>
          <Button type="submit" form="voucher-form" size="sm" loading={saving}>Simpan voucher</Button>
        </>
      )}
    >
      <form id="voucher-form" noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <FormField id="voucher-code" label="Kode voucher" error={errorOf('code')} hint="Huruf besar & angka, mis. WEEKEND15">
          <input className={`${fieldClass(errorOf('code'))} uppercase`} maxLength={VOUCHER_FIELD_MAX.code} autoCapitalize="characters" {...bind('code')} />
        </FormField>
        <FormField id="voucher-title" label="Judul promo" error={errorOf('title')}>
          <input className={fieldClass(errorOf('title'))} maxLength={VOUCHER_FIELD_MAX.title} {...bind('title')} />
        </FormField>
        <FormField id="voucher-type" label="Jenis diskon" error={errorOf('discount_type')}>
          <select className={fieldClass(errorOf('discount_type'))} {...bind('discount_type')}>
            {Object.values(DISCOUNT_TYPE).map((t) => <option key={t} value={t}>{DISCOUNT_TYPE_LABEL[t]}</option>)}
          </select>
        </FormField>
        <FormField id="voucher-value" label={isPercent ? 'Nilai diskon (%)' : 'Nilai diskon (Rp)'} error={errorOf('discount_value')}>
          <input type="number" inputMode="numeric" min="1" step="1" className={`${fieldClass(errorOf('discount_value'))} tabular-nums`} {...bind('discount_value')} />
        </FormField>
        <FormField id="voucher-product" label="Berlaku untuk" error={errorOf('product_id')} hint="Kosongkan untuk semua produk">
          <select className={fieldClass(errorOf('product_id'))} {...bind('product_id')}>
            <option value="">Semua produk</option>
            {products.map((p) => <option key={p.product_id} value={p.product_id}>{p.name}{p.is_active ? '' : ' (nonaktif)'}</option>)}
          </select>
        </FormField>
        <FormField id="voucher-quota" label="Sisa kuota" error={errorOf('quota')} hint={voucher ? `Sudah terpakai ${voucher.used}×` : 'Jumlah pemakaian yang tersedia'}>
          <input type="number" inputMode="numeric" min="0" step="1" className={`${fieldClass(errorOf('quota'))} tabular-nums`} {...bind('quota')} />
        </FormField>
        <FormField id="voucher-from" label="Mulai berlaku" error={errorOf('valid_from')}>
          <input type="date" className={fieldClass(errorOf('valid_from'))} {...bind('valid_from')} />
        </FormField>
        <FormField id="voucher-to" label="Berakhir" error={errorOf('valid_to')}>
          <input type="date" min={values.valid_from || undefined} className={fieldClass(errorOf('valid_to'))} {...bind('valid_to')} />
        </FormField>
        <div className="sm:col-span-2">
          <Switch checked={values.is_active} onChange={(c) => set('is_active', c)} label="Voucher aktif" showLabel />
          <p className="text-xs text-cocoa/65">Maks. 1 voucher per transaksi dan boleh digabung tukar poin (BR-10). Voucher berlaku untuk pelanggan yang memilikinya.</p>
        </div>
        <div className="sm:col-span-2"><FormError message={error} /></div>
      </form>
    </Modal>
  );
}
