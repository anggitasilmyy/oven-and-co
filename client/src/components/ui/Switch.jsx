// components/ui/Switch.jsx
// Step 5.7 · AD-06 — sakelar aktif/nonaktif (role="switch"); area sentuh 44 × 44 px (NFR-02)

/**
 * @param {boolean} checked
 * @param {Function} onChange — (checked) → void
 * @param {string} label — nama aksesibel, mis. "Aktifkan Classic Butter Croissant"
 * @param {boolean} [showLabel] — tampilkan label di sebelah kanan sakelar
 * @param {boolean} [disabled]
 */
export default function Switch({ checked, onChange, label, showLabel = false, disabled = false, id, className = '' }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={showLabel ? undefined : label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`group inline-flex min-h-touch-min min-w-touch-min items-center gap-3 rounded-btn text-sm font-semibold text-cocoa
                  disabled:cursor-not-allowed disabled:opacity-50
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${className}`}
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill transition-colors
                    ${checked ? 'bg-primary' : 'bg-cocoa/25'}`}
      >
        <span
          className={`absolute left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </span>
      {showLabel && <span>{label}</span>}
    </button>
  );
}
