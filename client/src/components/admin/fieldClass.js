// components/admin/fieldClass.js
// Step 5.7 · AD-06 · AD-07 — kelas kontrol form admin (tinggi input 48 px sesuai token AGENTS.md §5)

const BASE =
  'w-full rounded-btn border bg-white px-3 text-sm text-cocoa placeholder-cocoa/40 transition ' +
  'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-beige/40 disabled:text-cocoa/60';

/**
 * @param {string} [error] — border merah bila ada error
 * @param {'input'|'textarea'} [kind]
 */
export function fieldClass(error, kind = 'input') {
  const size = kind === 'textarea' ? 'min-h-[96px] py-3 leading-relaxed' : 'h-input';
  return `${BASE} ${size} ${error ? 'border-error focus:ring-error/30' : 'border-beige'}`;
}
