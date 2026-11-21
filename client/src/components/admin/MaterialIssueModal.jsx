// components/admin/MaterialIssueModal.jsx
// CR-04b · FR-46 · UC-37 · BR-26, BR-29, BR-30, BR-36 · AD-13 — "Catat pengeluaran" (WO Diproses; stok bahan berkurang,
// boleh menjadi minus — BR-36) dan "Koreksi pengeluaran" (isi pengganti dokumen asal + alasan wajib; dokumen asal tetap
// tersimpan). Validasi = aturan murni server (validateIssueLines); request_id per percobaan simpan.

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FormError from '../ui/FormError';
import FormField from './FormField';
import IssueLinesEditor from './IssueLinesEditor';
import { fieldClass } from './fieldClass';
import { validateIssueLines } from '../../utils/rules/workOrder';
import { reasonError } from '../../utils/rules/purchasing';
import { issueMaterials, reverseOrCorrectIssue } from '../../services/workOrderService';
import useRequestId from '../../hooks/useRequestId';

const text = (v) => String(v ?? '').trim().replace(',', '.');

/**
 * @param {object} order — detail WO
 * @param {object|null} issue — dokumen asal (koreksi) atau null (pengeluaran baru)
 * @param {Array} materials — bahan master
 * @param {Function} onClose
 * @param {Function} onSaved — (message) → void
 */
export default function MaterialIssueModal({ order, issue, materials, onClose, onSaved }) {
  const correcting = Boolean(issue);
  const [rows, setRows] = useState(issue ? issue.lines.map((l, i) => ({ key: `iss-o${i}`, material_id: l.material_id, qty: String(l.qty) })) : [{ key: 'iss-o0', material_id: '', qty: '' }]);
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { requestId, renew } = useRequestId();
  const lines = rows.map((r) => ({ material_id: r.material_id, qty: text(r.qty) }));
  const checked = validateIssueLines(new Set(materials.map((m) => String(m.material_id))), lines);
  const errors = { ...(checked.errors ?? {}), ...(correcting && reasonError(reason) ? { reason: reasonError(reason) } : {}) };
  const all = { ...errors, ...serverErrors };
  const errorOf = (k) => (submitted || serverErrors[k] ? all[k] : undefined);
  const touch = () => { setServerErrors({}); setError(''); renew(); };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      if (correcting) await reverseOrCorrectIssue(issue.issue_id, { lines, reason: reason.trim() }, requestId, { correct: true });
      else await issueMaterials(order.wo_id, { lines }, requestId);
      onSaved(correcting ? 'Pengeluaran dikoreksi; stok bahan diperbarui' : 'Pengeluaran bahan dicatat; stok bahan berkurang');
    } catch (err) {
      setServerErrors(err.fieldErrors ?? {});
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal isOpen size="lg" onClose={saving ? undefined : onClose} title={correcting ? `Koreksi pengeluaran #${issue.issue_id}` : `Catat pengeluaran · ${order.wo_number}`}
      footer={(<><Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Batal</Button><Button type="submit" form="issue-form" size="sm" loading={saving}>{correcting ? 'Simpan koreksi' : 'Simpan pengeluaran'}</Button></>)}>
      <form id="issue-form" noValidate className="space-y-4" onSubmit={submit}>
        <p className="text-sm text-cocoa-muted">{correcting
          ? 'Isi bahan dan jumlah yang benar. Bahan yang dihapus dari daftar dianggap tidak dikeluarkan. Dokumen asal tetap tersimpan sebagai riwayat.'
          : 'Isi bahan yang benar-benar dikeluarkan untuk WO ini. Stok bahan berkurang dan boleh menjadi minus bila stok tercatat kurang.'}</p>
        <IssueLinesEditor idPrefix="issue" rows={rows} setRows={setRows} materials={materials} recipeIds={new Set(order.recipe.map((r) => r.material_id))} errorOf={errorOf} onTouch={touch} />
        {correcting && (
          <FormField id="issue-reason" label="Alasan koreksi" error={errorOf('reason')}>
            <textarea className={fieldClass(errorOf('reason'), 'textarea')} value={reason} onChange={(e) => { setReason(e.target.value); touch(); }} />
          </FormField>
        )}
        <FormError message={error} />
      </form>
    </Modal>
  );
}
