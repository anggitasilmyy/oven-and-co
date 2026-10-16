// services/mock/seed/productExtras.js
// Step 5.1 · FR-08 · FR-09 · FR-25 — product_variants, balasan admin, wishlists (SPEC §8)
// Semua isi = data contoh. review_photos sengaja kosong (lihat services/mock/db.js).

const variant = (variant_id, product_id, name, extra_price, is_active = true) => ({
  variant_id, product_id, name, extra_price, is_active,
});

// product_variants — Croissant sesuai UI/UX Spec (Original, Almond +6.000, Chocolate +5.000); lainnya data contoh
export const PRODUCT_VARIANTS = [
  variant(1, 1, 'Original', 0),
  variant(2, 1, 'Almond', 6000),
  variant(3, 1, 'Chocolate', 5000),
  variant(4, 1, 'Matcha', 7000, false), // contoh varian nonaktif — tidak boleh tampil
  variant(5, 2, 'Original', 0),
  variant(6, 2, 'Extra Cream Cheese', 5000),
  variant(7, 5, 'Vanilla', 0),
  variant(8, 5, 'Chocolate', 25000),
  variant(9, 5, 'Red Velvet', 40000),
];

const ADMIN_REPLIES = [
  'Terima kasih sudah berbelanja di Oven & Co.! Ditunggu pesanan berikutnya.',
  'Senang sekali kamu suka. Sampai jumpa lagi di toko!',
];

/**
 * Balasan admin (FR-35) untuk sebagian ulasan contoh — hanya menambah kolom admin_reply,
 * isi ulasan Step 4 tidak berubah.
 */
export function withAdminReplies(reviews) {
  return reviews.map((r) =>
    !r.is_hidden && r.review_id % 5 === 0 ? { ...r, admin_reply: ADMIN_REPLIES[r.review_id % 2] } : r
  );
}

/** wishlists awal akun demo pelanggan */
export function buildWishlists(demoCustomerId, now) {
  return [5, 7].map((product_id, i) => ({
    user_id: demoCustomerId,
    product_id,
    created_at: new Date(now.getTime() - (i + 1) * 86400000).toISOString(),
  }));
}
