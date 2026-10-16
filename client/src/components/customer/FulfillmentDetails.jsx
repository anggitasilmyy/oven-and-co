// components/customer/FulfillmentDetails.jsx
// Step 5.3 · FR-12 · BR-12 · C-13 — kartu toko (pickup) atau alamat tersimpan + ongkir (delivery).
// Alamat di luar radius ditolak dengan pesan jelas (validation rule Checkout). Kelola alamat: C-22 (Step 5.5).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Store } from 'lucide-react';
import { formatRupiah } from '../../utils/format';
import { CUSTOMER_ROUTES } from '../../constants/routes';

const distanceText = (a, radius) =>
  a.withinRadius ? `${a.distance.toLocaleString('id-ID')} km · Ongkir ${formatRupiah(a.fee)}` : `Di luar radius pengiriman ${radius} km`;

function AddressOption({ address, radius, selected, onSelect }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`w-full text-left rounded-btn border-2 p-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                  ${selected ? 'border-primary bg-beige/40' : 'border-beige bg-surface hover:border-primary/40'}`}
    >
      <span className="block font-semibold text-cocoa">{address.label}{address.is_primary ? ' · Utama' : ''}</span>
      <span className="block text-sm text-cocoa/70 break-words">{address.recipient_name} · {address.full_address}</span>
      <span className={`block text-xs font-semibold mt-1 ${address.withinRadius ? 'text-primary' : 'text-error'}`}>{distanceText(address, radius)}</span>
    </button>
  );
}

/**
 * @param {boolean} isDelivery
 * @param {object} store — { name, address }
 * @param {object[]} addresses — alamat + { distance, withinRadius, fee }
 */
export default function FulfillmentDetails({ isDelivery, store, addresses, address, radius, onSelectAddress }) {
  const [choosing, setChoosing] = useState(false);

  if (!isDelivery) {
    return (
      <div className="card p-4 flex gap-3">
        <span className="w-12 h-12 shrink-0 rounded-btn bg-beige text-primary flex items-center justify-center"><Store size={22} aria-hidden="true" /></span>
        <div className="min-w-0">
          <p className="font-semibold text-cocoa">{store.name}</p>
          <p className="text-sm text-cocoa/70 break-words">{store.address}</p>
        </div>
      </div>
    );
  }
  if (!address) {
    return (
      <div className="card p-4 text-sm text-cocoa/80">
        Belum ada alamat tersimpan. <Link to={CUSTOMER_ROUTES.ALAMAT} className="font-semibold text-primary underline">Tambah alamat</Link>
      </div>
    );
  }
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <MapPin size={20} className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-cocoa">Alamat pengiriman</p>
          {!choosing && (
            <>
              <p className="text-sm text-cocoa">{address.label} · {address.recipient_name} ({address.recipient_phone})</p>
              <p className="text-sm text-cocoa/70 break-words">{address.full_address}</p>
              <p className={`text-xs font-semibold mt-1 ${address.withinRadius ? 'text-primary' : 'text-error'}`} role={address.withinRadius ? undefined : 'alert'}>
                {distanceText(address, radius)}
              </p>
            </>
          )}
        </div>
        {addresses.length > 1 && (
          <button
            type="button"
            onClick={() => setChoosing((c) => !c)}
            className="shrink-0 min-h-touch-min px-3 -mr-3 -mt-2 rounded-btn text-sm font-semibold text-primary hover:underline
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-expanded={choosing}
          >
            {choosing ? 'Tutup' : 'Ubah'}
          </button>
        )}
      </div>
      {choosing && (
        <div role="radiogroup" aria-label="Pilih alamat" className="space-y-2">
          {addresses.map((a) => (
            <AddressOption
              key={a.address_id}
              address={a}
              radius={radius}
              selected={a.address_id === address.address_id}
              onSelect={() => { onSelectAddress(a.address_id); setChoosing(false); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
