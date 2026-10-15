// components/ui/Input.jsx
// Step 2 · Layout & Komponen Dasar

/**
 * Input field reusable Oven & Co.
 *
 * @param {string} label — label di atas input (wajib untuk aksesibilitas)
 * @param {string} error — pesan error di bawah input
 * @param {string} hint  — teks bantuan di bawah input (bila tidak ada error)
 * @param {React.ReactNode} leftIcon
 * @param {React.ReactNode} rightIcon
 */
export default function Input({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  id,
  className = '',
  ...props
}) {
  // Buat id unik bila tidak diberikan
  const inputId = id ?? `input-${label?.toLowerCase().replace(/\s+/g, '-') ?? 'field'}`;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-semibold text-cocoa mb-1.5"
        >
          {label}
        </label>
      )}

      <div className="relative">
        {leftIcon && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-cocoa/40 pointer-events-none">
            {leftIcon}
          </span>
        )}

        <input
          id={inputId}
          className={[
            'input w-full',
            leftIcon ? 'pl-10' : '',
            rightIcon ? 'pr-10' : '',
            error ? 'border-error focus:ring-error/30' : '',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          aria-invalid={!!error}
          {...props}
        />

        {rightIcon && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-cocoa/40">
            {rightIcon}
          </span>
        )}
      </div>

      {error && (
        <p id={`${inputId}-error`} className="mt-1.5 text-xs text-error flex items-center gap-1">
          <span className="shrink-0">⚠</span> {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-cocoa/50">
          {hint}
        </p>
      )}
    </div>
  );
}
