// components/admin/PaymentMethodSettings.jsx
// Step 5.8 · FR-36 · FR-14 · FR-15 · BR-05 · AD-11 — sakelar metode bayar aktif per kelompok (payment_methods)
// Metode nonaktif tidak muncul di C-14. Minimal satu metode online tetap aktif (BR-05).

import { useState } from 'react';
import Switch from '../ui/Switch';
import { setPaymentMethodActive } from '../../services/settingsService';
import { PAYMENT_GROUPS } from '../../constants/checkout';

/**
 * @param {Array} methods — getStoreSettings().paymentMethods
 * @param {Function} onChanged — (type, message) → void
 */
export default function PaymentMethodSettings({ methods, onChanged }) {
  const [pending, setPending] = useState(null);
  const toggle = async (m, checked) => {
    setPending(m.method_code);
    try {
      await setPaymentMethodActive(m.method_code, checked);
      onChanged('success', `${m.name} ${checked ? 'diaktifkan' : 'dinonaktifkan di halaman pembayaran'}`);
    } catch (err) {
      onChanged('error', err.message);
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="card-admin space-y-4 p-4 md:p-6" aria-labelledby="payment-methods-title">
      <div>
        <h2 id="payment-methods-title" className="text-base font-bold text-cocoa">Metode pembayaran</h2>
        <p className="text-xs text-cocoa/70">Pre-order, custom cake, dan delivery wajib dibayar online, jadi minimal satu metode online harus aktif.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PAYMENT_GROUPS.map((g) => (
          <fieldset key={g.key} className="rounded-xl border border-beige p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-cocoa/70">{g.label}</legend>
            <ul>
              {methods.filter((m) => m.method_group === g.key).map((m) => (
                <li key={m.method_code} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-cocoa">{m.name}</span>
                  <Switch checked={m.is_active} disabled={pending != null} onChange={(c) => toggle(m, c)} label={`Aktifkan ${m.name}`} />
                </li>
              ))}
            </ul>
          </fieldset>
        ))}
      </div>
    </section>
  );
}
