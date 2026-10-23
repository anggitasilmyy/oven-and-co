// hooks/useCustomCakeBuilder.js
// FR-10 · UC-06 · C-11 — state 6 langkah, harga berjalan, navigasi langkah, dan Tambah ke Keranjang.
// Lanjut nonaktif sampai langkah terisi; langkah yang sudah selesai bisa dibuka lagi lewat stepper/Ubah.

import { useState } from 'react';
import useCartStore from '../stores/useCartStore';
import { createCustomCakeDesign } from '../services/customCakeService';
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
  const addItem = useCartStore((s) => s.addItem);
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
    try {
      const saved = await createCustomCakeDesign(design);
      addItem({
        product_id: builder.product.product_id,
        design_id: saved.design_id,
        // Step 6.3: token akses desain tamu (null untuk pelanggan login & mode mock)
        design_token: saved.design_token ?? null,
        quantity: 1,
        preferred_date: saved.ready_date,
        name: builder.product.name,
        price: saved.price,
        image_url: builder.product.image_url,
      });
      notify('success', 'Ditambahkan ke keranjang');
      setDesign(emptyDesign(builder.earliest_ready_date));
      setStepIndex(0);
    } catch (e) {
      notify('error', e.message || 'Desain gagal disimpan');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    stepIndex, step: CUSTOM_CAKE_STEPS[stepIndex], design, update, selectOption, selectedOptions, total,
    completion, canContinue, isLastStep, goToStep, goNext, addToCart, submitting,
  };
}
