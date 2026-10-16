// components/customer/AuthBrandHighlights.jsx
// Step 2.5 (PR B) · C-02 – C-04 — isi panel brand desktop (≥ lg)
// Isi diambil dari pesan onboarding C-01 (tidak menambah klaim/fitur baru)

import { Croissant, Cake, ShoppingBag } from 'lucide-react';

const HIGHLIGHTS = [
  { Icon: Croissant, text: 'Kue & roti artisan buatan tangan dari dapur Oven & Co.' },
  { Icon: Cake, text: 'Custom cake sesuai keinginanmu — pesan H-3 sebelum acara.' },
  { Icon: ShoppingBag, text: 'Pilih ambil sendiri di toko atau diantar ke rumah.' },
];

export default function AuthBrandHighlights() {
  return (
    <ul className="max-w-sm space-y-4 text-left">
      {HIGHLIGHTS.map(({ Icon, text }) => (
        <li key={text} className="flex items-start gap-3 text-sm text-cream/85 leading-relaxed">
          <span className="w-9 h-9 shrink-0 rounded-xl bg-white/10 flex items-center justify-center">
            <Icon size={18} className="text-cream" aria-hidden="true" />
          </span>
          <span className="pt-1.5">{text}</span>
        </li>
      ))}
    </ul>
  );
}
