// components/admin/OperationsPurchaseTables.jsx
// CR-04c · FR-47 · BR-22 · AD-08 tab Operasional — pembelian dipesan (`ordered_at`), penerimaan bersih (mutasi penerimaan/
// pembalik/koreksi, `created_at`), sisa dibatalkan (`cancelled_at`, historis): baris per supplier × bahan + total nilai.
// Nilai pembelian = informasi, bukan pembukuan (§6). Angka = respons API apa adanya.

import DashboardPanel from './DashboardPanel';
import DataTable from './DataTable';
import { formatNumber, formatRupiahExact as formatRupiah } from '../../utils/format'; // AC-47.4: 2 desimal = ekspor

const SECTIONS = [
  { key: 'ordered', title: 'Pembelian dipesan', description: 'PO yang dipesan pada periode ini', qty: 'Dipesan' },
  { key: 'received', title: 'Penerimaan', description: 'Penerimaan bersih (termasuk pembalik & koreksi) yang dicatat pada periode ini', qty: 'Diterima bersih' },
  { key: 'cancelled', title: 'Sisa dibatalkan', description: 'Sisa PO yang dibatalkan pada periode ini', qty: 'Dibatalkan' },
];

/** @param {{purchases: {ordered, received, cancelled}}} props */
export default function OperationsPurchaseTables({ purchases }) {
  return (
    <div className="grid gap-6">
      {SECTIONS.map((s) => {
        const section = purchases[s.key];
        const columns = [
          { key: 'supplier_name', header: 'Supplier', className: 'min-w-[120px]' },
          { key: 'name', header: 'Bahan', className: 'font-semibold min-w-[120px]' },
          { key: 'qty', header: s.qty, align: 'right', render: (r) => <span className="whitespace-nowrap tabular-nums">{formatNumber(r.qty)} {r.unit}</span> },
          { key: 'value', header: 'Nilai', align: 'right', render: (r) => <span className="whitespace-nowrap tabular-nums">{formatRupiah(r.value)}</span> },
        ];
        return (
          <DashboardPanel key={s.key} title={s.title} description={s.description}>
            <p className="mb-3 text-sm text-cocoa">Total nilai <span className="font-semibold tabular-nums">{formatRupiah(section.total_value)}</span></p>
            {section.rows.length === 0
              ? <p className="text-sm text-cocoa/70">Belum ada data pada periode ini.</p>
              : <DataTable label={s.title} columns={columns} rows={section.rows} rowKey={(r) => `${r.supplier_id}-${r.material_id}`} minWidth="min-w-[440px]" />}
          </DashboardPanel>
        );
      })}
    </div>
  );
}
