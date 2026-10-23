// services/designAccess.service.js
// FR-10 · FR-04 · FR-11 — siapa boleh memakai desain custom cake (fungsi murni).
//   - Desain milik pelanggan: hanya pelanggan itu (token diabaikan).
//   - Desain tamu (user_id kosong): hanya pemegang token desain yang valid.
//   - Desain yang pernah dikaitkan dengan pesanan tidak boleh dipakai lagi, termasuk bila pesanan
//     dibatalkan (kebijakan sekali pakai prototype — "Pesan Lagi" juga wajib desain ulang).

const { verifyDesignToken } = require('../utils/designToken');

function isOwnedBy(design, userId) {
  return design.userId != null && userId != null && String(design.userId) === String(userId);
}

/**
 * @param {{designId: bigint, userId: bigint|null}} design
 * @param {{userId?: string|null, designToken?: string|null}} requester
 */
function canAccessDesign(design, { userId = null, designToken = null } = {}) {
  if (design.userId != null) return isOwnedBy(design, userId);
  return verifyDesignToken(design.designId, designToken);
}

/** Sekali pakai: true bila desain sudah pernah masuk order_items (status pesanan apa pun) */
function isDesignAlreadyOrdered(design) {
  return Array.isArray(design.orderItems) && design.orderItems.length > 0;
}

/**
 * Satu design_id hanya boleh ada di SATU baris keranjang/pesanan (jumlah > 1 di baris itu boleh, untuk kue identik).
 * Baris berikutnya dengan design_id yang sama ditandai agar desain tidak dipakai ganda lewat catatan berbeda.
 * Dipakai cart.service sekarang dan wajib dipakai lagi saat pembuatan pesanan (Phase berikutnya).
 * @param {Array<{design_id?: string|null}>} items
 * @returns {Set<number>} indeks baris duplikat (kemunculan pertama tidak termasuk)
 */
function findDuplicateDesignLines(items) {
  const seen = new Set();
  const duplicates = new Set();

  items.forEach((item, index) => {
    if (!item.design_id) return;
    if (seen.has(item.design_id)) duplicates.add(index);
    seen.add(item.design_id);
  });

  return duplicates;
}

/**
 * Persiapan Phase 2 (gabung keranjang setelah login): id desain tamu yang AMAN diklaim pelanggan,
 * yaitu masih tanpa pemilik, token valid, dan belum pernah dipesan. Fungsi ini tidak menulis data;
 * Phase 2 memakai hasilnya untuk `updateMany({ where: { designId: { in }, userId: null }, data: { userId } })`.
 * @param {Array<{design_id: string|null, design_token?: string|null}>} items
 * @param {Map<string, object>} designsById
 * @returns {string[]}
 */
function selectClaimableGuestDesignIds(items, designsById) {
  const ids = new Set();

  for (const item of items) {
    const design = item.design_id ? designsById.get(item.design_id) : null;

    if (
      design &&
      design.userId == null &&
      !isDesignAlreadyOrdered(design) &&
      verifyDesignToken(design.designId, item.design_token)
    ) {
      ids.add(item.design_id);
    }
  }

  return [...ids];
}

module.exports = {
  canAccessDesign,
  isDesignAlreadyOrdered,
  findDuplicateDesignLines,
  selectClaimableGuestDesignIds,
};
