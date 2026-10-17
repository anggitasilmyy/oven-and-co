// components/customer/ReviewForm.jsx
// Step 5.4 · FR-21 · C-19 — form ulasan satu produk (PRD Batch 5): foto & nama produk, 5 bintang, tag cepat,
// "Ceritakan pengalamanmu", unggah foto (maks. 3). Tombol Kirim Ulasan ada di ActionBar halaman.

import Chip from '../ui/Chip';
import FormError from '../ui/FormError';
import ProductImage from '../ui/ProductImage';
import StarRatingInput from '../ui/StarRatingInput';
import ReviewPhotosField from './ReviewPhotosField';
import { REVIEW_TAGS } from '../../constants/orderHistory';

/**
 * @param {object} item — item getOrderReviewForm
 * @param {object} review — hasil useReviewForm
 */
export default function ReviewForm({ item, review }) {
  const details = [item.variant_name, item.design?.options].filter(Boolean);
  return (
    <form className="card p-5 md:p-6 space-y-6" onSubmit={(e) => { e.preventDefault(); review.submit(item.order_item_id); }}>
      <div className="flex items-center gap-4">
        <ProductImage src={item.image_url} sizes="80px" className="w-20 h-20 shrink-0 rounded-btn object-cover" />
        <div className="min-w-0">
          <h2 className="font-display text-xl text-cocoa leading-snug">{item.name}</h2>
          {details.length > 0 && <p className="text-xs text-cocoa/65 break-words">{details.join(' · ')}</p>}
        </div>
      </div>

      <div>
        <p id="rating-label" className="text-sm font-bold text-cocoa mb-1">Beri rating <span className="text-error">*</span></p>
        <StarRatingInput value={review.form.rating} onChange={review.setRating} labelId="rating-label" />
      </div>

      <fieldset>
        <legend className="text-sm font-bold text-cocoa mb-2">Apa yang kamu suka?</legend>
        <div className="flex flex-wrap gap-2">
          {REVIEW_TAGS.map((tag) => (
            <Chip key={tag} size="compact" selected={review.form.tags.includes(tag)} onClick={() => review.toggleTag(tag)}>{tag}</Chip>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="review-comment" className="block text-sm font-bold text-cocoa mb-1.5">
          Ulasan <span className="font-normal text-cocoa/60">(opsional)</span>
        </label>
        <textarea
          id="review-comment"
          rows={4}
          value={review.form.comment}
          onChange={(e) => review.setComment(e.target.value)}
          placeholder="Ceritakan pengalamanmu"
          className="input h-auto py-3 resize-none"
        />
      </div>

      <ReviewPhotosField value={review.form.photos} onChange={review.setPhotos} />
      <FormError message={review.error} />
      {/* Enter di textarea tidak mengirim form; tombol utama ada di ActionBar */}
      <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">Kirim</button>
    </form>
  );
}
