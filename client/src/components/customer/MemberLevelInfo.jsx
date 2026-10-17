// components/customer/MemberLevelInfo.jsx
// Step 5.5 · FR-22 · BR-09 · TF-11 · C-21 — level member: Silver < 500, Gold 500–1.999, Platinum ≥ 2.000 poin
// per tahun kalender. Dokumen tidak mendefinisikan manfaat per level, jadi yang ditampilkan hanya syarat poinnya.

import Badge from '../ui/Badge';
import { MEMBER_LEVEL, STORE_SETTINGS_DEFAULT } from '../../constants/storeConfig';
import { formatNumber, formatRupiah } from '../../utils/format';

/**
 * @param {string} [currentKey] — level pelanggan saat ini (summary.level.key)
 * @param {object} [settings] — store_settings (gold_min_points, platinum_min_points, earn_amount_per_point)
 */
export default function MemberLevelInfo({ currentKey, settings = STORE_SETTINGS_DEFAULT }) {
  const gold = settings.gold_min_points;
  const platinum = settings.platinum_min_points;
  const levels = [
    { ...MEMBER_LEVEL.SILVER, rule: `< ${formatNumber(gold)} poin` },
    { ...MEMBER_LEVEL.GOLD, rule: `${formatNumber(gold)}–${formatNumber(platinum - 1)} poin` },
    { ...MEMBER_LEVEL.PLATINUM, rule: `≥ ${formatNumber(platinum)} poin` },
  ];

  return (
    <section className="card p-5 lg:p-6 space-y-4" aria-labelledby="level-title">
      <div>
        <h2 id="level-title" className="font-display text-xl text-cocoa">Level Member</h2>
        <p className="mt-1 text-xs text-cocoa/70">
          Dihitung dari poin yang diperoleh tahun ini. 1 poin per {formatRupiah(settings.earn_amount_per_point)} setelah
          pesanan Selesai; {formatNumber(settings.redeem_points_unit)} poin = {formatRupiah(settings.redeem_value)} saat checkout.
        </p>
      </div>
      <ul className="space-y-2">
        {levels.map((lvl) => {
          const current = lvl.key === currentKey;
          return (
            <li
              key={lvl.key}
              aria-current={current || undefined}
              className={`flex items-center justify-between gap-3 rounded-btn px-3 py-1.5 min-h-touch-min ${current ? 'bg-beige ring-1 ring-primary/30' : ''}`}
            >
              <Badge variant={lvl.badge} className="whitespace-nowrap">{lvl.label}</Badge>
              <span className="text-sm text-cocoa tabular-nums text-right">
                {lvl.rule}
                {current && <span className="block text-xs font-semibold text-primary">Level kamu</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
