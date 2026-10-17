// components/admin/ReportExportButtons.jsx
// Step 5.8 · FR-33 · UC-28 · AD-08 — tombol "Export Excel" & "Export PDF" dengan status memuat & toast

import { useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import Button from '../ui/Button';
import { exportReportExcel, exportReportPdf } from '../../utils/reportExport';
import { REPORT_EXPORT } from '../../constants/report';

/**
 * @param {object|null} report — data laporan aktif (null = belum dimuat)
 * @param {string} storeName
 * @param {Function} onToast — (type, message) → void
 */
export default function ReportExportButtons({ report, storeName, onToast }) {
  const [busy, setBusy] = useState(null);
  const run = async (kind) => {
    setBusy(kind);
    try {
      await (kind === REPORT_EXPORT.EXCEL ? exportReportExcel : exportReportPdf)(report, storeName);
      onToast('success', `Laporan ${kind === REPORT_EXPORT.EXCEL ? 'Excel' : 'PDF'} diunduh`);
    } catch {
      onToast('error', 'Ekspor gagal. Coba lagi.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" disabled={!report || busy != null} loading={busy === REPORT_EXPORT.EXCEL}
        onClick={() => run(REPORT_EXPORT.EXCEL)} leftIcon={<FileSpreadsheet size={16} aria-hidden="true" />}>
        Export Excel
      </Button>
      <Button variant="secondary" size="sm" disabled={!report || busy != null} loading={busy === REPORT_EXPORT.PDF}
        onClick={() => run(REPORT_EXPORT.PDF)} leftIcon={<FileText size={16} aria-hidden="true" />}>
        Export PDF
      </Button>
    </div>
  );
}
