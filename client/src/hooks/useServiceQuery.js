// hooks/useServiceQuery.js
// Step 4 · Memuat data dari services/ dengan status loading, error, dan muat ulang.
// Data sebelumnya tetap ditampilkan saat memuat ulang (mis. ganti filter) agar tidak berkedip.

import { useCallback, useEffect, useState } from 'react';
import { isSessionError } from '../utils/apiErrors';

/**
 * @param {Function} fetcher — fungsi async dari services/
 * @param {Array} deps — nilai yang memicu pemuatan ulang (mis. filter)
 * @returns {{ data, error, loading, reload }}
 */
export default function useServiceQuery(fetcher, deps = []) {
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${JSON.stringify(deps)}#${reloadCount}`;
  const [result, setResult] = useState({ key: null, data: null, error: null });

  useEffect(() => {
    let active = true;
    fetcher().then(
      (data) => active && setResult({ key: requestKey, data, error: null }),
      // Step 6.3 (temuan #4): error sesi (berakhir/berganti) → data lama milik sesi sebelumnya dibuang
      (error) => active && setResult((prev) => ({ key: requestKey, data: isSessionError(error) ? null : prev.data, error }))
    );
    return () => {
      active = false;
    };
    // fetcher sengaja tidak dijadikan dependency: pemuatan ulang dikendalikan lewat deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const reload = useCallback(() => setReloadCount((n) => n + 1), []);

  return {
    data: result.data,
    error: result.key === requestKey ? result.error : null,
    loading: result.key !== requestKey,
    reload,
  };
}
