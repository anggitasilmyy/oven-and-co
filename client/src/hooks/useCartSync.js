// hooks/useCartSync.js
// Step 6.6 (CP3) · FR-04 · BR-04 — jalankan engine sinkronisasi keranjang akun (mode API) selama aplikasi terbuka.
// startCartSync aman dipanggil berulang (React StrictMode): tetap satu engine per tab.

import { useEffect } from 'react';
import { startCartSync } from '../services/cartSync';

export default function useCartSync() {
  useEffect(() => startCartSync(), []);
}
