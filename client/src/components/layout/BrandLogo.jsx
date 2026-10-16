// components/layout/BrandLogo.jsx
// Step 2.5 (PR A) · Logo teks Oven & Co. yang menautkan ke Beranda (dipakai SiteHeader & FocusLayout)

import { Link } from 'react-router-dom';
import { CUSTOMER_ROUTES } from '../../constants/routes';

export default function BrandLogo({ className = '' }) {
  return (
    <Link
      to={CUSTOMER_ROUTES.BERANDA}
      className={`inline-flex items-center min-h-touch-min rounded-btn px-1 -mx-1
                  font-display text-xl lg:text-2xl text-cocoa leading-none
                  hover:text-primary active:opacity-80 transition-colors
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${className}`}
      aria-label="Oven & Co. — ke Beranda"
    >
      Oven &amp; Co.
    </Link>
  );
}
