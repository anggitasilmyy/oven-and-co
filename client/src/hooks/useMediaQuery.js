// hooks/useMediaQuery.js
// Step 2.5 (PR A) · NFR-06 Responsive (CR-01)
//
// HANYA untuk perubahan PERILAKU komponen (mis. fokus, jumlah item yang dirender).
// Perubahan tampilan (ukuran, kolom, sembunyikan elemen) tetap memakai kelas Tailwind md:/lg:.

import { useSyncExternalStore } from 'react';

/**
 * @param {string} query — gunakan konstanta MEDIA_QUERY dari constants/breakpoints
 * @returns {boolean} true jika media query cocok
 */
export default function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false // server/prerender: anggap mobile (mobile-first)
  );
}
