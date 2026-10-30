// hooks/useReorder.js
// Step 5.4 · FR-19 · C-17 · C-18 — "Pesan Lagi": salin item yang masih tersedia ke keranjang lalu buka keranjang
// (PRD Batch 5). Item yang dilewati (tidak tersedia, custom cake, stok habis) diberitahukan di halaman Keranjang.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useCartStore from '../stores/useCartStore';
import { getReorderPlan } from '../services/orderHistoryService';
import { CUSTOMER_ROUTES } from '../constants/routes';
import { CART_MAX_LINES } from '../constants/cart';

/** "Croissant (stok hari ini habis), Custom Cake (custom cake perlu didesain ulang)" */
const describeSkipped = (skipped) => skipped.map((s) => `${s.name} (${s.reason})`).join(', ');

/**
 * @param {Function} notify — (type, message) → void, untuk pesan bila tidak ada item yang bisa disalin
 * @returns {{reorder: Function, pendingOrder: string|null}}
 */
export default function useReorder(notify) {
  const navigate = useNavigate();
  const addItem = useCartStore((s) => s.addItem);
  const [pendingOrder, setPendingOrder] = useState(null);

  const reorder = async (orderNumber) => {
    setPendingOrder(orderNumber);
    try {
      // Isi keranjang dibaca saat klik agar batas stok ready ikut menghitung item yang sudah ada
      const plan = await getReorderPlan(orderNumber, useCartStore.getState().items);
      if (plan.items.length === 0) {
        notify('error', `Tidak ada item yang bisa dipesan lagi: ${describeSkipped(plan.skipped)}.`);
        return;
      }
      // Step 6.3: item yang ditolak karena batas baris keranjang ikut diberitahukan (tidak hilang diam-diam)
      const skipped = [...plan.skipped];
      plan.items.forEach((item) => {
        if (!addItem(item)) skipped.push({ name: item.name, reason: `keranjang maks. ${CART_MAX_LINES} item berbeda` });
      });
      const notice = skipped.length
        ? `Sebagian item tidak ditambahkan: ${describeSkipped(skipped)}.`
        : `Item dari pesanan ${orderNumber} ditambahkan ke keranjang.`;
      navigate(CUSTOMER_ROUTES.KERANJANG, { state: { reorderNotice: notice } });
    } catch (e) {
      notify('error', e.message);
    } finally {
      setPendingOrder(null);
    }
  };

  return { reorder, pendingOrder };
}
