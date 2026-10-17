// components/admin/OrderFulfillmentInfo.jsx
// Step 5.6 · FR-28 · AD-04 — info pickup (dengan field verifikasi kode pickup) atau delivery (alamat, jarak, kurir)

import { CalendarDays, MapPin, Store, Truck } from 'lucide-react';
import PickupCodeVerifier from './PickupCodeVerifier';
import { FULFILLMENT_LABEL, FULFILLMENT_TYPE } from '../../constants/orderStatus';
import { formatDate } from '../../utils/format';
import { parseDateKey } from '../../utils/date';

/**
 * @param {object} order — order AD-04 (tanpa pickup_code)
 * @param {boolean} showVerifier — tampilkan field verifikasi (pesanan pickup berikutnya Selesai)
 * @param {object} verifier — props PickupCodeVerifier
 */
export default function OrderFulfillmentInfo({ order, showVerifier, verifier }) {
  const isDelivery = order.fulfillment_type === FULFILLMENT_TYPE.DELIVERY;
  const Icon = isDelivery ? Truck : Store;
  return (
    <section aria-labelledby="admin-fulfillment-title" className="card-admin p-5 md:p-6 space-y-4">
      <h2 id="admin-fulfillment-title" className="font-display text-lg text-cocoa flex items-center gap-2">
        <Icon size={18} className="text-primary" aria-hidden="true" /> {FULFILLMENT_LABEL[order.fulfillment_type]}
      </h2>
      <dl className="space-y-2.5 text-sm text-cocoa">
        <div className="flex items-start gap-3">
          <CalendarDays size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <dt className="sr-only">Tanggal & slot siap</dt>
          <dd>{formatDate(parseDateKey(order.ready_date))} · {order.time_slot}</dd>
        </div>
        {isDelivery && (
          <>
            <div className="flex items-start gap-3">
              <MapPin size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <dt className="sr-only">Alamat pengiriman</dt>
              <dd className="min-w-0 break-words">
                {order.delivery_address_snapshot ?? '-'}
                {order.distance_km != null && <span className="block text-xs text-cocoa/65">Jarak {String(order.distance_km).replace('.', ',')} km</span>}
              </dd>
            </div>
            <div className="flex items-start gap-3">
              <dt className="text-cocoa/65 w-[52px] shrink-0">Kurir</dt>
              <dd className="font-semibold">{order.courier_name ?? 'Belum ditentukan'}</dd>
            </div>
          </>
        )}
        {!isDelivery && (
          <div className="flex items-start gap-3">
            <dt className="text-cocoa/65 shrink-0">Kode pickup</dt>
            <dd className="font-semibold">{order.has_pickup_code ? 'Ditunjukkan pelanggan saat mengambil' : '-'}</dd>
          </div>
        )}
      </dl>
      {showVerifier && (
        <div className="pt-4 border-t border-beige">
          <PickupCodeVerifier {...verifier} />
        </div>
      )}
    </section>
  );
}
