// components/customer/MapPinPicker.jsx
// Step 5.5 · FR-24 · BR-12 · C-22 — "map pin" form alamat (PRD Batch 5).
// Asumsi prototype: belum ada layanan peta, jadi peta disimulasikan sebagai kotak berpusat di toko dengan
// lingkaran radius pengiriman. Klik/ketuk menaruh pin; tombol panah menggeser pin 0,5 km (aksesibel keyboard).

import { MapPin, Store } from 'lucide-react';
import { coordinatesToOffset, offsetToCoordinates, distanceKm, getDeliveryQuote } from '../../utils/businessRules';
import { formatNumber } from '../../utils/format';
import { MAP_SPAN_KM } from '../../constants/account';

const STEP_KM = 0.5;
const KEY_MOVES = { ArrowUp: [STEP_KM, 0], ArrowDown: [-STEP_KM, 0], ArrowRight: [0, STEP_KM], ArrowLeft: [0, -STEP_KM] };
const clampKm = (km) => Math.max(-MAP_SPAN_KM, Math.min(MAP_SPAN_KM, km));
const toPercent = (km) => 50 + (km / MAP_SPAN_KM) * 50;

/**
 * @param {{latitude, longitude}} store — koordinat toko (store_settings)
 * @param {object} settings — store_settings (delivery_radius_km, delivery_fee_per_km)
 * @param {{latitude, longitude}|null} value — pin saat ini
 * @param {Function} onChange — ({latitude, longitude}) → void
 * @param {string} [error]
 */
export default function MapPinPicker({ store, settings, value, onChange, error }) {
  const offset = value ? coordinatesToOffset(store, value) : null;
  const quote = value ? getDeliveryQuote(distanceKm(store, value), settings) : null;
  const radiusPct = (Number(settings.delivery_radius_km) / MAP_SPAN_KM) * 50;
  const place = (northKm, eastKm) => onChange(offsetToCoordinates(store, clampKm(northKm), clampKm(eastKm)));

  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    place((0.5 - y) * 2 * MAP_SPAN_KM, (x - 0.5) * 2 * MAP_SPAN_KM);
  };
  const handleKey = (e) => {
    const move = KEY_MOVES[e.key];
    if (!move) return;
    e.preventDefault();
    place((offset?.northKm ?? 0) + move[0], (offset?.eastKm ?? 0) + move[1]);
  };

  return (
    <div>
      <p id="map-pin-label" className="block text-sm font-semibold text-cocoa mb-1.5">Titik lokasi</p>
      <div
        role="application"
        tabIndex={0}
        aria-labelledby="map-pin-label"
        aria-describedby="map-pin-status"
        onClick={handleClick}
        onKeyDown={handleKey}
        className={`relative w-full max-w-[320px] aspect-square rounded-card overflow-hidden cursor-crosshair select-none
                    bg-[#EEF2E6] border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60
                    ${error ? 'border-error' : 'border-beige'}`}
        style={{ backgroundImage: 'linear-gradient(#0000000d 1px, transparent 1px), linear-gradient(90deg, #0000000d 1px, transparent 1px)', backgroundSize: '10% 10%' }}
      >
        <span
          aria-hidden="true"
          className="absolute rounded-full border-2 border-dashed border-primary/50 bg-sage/30 -translate-x-1/2 -translate-y-1/2"
          style={{ left: '50%', top: '50%', width: `${radiusPct * 2}%`, height: `${radiusPct * 2}%` }}
        />
        <span aria-hidden="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-cocoa text-cream flex items-center justify-center">
          <Store size={16} />
        </span>
        {offset && (
          <MapPin
            aria-hidden="true"
            size={32}
            className="absolute -translate-x-1/2 -translate-y-full text-error fill-white drop-shadow"
            style={{ left: `${toPercent(offset.eastKm)}%`, top: `${100 - toPercent(offset.northKm)}%` }}
          />
        )}
      </div>
      <p id="map-pin-status" className={`mt-1.5 text-xs ${error ? 'text-error' : 'text-cocoa/70'}`}>
        {error
          || (quote
            ? `${formatNumber(quote.distance)} km dari toko · ${quote.withinRadius ? 'dalam' : 'di luar'} radius pengiriman ${formatNumber(settings.delivery_radius_km)} km`
            : 'Ketuk peta (atau fokus lalu tekan tombol panah) untuk menaruh pin. Lingkaran = radius pengiriman.')}
      </p>
    </div>
  );
}
