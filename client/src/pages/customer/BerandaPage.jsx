// pages/customer/BerandaPage.jsx
// FR-05 · UC-04 · C-05 Beranda (pelanggan & tamu)
// Step 4: sapaan, kartu poin (login), promo, kategori, Fresh from Oven Today, Best Sellers, banner Custom Cake.
// Data hanya lewat services/ (productService, promoService, loyaltyService).

import PageContainer from '../../components/layout/PageContainer';
import Toast from '../../components/ui/Toast';
import HomeGreeting from '../../components/customer/HomeGreeting';
import MemberCard from '../../components/customer/MemberCard';
import GuestJoinCard from '../../components/customer/GuestJoinCard';
import PromoCarousel from '../../components/customer/PromoCarousel';
import CategoryChips from '../../components/customer/CategoryChips';
import HomeProductSection from '../../components/customer/HomeProductSection';
import CustomCakeBanner from '../../components/customer/CustomCakeBanner';
import BestSellerRank from '../../components/customer/BestSellerRank';
import useServiceQuery from '../../hooks/useServiceQuery';
import useQuickAddToCart from '../../hooks/useQuickAddToCart';
import useAuthStore from '../../stores/useAuthStore';
import { getCategories, getFreshFromOvenToday, getBestSellers, getCustomCakeInfo } from '../../services/productService';
import { getActivePromos } from '../../services/promoService';
import { getMyLoyaltySummary } from '../../services/loyaltyService';
import { ROLES } from '../../constants/roles';
import { CUSTOMER_ROUTES } from '../../constants/routes';
import { formatNumber } from '../../utils/format';

/** Ambil kartu poin hanya untuk pelanggan login */
const noLoyalty = () => Promise.resolve(null);

export default function BerandaPage() {
  const user = useAuthStore((s) => s.user);
  const isCustomer = user?.role === ROLES.CUSTOMER;

  const loyalty = useServiceQuery(isCustomer ? getMyLoyaltySummary : noLoyalty, [user?.user_id, isCustomer]);
  const promos = useServiceQuery(getActivePromos);
  const categories = useServiceQuery(getCategories);
  const fresh = useServiceQuery(getFreshFromOvenToday);
  const bestSellers = useServiceQuery(getBestSellers);
  const customCake = useServiceQuery(getCustomCakeInfo);
  const { addProduct, toast, hideToast } = useQuickAddToCart();

  return (
    <PageContainer className="py-6 md:py-8 lg:py-10 space-y-8 lg:space-y-12">
      <div className="space-y-5 lg:space-y-6">
        <HomeGreeting user={user} />
        <div className={`grid gap-5 lg:gap-6 ${user && !isCustomer ? '' : 'lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]'}`}>
          {/* HP: kartu poin di atas promo · desktop: kolom kanan */}
          {isCustomer && (
            <div className="lg:order-2">
              <MemberCard summary={loyalty.data} loading={loyalty.loading} error={loyalty.error} onRetry={loyalty.reload} />
            </div>
          )}
          {!user && <div className="lg:order-2"><GuestJoinCard /></div>}
          <div className="min-w-0 lg:order-1">
            <PromoCarousel promos={promos.data} loading={promos.loading} error={promos.error} onRetry={promos.reload} />
          </div>
        </div>
      </div>

      <CategoryChips categories={categories.data} loading={categories.loading} error={categories.error} onRetry={categories.reload} />

      <HomeProductSection
        id="fresh-today"
        title="Fresh from Oven Today"
        subtitle="Ready hari ini dan masih tersedia — bisa diambil atau diantar hari ini."
        linkTo={CUSTOMER_ROUTES.KATALOG}
        products={fresh.data}
        loading={fresh.loading}
        error={fresh.error}
        onRetry={fresh.reload}
        emptyText="Produk ready hari ini sudah habis. Coba pre-order untuk besok."
        onAdd={addProduct}
        renderExtras={(p) => ({
          footnote: p.remaining_today <= 5 ? `Sisa ${p.remaining_today} hari ini` : null,
        })}
      />

      <HomeProductSection
        id="best-sellers"
        title="Best Sellers"
        subtitle="Paling banyak dipesan dalam 7 hari terakhir."
        linkTo={CUSTOMER_ROUTES.KATALOG}
        products={bestSellers.data}
        loading={bestSellers.loading}
        error={bestSellers.error}
        onRetry={bestSellers.reload}
        emptyText="Belum ada data penjualan."
        onAdd={addProduct}
        renderExtras={(p, i) => ({
          topRight: <BestSellerRank rank={i + 1} />,
          footnote: `${formatNumber(p.quantity_sold)} terjual minggu ini`,
        })}
      />

      <CustomCakeBanner product={customCake.data} />

      <Toast {...toast} onClose={hideToast} />
    </PageContainer>
  );
}
