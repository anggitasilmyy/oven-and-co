// pages/customer/OnboardingPage.jsx
// C-01 · Splash & Onboarding (3 slide, kunjungan pertama)
// Step 3 · Authentication
// FR-05 (entry point) — redirect ke / setelah onboarding selesai/dilewati
// Step 2.5 (PR B): < lg slide satu kolom · ≥ lg hero dua kolom (visual kiri, konten kanan)

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CUSTOMER_ROUTES } from '../../constants/routes';
import { ONBOARDING_SLIDES as SLIDES } from '../../constants/onboarding';

/** Key localStorage penanda onboarding sudah pernah dilihat */
const ONBOARDING_KEY = 'ovenco_onboarding_done';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [animating, setAnimating] = useState(false);
  const touchStartXRef = useRef(null);

  /** Tandai selesai & redirect ke beranda */
  const finish = () => {
    localStorage.setItem(ONBOARDING_KEY, '1');
    navigate(CUSTOMER_ROUTES.BERANDA, { replace: true });
  };

  /** Lanjut ke slide berikutnya atau selesai */
  const handleNext = () => {
    if (animating) return;
    if (current < SLIDES.length - 1) {
      setAnimating(true);
      setTimeout(() => {
        setCurrent((c) => c + 1);
        setAnimating(false);
      }, 250);
    } else {
      finish();
    }
  };

  /** Swipe sederhana dengan touch events */
  const handleTouchStart = (e) => {
    touchStartXRef.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e) => {
    if (touchStartXRef.current === null) return;
    const diff = touchStartXRef.current - e.changedTouches[0].clientX;
    if (diff > 50) handleNext();
    if (diff < -50 && current > 0) {
      setCurrent((c) => c - 1);
    }
    touchStartXRef.current = null;
  };

  const slide = SLIDES[current];
  const isLast = current === SLIDES.length - 1;
  const fadeClass = `transition-opacity duration-200 ${animating ? 'opacity-0' : 'opacity-100'}`;

  return (
    <div
      className={`min-h-screen flex flex-col bg-gradient-to-b lg:bg-gradient-to-br ${slide.bg}
                  transition-all duration-500 select-none`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Bar atas: nama toko (≥ lg) + Lewati */}
      <div className="page-container flex items-center justify-between pt-6">
        <p className="hidden lg:block font-display text-2xl text-cocoa">Oven &amp; Co.</p>
        <button
          id="onboarding-skip-btn"
          onClick={finish}
          className="ml-auto text-sm font-semibold text-cocoa/70 hover:text-cocoa hover:bg-white/40 active:bg-white/60
                     transition-colors px-3 rounded-btn min-h-touch-min min-w-touch-min flex items-center
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label="Lewati onboarding"
        >
          Lewati
        </button>
      </div>

      {/* < lg: kolom tunggal (visual, teks, tombol) · ≥ lg: hero dua kolom */}
      <div
        className="page-container flex-1 flex flex-col pb-12
                   lg:grid lg:grid-cols-2 lg:items-center lg:gap-16 xl:gap-24 lg:pb-16"
      >
        {/* Visual */}
        <div className={`flex-1 flex items-center justify-center ${fadeClass}`}>
          <div
            className="flex items-center justify-center lg:w-full lg:max-w-[460px] lg:aspect-square
                       lg:rounded-full lg:bg-white/40 lg:shadow-inner"
            aria-hidden="true"
          >
            <span
              className="text-[120px] md:text-[150px] lg:text-[200px] xl:text-[220px] leading-none drop-shadow-sm"
              style={{ filter: 'saturate(1.2)' }}
            >
              {slide.emoji}
            </span>
          </div>
        </div>

        {/* Konten + kontrol */}
        <div className="w-full max-w-auth mx-auto lg:max-w-lg lg:mx-0 flex flex-col items-center lg:items-start gap-6 lg:gap-8">
          <div className={`text-center lg:text-left ${fadeClass}`}>
            <p className="hidden lg:block text-xs font-semibold text-primary tracking-widest uppercase mb-3">
              {current + 1} / {SLIDES.length}
            </p>
            <h1
              className="font-display text-3xl md:text-4xl lg:text-5xl xl:text-6xl leading-tight mb-4 whitespace-pre-line"
              style={{ color: slide.accent }}
            >
              {slide.title}
            </h1>
            <p className="text-sm md:text-base lg:text-lg text-cocoa/70 leading-relaxed max-w-[300px] md:max-w-[380px] lg:max-w-md mx-auto lg:mx-0">
              {slide.description}
            </p>
          </div>

          {/* Indikator slide */}
          <div className="flex items-center gap-1" role="tablist" aria-label="Slide onboarding">
            {SLIDES.map((s, i) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={i === current}
                aria-label={`Slide ${i + 1}`}
                onClick={() => setCurrent(i)}
                className="min-w-touch-min min-h-touch-min flex items-center justify-center rounded-pill
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 group"
              >
                <span
                  className={[
                    'h-2 rounded-full transition-all duration-300',
                    i === current ? 'w-6 bg-primary' : 'w-2 bg-primary/25 group-hover:bg-primary/50',
                  ].join(' ')}
                />
              </button>
            ))}
          </div>

          {/* Tombol aksi */}
          <button
            id="onboarding-next-btn"
            onClick={handleNext}
            className="w-full lg:w-auto lg:min-w-[260px] h-[52px] px-8 rounded-btn bg-primary text-white font-sans font-semibold text-base
                       hover:bg-cocoa transition-colors active:scale-[0.98]
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
            aria-label={isLast ? 'Mulai belanja' : 'Lanjut'}
          >
            {isLast ? 'Mulai Belanja 🎉' : 'Lanjut'}
          </button>
        </div>
      </div>
    </div>
  );
}
