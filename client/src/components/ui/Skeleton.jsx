// components/ui/Skeleton.jsx
// Step 2 · Layout & Komponen Dasar

/**
 * Skeleton loading placeholder — pulsing animation.
 *
 * @param {'text'|'card'|'circle'|'image'} variant
 * @param {string} className — override width/height jika perlu
 * @param {number} count — jumlah baris (khusus variant 'text')
 */
export default function Skeleton({ variant = 'text', className = '', count = 1 }) {
  const base = 'animate-pulse bg-beige rounded';

  if (variant === 'text') {
    return (
      <div className="space-y-2">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={`${base} h-4 ${i === count - 1 && count > 1 ? 'w-3/4' : 'w-full'} ${className}`}
          />
        ))}
      </div>
    );
  }

  if (variant === 'circle') {
    return <div className={`${base} rounded-full w-10 h-10 ${className}`} />;
  }

  if (variant === 'image') {
    return <div className={`${base} aspect-square w-full rounded-card ${className}`} />;
  }

  // card — kartu produk skeleton
  if (variant === 'card') {
    return (
      <div className="card p-0 overflow-hidden">
        <div className={`${base} aspect-square w-full rounded-none`} />
        <div className="p-3 space-y-2">
          <div className={`${base} h-3 w-16`} />
          <div className={`${base} h-4 w-full`} />
          <div className={`${base} h-4 w-3/4`} />
          <div className={`${base} h-5 w-1/2`} />
        </div>
      </div>
    );
  }

  return <div className={`${base} ${className}`} />;
}

/**
 * Grid skeleton untuk halaman katalog.
 * @param {number} count
 */
export function ProductGridSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant="card" />
      ))}
    </div>
  );
}
