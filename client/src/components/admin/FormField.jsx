// components/admin/FormField.jsx
// Step 5.7 · AD-06 · AD-07 — label + kontrol + pesan error/bantuan untuk form admin (select, textarea, input)
// Setiap input punya label (NFR-02); error ditautkan lewat aria-describedby.

import { cloneElement } from 'react';

/**
 * @param {string} id — id kontrol (wajib, untuk label)
 * @param {string} label
 * @param {string} [error]
 * @param {React.ReactNode} [hint]
 * @param {boolean} [optional] — tampilkan "(opsional)"
 * @param {React.ReactElement} children — satu elemen kontrol (input/select/textarea)
 */
export default function FormField({ id, label, error, hint, optional = false, className = '', children }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-cocoa">
        {label} {optional && <span className="font-normal text-cocoa/60">(opsional)</span>}
      </label>
      {cloneElement(children, { id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 flex items-center gap-1 text-xs text-error">
          <span aria-hidden="true">⚠</span> {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-cocoa/65">{hint}</p>
      ) : null}
    </div>
  );
}
