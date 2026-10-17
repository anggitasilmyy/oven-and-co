// pages/admin/PengaturanPage.jsx
// FR-36 · UC-30 · A-11 · BR-05 · BR-12 · AD-11 Pengaturan (Owner)
// Step 5.8: profil toko (nama, alamat, WhatsApp), batas pre-order, radius & tarif ongkir, jam operasional per hari,
// sakelar metode bayar, akun staf. PRD tidak memiliki profil pribadi admin — kebutuhan itu dipenuhi halaman ini.

import PageHeader from '../../components/layout/PageHeader';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import Toast, { useToast } from '../../components/ui/Toast';
import StoreProfileForm from '../../components/admin/StoreProfileForm';
import OperatingHoursForm from '../../components/admin/OperatingHoursForm';
import PaymentMethodSettings from '../../components/admin/PaymentMethodSettings';
import AdminAccountsPanel from '../../components/admin/AdminAccountsPanel';
import useServiceQuery from '../../hooks/useServiceQuery';
import useAuthStore from '../../stores/useAuthStore';
import { getStoreSettings, getAdminAccounts } from '../../services/settingsService';

export default function PengaturanPage() {
  const settings = useServiceQuery(getStoreSettings);
  const accounts = useServiceQuery(getAdminAccounts);
  const currentUserId = useAuthStore((s) => s.user?.user_id);
  const { toast, showToast, hideToast } = useToast();
  const savedSettings = (message) => { showToast('success', message); settings.reload(); };
  const changedSettings = (type, message) => { showToast(type, message); settings.reload(); };
  const changedAccounts = (type, message) => { showToast(type, message); accounts.reload(); };
  const error = settings.error ?? accounts.error;

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader
        screenCode="AD-11"
        title="Pengaturan"
        description="Atur profil toko, jam operasional, batas pre-order, ongkir, metode bayar, dan akun staf. Perubahan langsung berlaku di web pelanggan."
      />
      {error && <ErrorState message={error.message || 'Pengaturan gagal dimuat.'} onRetry={() => { settings.reload(); accounts.reload(); }} />}
      {!settings.data && !error && (
        <div className="grid gap-6 xl:grid-cols-2" aria-busy="true" aria-label="Memuat pengaturan">
          <Skeleton variant="block" className="h-96 w-full" />
          <Skeleton variant="block" className="h-96 w-full" />
        </div>
      )}
      {settings.data && (
        <>
          <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
            <StoreProfileForm key={JSON.stringify(settings.data.profile)} profile={settings.data.profile} onSaved={savedSettings} />
            <OperatingHoursForm key={JSON.stringify(settings.data.hours)} hours={settings.data.hours} onSaved={savedSettings} />
          </div>
          <PaymentMethodSettings methods={settings.data.paymentMethods} onChanged={changedSettings} />
        </>
      )}
      {accounts.data && <AdminAccountsPanel accounts={accounts.data} currentUserId={currentUserId} onChanged={changedAccounts} />}
      <Toast {...toast} onClose={hideToast} />
    </div>
  );
}
