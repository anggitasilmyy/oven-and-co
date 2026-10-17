// components/customer/OrderFulfillmentCard.jsx
// Step 5.4 · FR-17 · BR-07 · C-18 — kartu pickup (alamat toko + kode pickup) atau delivery (alamat + kurir)

import { Store, MapPin } from 'lucide-react';
import { FULFILLMENT_TYPE, ORDER_STATUS } from '../../constants/orderStatus';

/**
 * @param {object} order
 * @param {string|null} storeAddress — store_settings.address
 * @param {string|null} payBeforeTime — BR-07: "HH:mm" jam tutup bila Bayar di Toko belum lunas
 */
export default function OrderFulfillmentCard({ order, storeAddress, payBeforeTime }) {
  const isPickup = order.fulfillment_type === FULFILLMENT_TYPE.PICKUP;
  const showCode = isPickup && order.pickup_code && ![ORDER_STATUS.DIBATALKAN, ORDER_STATUS.SELESAI].includes(order.order_status);
  const Icon = isPickup ? Store : MapPin;

  return (
    <section aria-label={isPickup ? 'Info pickup' : 'Info delivery'} className="card p-5 md:p-6 space-y-3">
      <h2 className="font-display text-xl text-cocoa flex items-center gap-2">
        <Icon size={20} className="text-primary" aria-hidden="true" /> {isPickup ? 'Pickup di Toko' : 'Delivery'}
      </h2>
      {isPickup ? (
        <>
          {storeAddress && <p className="text-sm text-cocoa/75">{storeAddress}</p>}
          {showCode && (
            <div className="rounded-btn bg-beige/60 px-4 py-3 text-center">
              <p className="text-xs text-cocoa/70">Tunjukkan kode ini saat mengambil</p>
              <p className="font-mono text-2xl font-bold tracking-widest text-cocoa">{order.pickup_code}</p>
            </div>
          )}
        </>
      ) : (
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-cocoa/65">Alamat</dt>
            <dd className="font-medium text-cocoa break-words">{order.delivery_address_snapshot ?? '-'}</dd>
          </div>
          {order.distance_km != null && (
            <div className="flex justify-between gap-3"><dt className="text-cocoa/65">Jarak</dt><dd className="font-medium text-cocoa">{String(order.distance_km).replace('.', ',')} km</dd></div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-cocoa/65">Kurir</dt>
            <dd className="font-medium text-cocoa text-right">{order.courier_name ?? 'Diinformasikan saat pesanan dikirim'}</dd>
          </div>
        </dl>
      )}
      {payBeforeTime && (
        <p className="rounded-btn bg-peach/50 px-4 py-2.5 text-sm font-semibold text-cocoa" role="note">
          Ambil dan bayar sebelum pukul {payBeforeTime.replace(':', '.')}
        </p>
      )}
    </section>
  );
}
