// components/admin/PickupCodeVerifier.jsx
// Step 5.6 · FR-28 · UC-21 Memverifikasi Kode Pickup · AD-04 — field verifikasi kode pickup
// Kode dicek di service (verifyPickupCode); kode yang sudah cocok dikirim lagi saat status Selesai disimpan.

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';

/**
 * @param {Function} onVerify — async (code) → lempar Error bila tidak cocok
 * @param {string|null} verifiedCode — kode yang sudah terverifikasi (null = belum)
 * @param {Function} onReset — kode diubah setelah terverifikasi
 */
export default function PickupCodeVerifier({ onVerify, verifiedCode, onReset }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await onVerify(code);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  };

  const change = (value) => {
    setCode(value);
    setError('');
    if (verifiedCode) onReset();
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Input
          id="pickup-code-input"
          label="Kode pickup dari pelanggan"
          placeholder="Contoh: PK1234"
          autoComplete="off"
          maxLength={10}
          value={code}
          onChange={(e) => change(e.target.value)}
          error={error}
          className="uppercase font-mono tracking-wider placeholder:normal-case placeholder:font-sans placeholder:tracking-normal"
        />
        <Button type="submit" variant="secondary" size="sm" loading={pending} className="sm:mt-[30px] shrink-0">
          Verifikasi
        </Button>
      </div>
      {verifiedCode && (
        <p role="status" className="flex items-center gap-2 text-sm font-semibold text-[#3F6B3A]">
          <CheckCircle2 size={16} aria-hidden="true" /> Kode pickup terverifikasi
        </p>
      )}
    </form>
  );
}
