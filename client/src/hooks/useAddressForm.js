// hooks/useAddressForm.js
// Step 5.5 · FR-24 · C-22 — state form tambah/ubah alamat + validasi (utils/rules/account.js).
// Error tampil per field setelah field disentuh atau setelah tombol Simpan ditekan.

import { useState } from 'react';
import { validateAddressInput } from '../utils/businessRules';

const EMPTY = {
  label: '', recipient_name: '', recipient_phone: '+62', full_address: '',
  latitude: null, longitude: null, courier_note: '', is_primary: false,
};

/**
 * @param {object|null} address — alamat yang diubah (null = tambah baru)
 * @param {{name, phone}} [user] — isian awal penerima untuk alamat baru
 * @param {boolean} [firstAddress] — alamat pertama otomatis utama
 */
export default function useAddressForm(address, user, firstAddress = false) {
  const [form, setForm] = useState(() => (address
    ? { ...EMPTY, ...address, courier_note: address.courier_note ?? '' }
    : { ...EMPTY, recipient_name: user?.name ?? '', recipient_phone: user?.phone ?? EMPTY.recipient_phone, is_primary: firstAddress }));
  const [touched, setTouched] = useState({});
  const [showAll, setShowAll] = useState(false);

  const errors = validateAddressInput(form);
  const errorOf = (key) => ((showAll || touched[key]) ? errors[key] ?? '' : '');
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const field = (key) => ({
    value: form[key] ?? '',
    onChange: (e) => set(key, e.target.value),
    onBlur: () => setTouched((t) => ({ ...t, [key]: true })),
    error: errorOf(key),
  });

  /** @returns {boolean} true bila valid (sekaligus menampilkan semua error) */
  const validate = () => {
    setShowAll(true);
    return Object.keys(errors).length === 0;
  };

  return { form, set, field, errorOf, validate };
}
