// components/customer/FulfillmentToggle.jsx
// Step 5.3 · FR-12 · C-13 — segmented control "Pickup di Toko" | "Delivery"

import { Store, Truck } from 'lucide-react';
import { FULFILLMENT_TYPE } from '../../constants/orderStatus';

const OPTIONS = [
  { value: FULFILLMENT_TYPE.PICKUP, label: 'Pickup di Toko', Icon: Store },
  { value: FULFILLMENT_TYPE.DELIVERY, label: 'Delivery', Icon: Truck },
];

export default function FulfillmentToggle({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Cara pemenuhan" className="grid grid-cols-2 gap-1 rounded-btn bg-beige/70 p-1">
      {OPTIONS.map(({ value: v, label, Icon }) => {
        const selected = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(v)}
            className={`min-h-[48px] rounded-[11px] inline-flex items-center justify-center gap-2 text-sm font-semibold transition
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                        ${selected ? 'bg-surface text-cocoa shadow-sm' : 'text-cocoa/70 hover:text-cocoa'}`}
          >
            <Icon size={18} aria-hidden="true" /> {label}
          </button>
        );
      })}
    </div>
  );
}
