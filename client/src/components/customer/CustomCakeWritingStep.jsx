// components/customer/CustomCakeWritingStep.jsx
// FR-10 · C-11 langkah Tulisan — teks maks. 30 karakter + penghitung, chip warna tulisan, foto referensi opsional

import Chip from '../ui/Chip';
import ReferencePhotoField from './ReferencePhotoField';
import { WRITING_COLORS, WRITING_TEXT_MAX_LENGTH } from '../../constants/customCake';

/** @param {{writingText, writingColor, referencePhoto}} design */
export default function CustomCakeWritingStep({ design, onChange }) {
  const length = design.writingText.length;
  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="tulisan-kue" className="block text-sm font-bold text-cocoa mb-1.5">
          Tulisan di kue <span className="font-normal text-cocoa/60">(opsional)</span>
        </label>
        <input
          id="tulisan-kue"
          type="text"
          value={design.writingText}
          maxLength={WRITING_TEXT_MAX_LENGTH}
          onChange={(e) => onChange({ writingText: e.target.value.slice(0, WRITING_TEXT_MAX_LENGTH) })}
          placeholder="Happy Birthday, Nadia!"
          aria-describedby="tulisan-kue-hint"
          className="input w-full"
        />
        <p id="tulisan-kue-hint" className="mt-1.5 flex justify-between gap-3 text-xs text-cocoa/65">
          <span>Kosongkan bila kue tanpa tulisan.</span>
          <span className="tabular-nums" aria-live="polite">{length}/{WRITING_TEXT_MAX_LENGTH}</span>
        </p>
      </div>

      <fieldset className="min-w-0" disabled={!design.writingText.trim()}>
        <legend className="text-sm font-bold text-cocoa mb-3">Warna tulisan</legend>
        <div className="flex flex-wrap gap-2">
          {WRITING_COLORS.map((c) => (
            <Chip
              key={c.name}
              selected={design.writingColor === c.name}
              onClick={() => onChange({ writingColor: c.name })}
              leftIcon={<span className="w-4 h-4 rounded-full border border-cocoa/25" style={{ backgroundColor: c.hex }} aria-hidden="true" />}
            >
              {c.name}
            </Chip>
          ))}
        </div>
      </fieldset>

      <ReferencePhotoField value={design.referencePhoto} onChange={(referencePhoto) => onChange({ referencePhoto })} />
    </div>
  );
}
