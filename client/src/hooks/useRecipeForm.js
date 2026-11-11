// hooks/useRecipeForm.js
// CR-03 CP6 · FR-39 · UC-31 · BR-13 · AD-06 — state form Komposisi (setelah data dimuat): tambah/ubah/hapus baris,
// validasi aturan murni (sama server), simpan PUT seluruh komposisi. Bahan hanya dari master AD-07 (AC-39.2).
// Takaran dikirim sebagai string desimal; koma desimal (format Indonesia) diubah menjadi titik sebelum validasi & kirim.

import { useState } from 'react';
import { saveProductRecipe } from '../services/recipeService';
import { validateRecipeItems } from '../utils/rules/recipe';
import { RECIPE_MAX_ITEMS } from '../constants/recipe';

let rowKey = 0;
const newRow = (material_id = '', qty = '') => ({ key: `r${(rowKey += 1)}`, material_id, qty });
/** "0,015" → "0.015"; spasi tepi dibuang */
export const toQtyText = (qty) => String(qty).trim().replace(',', '.');

/**
 * @param {string|number} productId
 * @param {{recipe, materials}} data — komposisi tersimpan (B7.1) + master bahan
 * @param {Function} onSavingChange — (boolean) → void, untuk tombol di footer modal
 */
export default function useRecipeForm(productId, data, onSavingChange) {
  const [rows, setRows] = useState(() => data.recipe.items.map((i) => newRow(String(i.material_id), String(i.qty_per_unit))));
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const payload = rows.map((r) => ({ material_id: r.material_id, qty_per_unit: toQtyText(r.qty) }));
  const { errors } = validateRecipeItems(payload, data.materials);
  const errorOf = (key) => serverErrors[key] || (submitted ? errors[key] : undefined);

  const clearFeedback = () => { setServerErrors({}); setError(''); };
  const updateRow = (key, field, value) => {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
    clearFeedback();
  };
  const addRow = () => { setRows((list) => (list.length >= RECIPE_MAX_ITEMS ? list : [...list, newRow()])); clearFeedback(); };
  const removeRow = (key) => { setRows((list) => list.filter((r) => r.key !== key)); clearFeedback(); };
  const setBusy = (value) => { setSaving(value); onSavingChange?.(value); };

  /** @returns {Promise<object|null>} komposisi tersimpan atau null bila gagal/tidak sah */
  const submit = async () => {
    setSubmitted(true);
    if (Object.keys(errors).length) {
      setError(errors.items ?? 'Periksa kembali bahan dan takaran yang ditandai.');
      return null;
    }
    setBusy(true);
    try {
      return await saveProductRecipe(productId, payload);
    } catch (err) {
      setServerErrors(err.fieldErrors ?? {});
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  return { rows, saving, error, errorOf, updateRow, addRow, removeRow, submit, canAdd: rows.length < RECIPE_MAX_ITEMS };
}
