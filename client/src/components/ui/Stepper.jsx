// components/ui/Stepper.jsx
// Step 2 · Layout & Komponen Dasar
// Dipakai untuk: C-11 Custom Cake Builder (6 langkah)

import { Check } from 'lucide-react';

/**
 * Indikator langkah horizontal.
 *
 * @param {string[]} steps — label setiap langkah
 * @param {number} currentStep — indeks langkah aktif (0-based)
 * @param {Function} [onStepClick] — Step 5.2: (index) → buka langkah; bila diisi, langkah bisa diklik
 * @param {Function} [canClickStep] — (index) → boolean; langkah yang tidak boleh dibuka dinonaktifkan
 */
export default function Stepper({ steps, currentStep, onStepClick, canClickStep = () => true }) {
  return (
    <div className="flex items-center w-full" role="list" aria-label="Langkah">
      {steps.map((label, index) => {
        const isDone = index < currentStep;
        const isActive = index === currentStep;
        const circleClass = [
          'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors duration-200',
          isDone ? 'bg-primary text-white' : '',
          isActive ? 'bg-primary text-white ring-4 ring-primary/20' : '',
          !isDone && !isActive ? 'bg-beige text-cocoa/40' : '',
        ].join(' ');
        const circleContent = isDone ? <Check size={14} /> : <span>{index + 1}</span>;

        return (
          <div key={label} className="flex items-center flex-1 last:flex-none" role="listitem">
            {/* Lingkaran step */}
            <div className="flex flex-col items-center">
              {onStepClick ? (
                // Area sentuh 44 px; lingkaran tetap 28 px
                <button
                  type="button"
                  onClick={() => onStepClick(index)}
                  disabled={!canClickStep(index)}
                  aria-current={isActive ? 'step' : undefined}
                  aria-label={`Langkah ${index + 1}: ${label}${isDone ? ' (selesai)' : ''}`}
                  className="w-11 h-11 -m-2 flex items-center justify-center rounded-full disabled:cursor-not-allowed
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <span className={circleClass}>{circleContent}</span>
                </button>
              ) : (
                <div className={circleClass} aria-current={isActive ? 'step' : undefined}>
                  {circleContent}
                </div>
              )}
              {/* Label (hanya tampil pada layar cukup lebar atau aktif) */}
              <span
                className={[
                  'mt-1 text-[10px] font-medium text-center leading-tight hidden sm:block',
                  isActive ? 'text-primary' : 'text-cocoa/40',
                ].join(' ')}
              >
                {label}
              </span>
            </div>

            {/* Garis penghubung */}
            {index < steps.length - 1 && (
              <div
                className={[
                  'h-0.5 flex-1 mx-1 transition-colors duration-300',
                  index < currentStep ? 'bg-primary' : 'bg-beige',
                ].join(' ')}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
