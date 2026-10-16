// components/customer/CustomCakeStepContent.jsx
// FR-10 · BR-02 · C-11 — isi langkah aktif: kartu opsi (langkah 1–4), Tulisan (5), Tanggal ≥ H+3 + ringkasan (6)

import CustomOptionCards from './CustomOptionCards';
import CustomCakeWritingStep from './CustomCakeWritingStep';
import CustomCakeSummary from './CustomCakeSummary';
import PreorderDatePicker from './PreorderDatePicker';
import { CUSTOM_CAKE_STEP, CUSTOM_CAKE_STEPS, CUSTOM_CAKE_DATE_HELPER, CUSTOM_CAKE_DATE_WINDOW_DAYS } from '../../constants/customCake';

/** @param {object} b — hasil useCustomCakeBuilder */
export default function CustomCakeStepContent({ builder, b }) {
  const { step } = b;
  let body;
  if (step.group) {
    body = (
      <CustomOptionCards
        legend={step.title}
        options={builder.options[step.group] ?? []}
        value={b.design.selections[step.group]}
        onChange={(id) => b.selectOption(step.group, id)}
      />
    );
  } else if (step.key === CUSTOM_CAKE_STEP.TULISAN) {
    body = <CustomCakeWritingStep design={b.design} onChange={b.update} />;
  } else {
    body = (
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm text-cocoa/80 rounded-btn bg-pink/50 px-4 py-3">{CUSTOM_CAKE_DATE_HELPER}</p>
          <PreorderDatePicker
            todayKey={builder.today_key}
            earliestKey={builder.earliest_ready_date}
            value={b.design.readyDate}
            onChange={(readyDate) => b.update({ readyDate })}
            days={CUSTOM_CAKE_DATE_WINDOW_DAYS}
          />
        </div>
        <CustomCakeSummary
          design={b.design}
          selectedOptions={b.selectedOptions}
          basePrice={builder.product.price}
          onEdit={b.goToStep}
        />
      </div>
    );
  }

  return (
    <section aria-labelledby="langkah-aktif" className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-primary tracking-widest uppercase">
          Langkah {b.stepIndex + 1} dari {CUSTOM_CAKE_STEPS.length} · {step.label}
        </p>
        <h2 id="langkah-aktif" className="font-display text-2xl text-cocoa mt-1">{step.title}</h2>
      </div>
      {body}
    </section>
  );
}
