// components/ui/EmptyState.jsx
// Step 2 · Layout & Komponen Dasar
// Step 8 · F-10: prop opsional titleAs, className, children agar empty state khusus (mis. SearchEmptyState C-08)
//   memakai komponen ini alih-alih menulis ulang strukturnya. Nilai bawaan = perilaku lama.

import Button from './Button';

/**
 * Tampilan empty state — ikon + judul + deskripsi + tombol opsional.
 *
 * @param {React.ReactNode} icon — ikon besar (dari lucide-react atau emoji)
 * @param {string} title
 * @param {string} description
 * @param {string} actionLabel — label tombol CTA
 * @param {Function} onAction — handler tombol CTA
 * @param {'h2'|'h3'} titleAs — tingkat heading judul (bawaan h3)
 * @param {string} className — padding pembungkus (bawaan "py-16 px-6")
 * @param {React.ReactNode} children — konten tambahan di bawah deskripsi (mis. chip saran)
 */
export default function EmptyState({
  icon, title, description, actionLabel, onAction, titleAs: Title = 'h3', className = 'py-16 px-6', children,
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${className}`}>
      {icon && (
        <div className="w-20 h-20 rounded-full bg-beige flex items-center justify-center mb-5 text-primary/50">
          {icon}
        </div>
      )}
      {title && (
        <Title className="font-display text-xl text-cocoa mb-2">{title}</Title>
      )}
      {description && (
        <p className="font-sans text-sm text-cocoa-muted max-w-[260px] leading-relaxed">
          {description}
        </p>
      )}
      {children && <div className="mt-6">{children}</div>}
      {actionLabel && onAction && (
        <div className="mt-6">
          <Button variant="primary" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
