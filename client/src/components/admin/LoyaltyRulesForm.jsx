// components/admin/LoyaltyRulesForm.jsx
// Step 5.8 · FR-34 · BR-09 · AD-09 — aturan dapat & tukar poin serta ambang level member (store_settings)
// Disimpan langsung berlaku: poin pesanan Selesai, tukar poin di checkout (C-13), level member (C-05, C-21, AD-10).

import { useState } from 'react';
import { Save } from 'lucide-react';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import FormError from '../ui/FormError';
import FormField from './FormField';
import { fieldClass } from './fieldClass';
import { normalizeLoyaltyInput, validateLoyaltyRules } from '../../utils/businessRules';
import { updateLoyaltyRules } from '../../services/adminPromoService';
import { LOYALTY_FIELDS } from '../../constants/adminPromo';
import { formatNumber, formatRupiah } from '../../utils/format';

const numberInput = (error) => `${fieldClass(error)} tabular-nums`;

/**
 * @param {object} rules — getLoyaltyRules()
 * @param {Function} onSaved — (message) → void
 */
export default function LoyaltyRulesForm({ rules, onSaved }) {
  const [values, setValues] = useState(() => Object.fromEntries(LOYALTY_FIELDS.map((f) => [f, String(rules[f])])));
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const parsed = normalizeLoyaltyInput(values);
  const errors = validateLoyaltyRules(parsed);
  const errorOf = (f) => (submitted || values[f] !== String(rules[f]) ? errors[f] : undefined);
  const bind = (f) => ({ value: values[f], onChange: (e) => { setValues((v) => ({ ...v, [f]: e.target.value })); setError(''); } });
  const dirty = LOYALTY_FIELDS.some((f) => values[f] !== String(rules[f]));

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      await updateLoyaltyRules(values);
      onSaved('Aturan loyalty disimpan dan langsung berlaku');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const ok = Object.keys(errors).length === 0;
  return (
    <form noValidate onSubmit={submit} className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <section className="card-admin space-y-4 p-4 md:p-6" aria-labelledby="loyalty-earn-title">
        <h2 id="loyalty-earn-title" className="text-base font-bold text-cocoa">Aturan poin</h2>
        <FormField id="loyalty-earn" label="Belanja per 1 poin (Rp)" error={errorOf('earn_amount_per_point')} hint="Poin diberikan setelah pesanan Selesai">
          <input type="number" inputMode="numeric" min="1" step="1" className={numberInput(errorOf('earn_amount_per_point'))} {...bind('earn_amount_per_point')} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="loyalty-redeem-unit" label="Poin per penukaran" error={errorOf('redeem_points_unit')}>
            <input type="number" inputMode="numeric" min="1" step="1" className={numberInput(errorOf('redeem_points_unit'))} {...bind('redeem_points_unit')} />
          </FormField>
          <FormField id="loyalty-redeem-value" label="Nilai penukaran (Rp)" error={errorOf('redeem_value')}>
            <input type="number" inputMode="numeric" min="1" step="1" className={numberInput(errorOf('redeem_value'))} {...bind('redeem_value')} />
          </FormField>
        </div>
        {ok && (
          <ul className="space-y-1 rounded-btn bg-cream px-4 py-3 text-sm text-cocoa" aria-label="Ringkasan aturan poin">
            <li>1 poin per {formatRupiah(parsed.earn_amount_per_point)}</li>
            <li>{formatNumber(parsed.redeem_points_unit)} poin = {formatRupiah(parsed.redeem_value)}</li>
          </ul>
        )}
      </section>

      <section className="card-admin space-y-4 p-4 md:p-6" aria-labelledby="loyalty-level-title">
        <h2 id="loyalty-level-title" className="text-base font-bold text-cocoa">Ambang level member</h2>
        <p className="text-xs text-cocoa/70">Dihitung dari poin yang diperoleh pada tahun kalender berjalan.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="loyalty-gold" label="Gold mulai (poin)" error={errorOf('gold_min_points')}>
            <input type="number" inputMode="numeric" min="1" step="1" className={numberInput(errorOf('gold_min_points'))} {...bind('gold_min_points')} />
          </FormField>
          <FormField id="loyalty-platinum" label="Platinum mulai (poin)" error={errorOf('platinum_min_points')}>
            <input type="number" inputMode="numeric" min="1" step="1" className={numberInput(errorOf('platinum_min_points'))} {...bind('platinum_min_points')} />
          </FormField>
        </div>
        {ok && (
          <ul className="flex flex-wrap gap-2" aria-label="Ringkasan level member">
            <li><Badge variant="silver">Silver &lt; {formatNumber(parsed.gold_min_points)}</Badge></li>
            <li><Badge variant="gold">Gold {formatNumber(parsed.gold_min_points)}–{formatNumber(parsed.platinum_min_points - 1)}</Badge></li>
            <li><Badge variant="platinum">Platinum ≥ {formatNumber(parsed.platinum_min_points)}</Badge></li>
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-3 lg:col-span-2 sm:flex-row sm:items-center sm:justify-end">
        <FormError message={error} />
        <Button type="submit" size="sm" loading={saving} disabled={!dirty} leftIcon={<Save size={16} aria-hidden="true" />}>Simpan aturan</Button>
      </div>
    </form>
  );
}
