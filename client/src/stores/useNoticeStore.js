// stores/useNoticeStore.js
// Step 6.3 (temuan L1) · FR-26 — notifikasi global (satu pesan) yang tidak hilang saat halaman dipasang ulang karena
// identitas berganti. Ditampilkan AppNotice di App.jsx; toast halaman (useToast) tetap dipakai untuk kasus biasa.

import { create } from 'zustand';

const useNoticeStore = create((set) => ({
  /** { id, type: 'success'|'error'|'info', message } atau null */
  notice: null,

  /** Tampilkan pesan; pesan baru menggantikan yang lama (id baru memulai ulang timer Toast) */
  showNotice: (type, message) => set((s) => ({ notice: { id: (s.notice?.id ?? 0) + 1, type, message } })),

  dismissNotice: () => set({ notice: null }),
}));

export default useNoticeStore;
