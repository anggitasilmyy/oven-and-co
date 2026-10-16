// components/customer/CategoryTabs.jsx
// Step 5.1 · FR-06 · C-06 — tab kategori (Semua, Roti, Cake, Pastry, Cookies, Custom Cake) dengan garis bawah

/**
 * @param {Array<{category_id, name}>} categories
 * @param {number|null} value — category_id aktif (null = Semua)
 * @param {Function} onChange — (categoryId | null) → void
 */
export default function CategoryTabs({ categories = [], value, onChange }) {
  const tabs = [{ category_id: null, name: 'Semua' }, ...categories];
  return (
    <nav aria-label="Kategori produk" className="border-b border-beige">
      <ul className="flex gap-1 overflow-x-auto -mx-5 px-5 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((cat) => {
          const active = value === cat.category_id;
          return (
            <li key={cat.category_id ?? 'semua'} className="shrink-0">
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onChange(cat.category_id)}
                className={`relative h-12 px-3 md:px-4 text-sm font-semibold whitespace-nowrap rounded-t-btn transition-colors
                            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50
                            ${active ? 'text-primary' : 'text-cocoa/65 hover:text-cocoa hover:bg-beige/40'}`}
              >
                {cat.name}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-3 bottom-0 h-[3px] rounded-pill transition-colors ${active ? 'bg-primary' : 'bg-transparent'}`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
