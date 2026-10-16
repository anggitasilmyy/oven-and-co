// components/ui/Chip.jsx
// Step 5.1 · Chip pilihan (pill) untuk filter, varian, dan saran pencarian — area sentuh ≥ 44 px

/**
 * @param {boolean} selected — state terpilih (aria-pressed); abaikan untuk chip aksi biasa
 * @param {'default'|'compact'} size
 */
export default function Chip({ selected, size = 'default', leftIcon, className = '', children, ...props }) {
  const isToggle = selected !== undefined;
  return (
    <button
      type="button"
      aria-pressed={isToggle ? Boolean(selected) : undefined}
      className={[
        'inline-flex items-center justify-center gap-1.5 rounded-pill border font-semibold whitespace-nowrap shrink-0',
        'transition-colors duration-150 active:scale-[0.97] min-h-touch-min',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        'disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100',
        size === 'compact' ? 'px-3.5 text-[13px]' : 'px-4 text-sm',
        selected
          ? 'bg-primary border-primary text-white'
          : 'bg-surface border-beige text-cocoa hover:border-primary/40 hover:bg-beige/50',
        className,
      ].join(' ')}
      {...props}
    >
      {leftIcon}
      {children}
    </button>
  );
}
