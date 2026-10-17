// components/customer/OrderActionsCard.jsx
// Step 5.4 · FR-17 · FR-19 – FR-21 · F-20 · BR-08 · BR-11 · C-18 — Hubungi Oven & Co. (WhatsApp), Pesan Lagi,
// Beri Ulasan (Selesai & ada item belum diulas), Batalkan Pesanan (teks merah, hanya sebelum Sedang Disiapkan).

import { useNavigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import Button from '../ui/Button';
import { CUSTOMER_ROUTES, buildPath } from '../../constants/routes';
import { ORDER_STATUS } from '../../constants/orderStatus';

/**
 * @param {object} detail — hasil getMyOrderDetail
 * @param {Function} onCancel — buka modal pembatalan
 * @param {Function} onReorder — (orderNumber) → void
 */
export default function OrderActionsCard({ detail, onCancel, onReorder, reordering }) {
  const navigate = useNavigate();
  const { order } = detail;
  const settled = [ORDER_STATUS.SELESAI, ORDER_STATUS.DIBATALKAN].includes(order.order_status);

  return (
    <section aria-label="Aksi pesanan" className="card p-5 md:p-6 flex flex-col gap-3">
      {detail.can_review && (
        <Button fullWidth onClick={() => navigate(buildPath(CUSTOMER_ROUTES.FORM_ULASAN, { orderNumber: order.order_number }))}>
          Beri Ulasan
        </Button>
      )}
      {settled && (
        <Button fullWidth variant={detail.can_review ? 'secondary' : 'primary'} loading={reordering} onClick={() => onReorder(order.order_number)}>
          Pesan Lagi
        </Button>
      )}
      {detail.store.whatsapp_link && (
        <a
          href={detail.store.whatsapp_link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 w-full h-[52px] px-6 rounded-btn font-semibold
                     bg-beige text-cocoa border border-primary/20 hover:bg-primary/10 transition
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <MessageCircle size={18} aria-hidden="true" /> Hubungi Oven &amp; Co.
        </a>
      )}
      {detail.can_cancel && (
        <Button fullWidth variant="ghost" className="!text-error hover:!bg-red-50" onClick={onCancel}>
          Batalkan Pesanan
        </Button>
      )}
    </section>
  );
}
