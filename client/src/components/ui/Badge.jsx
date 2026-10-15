// components/ui/Badge.jsx
// Step 2 · Layout & Komponen Dasar

/**
 * Badge pill Oven & Co.
 *
 * @param {'ready'|'preorder'|'custom'|'error'|'neutral'|'gold'|'silver'|'platinum'} variant
 * @param {React.ReactNode} leftIcon
 */
export default function Badge({
  children,
  variant = 'neutral',
  leftIcon,
  className = '',
  ...props
}) {
  const variants = {
    ready: 'bg-sage text-cocoa',
    preorder: 'bg-peach text-cocoa',
    custom: 'bg-pink text-cocoa',
    error: 'bg-red-100 text-error',
    neutral: 'bg-beige text-cocoa',
    gold: 'bg-yellow-100 text-yellow-700',
    silver: 'bg-gray-100 text-gray-600',
    platinum: 'bg-primary/10 text-primary',
  };

  return (
    <span
      className={`badge ${variants[variant] ?? variants.neutral} ${className}`}
      {...props}
    >
      {leftIcon && <span className="shrink-0">{leftIcon}</span>}
      {children}
    </span>
  );
}
