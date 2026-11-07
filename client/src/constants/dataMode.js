// constants/dataMode.js
// Step 6.6 (CP3) — mode data aplikasi dibaca SEKALI dari VITE_USE_MOCK (sama dengan services/apiClient.js).
// Modul kecil tanpa dependensi agar store (useCartStore) bisa memilih namespace penyimpanan tanpa mengimpor apiClient
// (apiClient → sessionRecovery → useCartStore akan membentuk impor melingkar).

// `?? {}`: import.meta.env hanya ada di Vite; di Node (tests/unit) dianggap mode API kecuali disuntik mock-env-loader
const ENV = import.meta.env ?? {};

/** true = mode mock (localStorage), false = mode API (REST) */
export const IS_MOCK_MODE = ENV.VITE_USE_MOCK === 'true';
