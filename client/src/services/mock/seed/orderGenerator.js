// services/mock/seed/orderGenerator.js
// Step 4 · Pesanan contoh 7 hari terakhir (orders, order_items, payments, custom cake designs)
// Deterministik: PRNG ber-seed + tanggal relatif terhadap hari ini (lihat mockClock.js).

import { AVAILABILITY_TYPE } from '../../../constants/product';
import { FULFILLMENT_TYPE, PAYMENT_OPTION, ORDER_STATUS } from '../../../constants/orderStatus';
import { STORE_SETTINGS_DEFAULT } from '../../../constants/storeConfig';
import { addDaysToKey } from '../../../utils/date';
import { atTime } from '../mockClock';
import { createRandom } from './random';
import { decideOrderState } from './orderStateRules';
import { pickReadyItems, pickPreorderItem, buildCustomDesign } from './orderItems';
import { buildOrderNumber, buildTimes, buildSlot, buildDelivery, buildPayment, pickOnlineMethod } from './orderParts';

const SEED = 20261016;
/** Jumlah pesanan per hari, dari H-6 sampai hari ini (data contoh) */
const DAY_COUNTS = [13, 15, 18, 14, 16, 17, 12];

export function generateOrders({ todayKey, now, products, customerIds, demoCustomerId, customOptions, stockPlan }) {
  const rng = createRandom(SEED);
  const out = { orders: [], order_items: [], payments: [], custom_cake_designs: [], custom_cake_design_options: [] };
  const sold = {}; // { dateKey: { productId: qty } } — stok berkurang saat pesanan dibuat (TF-12)
  const remainingOf = (dateKey) => (pid) => (stockPlan[pid] ?? 0) - (sold[dateKey]?.[pid] ?? 0);
  let orderId = 0;

  DAY_COUNTS.forEach((count, i) => {
    const dateKey = addDaysToKey(todayKey, i - (DAY_COUNTS.length - 1));
    const isToday = dateKey === todayKey;
    const times = buildTimes(rng, dateKey, count, isToday ? now : atTime(dateKey, '19:40'));
    let seq = 0;

    for (const createdAt of times) {
      const kind = rng.weighted([
        { value: AVAILABILITY_TYPE.READY, weight: 78 },
        { value: AVAILABILITY_TYPE.PREORDER, weight: 15 },
        { value: AVAILABILITY_TYPE.CUSTOM, weight: 7 },
      ]);
      const fulfillment = rng.next() < 0.65 ? FULFILLMENT_TYPE.PICKUP : FULFILLMENT_TYPE.DELIVERY;
      // BR-05: Bayar di Toko hanya pickup + semua item ready
      const paymentOption =
        kind === AVAILABILITY_TYPE.READY && fulfillment === FULFILLMENT_TYPE.PICKUP && rng.next() < 0.3
          ? PAYMENT_OPTION.PAY_AT_STORE
          : PAYMENT_OPTION.ONLINE;
      const userId = rng.next() < 0.14 ? demoCustomerId : rng.pick(customerIds);

      // Tanggal siap (BR-02): pre-order H+1 (H+2 bila lewat batas jam), custom ≥ H+3
      const cutoffPassed = createdAt >= atTime(dateKey, STORE_SETTINGS_DEFAULT.preorder_cutoff_time);
      const leadDays = { ready: 0, preorder: cutoffPassed ? 2 : 1, custom: rng.int(3, 6) }[kind];
      const readyDate = addDaysToKey(dateKey, leadDays);
      const readyCompare = readyDate < todayKey ? -1 : readyDate > todayKey ? 1 : 0;
      const ageMinutes = (now - createdAt) / 60000;

      // Item
      let items;
      let design = null;
      if (kind === AVAILABILITY_TYPE.READY) {
        items = pickReadyItems(rng, products, remainingOf(dateKey));
        if (items.length === 0) continue; // semua stok habis — pesanan tidak terjadi
      } else if (kind === AVAILABILITY_TYPE.PREORDER) {
        items = [pickPreorderItem(rng, products)];
      } else {
        const product = products.find((p) => p.availability_type === AVAILABILITY_TYPE.CUSTOM);
        design = buildCustomDesign(rng, product, customOptions, {
          designId: out.custom_cake_designs.length + 1, userId, readyDate,
        });
        items = [{ product, quantity: 1, unitPrice: design.design.price, designId: design.design.design_id }];
      }

      const state = decideOrderState({ kind, ageMinutes, readyCompare, fulfillment, paymentOption, rng });
      orderId += 1;
      seq += 1;

      const subtotal = items.reduce((s, it) => s + (it.unitPrice ?? it.product.price) * it.quantity, 0);
      const delivery = buildDelivery(rng, fulfillment, state.order_status);
      const order = {
        order_id: orderId,
        order_number: buildOrderNumber(dateKey, seq),
        user_id: userId,
        fulfillment_type: fulfillment,
        address_id: null,
        ...delivery,
        ready_date: readyDate,
        time_slot: buildSlot(rng, kind, createdAt),
        subtotal,
        voucher_id: null,
        voucher_discount: 0,
        points_used: 0,
        points_discount: 0,
        total: subtotal + delivery.shipping_fee,
        payment_option: paymentOption,
        payment_status: state.payment_status,
        order_status: state.order_status,
        pickup_code: fulfillment === FULFILLMENT_TYPE.PICKUP ? `PK${String(rng.int(1000, 9999))}` : null,
        cancel_reason: state.cancel_reason,
        created_at: createdAt.toISOString(),
      };
      out.orders.push(order);

      items.forEach((it) => {
        out.order_items.push({
          order_item_id: out.order_items.length + 1,
          order_id: orderId,
          product_id: it.product.product_id,
          variant_id: null,
          design_id: it.designId ?? null,
          quantity: it.quantity,
          unit_price: it.unitPrice ?? it.product.price,
          note: null,
        });
        // Stok ready berkurang saat dibuat dan kembali saat dibatalkan → hanya pesanan aktif yang dihitung
        if (kind === AVAILABILITY_TYPE.READY && order.order_status !== ORDER_STATUS.DIBATALKAN) {
          sold[dateKey] = sold[dateKey] ?? {};
          sold[dateKey][it.product.product_id] = (sold[dateKey][it.product.product_id] ?? 0) + it.quantity;
        }
      });

      if (design) {
        out.custom_cake_designs.push(design.design);
        design.optionIds.forEach((option_id) =>
          out.custom_cake_design_options.push({ design_id: design.design.design_id, option_id })
        );
      }

      const methodCode = paymentOption === PAYMENT_OPTION.PAY_AT_STORE ? 'pay_at_store' : pickOnlineMethod(rng);
      out.payments.push(buildPayment(order, methodCode, createdAt));
    }
  });

  return { ...out, sold };
}

