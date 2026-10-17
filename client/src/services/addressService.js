// services/addressService.js
// Step 5.5 · FR-24 · BR-12 · UC-16 · C-22 Alamat Tersimpan — kelola alamat pelanggan login (tabel addresses).
// Satu alamat utama per pelanggan; alamat pertama otomatis utama. Pesanan lama tidak terpengaruh karena
// alamat pesanan disimpan sebagai salinan (orders.delivery_address_snapshot).

import { apiClient } from './apiClient';
import { getTables, updateTable } from './mock/db';
import { requireMockRole } from './mock/mockSession';
import { distanceKm, getDeliveryQuote, normalizePrimaryAddress, validateAddressInput } from '../utils/businessRules';
import { ROLES } from '../constants/roles';

const fail = (message) => { throw new Error(message); };
const trimOrNull = (val) => String(val ?? '').trim() || null;

/** Kolom addresses dari isian form (tanpa id & pemilik) */
function toRow(input) {
  return {
    label: input.label.trim(),
    recipient_name: input.recipient_name.trim(),
    recipient_phone: String(input.recipient_phone).replace(/\s/g, ''),
    full_address: input.full_address.trim(),
    latitude: Number(input.latitude),
    longitude: Number(input.longitude),
    courier_note: trimOrNull(input.courier_note),
  };
}

function validated(input) {
  const first = Object.values(validateAddressInput(input))[0];
  if (first) fail(first);
  return toRow(input);
}

/**
 * @returns {Promise<{store, settings, addresses}>} alamat (utama dulu) + jarak & status radius pengiriman (BR-12)
 */
export function getMyAddresses() {
  return apiClient('/me/addresses', {
    mockHandler: () => {
      const user = requireMockRole(ROLES.CUSTOMER);
      const { addresses, store_settings: settings } = getTables('addresses', 'store_settings');
      return {
        store: { name: settings.store_name, address: settings.address, latitude: settings.latitude, longitude: settings.longitude },
        settings,
        addresses: addresses
          .filter((a) => a.user_id === user.user_id)
          .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.address_id - b.address_id)
          .map((a) => ({ ...a, ...getDeliveryQuote(distanceKm(settings, a), settings) })),
      };
    },
  });
}

/**
 * Tambah (addressId kosong) atau ubah alamat. `is_primary: true` menjadikannya alamat utama.
 * @returns {Promise<{address_id}>}
 */
export function saveAddress(input, addressId = null) {
  return apiClient(addressId ? `/me/addresses/${addressId}` : '/me/addresses', {
    method: addressId ? 'PUT' : 'POST',
    body: input,
    mockHandler: () => {
      const user = requireMockRole(ROLES.CUSTOMER);
      const row = validated(input);
      const rows = getTables('addresses').addresses;
      let id = Number(addressId);
      if (addressId) {
        if (!rows.some((a) => a.address_id === id && a.user_id === user.user_id)) fail('Alamat tidak ditemukan');
      } else {
        id = rows.reduce((max, a) => Math.max(max, a.address_id), 0) + 1;
      }
      updateTable('addresses', (current) => {
        const next = addressId
          ? current.map((a) => (a.address_id === id ? { ...a, ...row } : a))
          : [...current, { address_id: id, user_id: user.user_id, ...row, is_primary: false }];
        return normalizePrimaryAddress(next, user.user_id, input.is_primary ? id : null);
      });
      return { address_id: id };
    },
  });
}

/** Jadikan alamat utama */
export function setPrimaryAddress(addressId) {
  const id = Number(addressId);
  return apiClient(`/me/addresses/${id}/primary`, {
    method: 'PATCH',
    mockHandler: () => {
      const user = requireMockRole(ROLES.CUSTOMER);
      if (!getTables('addresses').addresses.some((a) => a.address_id === id && a.user_id === user.user_id)) fail('Alamat tidak ditemukan');
      updateTable('addresses', (rows) => normalizePrimaryAddress(rows, user.user_id, id));
      return { address_id: id };
    },
  });
}

/** Hapus alamat; bila alamat utama yang dihapus, alamat lain menjadi utama */
export function deleteAddress(addressId) {
  const id = Number(addressId);
  return apiClient(`/me/addresses/${id}`, {
    method: 'DELETE',
    mockHandler: () => {
      const user = requireMockRole(ROLES.CUSTOMER);
      if (!getTables('addresses').addresses.some((a) => a.address_id === id && a.user_id === user.user_id)) fail('Alamat tidak ditemukan');
      updateTable('addresses', (rows) => normalizePrimaryAddress(rows.filter((a) => a.address_id !== id), user.user_id));
      return { address_id: id };
    },
  });
}
