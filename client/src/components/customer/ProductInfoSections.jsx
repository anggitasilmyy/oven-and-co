// components/customer/ProductInfoSections.jsx
// Step 5.1 · FR-08 · C-09 — bagian lipat Deskripsi, Komposisi, Info Alergen

import { ChevronDown } from 'lucide-react';

export default function ProductInfoSections({ product }) {
  const sections = [
    { title: 'Deskripsi', body: product.description || 'Deskripsi belum tersedia.', open: true },
    { title: 'Komposisi', body: product.ingredients || 'Informasi komposisi belum tersedia.' },
    { title: 'Info Alergen', body: product.allergens ? `Mengandung: ${product.allergens}.` : 'Informasi alergen belum tersedia.' },
  ];
  return (
    <div className="card divide-y divide-beige">
      {sections.map(({ title, body, open }) => (
        <details key={title} open={open} className="group">
          <summary
            className="flex items-center justify-between gap-3 min-h-[52px] px-4 md:px-5 cursor-pointer list-none
                       font-semibold text-cocoa rounded-card [&::-webkit-details-marker]:hidden
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
          >
            {title}
            <ChevronDown size={18} aria-hidden="true" className="text-cocoa/60 transition-transform group-open:rotate-180" />
          </summary>
          <p className="px-4 md:px-5 pb-4 text-sm text-cocoa/80 leading-relaxed">{body}</p>
        </details>
      ))}
    </div>
  );
}
