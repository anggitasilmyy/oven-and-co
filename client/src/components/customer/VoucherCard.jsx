// components/customer/VoucherCard.jsx
// Step 5.5 · FR-23 · BR-10 · C-21 — kartu voucher berbentuk tiket: kode, judul, masa berlaku, tombol "Pakai".
// "Pakai" membuka produk voucher (atau Katalog bila berlaku untuk semua produk); voucher dipakai saat checkout.

import { Link } from 'react-router-dom';
import { Ticket } from 'lucide-react';
import Badge from '../ui/Badge';
import { formatRupiah } from '../../utils/format';
import { parseDateKey } from '../../utils/date';
import { productHref } from '../../utils/productLinks';
import { CUSTOMER_ROUTES } from '../../constants/routes';
import { VOUCHER_STATE, VOUCHER_STATE_LABEL } from '../../constants/account';

const formatValidTo = (key) => parseDateKey(key).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

/** @param {{voucher, claim, state, product}} item — hasil loyaltyService.getMyVouchers() */
export default function VoucherCard({ item }) {
  const { voucher, state, product } = item;
  const usable = state === VOUCHER_STATE.USABLE;
  const discount = voucher.discount_type === 'percent' ? `${voucher.discount_value}%` : formatRupiah(voucher.discount_value);
  const target = product ? productHref(product) : CUSTOMER_ROUTES.KATALOG;

  return (
    <li className={`card overflow-hidden flex ${usable ? '' : 'opacity-70'}`}>
      {/* Sobekan tiket: bagian kiri berwarna + lubang setengah lingkaran di batasnya */}
      <div className={`relative w-24 md:w-28 shrink-0 flex flex-col items-center justify-center gap-1 px-2 text-center ${usable ? 'bg-peach' : 'bg-beige'}`}>
        <Ticket size={20} className="text-cocoa" aria-hidden="true" />
        <p className="font-display text-xl text-cocoa leading-none">{discount}</p>
        <span aria-hidden="true" className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-cream" />
      </div>
      <div className="flex-1 min-w-0 p-4 border-l-2 border-dashed border-beige flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono font-bold text-sm text-cocoa tracking-wide">{voucher.code}</p>
          <Badge variant={usable ? 'ready' : state === VOUCHER_STATE.USED ? 'neutral' : 'error'}>{VOUCHER_STATE_LABEL[state]}</Badge>
        </div>
        <p className="text-sm text-cocoa leading-snug">{voucher.title}</p>
        <p className="text-xs text-cocoa/70">
          {product ? `Khusus ${product.name}` : 'Berlaku untuk semua produk'} · Berlaku s.d. {formatValidTo(voucher.valid_to)}
        </p>
        {usable && (
          <Link
            to={target}
            className="self-start inline-flex items-center justify-center min-h-touch-min px-5 rounded-btn bg-primary text-white text-sm font-semibold
                       hover:bg-cocoa active:scale-[0.98] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            Pakai
            <span className="sr-only"> voucher {voucher.code}</span>
          </Link>
        )}
      </div>
    </li>
  );
}
