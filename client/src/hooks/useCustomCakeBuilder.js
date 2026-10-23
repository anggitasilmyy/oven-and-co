// hooks/useCustomCakeBuilder.js
// FR-10 · UC-06 · C-11 — state 6 langkah, harga berjalan, navigasi langkah, dan Tambah ke Keranjang.
// Lanjut nonaktif sampai langkah terisi; langkah yang sudah selesai bisa dibuka lagi lewat stepper/Ubah.

import { useState } from 'react';
import useCartStore from '../stores/useCartStore';
import { saveCustomCakeToCart, getDesignCartNotice } from '../services/customCakeCartService';
import { createSessionBoundNotifier } from '../services/sessionScope';
import { isCommittedForOtherSessionError } from '../utils/apiErrors';
import {
  getSelectedOptions, calculateCustomCakePrice, getCustomCakeStepCompletion, canOpenCustomCakeStep,
  validateCustomCakeDesign,
} from '../utils/businessRules';
import { CUSTOM_CAKE_STEPS, CUSTOM_OPTION_GROUPS, WRITING_COLORS } from '../constants/customCake';
import { CART_MAX_LINES, CART_LINE_LIMIT_MESSAGE } from '../constants/cart';

const emptyDesign = (earliestKey) => ({
  selections: Object.fromEntries(CUSTOM_OPTION_GROUPS.map((g) => [g, null])),
  writingText: '',
  writingColor: WRITING_COLORS[0].name,
  referencePhoto: null,
  // Default: tanggal tercepat (H+3); pelanggan bisa memilih tanggal yang lebih lambat
  readyDate: earliestKey,
});

/**
 * @param {object} builder — hasil getCustomCakeBuilder
 * @param {Function} notify — (type, message) → toast
 */
export default function useCustomCakeBuilder(builder, notify) {
  const [stepIndex, setStepIndex] = useState(0);
  const [design, setDesign] = useState(() => emptyDesign(builder.earliest_ready_date));
  const [submitting, setSubmitting] = useState(false);

  const ctx = { groupedOptions: builder.options, earliestKey: builder.earliest_ready_date };
  const selectedOptions = getSelectedOptions(builder.options, design.selections);
  const total = calculateCustomCakePrice(builder.product.price, selectedOptions);
  const completion = getCustomCakeStepCompletion(design, ctx);
  const isLastStep = stepIndex === CUSTOM_CAKE_STEPS.length - 1;
  const canContinue = completion[stepIndex];

  const update = (patch) => setDesign((d) => ({ ...d, ...patch }));
  const selectOption = (group, optionId) => update({ selections: { ...design.selections, [group]: optionId } });

  const goToStep = (index) => {
    if (canOpenCustomCakeStep(completion, index)) setStepIndex(index);
  };
  const goNext = () => {
    if (canContinue && !isLastStep) setStepIndex(stepIndex + 1);
  };

  const addToCart = async () => {
    const error = validateCustomCakeDesign(design, ctx);
    if (error) {
      notify('error', error);
      return;
    }
    // Desain baru selalu menjadi baris baru: cek batas baris sebelum desain disimpan (Step 6.3)
    if (useCartStore.getState().items.length >= CART_MAX_LINES) {
      notify('error', CART_LINE_LIMIT_MESSAGE);
      return;
    }
    setSubmitting(true);
    // Step 6.3 (temuan L1): bila identitas berganti, halaman ini dipasang ulang → pesan lewat notifikasi global
    const report = createSessionBoundNotifier(notify);
    try {
      // Step 6.3 (temuan H1, M-A, L2): simpan & masukkan ke keranjang pemilik yang sah
      const result = await saveCustomCakeToCart(design, builder.product);
      const { type, message, replacesSessionNotice } = getDesignCartNotice(result);
      report(type, message, { replacesSessionNotice });
      if (!result.added) return;
      setDesign(emptyDesign(builder.earliest_ready_date));
      setStepIndex(0);
    } catch (e) {
      // M1: desain sudah tersimpan untuk akun sebelumnya → informasi, bukan kegagalan
      report(isCommittedForOtherSessionError(e) ? 'info' : 'error', e.message || 'Desain gagal disimpan');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    stepIndex, step: CUSTOM_CAKE_STEPS[stepIndex], design, update, selectOption, selectedOptions, total,
    completion, canContinue, isLastStep, goToStep, goNext, addToCart, submitting,
  };
}
