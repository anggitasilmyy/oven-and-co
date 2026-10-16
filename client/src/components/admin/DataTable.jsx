// components/admin/DataTable.jsx
// Step 4 · Tabel admin generik, dibungkus TableScroll agar tidak membuat halaman scroll horizontal

import TableScroll from '../layout/TableScroll';

/**
 * @param {Array<{key, header, render?: Function, align?: 'left'|'right'|'center', className?, visibility?}>} columns
 *   visibility — kelas tampil responsif untuk th & td, mis. 'hidden xl:table-cell'
 * @param {Array} rows
 * @param {Function} rowKey — (row) → key unik
 * @param {string} label — nama tabel untuk pembaca layar
 * @param {string} [minWidth] — lebar minimum tabel, mis. 'min-w-[880px]'
 */
export default function DataTable({ columns, rows, rowKey, label, minWidth = 'min-w-[720px]', className = '' }) {
  const alignClass = (align) => (align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left');

  return (
    <TableScroll label={label} minWidth={minWidth} className={className}>
      <table className="w-full text-sm">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr className="border-b border-beige">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-2 py-3 text-xs font-semibold uppercase tracking-wide text-cocoa/70 whitespace-nowrap ${alignClass(col.align)} ${col.visibility ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-beige/70 last:border-0 hover:bg-cream/70 transition-colors">
              {columns.map((col) => (
                <td key={col.key} className={`px-2 py-3 align-middle text-cocoa ${alignClass(col.align)} ${col.className ?? ''} ${col.visibility ?? ''}`}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
