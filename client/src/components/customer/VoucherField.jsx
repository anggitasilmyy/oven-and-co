// components/customer/VoucherField.jsx
// Step 5.3 · FR-13 · BR-10 · C-13 — "Pakai voucher": maks. 1 voucher, error inline bila tidak berlaku

import { useState } from 'react';
import { Ticket, X } from 'lucide-react';
import Button from '../ui/Button';
import Chip from '../ui/Chip';
import FormError from '../ui/FormError';
import { formatRupiah } from '../../utils/format';
import { VOUCHER_INVALID_TEXT } from '../../constants/checkout';

/**
 * @param {object|null} applied — { code, discount, valid }
 * @param {object[]} vouchers — voucher milik pelanggan { voucher, claim, usable }
 * @param {Function} onApply — (code) → boolean
 */
export default function VoucherField({ applied, vouchers, onApply, onRemove }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const apply = (value) => {
    if (onApply(value)) {
      setOpen(false);
      setCode('');
      setError('');
    } else {
      setError(VOUCHER_INVALID_TEXT);
    }
  };

  if (applied) {
    return (
      <div className="card p-4 flex items-center gap-3">
        <Ticket size={20} className="text-primary shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-cocoa">
          <strong>{applied.code}</strong>
          {applied.valid ? ` · Hemat ${formatRupiah(applied.discount)}` : <span className="block text-error">{VOUCHER_INVALID_TEXT}</span>}
        </p>
        <button
          type="button"
          onClick={onRemove}
          className="w-11 h-11 shrink-0 -mr-2 flex items-center justify-center rounded-full text-cocoa/60 hover:bg-beige
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label={`Hapus voucher ${applied.code}`}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    );
  }

  const usable = vouchers.filter((v) => v.usable);
  return (
    <div className="card p-4 space-y-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full min-h-touch-min flex items-center gap-3 text-left text-sm font-semibold text-cocoa rounded-btn
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <Ticket size={20} className="text-primary shrink-0" aria-hidden="true" /> Pakai voucher
      </button>
      {open && (
        <div className="space-y-3">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); apply(code); }}>
            <label htmlFor="kode-voucher" className="sr-only">Kode voucher</label>
            <input
              id="kode-voucher"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(''); }}
              placeholder="Masukkan kode voucher"
              aria-invalid={Boolean(error)}
              className={`input w-full min-w-0 uppercase placeholder:normal-case ${error ? 'border-error' : ''}`}
            />
            <Button type="submit" variant="secondary" disabled={!code.trim()} className="shrink-0">Pakai</Button>
          </form>
          <FormError message={error} className="text-sm" />
          {usable.length > 0 && (
            <div>
              <p className="text-xs text-cocoa/65 mb-2">Voucher milikmu</p>
              <div className="flex flex-wrap gap-2">
                {usable.map(({ voucher }) => (
                  <Chip key={voucher.voucher_id} size="compact" onClick={() => apply(voucher.code)} title={voucher.title}>
                    {voucher.code}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
