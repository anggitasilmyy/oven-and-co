// components/customer/PaymentPending.jsx
// Step 5.3 · FR-14 · BR-06 · C-15 — hitung mundur 30 menit, kode bayar, cara bayar, Cek Status / Ganti Metode.
// Tombol "Simulasikan Lunas" hanya tampil di mode development (SPEC §10).

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Timer } from 'lucide-react';
import Button from '../ui/Button';
import FocusPageGrid from '../layout/FocusPageGrid';
import ActionBar from '../layout/ActionBar';
import PageHeader from '../layout/PageHeader';
import PaymentCodeCard from './PaymentCodeCard';
import PaymentInstructions from './PaymentInstructions';
import { CUSTOMER_ROUTES } from '../../constants/routes';

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/**
 * @param {object} data — hasil getOrderPayment
 * @param {Function} onCheck — cek status (muat ulang)
 * @param {Function} onExpire — dipanggil saat hitung mundur habis
 * @param {Function} [onSimulatePaid] — hanya development
 */
export default function PaymentPending({ data, onCheck, checking, onExpire, onSimulatePaid, notify }) {
  const { order, payment, method } = data;
  // Batas waktu dihitung dari jam perangkat saat data dimuat; sisa detik dihitung ulang tiap detik
  // (bukan dikurangi 1) agar tetap tepat walau tab sempat tidur/terthrottle.
  const [deadline] = useState(() => Date.now() + data.seconds_left * 1000);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const secondsLeft = Math.max(0, Math.ceil((deadline - nowMs) / 1000));

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (secondsLeft === 0 && data.seconds_left > 0) {
      // hitung mundur selesai di perangkat → muat ulang agar pembatalan otomatis (BR-06) terbaca
      const t = setTimeout(onExpire, 1000);
      return () => clearTimeout(t);
    }
  }, [secondsLeft, data.seconds_left, onExpire]);

  const aside = (
    <ActionBar label="Aksi pembayaran">
      <div className="flex flex-col gap-2 min-w-0">
        <Button fullWidth onClick={onCheck} loading={checking}>Cek Status Pembayaran</Button>
        <Link
          to={`${CUSTOMER_ROUTES.PEMBAYARAN}?pesanan=${order.order_number}`}
          className="min-h-touch-min inline-flex items-center justify-center rounded-btn text-sm font-semibold text-primary hover:underline
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          Ganti Metode
        </Link>
      </div>
    </ActionBar>
  );

  return (
    <FocusPageGrid aside={aside}>
      <div className="space-y-5 lg:space-y-6 pb-12 lg:pb-0">
        <PageHeader title="Pembayaran" description={`Nomor pesanan ${order.order_number}`} />
        <div className="rounded-card bg-peach/70 px-5 py-4 flex items-center gap-3 text-cocoa" role="timer" aria-live="off">
          <Timer size={22} aria-hidden="true" className="shrink-0" />
          <p className="text-sm">
            Selesaikan pembayaran dalam <strong className="text-lg tabular-nums">{mmss(secondsLeft)}</strong>
          </p>
        </div>
        <PaymentCodeCard method={method} payment={payment} orderNumber={order.order_number} total={order.total} notify={notify} />
        <PaymentInstructions methodGroup={method.method_group} />
        {onSimulatePaid && (
          <div className="rounded-card border-2 border-dashed border-beige p-4 space-y-2">
            <p className="text-xs text-cocoa/65">Mode development: simulasikan webhook payment gateway.</p>
            <Button variant="secondary" size="sm" onClick={onSimulatePaid}>Simulasikan Lunas</Button>
          </div>
        )}
      </div>
    </FocusPageGrid>
  );
}
