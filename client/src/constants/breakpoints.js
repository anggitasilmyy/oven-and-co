// constants/breakpoints.js
// Step 2.5 (PR A) · NFR-06 Responsive (CR-01)
// Breakpoint mengikuti default Tailwind — jangan diubah tanpa mengubah tailwind.config.js

/** Lebar minimum (px) setiap breakpoint */
export const BREAKPOINTS = {
  SM: 640,
  MD: 768,   // < 768: bottom nav · ≥ 768: top nav
  LG: 1024,  // ≥ 1024: layout desktop, panel aksi sticky, sidebar admin tetap
  XL: 1280,
  XXL: 1536,
};

/** Media query siap pakai untuk useMediaQuery */
export const MEDIA_QUERY = {
  MD_UP: `(min-width: ${BREAKPOINTS.MD}px)`,
  LG_UP: `(min-width: ${BREAKPOINTS.LG}px)`,
  XL_UP: `(min-width: ${BREAKPOINTS.XL}px)`,
};
