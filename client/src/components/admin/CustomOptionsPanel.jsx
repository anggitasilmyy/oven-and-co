// components/admin/CustomOptionsPanel.jsx
// Step 5.7 · FR-31 · BR-02 · AD-06 — tab Opsi Custom Cake: info produk dasar & lead time minimal (H-3),
// daftar opsi per kelompok, modal tambah/ubah, toggle aktif.

import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import ErrorState from '../ui/ErrorState';
import Skeleton from '../ui/Skeleton';
import CustomOptionGroups from './CustomOptionGroups';
import CustomOptionFormModal from './CustomOptionFormModal';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getAdminCustomOptions, setCustomOptionActive } from '../../services/adminProductService';
import { formatRupiah } from '../../utils/format';

/** @param {Function} onToast — (type, message) → void */
export default function CustomOptionsPanel({ onToast }) {
  const query = useServiceQuery(getAdminCustomOptions);
  const [target, setTarget] = useState(null); // { group, option|null }
  const [pendingId, setPendingId] = useState(null);

  const toggle = async (option, checked) => {
    setPendingId(option.option_id);
    try {
      await setCustomOptionActive(option.option_id, checked);
      onToast('success', `${option.name} ${checked ? 'tampil' : 'disembunyikan'} di Custom Cake Builder`);
      query.reload();
    } catch (err) {
      onToast('error', err.message);
    } finally {
      setPendingId(null);
    }
  };

  if (query.error) return <ErrorState message={query.error.message || 'Opsi custom cake gagal dimuat.'} onRetry={query.reload} />;
  if (!query.data) {
    return (
      <div className="grid gap-5 lg:grid-cols-2" aria-busy="true" aria-label="Memuat opsi custom cake">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="block" className="h-56 w-full rounded-card-admin" />)}
      </div>
    );
  }

  const { groups, custom_product: product, lead_time_days: leadTime } = query.data;
  return (
    <div className={`space-y-5 transition-opacity ${query.loading ? 'opacity-60' : ''}`} aria-busy={query.loading}>
      <div className="card-admin flex items-start gap-3 p-4">
        <CalendarClock size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <div className="text-sm text-cocoa/80">
          <p className="font-semibold text-cocoa">Lead time minimal custom cake: {leadTime} hari (H-{leadTime})</p>
          <p>
            {product
              ? `Harga = harga dasar ${product.name} ${formatRupiah(product.price)} + harga tambahan opsi terpilih. `
              : 'Belum ada produk custom cake aktif, sehingga Custom Cake Builder belum bisa dipakai pelanggan. '}
            Hanya opsi aktif yang muncul di builder; setiap kelompok wajib punya minimal satu opsi aktif.
          </p>
        </div>
      </div>

      <CustomOptionGroups
        groups={groups}
        pendingId={pendingId}
        onAdd={(group) => setTarget({ group, option: null })}
        onEdit={(option) => setTarget({ group: option.option_group, option })}
        onToggle={toggle}
      />

      {target && (
        <CustomOptionFormModal
          target={target}
          options={groups.flatMap((g) => g.options)}
          onClose={() => setTarget(null)}
          onSaved={(message) => { setTarget(null); onToast('success', message); query.reload(); }}
        />
      )}
    </div>
  );
}
