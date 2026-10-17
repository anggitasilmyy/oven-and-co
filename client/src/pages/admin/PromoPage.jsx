// pages/admin/PromoPage.jsx
// FR-34 · UC-29 · A-09 · BR-09 · BR-10 · AD-09 Promo & Loyalty (Owner)
// Step 5.8: tab Voucher (tabel + form buat/ubah, toggle aktif) dan tab Aturan Loyalty (aturan poin & ambang level).
// Tab disimpan di URL (?tab=loyalty).

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Tabs from '../../components/ui/Tabs';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import Toast, { useToast } from '../../components/ui/Toast';
import VoucherListPanel from '../../components/admin/VoucherListPanel';
import VoucherFormModal from '../../components/admin/VoucherFormModal';
import LoyaltyRulesForm from '../../components/admin/LoyaltyRulesForm';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getAdminVouchers, getLoyaltyRules } from '../../services/adminPromoService';
import { PROMO_TAB, PROMO_TABS, ADMIN_VOUCHER_STATUS } from '../../constants/adminPromo';

export default function PromoPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === PROMO_TAB.LOYALTY ? PROMO_TAB.LOYALTY : PROMO_TAB.VOUCHER;
  const vouchers = useServiceQuery(getAdminVouchers);
  const rules = useServiceQuery(getLoyaltyRules);
  const { toast, showToast, hideToast } = useToast();
  // null = tertutup · { voucher: null } = buat · { voucher } = ubah
  const [editing, setEditing] = useState(null);
  const query = tab === PROMO_TAB.VOUCHER ? vouchers : rules;

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader
        screenCode="AD-09"
        title="Promo & Loyalty"
        description="Kelola voucher promo serta aturan poin dan level member pelanggan."
        actions={tab === PROMO_TAB.VOUCHER && (
          <Button size="sm" onClick={() => setEditing({ voucher: null })} disabled={!vouchers.data} leftIcon={<Plus size={16} aria-hidden="true" />}>
            Buat Voucher
          </Button>
        )}
      />

      <Tabs tabs={PROMO_TABS} value={tab} onChange={(key) => setParams(key === PROMO_TAB.VOUCHER ? {} : { tab: key })} label="Bagian promo" />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-4">
        {query.error && <ErrorState message={query.error.message || 'Data gagal dimuat.'} onRetry={query.reload} />}
        {!query.data && !query.error && (
          <div className="card-admin space-y-3 p-4" aria-busy="true" aria-label="Memuat data promo">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} variant="block" className="h-14 w-full" />)}
          </div>
        )}
        {tab === PROMO_TAB.VOUCHER && vouchers.data && (
          <div className={`space-y-4 transition-opacity ${vouchers.loading ? 'opacity-60' : ''}`}>
            <p className="text-sm text-cocoa/70">
              {vouchers.data.rows.length} voucher · {vouchers.data.rows.filter((v) => v.status === ADMIN_VOUCHER_STATUS.AKTIF.key).length} aktif hari ini
            </p>
            <VoucherListPanel
              rows={vouchers.data.rows}
              onEdit={(voucher) => setEditing({ voucher })}
              onChanged={(type, message) => { showToast(type, message); vouchers.reload(); }}
            />
          </div>
        )}
        {tab === PROMO_TAB.LOYALTY && rules.data && (
          <LoyaltyRulesForm key={JSON.stringify(rules.data)} rules={rules.data} onSaved={(message) => { showToast('success', message); rules.reload(); }} />
        )}
      </div>

      {editing && vouchers.data && (
        <VoucherFormModal
          voucher={editing.voucher}
          board={vouchers.data}
          onClose={() => setEditing(null)}
          onSaved={(message) => { showToast('success', message); setEditing(null); vouchers.reload(); }}
        />
      )}
      <Toast {...toast} onClose={hideToast} />
    </div>
  );
}
