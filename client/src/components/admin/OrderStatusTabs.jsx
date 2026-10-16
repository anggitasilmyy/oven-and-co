// components/admin/OrderStatusTabs.jsx
// Step 4 · FR-28 · AD-03 — tab status dengan jumlah (status HANYA dari constants/orderStatus.js)

import { ORDER_STATUS_TABS } from '../../constants/orderStatus';

/**
 * @param {string} active — key tab aktif
 * @param {Record<string, number>|null} counts — jumlah per tab setelah filter
 * @param {Function} onChange — (key) → void
 */
export default function OrderStatusTabs({ active, counts, onChange }) {
  return (
    <div
      role="tablist"
      aria-label="Status pesanan"
      className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 lg:flex-wrap lg:overflow-visible [scrollbar-width:thin]"
    >
      {ORDER_STATUS_TABS.map((tab) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.key)}
            className={`shrink-0 inline-flex items-center gap-2 h-11 px-4 rounded-pill text-sm font-semibold whitespace-nowrap
                        border transition-colors active:scale-[0.98]
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ` +
              (selected
                ? 'bg-primary border-primary text-white'
                : 'bg-white border-beige text-cocoa/75 hover:text-cocoa hover:border-primary/40')}
          >
            {tab.label}
            <span
              className={`min-w-[24px] h-6 px-1.5 rounded-pill text-xs leading-6 text-center tabular-nums ` +
                (selected ? 'bg-white/20 text-white' : 'bg-beige text-cocoa')}
            >
              {counts ? counts[tab.key] : '·'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
