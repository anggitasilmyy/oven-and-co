// components/customer/PaymentCodeCard.jsx
// Step 5.3 · FR-14 · C-15 — QRIS: kartu QR besar + "Unduh QR"; VA / e-wallet: nomor bayar + "Salin"

import { useState } from 'react';
import { Copy, Download } from 'lucide-react';
import Button from '../ui/Button';
import SimulatedQr from './SimulatedQr';
import { formatRupiah } from '../../utils/format';
import { PAYMENT_GROUP } from '../../constants/checkout';

/** Unduh SVG QR sebagai file */
function downloadQr(svgId, fileName) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  const url = URL.createObjectURL(new Blob([svg.outerHTML], { type: 'image/svg+xml' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {object} method — payment_methods
 * @param {object} payment — payments
 * @param {Function} notify — toast
 */
export default function PaymentCodeCard({ method, payment, orderNumber, total, notify }) {
  const [copied, setCopied] = useState(false);
  const isQris = method.method_group === PAYMENT_GROUP.QRIS;
  const label = method.method_group === PAYMENT_GROUP.VA ? 'Nomor Virtual Account' : 'Kode pembayaran';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payment.payment_code);
      setCopied(true);
      notify('success', `${label} disalin`);
    } catch {
      notify('error', 'Gagal menyalin. Salin manual nomor di atas.');
    }
  };

  return (
    <section className="card p-5 md:p-6 text-center space-y-4" aria-label={`Pembayaran ${method.name}`}>
      <p className="text-sm font-semibold text-cocoa">{method.name}</p>
      {isQris ? (
        <>
          <div className="mx-auto w-full max-w-[240px] rounded-btn border border-beige p-3 bg-white">
            <SimulatedQr id="qr-pembayaran" value={payment.payment_code} />
          </div>
          <p className="text-xs text-cocoa/65">QR simulasi prototype — tidak memproses pembayaran sungguhan.</p>
        </>
      ) : (
        <div className="space-y-1">
          <p className="text-xs text-cocoa/65">{label}</p>
          <p className="font-mono text-2xl md:text-3xl font-bold tracking-wider text-cocoa break-all">{payment.payment_code}</p>
        </div>
      )}
      <div>
        <p className="text-xs text-cocoa/65">Total pembayaran</p>
        <p className="font-bold text-2xl text-primary tabular-nums">{formatRupiah(total)}</p>
      </div>
      {isQris ? (
        <Button variant="secondary" size="sm" leftIcon={<Download size={16} aria-hidden="true" />} onClick={() => downloadQr('qr-pembayaran', `QR-${orderNumber}.svg`)}>
          Unduh QR
        </Button>
      ) : (
        <Button variant="secondary" size="sm" leftIcon={<Copy size={16} aria-hidden="true" />} onClick={copy}>
          {copied ? 'Tersalin' : 'Salin'}
        </Button>
      )}
    </section>
  );
}
