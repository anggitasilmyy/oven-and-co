// pages/customer/OnboardingPage.jsx
// C-01 · Splash & Onboarding (3 slide, kunjungan pertama)
// Step 3 · Authentication
// FR-05 (entry point) — redirect ke / setelah onboarding selesai/dilewati

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CUSTOMER_ROUTES } from '../../constants/routes';

/** Key localStorage penanda onboarding sudah pernah dilihat */
const ONBOARDING_KEY = 'ovenco_onboarding_done';

/** 3 slide onboarding sesuai tema bakery Oven & Co. */
const SLIDES = [
  {
    id: 'slide-1',
    emoji: '🥐',
    title: 'Freshly Baked,\nMade With Care',
    description:
      'Nikmati kue & roti artisan premium buatan tangan langsung dari dapur Oven & Co.',
    bg: 'from-[#FBF6EE] to-[#F4C7AB]',
    accent: '#8B5E3C',
  },
  {
    id: 'slide-2',
    emoji: '🎂',
    title: 'Custom Cake\nImpian Kamu',
    description:
      'Desain kue ulang tahun, pernikahan, atau momen spesial sesuai keinginanmu — H-3 sebelum acara.',
    bg: 'from-[#FBF6EE] to-[#F2D4D7]',
    accent: '#5C3D2E',
  },
  {
    id: 'slide-3',
    emoji: '🛍️',
    title: 'Pickup atau\nDelivery ke Rumah',
    description:
      'Pesan kapan saja, pilih ambil sendiri atau kami antarkan — semua bisa diatur dalam genggamanmu.',
    bg: 'from-[#FBF6EE] to-[#C9D8C5]',
    accent: '#8B5E3C',
  },
];

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

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-between bg-gradient-to-b ${slide.bg}
                  transition-all duration-500 select-none px-6 pt-safe`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Tombol Lewati */}
      <div className="w-full max-w-[480px] flex justify-end pt-6">
        <button
          id="onboarding-skip-btn"
          onClick={finish}
          className="text-sm font-semibold text-cocoa/60 hover:text-cocoa transition-colors px-2 py-1 min-h-[44px] min-w-[44px] flex items-center"
          aria-label="Lewati onboarding"
        >
          Lewati
        </button>
      </div>

      {/* Ilustrasi + Konten */}
      <div
        className={`flex-1 flex flex-col items-center justify-center w-full max-w-[480px]
                    transition-opacity duration-250 ${animating ? 'opacity-0' : 'opacity-100'}`}
      >
        {/* Emoji / ilustrasi */}
        <div
          className="text-[120px] leading-none mb-8 drop-shadow-sm"
          style={{ filter: 'saturate(1.2)' }}
          aria-hidden="true"
        >
          {slide.emoji}
        </div>

        {/* Teks */}
        <h1
          className="font-display text-3xl text-cocoa text-center leading-tight mb-4 whitespace-pre-line"
          style={{ color: slide.accent }}
        >
          {slide.title}
        </h1>
        <p className="text-sm text-cocoa/60 text-center leading-relaxed max-w-[300px]">
          {slide.description}
        </p>
      </div>

      {/* Footer: dots + tombol */}
      <div className="w-full max-w-[480px] flex flex-col items-center gap-6 pb-12">
        {/* Indikator slide */}
        <div className="flex items-center gap-2" role="tablist" aria-label="Slide onboarding">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={i === current}
              aria-label={`Slide ${i + 1}`}
              onClick={() => setCurrent(i)}
              className={[
                'h-2 rounded-full transition-all duration-300',
                i === current ? 'w-6 bg-primary' : 'w-2 bg-primary/25',
              ].join(' ')}
            />
          ))}
        </div>

        {/* Tombol aksi */}
        <button
          id="onboarding-next-btn"
          onClick={handleNext}
          className="w-full h-[52px] rounded-btn bg-primary text-white font-sans font-semibold text-base
                     hover:bg-cocoa transition-colors active:scale-[0.98]"
          aria-label={current === SLIDES.length - 1 ? 'Mulai belanja' : 'Lanjut'}
        >
          {current === SLIDES.length - 1 ? 'Mulai Belanja 🎉' : 'Lanjut'}
        </button>
      </div>
    </div>
  );
}
