// components/ui/Button.jsx
// Step 2 · Layout & Komponen Dasar

/**
 * Tombol reusable Oven & Co.
 *
 * @param {'primary'|'secondary'|'ghost'|'danger'} variant
 * @param {'sm'|'md'|'lg'} size
 * @param {boolean} fullWidth
 * @param {boolean} loading — tampilkan spinner, nonaktifkan klik
 * @param {React.ReactNode} leftIcon
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  leftIcon,
  className = '',
  disabled,
  ...props
}) {
  const base =
    'inline-flex items-center justify-center gap-2 font-sans font-semibold ' +
    'rounded-btn transition-all duration-150 focus:outline-none focus-visible:ring-2 ' +
    'focus-visible:ring-primary/50 active:scale-[0.98] select-none';

  const variants = {
    primary:
      'bg-primary text-white hover:bg-cocoa disabled:bg-primary/40 disabled:cursor-not-allowed',
    secondary:
      'bg-beige text-cocoa border border-primary/20 hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed',
    ghost:
      'bg-transparent text-primary hover:bg-primary/8 disabled:opacity-50 disabled:cursor-not-allowed',
    danger:
      'bg-error text-white hover:bg-red-700 disabled:bg-error/40 disabled:cursor-not-allowed',
  };

  // Tinggi tombol sesuai spec: 52px (md), 44px (sm), 56px (lg)
  const sizes = {
    sm: 'h-[44px] px-4 text-sm',
    md: 'h-[52px] px-6 text-base',
    lg: 'h-[56px] px-8 text-base',
  };

  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${widthClass} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        leftIcon
      )}
      {children}
    </button>
  );
}
