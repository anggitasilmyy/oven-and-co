// pages/customer/UbahProfilPage.jsx
// FR-24 · UC-16 · TF-07 · C-20 (sub) Ubah Profil — rute /akun/ubah-profil
// Step 5.5: form data profil (nama, email, HP) dan form ubah kata sandi. Sesi di useAuthStore diperbarui
// setelah profil tersimpan agar nama di header/sidebar langsung berganti.

import AccountLayout from '../../layouts/AccountLayout';
import PageHeader from '../../components/layout/PageHeader';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import Toast, { useToast } from '../../components/ui/Toast';
import ProfileForm from '../../components/customer/ProfileForm';
import ChangePasswordForm from '../../components/customer/ChangePasswordForm';
import useAuthStore from '../../stores/useAuthStore';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getMyProfile, updateMyProfile, changeMyPassword } from '../../services/accountService';

export default function UbahProfilPage() {
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);
  const profile = useServiceQuery(() => getMyProfile(), []);
  const { toast, showToast, hideToast } = useToast();

  const saveProfile = async (values) => {
    const updated = await updateMyProfile(values);
    setAuth(updated, token);
    profile.reload();
    showToast('success', 'Profil berhasil diperbarui.');
  };

  const savePassword = async (values) => {
    await changeMyPassword(values);
    showToast('success', 'Kata sandi berhasil diubah.');
  };

  let body;
  if (profile.error) {
    body = <ErrorState message={profile.error.message} onRetry={profile.reload} />;
  } else if (!profile.data) {
    body = (
      <div aria-busy="true" aria-label="Memuat profil">
        <Skeleton variant="block" className="h-80 w-full rounded-card" />
      </div>
    );
  } else {
    body = (
      <div className="grid gap-5 lg:gap-6 xl:grid-cols-2 xl:items-start">
        {/* key: form diisi ulang dari data terbaru setelah tersimpan */}
        <ProfileForm key={JSON.stringify(profile.data)} initial={profile.data} onSubmit={saveProfile} />
        <ChangePasswordForm onSubmit={savePassword} />
      </div>
    );
  }

  return (
    <AccountLayout>
      <div className="space-y-5 lg:space-y-6">
        <PageHeader title="Ubah Profil" description="Perbarui data diri dan kata sandi akunmu." />
        {body}
      </div>
      <Toast {...toast} onClose={hideToast} />
    </AccountLayout>
  );
}
