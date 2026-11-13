// hooks/useRequestId.js
// CR-04a CP6 · BR-31 — satu `request_id` (UUID v4 huruf kecil, crypto.randomUUID) per percobaan simpan: dipakai ulang
// bila pengguna menekan Simpan lagi setelah gagal (jaringan/timeout) sehingga server/mock me-replay respons asli dan
// tidak membuat dokumen ganda; `renew()` setelah berhasil atau setelah isi form berubah (payload beda = operasi baru).

import { useCallback, useState } from 'react';

const newId = () => globalThis.crypto.randomUUID();

export default function useRequestId() {
  const [requestId, setRequestId] = useState(newId);
  const renew = useCallback(() => setRequestId(newId()), []);
  return { requestId, renew };
}
