// components/admin/RecipeFormModal.jsx
// CR-03 CP6 · FR-39 · UC-31 · BR-13 · AD-06 — modal Komposisi bahan per produk (§B8): memuat komposisi tersimpan + master
// bahan AD-07 (skeleton / error + coba lagi), lalu RecipeForm. Produk aktif & nonaktif boleh; daftar kosong =
// mengosongkan komposisi. Form produk & useProductForm tidak diubah.

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Skeleton from '../ui/Skeleton';
import ErrorState from '../ui/ErrorState';
import RecipeForm from './RecipeForm';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getProductRecipe } from '../../services/recipeService';
import { getRawMaterials } from '../../services/stockService';

const FORM_ID = 'recipe-form';

/**
 * @param {{product_id, name}} product — baris produk dari tabel AD-06
 * @param {Function} onClose
 * @param {Function} onSaved — (message) → void
 */
export default function RecipeFormModal({ product, onClose, onSaved }) {
  const query = useServiceQuery(async () => {
    const [recipe, board] = await Promise.all([getProductRecipe(product.product_id), getRawMaterials()]);
    return { recipe, materials: board.rows };
  }, [product.product_id]);
  const [saving, setSaving] = useState(false);
  const ready = !query.loading && query.data;

  let body;
  if (query.error) body = <ErrorState message={query.error.message || 'Komposisi gagal dimuat.'} onRetry={query.reload} />;
  else if (!ready) {
    body = (
      <div className="space-y-3" aria-busy="true" aria-label="Memuat komposisi">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} variant="card" className="h-20 w-full" />)}
      </div>
    );
  } else {
    body = (
      <RecipeForm
        productId={product.product_id}
        data={query.data}
        formId={FORM_ID}
        onSavingChange={setSaving}
        onSaved={(saved) => onSaved(saved.items.length ? `Komposisi ${product.name} disimpan` : `Komposisi ${product.name} dikosongkan`)}
      />
    );
  }

  return (
    <Modal
      isOpen
      size="lg"
      onClose={saving ? undefined : onClose}
      title={`Komposisi · ${product.name}`}
      footer={(
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Batal</Button>
          <Button type="submit" form={FORM_ID} size="sm" loading={saving} disabled={!ready || Boolean(query.error)}>Simpan</Button>
        </>
      )}
    >
      {body}
    </Modal>
  );
}
