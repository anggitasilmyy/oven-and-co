// components/customer/PaymentMethodScreen.jsx
// Step 5.3 · FR-14 · FR-15 · C-14 — daftar metode + tombol sticky "Bayar Sekarang · Rp …"

import { useState } from 'react';
import Button from '../ui/Button';
import FocusPageGrid from '../layout/FocusPageGrid';
import ActionBar from '../layout/ActionBar';
import PageHeader from '../layout/PageHeader';
import PaymentMethodList from './PaymentMethodList';
import { formatRupiah } from '../../utils/format';
import { PAY_AT_STORE_METHOD } from '../../constants/checkout';

/**
 * @param {number} total
 * @param {Function} onSubmit — async (methodCode) → void
 * @param {string|null} initialMethod
 */
export default function PaymentMethodScreen({ methods, total, payAtStoreAllowed, onSubmit, initialMethod = null, description }) {
  const [method, setMethod] = useState(initialMethod);
  const [submitting, setSubmitting] = useState(false);
  // Pilihan Bayar di Toko gugur bila syarat BR-05 tidak terpenuhi
  const selected = method === PAY_AT_STORE_METHOD && !payAtStoreAllowed ? null : method;

  const submit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(selected);
    } finally {
      setSubmitting(false);
    }
  };

  const aside = (
    <ActionBar
      label="Total & aksi"
      summary={
        <div>
          <p className="text-xs text-cocoa/65">Total</p>
          <p className="font-bold text-lg lg:text-2xl text-cocoa tabular-nums">{formatRupiah(total)}</p>
        </div>
      }
    >
      <div className="flex flex-col gap-1.5 min-w-0">
        <Button fullWidth onClick={submit} loading={submitting} disabled={!selected || submitting}>
          <span className="lg:hidden">Bayar Sekarang</span>
          <span className="hidden lg:inline">Bayar Sekarang · {formatRupiah(total)}</span>
        </Button>
        {!selected && <p className="text-xs text-cocoa/65 text-center lg:text-left" role="status">Pilih metode pembayaran</p>}
      </div>
    </ActionBar>
  );

  return (
    <FocusPageGrid aside={aside}>
      <div className="space-y-5 lg:space-y-6">
        <PageHeader title="Metode Pembayaran" description={description} />
        <PaymentMethodList methods={methods} value={selected} onChange={setMethod} payAtStoreAllowed={payAtStoreAllowed} />
      </div>
    </FocusPageGrid>
  );
}
