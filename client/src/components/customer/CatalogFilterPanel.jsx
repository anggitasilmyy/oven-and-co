// components/customer/CatalogFilterPanel.jsx
// Step 5.1 · FR-06 · C-07 — isi filter & urutan. Komponen yang SAMA dipakai di BottomSheet (< lg)
// dan sidebar kiri Katalog (≥ lg).

import Chip from '../ui/Chip';
import PriceRangeField from './PriceRangeField';
import { Star } from 'lucide-react';
import { AVAILABILITY_FILTER_OPTIONS, CATALOG_SORT_OPTIONS, MIN_RATING_OPTIONS } from '../../constants/catalog';

function Section({ title, children }) {
  return (
    <fieldset className="space-y-3 min-w-0">
      <legend className="text-sm font-bold text-cocoa mb-3">{title}</legend>
      {children}
    </fieldset>
  );
}

/**
 * @param {{availability, minPrice, maxPrice, minRating, sort}} value
 * @param {Function} onChange — (patch) → void
 * @param {string} idPrefix — pembeda id input (sidebar vs sheet)
 */
export default function CatalogFilterPanel({ value, onChange, idPrefix = 'filter' }) {
  const toggleAvailability = (option) =>
    onChange({
      availability: value.availability.includes(option)
        ? value.availability.filter((a) => a !== option)
        : [...value.availability, option],
    });

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor={`${idPrefix}-urut`} className="block text-sm font-bold text-cocoa mb-3">Urutkan</label>
        <select
          id={`${idPrefix}-urut`}
          className="input form-select pr-10"
          value={value.sort}
          onChange={(e) => onChange({ sort: e.target.value })}
        >
          {CATALOG_SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <Section title="Ketersediaan">
        <div className="flex flex-wrap gap-2">
          {AVAILABILITY_FILTER_OPTIONS.map((o) => (
            <Chip key={o.value} selected={value.availability.includes(o.value)} onClick={() => toggleAvailability(o.value)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Rentang harga">
        <PriceRangeField
          idPrefix={`${idPrefix}-harga`}
          minPrice={value.minPrice}
          maxPrice={value.maxPrice}
          onChange={onChange}
        />
      </Section>

      <Section title="Rating minimal">
        <div className="flex flex-wrap gap-2">
          {MIN_RATING_OPTIONS.map((r) => (
            <Chip
              key={r}
              selected={value.minRating === r}
              onClick={() => onChange({ minRating: value.minRating === r ? null : r })}
              leftIcon={<Star size={15} aria-hidden="true" className={value.minRating === r ? 'fill-white' : 'fill-[#D9A441] text-[#D9A441]'} />}
            >
              {`${String(r).replace('.', ',')}+`}
            </Chip>
          ))}
        </div>
      </Section>
    </div>
  );
}
