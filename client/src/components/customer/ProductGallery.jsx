// components/customer/ProductGallery.jsx
// Step 5.1 · FR-08 · C-09 — galeri foto 4:3 yang bisa digeser (scroll-snap) dengan titik penanda;
// ≥ lg ditambah thumbnail. Slot `overlay` untuk tombol wishlist mengambang.
// Foto stok ditandai "Foto ilustrasi" (PRODUCT_PHOTO_NOTE) agar tidak dianggap foto produk asli toko.

import { useRef, useState } from 'react';
import ProductImage from '../ui/ProductImage';
import { PRODUCT_PHOTO_NOTE } from '../../constants/media';

export default function ProductGallery({ images, name, overlay }) {
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);
  const list = images.length ? images : [null];

  const goTo = (index) => {
    const track = trackRef.current;
    track?.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' });
    setActive(index);
  };
  const onScroll = (e) => {
    const { scrollLeft, clientWidth } = e.currentTarget;
    setActive(Math.round(scrollLeft / Math.max(clientWidth, 1)));
  };

  return (
    <div className="space-y-3">
      <div className="relative rounded-card overflow-hidden bg-beige">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label={`Foto ${name}`}
          role="region"
          tabIndex={0}
        >
          {list.map((src, i) => (
            <div key={src ?? i} className="w-full shrink-0 snap-center aspect-[4/3]">
              <ProductImage
                src={src}
                alt={`${name} — foto ${i + 1} dari ${list.length}`}
                sizes="(min-width: 1280px) 780px, (min-width: 1024px) 56vw, 100vw"
                className="w-full h-full object-cover"
                loading={i === 0 ? 'eager' : 'lazy'}
              />
            </div>
          ))}
        </div>
        {overlay && <div className="absolute top-3 right-3">{overlay}</div>}
        <span className="absolute top-3 left-3 rounded-pill bg-cocoa/70 px-2.5 py-1 text-[11px] font-medium text-cream">
          {PRODUCT_PHOTO_NOTE}
        </span>
        {list.length > 1 && (
          <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5" aria-hidden="true">
            {list.map((_, i) => (
              <span key={i} className={`h-2 rounded-pill transition-all ${i === active ? 'w-5 bg-surface' : 'w-2 bg-surface/60'}`} />
            ))}
          </div>
        )}
      </div>

      {list.length > 1 && (
        <div className="hidden lg:flex gap-3" role="group" aria-label="Pilih foto">
          {list.map((src, i) => (
            <button
              key={src ?? i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Lihat foto ${i + 1}`}
              aria-pressed={i === active}
              className={`w-20 aspect-[4/3] rounded-btn overflow-hidden border-2 transition
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                          ${i === active ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100'}`}
            >
              <ProductImage src={src} sizes="80px" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
