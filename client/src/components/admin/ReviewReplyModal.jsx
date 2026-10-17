// components/admin/ReviewReplyModal.jsx
// Step 5.8 · FR-35 · AD-10 — modal "Balas" ulasan (balasan tampil di bawah ulasan pada C-09/C-10)

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FormError from '../ui/FormError';
import StarRating from '../ui/StarRating';
import FormField from './FormField';
import { fieldClass } from './fieldClass';
import { validateAdminReply } from '../../utils/businessRules';
import { replyReview } from '../../services/adminCustomerService';
import { ADMIN_REPLY_MAX } from '../../constants/adminCustomer';

/**
 * @param {object} review — baris getAdminReviews
 * @param {Function} onClose
 * @param {Function} onSaved — (message) → void
 */
export default function ReviewReplyModal({ review, onClose, onSaved }) {
  const [reply, setReply] = useState(review.admin_reply ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fieldError = submitted ? validateAdminReply(reply) : '';

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (validateAdminReply(reply)) return;
    setSaving(true);
    try {
      await replyReview(review.review_id, reply);
      onSaved(review.admin_reply ? 'Balasan diperbarui' : 'Balasan dikirim dan tampil di halaman produk');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={saving ? undefined : onClose}
      title={review.admin_reply ? 'Ubah balasan' : 'Balas ulasan'}
      footer={(
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Batal</Button>
          <Button type="submit" form="reply-form" size="sm" loading={saving}>Kirim balasan</Button>
        </>
      )}
    >
      <form id="reply-form" noValidate className="space-y-4" onSubmit={submit}>
        <div className="rounded-btn bg-cream p-3 text-sm text-cocoa">
          <p className="font-semibold">{review.reviewer_name} · {review.product_name}</p>
          <StarRating value={review.rating} className="mt-1" />
          {review.comment && <p className="mt-1 text-cocoa/80">{review.comment}</p>}
        </div>
        <FormField id="review-reply" label="Balasan toko" error={fieldError || undefined} hint={`${reply.trim().length}/${ADMIN_REPLY_MAX} karakter`}>
          <textarea className={fieldClass(fieldError, 'textarea')} maxLength={ADMIN_REPLY_MAX} value={reply} onChange={(e) => { setReply(e.target.value); setError(''); }} />
        </FormField>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
