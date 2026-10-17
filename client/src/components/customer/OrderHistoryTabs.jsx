// components/customer/OrderHistoryTabs.jsx
// Step 5.4 · FR-19 · C-17 — tab Aktif / Selesai dengan jumlah pesanan (gaya garis bawah seperti CategoryTabs)

import { ORDER_HISTORY_TABS } from '../../constants/orderHistory';

/**
 * @param {string} value — key tab aktif
 * @param {Record<string, number>} counts — jumlah pesanan per tab
 * @param {Function} onChange — (key) → void
 */
export default function OrderHistoryTabs({ value, counts = {}, onChange }) {
  return (
    <div role="tablist" aria-label="Status pesanan" className="flex border-b border-beige">
      {ORDER_HISTORY_TABS.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`tab-${tab.key}`}
            aria-selected={active}
            aria-controls={`panel-${tab.key}`}
            onClick={() => onChange(tab.key)}
            className={`relative flex-1 md:flex-none h-12 px-4 md:px-6 text-sm font-semibold whitespace-nowrap rounded-t-btn transition-colors
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50
                        ${active ? 'text-primary' : 'text-cocoa/65 hover:text-cocoa hover:bg-beige/40'}`}
          >
            {tab.label}
            {counts[tab.key] != null && <span className="tabular-nums"> ({counts[tab.key]})</span>}
            <span
              aria-hidden="true"
              className={`absolute inset-x-3 bottom-0 h-[3px] rounded-pill transition-colors ${active ? 'bg-primary' : 'bg-transparent'}`}
            />
          </button>
        );
      })}
    </div>
  );
}
