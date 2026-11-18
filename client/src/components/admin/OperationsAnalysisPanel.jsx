// components/admin/OperationsAnalysisPanel.jsx
// CR-04c · FR-47 · K19 · AD-08 tab Operasional — analisis: estimasi kebutuhan bahan FR-40 hari ini apa adanya (tabel &
// teks keterangan wajib yang sama dengan tab Kebutuhan Bahan AD-07, tanpa rumus baru), dibaca pada snapshot laporan.
// Selisih standar vs aktual periode ditampilkan di bagian Pemakaian bahan.

import { Info } from 'lucide-react';
import DashboardPanel from './DashboardPanel';
import MaterialRequirementTable from './MaterialRequirementTable';
import { MATERIAL_REQUIREMENT_NOTE } from '../../constants/recipe';
import { formatDateShort } from '../../utils/format';

/** @param {{requirements: object}} props — respons FR-40 (tanggal target hari ini) */
export default function OperationsAnalysisPanel({ requirements }) {
  const dateLabel = formatDateShort(requirements.date);
  return (
    <DashboardPanel title="Analisis kebutuhan bahan" description={`Estimasi kebutuhan bahan untuk hari ini (${dateLabel}), sama dengan tab Kebutuhan Bahan di menu Stok`}>
      <div className="space-y-3">
        <p className="flex gap-2 rounded-btn bg-beige/40 p-3 text-xs text-cocoa/80"><Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{MATERIAL_REQUIREMENT_NOTE}</span></p>
        {requirements.rows.length === 0
          ? <p className="text-sm text-cocoa/70">Belum ada kebutuhan bahan yang dihitung untuk hari ini.</p>
          : <MaterialRequirementTable rows={requirements.rows} dateLabel={dateLabel} />}
        {requirements.products_without_recipe?.length > 0 && (
          <p className="text-xs text-cocoa/70">{requirements.products_without_recipe.length} produk belum punya komposisi dan tidak dihitung.</p>
        )}
      </div>
    </DashboardPanel>
  );
}
