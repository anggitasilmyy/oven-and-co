// components/customer/MemberCard.jsx
// Step 4 · FR-05 · FR-22 · BR-09 — kartu poin & level member (HANYA pelanggan login)

import { Link } from 'react-router-dom';
import { Award, ChevronRight } from 'lucide-react';
import Badge from '../ui/Badge';
import Skeleton from '../ui/Skeleton';
import ErrorState from '../ui/ErrorState';
import { CUSTOMER_ROUTES } from '../../constants/routes';
import { formatNumber, formatRupiah } from '../../utils/format';

/**
 * @param {object|null} summary — hasil loyaltyService.getMyLoyaltySummary()
 * @param {boolean} loading
 * @param {Error|null} error
 * @param {Function} onRetry
 * @param {boolean} [showRewardLink] — Step 5.5: disembunyikan di C-21 (tautan menuju halaman itu sendiri)
 */
export default function MemberCard({ summary, loading, error, onRetry, showRewardLink = true }) {
  if (error) return <ErrorState message="Poin gagal dimuat." onRetry={onRetry} />;
  if (loading && !summary) {
    return (
      <div className="card p-5 space-y-3" aria-busy="true">
        <Skeleton variant="block" className="h-4 w-24" />
        <Skeleton variant="block" className="h-8 w-40" />
        <Skeleton variant="block" className="h-2 w-full rounded-pill" />
      </div>
    );
  }
  if (!summary) return null;

  const { balance, redeemValue, level, nextLevel, pointsToNext, yearlyPoints } = summary;
  const progress = nextLevel ? Math.min(100, Math.round((yearlyPoints / (yearlyPoints + pointsToNext)) * 100)) : 100;

  return (
    <section aria-label="Poin member" className="card p-5 lg:p-6 h-full flex flex-col gap-4 bg-gradient-to-br from-surface to-beige/70">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-cocoa">
          <Award size={18} className="text-primary" aria-hidden="true" />
          Poin Oven &amp; Co.
        </p>
        <Badge variant={level.badge}>{level.label}</Badge>
      </div>

      <div>
        <p className="font-display text-4xl text-cocoa leading-none tabular-nums">
          {formatNumber(balance)} <span className="font-sans text-base font-semibold text-cocoa/70">poin</span>
        </p>
        <p className="mt-1 text-xs text-cocoa/70">Setara {formatRupiah(redeemValue)} saat ditukar di checkout</p>
      </div>

      <div className="space-y-1.5">
        <div
          className="h-2 rounded-pill bg-beige overflow-hidden"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progres level member tahun ini"
        >
          <div className="h-full rounded-pill bg-primary" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-xs text-cocoa/70">
          {nextLevel
            ? `${formatNumber(pointsToNext)} poin lagi menuju ${nextLevel.label} tahun ini`
            : 'Level tertinggi tahun ini — terima kasih!'}
        </p>
      </div>

      {showRewardLink && <Link
        to={CUSTOMER_ROUTES.VOUCHER_POIN}
        className="mt-auto inline-flex items-center gap-1 self-start min-h-touch-min -mb-2 text-sm font-semibold text-primary
                   rounded-btn hover:text-cocoa focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        Lihat reward
        <ChevronRight size={16} aria-hidden="true" />
      </Link>}
    </section>
  );
}
