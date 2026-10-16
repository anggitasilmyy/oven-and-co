// pages/dev/BreakpointIndicator.jsx
// Step 2.5 (PR A) · Penunjuk breakpoint aktif (CSS) + contoh useMediaQuery (perilaku)

import useMediaQuery from '../../hooks/useMediaQuery';
import { MEDIA_QUERY } from '../../constants/breakpoints';

const PILL = 'badge bg-beige text-cocoa';

export default function BreakpointIndicator() {
  const isMdUp = useMediaQuery(MEDIA_QUERY.MD_UP);
  const isLgUp = useMediaQuery(MEDIA_QUERY.LG_UP);

  return (
    <div className="card p-4 flex flex-wrap items-center gap-3 text-sm">
      <span className={`${PILL} md:hidden`}>Mobile &lt; 768</span>
      <span className={`${PILL} hidden md:inline-flex lg:hidden`}>Tablet 768–1023</span>
      <span className={`${PILL} hidden lg:inline-flex xl:hidden`}>Desktop lg ≥ 1024</span>
      <span className={`${PILL} hidden xl:inline-flex 2xl:hidden`}>Desktop xl ≥ 1280</span>
      <span className={`${PILL} hidden 2xl:inline-flex`}>Desktop 2xl ≥ 1536</span>
      <span className="text-cocoa/70">
        useMediaQuery → md: <b>{String(isMdUp)}</b> · lg: <b>{String(isLgUp)}</b>
      </span>
    </div>
  );
}
