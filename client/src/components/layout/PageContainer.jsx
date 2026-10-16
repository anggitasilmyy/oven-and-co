// components/layout/PageContainer.jsx
// Step 2.5 (PR A) · NFR-06 Responsive (CR-01)
// Kontainer halaman: lebar penuh di HP, dibatasi di tablet/desktop.

const VARIANTS = {
  // 1280 px — halaman katalog, beranda, daftar
  default: 'page-container',
  // 720 px — halaman satu kolom (form, detail sempit)
  narrow: 'w-full max-w-narrow mx-auto px-5 md:px-8',
};

/**
 * @param {'default'|'narrow'} variant
 * @param {string} as — elemen HTML pembungkus (default 'div')
 */
export default function PageContainer({
  variant = 'default',
  as: Tag = 'div',
  className = '',
  children,
  ...props
}) {
  return (
    <Tag className={`${VARIANTS[variant] ?? VARIANTS.default} ${className}`} {...props}>
      {children}
    </Tag>
  );
}
