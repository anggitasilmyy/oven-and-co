// components/customer/PaymentInstructions.jsx
// Step 5.3 · FR-14 · C-15 — "Cara pembayaran" yang bisa dibuka/tutup

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { PAYMENT_INSTRUCTIONS } from '../../constants/checkout';

export default function PaymentInstructions({ methodGroup }) {
  const [open, setOpen] = useState(false);
  const steps = PAYMENT_INSTRUCTIONS[methodGroup] ?? [];
  if (steps.length === 0) return null;
  return (
    <section className="card p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="cara-pembayaran"
        className="w-full min-h-touch-min flex items-center justify-between gap-3 text-sm font-bold text-cocoa rounded-btn
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        Cara pembayaran
        <ChevronDown size={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <ol id="cara-pembayaran" className="mt-2 space-y-2 text-sm text-cocoa/80 list-decimal pl-5">
          {steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      )}
    </section>
  );
}
