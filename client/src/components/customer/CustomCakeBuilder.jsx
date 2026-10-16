// components/customer/CustomCakeBuilder.jsx
// FR-10 · UC-06 · C-11 — stepper 6 langkah, preview kue, harga berjalan, Lanjut / Tambah ke Keranjang.
// FocusPageGrid + ActionBar: < lg bar bawah · ≥ lg panel aksi sticky di kanan.

import { CalendarClock } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Stepper from '../ui/Stepper';
import FocusPageGrid from '../layout/FocusPageGrid';
import ActionBar from '../layout/ActionBar';
import CakePreview from './CakePreview';
import CustomCakeStepContent from './CustomCakeStepContent';
import useCustomCakeBuilder from '../../hooks/useCustomCakeBuilder';
import { buildCakeVisual } from '../../utils/cakeVisual';
import { canOpenCustomCakeStep } from '../../utils/businessRules';
import { formatRupiah, formatDate } from '../../utils/format';
import { parseDateKey } from '../../utils/date';
import { AVAILABILITY_BADGE, AVAILABILITY_TYPE } from '../../constants/product';
import { CUSTOM_CAKE_STEPS } from '../../constants/customCake';

const STEP_LABELS = CUSTOM_CAKE_STEPS.map((s) => s.label);

export default function CustomCakeBuilder({ builder, notify }) {
  const b = useCustomCakeBuilder(builder, notify);
  const visual = buildCakeVisual(b.selectedOptions, builder.options, b.design);
  const previewLabel = `Preview kue: ${b.selectedOptions.map((o) => o.name).join(', ') || 'belum ada pilihan'}`
    + (visual.writing ? `, tulisan "${visual.writing}"` : '');
  const blockedReason = b.canContinue ? null : b.isLastStep ? 'Pilih tanggal minimal H+3' : 'Pilih salah satu opsi untuk lanjut';

  const aside = (
    <ActionBar
      label="Total & aksi"
      summary={
        <div>
          <p className="text-xs text-cocoa/65">Total</p>
          <p className="font-bold text-lg lg:text-2xl text-cocoa tabular-nums" aria-live="polite">{formatRupiah(b.total)}</p>
        </div>
      }
    >
      <div className="flex flex-col gap-1.5 min-w-0">
        {b.isLastStep ? (
          <Button fullWidth onClick={b.addToCart} loading={b.submitting} disabled={!b.canContinue || b.submitting}>
            Tambah ke Keranjang
          </Button>
        ) : (
          <Button fullWidth onClick={b.goNext} disabled={!b.canContinue}>Lanjut</Button>
        )}
        {blockedReason && <p className="text-xs text-cocoa/65 text-center lg:text-left" role="status">{blockedReason}</p>}
      </div>
    </ActionBar>
  );

  return (
    <FocusPageGrid aside={aside}>
      <div className="space-y-6 lg:space-y-8">
        <div className="space-y-2">
          <Badge variant="custom">{AVAILABILITY_BADGE[AVAILABILITY_TYPE.CUSTOM].longLabel}</Badge>
          <h1 className="font-display text-3xl lg:text-4xl text-cocoa leading-tight">Design Your Celebration Cake</h1>
          <p className="text-sm md:text-base text-cocoa/70 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{builder.product.name} · mulai <strong className="tabular-nums">{formatRupiah(builder.product.price)}</strong></span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock size={16} aria-hidden="true" />
              Siap paling cepat {formatDate(parseDateKey(builder.earliest_ready_date))}
            </span>
          </p>
        </div>

        <div className="card px-3 py-4 md:p-6">
          <Stepper
            steps={STEP_LABELS}
            currentStep={b.stepIndex}
            onStepClick={b.goToStep}
            canClickStep={(i) => canOpenCustomCakeStep(b.completion, i)}
          />
        </div>

        <div className="rounded-card bg-pink/60 px-4 py-3 md:px-8 md:py-5">
          <CakePreview visual={visual} label={previewLabel} />
        </div>

        <CustomCakeStepContent builder={builder} b={b} />
      </div>
    </FocusPageGrid>
  );
}
