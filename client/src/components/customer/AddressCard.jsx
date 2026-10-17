// components/customer/AddressCard.jsx
// Step 5.5 · FR-24 · BR-12 · C-22 — kartu alamat: chip label, badge "Utama", penerima, alamat, jarak & radius,
// aksi Ubah, Jadikan Utama, Hapus.

import { MapPin, Pencil, Trash2, Star } from 'lucide-react';
import Badge from '../ui/Badge';
import { formatNumber } from '../../utils/format';

const actionClass = `inline-flex items-center gap-1.5 min-h-touch-min px-3 rounded-btn text-sm font-semibold transition-colors
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50`;

/**
 * @param {object} address — addresses + distance & withinRadius (addressService.getMyAddresses)
 * @param {number} radiusKm — store_settings.delivery_radius_km
 */
export default function AddressCard({ address, radiusKm, busy, onEdit, onMakePrimary, onDelete }) {
  return (
    <li className={`card p-4 md:p-5 flex flex-col gap-3 ${address.is_primary ? 'ring-1 ring-primary/40' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="neutral" leftIcon={<MapPin size={12} aria-hidden="true" />}>{address.label}</Badge>
        {address.is_primary && <Badge variant="preorder">Utama</Badge>}
        {!address.withinRadius && <Badge variant="error">Di luar radius {formatNumber(radiusKm)} km</Badge>}
      </div>
      <div className="space-y-1 min-w-0">
        <p className="text-sm font-semibold text-cocoa">
          {address.recipient_name} <span className="font-normal text-cocoa/70 tabular-nums">· {address.recipient_phone}</span>
        </p>
        <p className="text-sm text-cocoa/80 leading-relaxed break-words">{address.full_address}</p>
        {address.courier_note && <p className="text-xs text-cocoa/70 break-words">Catatan kurir: {address.courier_note}</p>}
        <p className="text-xs text-cocoa/70 tabular-nums">{formatNumber(address.distance)} km dari toko</p>
      </div>
      <div className="mt-auto flex flex-wrap gap-1 -ml-3">
        <button type="button" onClick={onEdit} disabled={busy} className={`${actionClass} text-primary hover:bg-beige/60`}>
          <Pencil size={16} aria-hidden="true" /> Ubah<span className="sr-only"> alamat {address.label}</span>
        </button>
        {!address.is_primary && (
          <button type="button" onClick={onMakePrimary} disabled={busy} className={`${actionClass} text-cocoa hover:bg-beige/60`}>
            <Star size={16} aria-hidden="true" /> Jadikan Utama<span className="sr-only"> alamat {address.label}</span>
          </button>
        )}
        <button type="button" onClick={onDelete} disabled={busy} className={`${actionClass} text-error hover:bg-red-50`}>
          <Trash2 size={16} aria-hidden="true" /> Hapus<span className="sr-only"> alamat {address.label}</span>
        </button>
      </div>
    </li>
  );
}
