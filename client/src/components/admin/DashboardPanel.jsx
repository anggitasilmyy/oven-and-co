// components/admin/DashboardPanel.jsx
// Step 4 · AD-02 — kartu panel admin (putih, radius 16 px) dengan judul & tautan aksi

import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

/**
 * @param {string} title
 * @param {string} [description]
 * @param {{to: string, label: string}} [action] — tautan di kanan judul
 */
export default function DashboardPanel({ title, description, action, className = '', children }) {
  return (
    <section className={`card-admin p-4 md:p-6 flex flex-col gap-4 min-w-0 ${className}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-sans text-base font-bold text-cocoa">{title}</h2>
          {description && <p className="text-xs text-cocoa/70 mt-0.5">{description}</p>}
        </div>
        {action && (
          <Link
            to={action.to}
            className="shrink-0 inline-flex items-center gap-0.5 min-h-touch-min -my-2 px-2 -mr-2 rounded-lg text-sm font-semibold
                       text-primary hover:bg-beige/60 hover:text-cocoa focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {action.label}
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}
