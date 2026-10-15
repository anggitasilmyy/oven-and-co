// components/ui/Card.jsx
// Step 2 · Layout & Komponen Dasar

/**
 * Card container reusable Oven & Co.
 * Radius 20px, bg surface, border beige.
 *
 * @param {boolean} hoverable — tambah efek hover ringan
 * @param {boolean} clickable — kursor pointer
 * @param {string} padding — override padding (default: 'p-4')
 */
export default function Card({
  children,
  hoverable = false,
  clickable = false,
  padding = 'p-4',
  className = '',
  ...props
}) {
  return (
    <div
      className={[
        'card',
        padding,
        hoverable ? 'hover:shadow-md hover:-translate-y-0.5 transition-all duration-150' : '',
        clickable ? 'cursor-pointer' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}
