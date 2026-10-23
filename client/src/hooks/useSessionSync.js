// hooks/useSessionSync.js
// Step 6.3 · FR-26 · BR-04 — sinkronkan sesi & keranjang saat tab lain login, logout, atau berganti pengguna.

import { useEffect } from 'react';
import { startSessionSync, syncSessionFromStorage } from '../services/sessionSync';

export default function useSessionSync() {
  useEffect(() => {
    // Perubahan dari tab lain sebelum pendengar terpasang ikut disamakan
    syncSessionFromStorage();
    return startSessionSync();
  }, []);
}
