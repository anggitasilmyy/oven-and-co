// services/searchHistoryService.js
// Step 5.1 · FR-07 · TF-13 — riwayat pencarian disimpan di perangkat (localStorage), bukan di database.
// Berlaku sama untuk mode mock dan mode API. Halaman mengaksesnya lewat hooks/useSearchHistory.

import { SEARCH_HISTORY_KEY, SEARCH_HISTORY_LIMIT } from '../constants/catalog';
import { normalizeQuery } from '../utils/businessRules';

/** @returns {string[]} kata kunci terbaru dulu */
export function getSearchHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

function save(list) {
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list));
  } catch {
    // penyimpanan penuh/diblokir — riwayat tidak disimpan, pencarian tetap jalan
  }
  return list;
}

/** Simpan kata kunci di urutan teratas (tanpa duplikat, tidak peka huruf besar) */
export function addSearchHistory(term) {
  const clean = String(term ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return getSearchHistory();
  const key = normalizeQuery(clean);
  const rest = getSearchHistory().filter((t) => normalizeQuery(t) !== key);
  return save([clean, ...rest].slice(0, SEARCH_HISTORY_LIMIT));
}

export function removeSearchHistory(term) {
  const key = normalizeQuery(term);
  return save(getSearchHistory().filter((t) => normalizeQuery(t) !== key));
}

export function clearSearchHistory() {
  return save([]);
}
