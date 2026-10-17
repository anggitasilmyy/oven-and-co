// hooks/useReviewForm.js
// Step 5.4 · FR-21 · BR-11 · C-19 — isian ulasan satu item (rating, tag, komentar, foto) dan pengirimannya

import { useState } from 'react';
import { submitReview } from '../services/reviewService';
import { validateReviewInput } from '../utils/businessRules';

const EMPTY = { rating: 0, tags: [], comment: '', photos: [] };

/**
 * @param {string} orderNumber
 * @param {Function} onSubmitted — ({review_id, points}, orderItemId) → void
 */
export default function useReviewForm(orderNumber, onSubmitted) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const toggleTag = (tag) => setForm((f) => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag] }));
  const reset = () => { setForm(EMPTY); setError(''); };

  const submit = async (orderItemId) => {
    const invalid = validateReviewInput(form);
    if (invalid) return setError(invalid);
    setSubmitting(true);
    setError('');
    try {
      const result = await submitReview(orderNumber, { order_item_id: orderItemId, ...form });
      reset();
      onSubmitted(result, orderItemId);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return {
    form, error, submitting, canSubmit: form.rating > 0 && !submitting,
    setRating: set('rating'), setComment: set('comment'), setPhotos: set('photos'), toggleTag, submit, reset,
  };
}
