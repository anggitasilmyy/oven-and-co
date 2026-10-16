// utils/rules/customCake.js
// FR-10 · BR-02 · C-11 — aturan Custom Cake Builder (fungsi murni)
//   - Harga custom cake = harga dasar + Σ extra_price opsi terpilih (SPEC §5)
//   - Semua langkah wajib; tulisan maks. 30 karakter; tanggal ≥ H+3 (validation rule Custom cake)
//   - Satu opsi per kelompok (asumsi TF-08)

import {
  CUSTOM_OPTION_GROUPS, CUSTOM_CAKE_STEPS, CUSTOM_CAKE_STEP, WRITING_TEXT_MAX_LENGTH, WRITING_COLORS,
} from '../../constants/customCake';
import { isSelectableDate } from './readyDate';

/** Opsi aktif dikelompokkan per option_group (urutan data dipertahankan) */
export function groupCustomOptions(options) {
  const groups = Object.fromEntries(CUSTOM_OPTION_GROUPS.map((g) => [g, []]));
  for (const o of options) {
    if (o.is_active && groups[o.option_group]) groups[o.option_group].push(o);
  }
  return groups;
}

/** Opsi terpilih (objek) dari peta { kelompok: option_id }; id yang sudah tidak aktif diabaikan */
export function getSelectedOptions(groupedOptions, selections) {
  return CUSTOM_OPTION_GROUPS
    .map((g) => (groupedOptions[g] ?? []).find((o) => o.option_id === selections[g]))
    .filter(Boolean);
}

/** Harga desain = harga dasar + Σ extra_price */
export function calculateCustomCakePrice(basePrice, selectedOptions) {
  return selectedOptions.reduce((sum, o) => sum + Number(o.extra_price || 0), Number(basePrice || 0));
}

/** Tulisan boleh kosong (kolom nullable); bila diisi maks. 30 karakter */
export function isWritingTextValid(text, max = WRITING_TEXT_MAX_LENGTH) {
  return String(text ?? '').trim().length <= max;
}

/** Warna tulisan wajib dari daftar bila tulisan diisi */
export function isWritingColorValid(text, color) {
  if (!String(text ?? '').trim()) return true;
  return WRITING_COLORS.some((c) => c.name === color);
}

/**
 * Status selesai tiap langkah (urutan CUSTOM_CAKE_STEPS).
 * @param {{selections, writingText, writingColor, readyDate}} design
 * @param {{groupedOptions, earliestKey}} ctx
 * @returns {boolean[]}
 */
export function getCustomCakeStepCompletion(design, { groupedOptions, earliestKey }) {
  return CUSTOM_CAKE_STEPS.map((step) => {
    if (step.group) {
      return (groupedOptions[step.group] ?? []).some((o) => o.option_id === design.selections[step.group]);
    }
    if (step.key === CUSTOM_CAKE_STEP.TULISAN) {
      return isWritingTextValid(design.writingText) && isWritingColorValid(design.writingText, design.writingColor);
    }
    return isSelectableDate(design.readyDate, earliestKey);
  });
}

/** Langkah boleh dibuka bila semua langkah sebelumnya selesai */
export function canOpenCustomCakeStep(completion, index) {
  return completion.slice(0, index).every(Boolean);
}

/**
 * Validasi desain lengkap (dipakai UI dan service sebelum menyimpan).
 * @returns {string|null} pesan error, null bila sah
 */
export function validateCustomCakeDesign(design, ctx) {
  const completion = getCustomCakeStepCompletion(design, ctx);
  const firstMissing = completion.indexOf(false);
  if (firstMissing === -1) return null;
  const step = CUSTOM_CAKE_STEPS[firstMissing];
  if (step.group) return `Pilih ${step.label.toLowerCase()} terlebih dahulu`;
  if (step.key === CUSTOM_CAKE_STEP.TULISAN) return `Tulisan maksimal ${WRITING_TEXT_MAX_LENGTH} karakter`;
  return 'Pilih tanggal minimal H+3';
}
