// components/ui/Tabs.jsx
// Step 5.5 · Tab bergaris bawah (gaya sama dengan OrderHistoryTabs C-17) untuk daftar tab apa pun.
// Panel pasangan memakai id `panel-<key>` dan aria-labelledby `tab-<key>`.

/**
 * @param {Array<{key, label}>} tabs
 * @param {string} value — key tab aktif
 * @param {Function} onChange — (key) → void
 * @param {string} label — aria-label tablist
 */
export default function Tabs({ tabs, value, onChange, label, className = '' }) {
  return (
    <div role="tablist" aria-label={label} className={`flex border-b border-beige ${className}`}>
      {tabs.map((tab) => {
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
