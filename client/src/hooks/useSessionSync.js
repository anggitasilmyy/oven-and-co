// hooks/useSessionSync.js
// Step 6.3 · FR-26 · BR-04 — sinkronkan sesi & keranjang saat tab lain login, logout, atau berganti pengguna, dan
// kosongkan state milik identitas lain (draft checkout, temuan L1) saat identitas berganti.

import { useEffect } from 'react';
import { startSessionSync, syncSessionFromStorage } from '../services/sessionSync';
import { startSessionScope } from '../services/sessionScope';

export default function useSessionSync() {
  useEffect(() => {
    const stopScope = startSessionScope();
    // Perubahan dari tab lain sebelum pendengar terpasang ikut disamakan
    syncSessionFromStorage();
    const stopSync = startSessionSync();
    return () => {
      stopSync();
      stopScope();
    };
  }, []);
}
