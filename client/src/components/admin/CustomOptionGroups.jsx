// components/admin/CustomOptionGroups.jsx
// Step 5.7 · FR-31 · UC-23 · AD-06 — tab "Opsi Custom Cake": daftar opsi per kelompok (ukuran, bentuk, rasa,
// krim & topping) dengan harga tambahan dan status aktif. Hanya opsi aktif yang muncul di Custom Cake Builder.

import { Pencil, Plus } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Switch from '../ui/Switch';
import { CUSTOM_OPTION_GROUP_LABEL } from '../../constants/adminCatalog';
import { formatRupiah } from '../../utils/format';

/**
 * @param {Array<{group, options}>} groups
 * @param {Function} onAdd — (group) → void
 * @param {Function} onEdit — (option) → void
 * @param {Function} onToggle — (option, checked) → void
 * @param {number|null} pendingId
 */
export default function CustomOptionGroups({ groups, onAdd, onEdit, onToggle, pendingId }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
      {groups.map(({ group, options }) => {
        const label = CUSTOM_OPTION_GROUP_LABEL[group];
        const activeCount = options.filter((o) => o.is_active).length;
        return (
          <section key={group} aria-labelledby={`option-group-${group}`} className="card-admin p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 id={`option-group-${group}`} className="font-display text-lg text-cocoa">{label}</h2>
                <p className="text-xs text-cocoa/65">{activeCount} dari {options.length} opsi aktif</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => onAdd(group)} leftIcon={<Plus size={16} aria-hidden="true" />} aria-label={`Tambah opsi ${label}`}>
                Tambah
              </Button>
            </div>
            <ul className="divide-y divide-beige">
              {options.map((o) => (
                <li key={o.option_id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold ${o.is_active ? 'text-cocoa' : 'text-cocoa/55'}`}>
                      {o.name} {!o.is_active && <Badge className="ml-1 align-middle">Nonaktif</Badge>}
                    </p>
                    <p className="text-xs text-cocoa/65 tabular-nums">
                      {Number(o.extra_price) > 0 ? `+${formatRupiah(o.extra_price)}` : 'Tanpa biaya tambahan'}
                      {o.description ? ` · ${o.description}` : ''}
                    </p>
                  </div>
                  <Switch
                    checked={o.is_active}
                    disabled={pendingId === o.option_id}
                    onChange={(checked) => onToggle(o, checked)}
                    label={`${o.is_active ? 'Nonaktifkan' : 'Aktifkan'} opsi ${o.name}`}
                  />
                  <button
                    type="button"
                    onClick={() => onEdit(o)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-beige/60
                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    aria-label={`Ubah opsi ${o.name}`}
                  >
                    <Pencil size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
