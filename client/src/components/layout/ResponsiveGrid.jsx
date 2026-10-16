// components/layout/ResponsiveGrid.jsx
// Step 2.5 (PR A) · NFR-06 Responsive (CR-01)
// Grid dengan jumlah kolom per breakpoint. Nama kelas ditulis utuh agar terbaca Tailwind JIT.

const COLS = {
  base: { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' },
  sm: { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' },
  md: { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' },
  lg: { 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' },
  xl: { 2: 'xl:grid-cols-2', 3: 'xl:grid-cols-3', 4: 'xl:grid-cols-4', 5: 'xl:grid-cols-5', 6: 'xl:grid-cols-6' },
};

// Jarak mengikuti grid 8 px
const GAPS = {
  sm: 'gap-3 md:gap-4',
  md: 'gap-4 md:gap-5 lg:gap-6',
  lg: 'gap-5 md:gap-6 lg:gap-8',
};

/**
 * @param {{base?, sm?, md?, lg?, xl?}} cols — contoh { base: 2, md: 3, lg: 4 }
 * @param {'sm'|'md'|'lg'} gap
 */
export default function ResponsiveGrid({
  cols = { base: 1, md: 2, lg: 3 },
  gap = 'md',
  as: Tag = 'div',
  className = '',
  children,
  ...props
}) {
  const colClasses = Object.entries(cols)
    .map(([bp, n]) => COLS[bp]?.[n])
    .filter(Boolean)
    .join(' ');

  return (
    <Tag className={`grid ${colClasses} ${GAPS[gap] ?? GAPS.md} ${className}`} {...props}>
      {children}
    </Tag>
  );
}
