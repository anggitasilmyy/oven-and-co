// services/adminCustomerService.js
// Step 5.8 · FR-35 · UC-25 · BR-11 · AD-10 — pelanggan & ulasan (Staf & Owner, SPEC §2)

import { apiClient } from './apiClient';
import { requireMockRole } from './mock/mockSession';
import { buildAdminCustomerRows, buildAdminReviewList, saveAdminReply, setAdminReviewHidden } from './mock/customerAdmin';
import { ROLES } from '../constants/roles';

const ADMIN_ROLES = [ROLES.STAF, ROLES.OWNER];
const asAdmin = (fn) => (...args) => {
  requireMockRole(...ADMIN_ROLES);
  return fn(...args);
};

/** @returns {Promise<Array>} pelanggan + total pesanan, total belanja, level, pesanan terakhir */
export function getAdminCustomers() {
  return apiClient('/admin/customers', { mockHandler: asAdmin(buildAdminCustomerRows) });
}

/** @param {string} rating — 'semua' atau '1'–'5' @returns {Promise<{rows, summary}>} */
export function getAdminReviews(rating) {
  return apiClient(`/admin/reviews?rating=${rating}`, { mockHandler: asAdmin(() => buildAdminReviewList(rating)) });
}

/** Balas (atau ubah balasan) ulasan */
export function replyReview(reviewId, reply) {
  return apiClient(`/admin/reviews/${reviewId}/reply`, {
    method: 'PUT',
    body: { admin_reply: reply },
    mockHandler: asAdmin(() => saveAdminReply(reviewId, reply)),
  });
}

/** Sembunyikan / tampilkan kembali ulasan */
export function setReviewHidden(reviewId, hidden) {
  return apiClient(`/admin/reviews/${reviewId}/hidden`, {
    method: 'PATCH',
    body: { is_hidden: hidden },
    mockHandler: asAdmin(() => setAdminReviewHidden(reviewId, hidden)),
  });
}
