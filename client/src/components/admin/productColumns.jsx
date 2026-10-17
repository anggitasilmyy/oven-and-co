// components/admin/productColumns.jsx
// Step 5.7 · FR-30 · AD-06 — kolom tabel produk (UI/UX Spec Batch 7): foto, nama, kategori, tipe, harga,
// stok hari ini, rating, toggle aktif, aksi ubah. Dipakai DataTable (≥ md) dan ProductCardList (< md).

import Switch from '../ui/Switch';
import ProductImage from '../ui/ProductImage';
import ProductTypeBadge from './ProductTypeBadge';
import ProductRating from './ProductRating';
import ProductEditButton from './ProductEditButton';
import { AVAILABILITY_TYPE } from '../../constants/product';
import { formatRupiah, formatNumber } from '../../utils/format';

/** Stok hari ini hanya untuk produk ready (sisa = rencana − terjual); tipe lain tidak memakai stok harian */
export function stockTodayText(row) {
  if (row.availability_type !== AVAILABILITY_TYPE.READY) return '—';
  if (!row.has_stock_today) return 'Belum diisi';
  return row.remaining_today > 0 ? `${formatNumber(row.remaining_today)} tersisa` : 'Habis';
}

/**
 * @param {{onToggle: Function, onEdit: Function, pendingId: number|null}} handlers
 * @returns {Array} kolom DataTable
 */
export function buildProductColumns({ onToggle, onEdit, pendingId }) {
  return [
    {
      key: 'image', header: 'Foto',
      render: (r) => <ProductImage src={r.image_url} alt="" sizes="56px" className="h-12 w-14 rounded-lg object-cover" />,
    },
    {
      key: 'name', header: 'Produk', className: 'min-w-[180px]',
      render: (r) => (
        <>
          <span className={`font-semibold ${r.is_active ? '' : 'text-cocoa/60'}`}>{r.name}</span>
          <span className="block text-xs text-cocoa/60">{r.photo_count} foto{r.is_active ? '' : ' · Nonaktif'}</span>
        </>
      ),
    },
    { key: 'category_name', header: 'Kategori', className: 'whitespace-nowrap' },
    { key: 'type', header: 'Tipe', render: (r) => <ProductTypeBadge row={r} /> },
    { key: 'price', header: 'Harga', align: 'right', className: 'whitespace-nowrap font-semibold', render: (r) => formatRupiah(r.price) },
    { key: 'stock', header: 'Stok hari ini', className: 'whitespace-nowrap', render: stockTodayText },
    { key: 'rating', header: 'Rating', render: (r) => <ProductRating rating={r.rating} /> },
    {
      key: 'active', header: 'Aktif', align: 'center',
      render: (r) => (
        <Switch
          checked={r.is_active}
          disabled={pendingId === r.product_id}
          onChange={(checked) => onToggle(r, checked)}
          label={`${r.is_active ? 'Nonaktifkan' : 'Aktifkan'} ${r.name}`}
        />
      ),
    },
    { key: 'action', header: 'Aksi', align: 'right', render: (r) => <ProductEditButton row={r} onEdit={onEdit} /> },
  ];
}
