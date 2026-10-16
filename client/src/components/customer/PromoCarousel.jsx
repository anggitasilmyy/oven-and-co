// components/customer/PromoCarousel.jsx
// Step 4 · FR-05 · C-05 — banner promo dari voucher aktif (geser/scroll-snap + titik halaman)

import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Tag } from 'lucide-react';
import Skeleton from '../ui/Skeleton';
import ErrorState from '../ui/ErrorState';
import { CUSTOMER_ROUTES, buildPath } from '../../constants/routes';
import { formatDate } from '../../utils/format';
import { parseDateKey } from '../../utils/date';

const arrowClass =
  'hidden md:flex absolute top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-surface/90 text-cocoa shadow-md ' +
  'items-center justify-center hover:bg-surface active:scale-95 transition disabled:opacity-0 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

/** Tujuan CTA: produk promo bila ada, selain itu Katalog */
const promoHref = (promo) =>
  promo.product_id ? buildPath(CUSTOMER_ROUTES.PRODUK_DETAIL, { id: promo.product_id }) : CUSTOMER_ROUTES.KATALOG;

export default function PromoCarousel({ promos, loading, error, onRetry }) {
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);

  if (error) return <ErrorState message="Promo gagal dimuat." onRetry={onRetry} />;
  if (loading && !promos) return <Skeleton variant="block" className="h-48 md:h-64 lg:h-72 w-full rounded-card" />;
  if (!promos?.length) return null; // tidak ada promo aktif → banner disembunyikan

  const goTo = (index) => {
    const track = trackRef.current;
    track?.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' });
  };
  const handleScroll = (e) => setActive(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth));

  return (
    <section aria-roledescription="carousel" aria-label="Promo aktif" className="relative">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory rounded-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {promos.map((promo, i) => (
          <article
            key={promo.voucher_id}
            aria-roledescription="slide"
            aria-label={`Promo ${i + 1} dari ${promos.length}`}
            className={`relative snap-start shrink-0 w-full min-h-[200px] md:min-h-[256px] lg:min-h-[288px] overflow-hidden
                        flex items-center ${i % 2 === 0 ? 'bg-cocoa' : 'bg-primary'}`}
          >
            {promo.image_url && (
              <img
                src={promo.image_url}
                alt=""
                className="absolute right-0 top-0 h-full w-2/5 md:w-[45%] object-cover opacity-60 md:opacity-90
                           [mask-image:linear-gradient(to_right,transparent,black_45%)]"
              />
            )}
            <div className="relative z-10 p-5 md:p-8 lg:p-10 max-w-[70%] md:max-w-[60%] space-y-2 md:space-y-3 text-cream">
              <p className="inline-flex items-center gap-1.5 text-[11px] md:text-xs font-semibold uppercase tracking-widest text-peach">
                <Tag size={14} aria-hidden="true" /> Promo
              </p>
              <h2 className="font-display text-lg md:text-3xl lg:text-4xl leading-tight">{promo.title}</h2>
              <p className="text-xs md:text-sm text-cream/80">
                Kode <span className="font-bold text-cream tracking-wide">{promo.code}</span> · berlaku s.d.{' '}
                {formatDate(parseDateKey(promo.valid_to))}
              </p>
              <Link
                to={promoHref(promo)}
                className="inline-flex items-center h-11 px-5 mt-1 rounded-btn bg-peach text-cocoa text-sm font-semibold
                           hover:bg-cream active:scale-[0.98] transition
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream"
              >
                {promo.product_id ? 'Lihat produk' : 'Belanja sekarang'}
              </Link>
            </div>
          </article>
        ))}
      </div>

      {promos.length > 1 && (
        <>
          <button type="button" className={`${arrowClass} left-3`} onClick={() => goTo(active - 1)} disabled={active === 0} aria-label="Promo sebelumnya">
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button type="button" className={`${arrowClass} right-3`} onClick={() => goTo(active + 1)} disabled={active === promos.length - 1} aria-label="Promo berikutnya">
            <ChevronRight size={20} aria-hidden="true" />
          </button>
          <div className="flex justify-center gap-1 mt-2">
            {promos.map((promo, i) => (
              <button
                key={promo.voucher_id}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Tampilkan promo ${i + 1}`}
                aria-current={i === active}
                className="w-11 h-6 flex items-center justify-center rounded-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <span className={`h-2 rounded-pill transition-all ${i === active ? 'w-6 bg-primary' : 'w-2 bg-primary/30'}`} />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
