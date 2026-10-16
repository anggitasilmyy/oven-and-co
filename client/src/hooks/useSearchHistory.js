// hooks/useSearchHistory.js
// Step 5.1 · FR-07 · TF-13 — riwayat pencarian perangkat (lewat searchHistoryService, bukan localStorage langsung)

import { useCallback, useState } from 'react';
import {
  getSearchHistory, addSearchHistory, removeSearchHistory, clearSearchHistory,
} from '../services/searchHistoryService';

export default function useSearchHistory() {
  const [history, setHistory] = useState(getSearchHistory);

  return {
    history,
    add: useCallback((term) => setHistory(addSearchHistory(term)), []),
    remove: useCallback((term) => setHistory(removeSearchHistory(term)), []),
    clear: useCallback(() => setHistory(clearSearchHistory()), []),
  };
}
