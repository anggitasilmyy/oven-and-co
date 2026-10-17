// hooks/useAdminOrderActions.js
// Step 5.6 · FR-28 · UC-20 · UC-21 · AD-04 — aksi halaman detail pesanan admin: verifikasi kode pickup, ubah status,
// tandai lunas. Validasi sebenarnya ada di service; hook ini hanya mengatur modal, kode terverifikasi, dan umpan balik.

import { useState } from 'react';
import { updateAdminOrderStatus, verifyPickupCode, markOrderPaid } from '../services/adminOrderService';
import { ORDER_STATUS_LABEL } from '../constants/orderStatus';
import { formatNumber } from '../utils/format';

/**
 * @param {string} orderNumber
 * @param {object|null} detail — data getAdminOrderDetail
 * @param {{reload: Function, showToast: Function}} deps
 */
export default function useAdminOrderActions(orderNumber, detail, { reload, showToast }) {
  // null | {type: 'paid'} | {type: 'status', from, to, requiresCourier} — status dikunci saat modal dibuka
  const [modal, setModal] = useState(null);
  // Kode pickup yang sudah cocok, disimpan per pesanan agar tidak terbawa ke pesanan lain
  const [verified, setVerified] = useState({ orderNumber: null, code: null });
  const verifiedCode = verified.orderNumber === orderNumber ? verified.code : null;

  const verify = async (code) => {
    await verifyPickupCode(orderNumber, code);
    setVerified({ orderNumber, code });
    showToast('success', 'Kode pickup cocok');
  };

  const openStatusModal = () => setModal({
    type: 'status', from: detail.order.order_status, to: detail.actions.next_status, requiresCourier: detail.actions.requires_courier,
  });

  const changeStatus = async ({ courierName }) => {
    try {
      const result = await updateAdminOrderStatus(orderNumber, {
        from: modal.from, to: modal.to, pickup_code: verifiedCode ?? undefined, courier_name: courierName,
      });
      setModal(null);
      setVerified({ orderNumber: null, code: null });
      const points = result.points_awarded ? ` · +${formatNumber(result.points_awarded)} poin untuk pelanggan` : '';
      showToast('success', `Status diubah menjadi ${ORDER_STATUS_LABEL[result.order_status]}${points}`);
      reload();
    } catch (err) {
      // Mis. status sudah diubah di tab lain → muat data terbaru; pesan error tetap tampil di modal
      reload();
      throw err;
    }
  };

  const markPaid = async () => {
    await markOrderPaid(orderNumber);
    setModal(null);
    showToast('success', 'Pembayaran ditandai lunas');
    reload();
  };

  const actions = detail?.actions;
  const needsCode = Boolean(actions?.requires_pickup_code);
  // Alasan tombol Ubah Status nonaktif (ditampilkan di bawah tombol)
  const statusBlockedReason = !actions?.next_status ? null
    : actions.completion_blocked
      ?? (needsCode && !verifiedCode ? 'Verifikasi kode pickup sebelum menyelesaikan pesanan' : null);

  return {
    modal,
    openStatusModal,
    openPaidModal: () => setModal({ type: 'paid' }),
    closeModal: () => setModal(null),
    verifiedCode,
    verify,
    resetVerified: () => setVerified({ orderNumber: null, code: null }),
    changeStatus,
    markPaid,
    statusBlockedReason,
    canChangeStatus: Boolean(actions?.next_status) && !statusBlockedReason,
  };
}
