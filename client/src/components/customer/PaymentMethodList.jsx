// components/customer/PaymentMethodList.jsx
// Step 5.3 · FR-14 · FR-15 · BR-05 · C-14 — metode bayar berkelompok (QRIS, E-Wallet, Virtual Account, Bayar di Toko).
// Bayar di Toko hanya aktif untuk pickup dengan semua item ready; selain itu nonaktif dengan teks bantuan.

import { Check, Landmark, QrCode, Store, Wallet } from 'lucide-react';
import { PAYMENT_GROUPS, PAYMENT_GROUP, PAY_AT_STORE_METHOD, PAY_AT_STORE_DISABLED_TEXT } from '../../constants/checkout';

const GROUP_ICONS = { [PAYMENT_GROUP.QRIS]: QrCode, [PAYMENT_GROUP.EWALLET]: Wallet, [PAYMENT_GROUP.VA]: Landmark, [PAYMENT_GROUP.STORE]: Store };

/**
 * @param {object[]} methods — payment_methods aktif
 * @param {boolean} payAtStoreAllowed — BR-05
 */
export default function PaymentMethodList({ methods, value, onChange, payAtStoreAllowed }) {
  return (
    <div role="radiogroup" aria-label="Metode pembayaran" className="space-y-5">
      {PAYMENT_GROUPS.map((group) => {
        const items = methods.filter((m) => m.method_group === group.key);
        if (items.length === 0) return null;
        const Icon = GROUP_ICONS[group.key];
        return (
          <section key={group.key} aria-labelledby={`grup-${group.key}`}>
            <h2 id={`grup-${group.key}`} className="font-sans text-sm font-bold text-cocoa mb-2">{group.label}</h2>
            <div className="card divide-y divide-beige overflow-hidden">
              {items.map((m) => {
                const disabled = m.method_code === PAY_AT_STORE_METHOD && !payAtStoreAllowed;
                const selected = value === m.method_code;
                return (
                  <button
                    key={m.method_code}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={disabled}
                    onClick={() => onChange(m.method_code)}
                    className="w-full min-h-[60px] px-4 py-3 flex items-center gap-3 text-left transition hover:bg-beige/40
                               disabled:cursor-not-allowed disabled:hover:bg-transparent
                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
                  >
                    <span className={`w-10 h-10 shrink-0 rounded-btn flex items-center justify-center ${disabled ? 'bg-beige/50 text-cocoa/35' : 'bg-beige text-primary'}`}>
                      <Icon size={20} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block font-semibold ${disabled ? 'text-cocoa/45' : 'text-cocoa'}`}>{m.name}</span>
                      {disabled && <span className="block text-xs text-cocoa/65">{PAY_AT_STORE_DISABLED_TEXT}</span>}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center
                                  ${selected ? 'border-primary bg-primary text-white' : 'border-beige'}`}
                    >
                      {selected && <Check size={14} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
