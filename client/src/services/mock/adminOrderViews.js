// services/mock/adminOrderViews.js
// Step 5.6 · FR-28 · UC-20 · AD-04 — detail satu pesanan untuk admin (pengganti GET /api/admin/orders/:orderNumber Step 6.4)
// Kode pickup TIDAK dikirim ke UI admin: staf harus mencocokkan kode yang ditunjukkan pelanggan (UC-21).

import { getTables } from './db';
import { getMockUsers } from './users';
import { requireMockRole } from './mockSession';
import { orderItemLines } from './myOrderViews';
import { CART_VIEW_TABLES } from './cartViews';
import { getAdminNextStatus, checkMarkPaidAtStore, getUnpaidCompletionError } from '../../utils/businessRules';
import { ROLES } from '../../constants/roles';
import { ORDER_STATUS, ORDER_STATUS_LABEL, FULFILLMENT_TYPE } from '../../constants/orderStatus';
import { CUSTOM_CAKE_STEPS } from '../../constants/customCake';
import { ADMIN_ORDER_ERROR } from '../../constants/adminOrder';

export const ADMIN_ROLES = [ROLES.STAF, ROLES.OWNER];

const ADMIN_ORDER_TABLES = [
  'orders', 'order_items', 'payments', 'payment_methods', 'order_status_histories', ...CART_VIEW_TABLES,
];

/**
 * Pesanan mana pun (Staf/Owner) + tabel terkait; lempar error bila tidak ditemukan.
 * @returns {{admin, order, payment, items, t}}
 */
export function findAdminOrder(orderNumber, ...extraTables) {
  const admin = requireMockRole(...ADMIN_ROLES);
  const t = getTables(...ADMIN_ORDER_TABLES, ...extraTables);
  const order = t.orders.find((o) => o.order_number === orderNumber);
  if (!order) throw new Error(ADMIN_ORDER_ERROR.NOT_FOUND);
  return {
    admin, order, t,
    payment: t.payments.find((p) => p.order_id === order.order_id) ?? null,
    items: t.order_items.filter((i) => i.order_id === order.order_id),
  };
}

/** Spesifikasi custom cake per langkah builder: Ukuran, Bentuk, Rasa, Krim & Topping, Tulisan, Foto referensi */
function designSpec(designId, t) {
  const design = designId ? t.custom_cake_designs.find((d) => d.design_id === designId) : null;
  if (!design) return null;
  const optionIds = new Set(t.custom_cake_design_options.filter((o) => o.design_id === design.design_id).map((o) => o.option_id));
  const options = t.custom_options.filter((o) => optionIds.has(o.option_id));
  return {
    options: CUSTOM_CAKE_STEPS.filter((s) => s.group).map((s) => ({
      label: s.label, value: options.filter((o) => o.option_group === s.group).map((o) => o.name).join(', ') || '-',
    })),
    writing_text: design.writing_text ?? null,
    writing_color: design.writing_color ?? null,
    reference_photo_url: design.reference_photo_url ?? null,
  };
}

/** Log status (order_status_histories) terbaru di atas, dengan nama pengubah — admin, pelanggan, atau sistem */
function statusLog(order, t) {
  const users = new Map(getMockUsers().map((u) => [u.user_id, u]));
  return t.order_status_histories
    .filter((h) => h.order_id === order.order_id)
    .sort((a, b) => b.changed_at.localeCompare(a.changed_at) || b.history_id - a.history_id)
    .map((h) => {
      const user = h.changed_by != null ? users.get(h.changed_by) : null;
      return {
        history_id: h.history_id, status: h.status, label: ORDER_STATUS_LABEL[h.status], note: h.note,
        changed_at: h.changed_at, changed_by_name: user?.name ?? 'Sistem', changed_by_role: user?.role ?? null,
      };
    });
}

/** Data lengkap AD-04 */
export function toAdminOrderDetail({ order, payment, items, t }) {
  const customer = getMockUsers().find((u) => u.user_id === order.user_id);
  const method = t.payment_methods.find((m) => m.method_code === payment?.method_code) ?? null;
  const next = getAdminNextStatus(order);
  const { pickup_code: pickupCode, ...safeOrder } = order;
  const lines = orderItemLines(items, t);
  return {
    order: { ...safeOrder, has_pickup_code: Boolean(pickupCode) },
    customer: { name: customer?.name ?? 'Pelanggan', email: customer?.email ?? null, phone: customer?.phone ?? null },
    items: lines.map((l, i) => ({ ...l, design_spec: designSpec(items[i].design_id, t) })),
    payment: {
      method_name: method?.name ?? '-', status: payment?.status ?? null, paid_at: payment?.paid_at ?? null, amount: payment?.amount ?? order.total,
    },
    status_log: statusLog(order, t),
    store: {
      name: t.store_settings.store_name, address: t.store_settings.address ?? null, whatsapp: t.store_settings.whatsapp_number ?? null,
    },
    actions: {
      next_status: next,
      // Pesan bila Selesai masih terhalang pembayaran (tombol nonaktif + penjelasan)
      completion_blocked: next === ORDER_STATUS.SELESAI ? getUnpaidCompletionError(order) : null,
      requires_pickup_code: next === ORDER_STATUS.SELESAI && order.fulfillment_type === FULFILLMENT_TYPE.PICKUP,
      requires_courier: next === ORDER_STATUS.DALAM_PENGIRIMAN,
      can_mark_paid: checkMarkPaidAtStore(order) === null,
    },
  };
}
