// components/admin/AdminAccountsPanel.jsx
// Step 5.8 · FR-36 · FR-26 · UC-30 · AD-11 — tabel akun admin (nama, email, HP, peran, status) + tambah akun,
// nonaktifkan (dengan konfirmasi) / aktifkan kembali. Akun nonaktif tidak bisa masuk (AD-01).
// Akun yang sedang dipakai tidak bisa dinonaktifkan dan minimal satu Owner tetap aktif (rules/settings.js).

import { useState } from 'react';
import { Plus, UserCheck, UserX } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import DataTable from './DataTable';
import ConfirmActionModal from './ConfirmActionModal';
import AdminAccountFormModal from './AdminAccountFormModal';
import { setAdminAccountStatus } from '../../services/settingsService';
import { ROLES, ROLE_LABEL } from '../../constants/roles';

const actionClass =
  'inline-flex h-11 min-w-touch-min items-center justify-center gap-1.5 rounded-lg border border-beige px-3 text-xs font-semibold ' +
  'text-primary hover:bg-beige/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50';

/**
 * @param {Array} accounts — getAdminAccounts()
 * @param {number} currentUserId — Owner yang sedang masuk
 * @param {Function} onChanged — (type, message) → void
 */
export default function AdminAccountsPanel({ accounts, currentUserId, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [deactivating, setDeactivating] = useState(null);
  const [pendingId, setPendingId] = useState(null);

  const activate = async (a) => {
    setPendingId(a.user_id);
    try {
      await setAdminAccountStatus(a.user_id, true);
      onChanged('success', `Akun ${a.name} aktif kembali`);
    } catch (err) {
      onChanged('error', err.message);
    } finally {
      setPendingId(null);
    }
  };
  const deactivate = async () => {
    await setAdminAccountStatus(deactivating.user_id, false);
    onChanged('success', `Akun ${deactivating.name} dinonaktifkan`);
    setDeactivating(null);
  };

  const role = (a) => <Badge variant={a.role === ROLES.OWNER ? 'platinum' : 'neutral'}>{ROLE_LABEL[a.role]}</Badge>;
  const status = (a) => <Badge variant={a.is_active ? 'ready' : 'error'}>{a.is_active ? 'Aktif' : 'Nonaktif'}</Badge>;
  const action = (a) => {
    if (a.user_id === currentUserId) return <span className="text-xs text-cocoa/65">Akun Anda</span>;
    return a.is_active ? (
      <button type="button" className={actionClass} disabled={pendingId != null} onClick={() => setDeactivating(a)} aria-label={`Nonaktifkan akun ${a.name}`}>
        <UserX size={14} aria-hidden="true" /> Nonaktifkan
      </button>
    ) : (
      <button type="button" className={actionClass} disabled={pendingId != null} onClick={() => activate(a)} aria-label={`Aktifkan akun ${a.name}`}>
        <UserCheck size={14} aria-hidden="true" /> Aktifkan
      </button>
    );
  };
  const columns = [
    { key: 'name', header: 'Nama', className: 'font-semibold min-w-[160px]' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'No. HP', className: 'whitespace-nowrap tabular-nums' },
    { key: 'role', header: 'Peran', render: role },
    { key: 'status', header: 'Status', render: status },
    { key: 'action', header: 'Aksi', align: 'right', render: action },
  ];

  return (
    <section className="card-admin space-y-4 p-4 md:p-6" aria-labelledby="accounts-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="accounts-title" className="text-base font-bold text-cocoa">Akun staf</h2>
          <p className="text-xs text-cocoa/70">Staf mengelola pesanan, kalender, produk, stok, serta pelanggan & ulasan.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)} leftIcon={<Plus size={16} aria-hidden="true" />}>Tambah Akun</Button>
      </div>
      <ul className="space-y-3 md:hidden" aria-label="Daftar akun admin">
        {accounts.map((a) => (
          <li key={a.user_id} className="rounded-xl border border-beige p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="font-semibold text-cocoa">{a.name}</p><p className="truncate text-xs text-cocoa/70">{a.email} · {a.phone}</p></div>
              <div className="flex shrink-0 flex-col items-end gap-1">{role(a)}{status(a)}</div>
            </div>
            <div className="mt-2 flex justify-end border-t border-beige pt-2">{action(a)}</div>
          </li>
        ))}
      </ul>
      <DataTable className="hidden md:block" label="Daftar akun admin" columns={columns} rows={accounts} rowKey={(a) => a.user_id} minWidth="min-w-[760px]" />

      {adding && (
        <AdminAccountFormModal users={accounts} onClose={() => setAdding(false)} onSaved={(m) => { setAdding(false); onChanged('success', m); }} />
      )}
      {deactivating && (
        <ConfirmActionModal title="Nonaktifkan akun?" confirmLabel="Nonaktifkan" onConfirm={deactivate} onClose={() => setDeactivating(null)}>
          <p><strong>{deactivating.name}</strong> ({ROLE_LABEL[deactivating.role]}) tidak akan bisa masuk ke Admin Panel.</p>
          <p>Riwayat pesanan yang pernah diproses akun ini tetap tersimpan. Akun bisa diaktifkan kembali kapan saja.</p>
        </ConfirmActionModal>
      )}
    </section>
  );
}
