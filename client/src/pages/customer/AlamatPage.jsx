// pages/customer/AlamatPage.jsx
// FR-24 · BR-12 · UC-16 · C-22 Alamat Tersimpan
// Step 5.5: kartu alamat (label, Utama, radius), tambah/ubah lewat form + pin peta, jadikan utama, hapus (konfirmasi).
// Alamat yang sama dipakai pilihan alamat delivery di Checkout (C-13).

import { useState } from 'react';
import { MapPin, Plus } from 'lucide-react';
import AccountLayout from '../../layouts/AccountLayout';
import PageHeader from '../../components/layout/PageHeader';
import ResponsiveGrid from '../../components/layout/ResponsiveGrid';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import Toast, { useToast } from '../../components/ui/Toast';
import AddressCard from '../../components/customer/AddressCard';
import AddressFormModal from '../../components/customer/AddressFormModal';
import useAuthStore from '../../stores/useAuthStore';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getMyAddresses, saveAddress, setPrimaryAddress, deleteAddress } from '../../services/addressService';

export default function AlamatPage() {
  const user = useAuthStore((s) => s.user);
  const query = useServiceQuery(() => getMyAddresses(), []);
  const { toast, showToast, hideToast } = useToast();
  const [editing, setEditing] = useState(null); // { address } — address null = tambah
  const [deleting, setDeleting] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const addresses = query.data?.addresses ?? [];

  const run = async (id, action, message) => {
    setBusyId(id);
    try {
      await action();
      query.reload();
      showToast('success', message);
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setBusyId(null);
    }
  };

  const submitForm = async (values) => {
    const id = editing.address?.address_id ?? null;
    await saveAddress(values, id);
    setEditing(null);
    query.reload();
    showToast('success', id ? 'Alamat berhasil diperbarui.' : 'Alamat berhasil ditambahkan.');
  };

  const confirmDelete = () => {
    const target = deleting;
    setDeleting(null);
    run(target.address_id, () => deleteAddress(target.address_id), `Alamat ${target.label} dihapus.`);
  };

  let body;
  if (query.error) {
    body = <ErrorState message={query.error.message} onRetry={query.reload} />;
  } else if (!query.data) {
    body = (
      <ResponsiveGrid cols={{ base: 1, md: 2 }} aria-busy="true" aria-label="Memuat alamat">
        {[0, 1].map((i) => <Skeleton key={i} variant="block" className="h-48 w-full rounded-card" />)}
      </ResponsiveGrid>
    );
  } else if (addresses.length === 0) {
    body = (
      <div className="card">
        <EmptyState
          icon={<MapPin size={36} aria-hidden="true" />}
          title="Belum ada alamat"
          description="Simpan alamat untuk mempercepat checkout delivery."
          actionLabel="Tambah Alamat"
          onAction={() => setEditing({ address: null })}
        />
      </div>
    );
  } else {
    body = (
      <ResponsiveGrid as="ul" cols={{ base: 1, md: 2 }} aria-label="Daftar alamat">
        {addresses.map((a) => (
          <AddressCard
            key={a.address_id}
            address={a}
            radiusKm={query.data.settings.delivery_radius_km}
            busy={busyId === a.address_id}
            onEdit={() => setEditing({ address: a })}
            onMakePrimary={() => run(a.address_id, () => setPrimaryAddress(a.address_id), `${a.label} menjadi alamat utama.`)}
            onDelete={() => setDeleting(a)}
          />
        ))}
      </ResponsiveGrid>
    );
  }

  return (
    <AccountLayout>
      <div className="space-y-5 lg:space-y-6">
        <PageHeader
          title="Alamat Tersimpan"
          actions={query.data && addresses.length > 0 && (
            <Button leftIcon={<Plus size={18} aria-hidden="true" />} onClick={() => setEditing({ address: null })}>Tambah Alamat</Button>
          )}
        />
        {body}
      </div>

      {editing && (
        <AddressFormModal
          address={editing.address}
          context={query.data}
          user={user}
          firstAddress={addresses.length === 0}
          onClose={() => setEditing(null)}
          onSubmit={submitForm}
        />
      )}
      <Modal
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        size="sm"
        title="Hapus alamat?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>Batal</Button>
            <Button variant="danger" onClick={confirmDelete}>Hapus</Button>
          </>
        }
      >
        {deleting && (
          <p>
            Alamat <strong>{deleting.label}</strong> akan dihapus dari akunmu.
            {deleting.is_primary && addresses.length > 1 && ' Alamat lain akan otomatis menjadi alamat utama.'}
            {' '}Pesanan yang sudah dibuat tidak terpengaruh.
          </p>
        )}
      </Modal>
      <Toast {...toast} onClose={hideToast} />
    </AccountLayout>
  );
}
