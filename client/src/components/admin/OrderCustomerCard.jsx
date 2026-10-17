// components/admin/OrderCustomerCard.jsx
// Step 5.6 · FR-28 · AD-04 — kartu pelanggan pemilik pesanan

import { Mail, Phone, User } from 'lucide-react';

/** @param {{name, email, phone}} customer */
export default function OrderCustomerCard({ customer }) {
  const rows = [
    { Icon: User, label: 'Nama', value: customer.name },
    { Icon: Phone, label: 'No. HP', value: customer.phone },
    { Icon: Mail, label: 'Email', value: customer.email },
  ];
  return (
    <section aria-labelledby="admin-customer-title" className="card-admin p-5 md:p-6">
      <h2 id="admin-customer-title" className="font-display text-lg text-cocoa mb-3">Pelanggan</h2>
      <dl className="space-y-2.5 text-sm">
        {rows.map(({ Icon, label, value }) => (
          <div key={label} className="flex items-start gap-3">
            <Icon size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <dt className="sr-only">{label}</dt>
            <dd className="min-w-0 break-words text-cocoa">{value ?? '-'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
