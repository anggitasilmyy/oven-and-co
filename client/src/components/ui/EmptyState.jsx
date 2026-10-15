// components/ui/EmptyState.jsx
// Step 2 · Layout & Komponen Dasar

import Button from './Button';

/**
 * Tampilan empty state — ikon + judul + deskripsi + tombol opsional.
 *
 * @param {React.ReactNode} icon — ikon besar (dari lucide-react atau emoji)
 * @param {string} title
 * @param {string} description
 * @param {string} actionLabel — label tombol CTA
 * @param {Function} onAction — handler tombol CTA
 */
export default function EmptyState({ icon, title, description, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {icon && (
        <div className="w-20 h-20 rounded-full bg-beige flex items-center justify-center mb-5 text-primary/50">
          {icon}
        </div>
      )}
      {title && (
        <h3 className="font-display text-xl text-cocoa mb-2">{title}</h3>
      )}
      {description && (
        <p className="font-sans text-sm text-cocoa/60 max-w-[260px] leading-relaxed">
          {description}
        </p>
      )}
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
