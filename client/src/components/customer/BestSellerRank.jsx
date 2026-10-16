// components/customer/BestSellerRank.jsx
// Step 4 · C-05 — penanda peringkat Best Sellers di pojok kartu produk

/** @param {number} rank — 1 = terlaris */
export default function BestSellerRank({ rank }) {
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[32px] h-8 px-2 rounded-pill text-xs font-bold shadow-sm
                  ${rank === 1 ? 'bg-cocoa text-cream' : 'bg-surface/95 text-cocoa'}`}
      aria-label={`Peringkat ${rank}`}
    >
      #{rank}
    </span>
  );
}
