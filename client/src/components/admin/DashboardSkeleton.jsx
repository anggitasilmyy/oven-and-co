// components/admin/DashboardSkeleton.jsx
// Step 4 · AD-02 — kerangka loading dashboard

import Skeleton from '../ui/Skeleton';
import ResponsiveGrid from '../layout/ResponsiveGrid';

export default function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Memuat dashboard">
      <ResponsiveGrid cols={{ base: 2, xl: 4 }} gap="md">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="block" className="h-32 rounded-card-admin" />)}
      </ResponsiveGrid>
      <div className="grid gap-6 xl:grid-cols-3">
        <Skeleton variant="block" className="h-80 rounded-card-admin xl:col-span-2" />
        <Skeleton variant="block" className="h-80 rounded-card-admin" />
      </div>
    </div>
  );
}
