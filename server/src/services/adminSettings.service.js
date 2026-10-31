// services/adminSettings.service.js
// Step 6.4.10 · FR-36 · UC-30 · AD-11 Pengaturan (Owner) — C1: GET /api/admin/settings.
// Kontrak = client services/settingsService.js getStoreSettings (mock settingsAdmin.js buildSettingsBoard):
// { profile{store_name, address, whatsapp_number, preorder_cutoff_time, delivery_radius_km, delivery_fee_per_km},
//   hours[{hour_id, day_of_week, open_time, close_time, is_open}], paymentMethods[{method_code, name, method_group, is_active}] }.
// Tiga bagian dibaca dalam SATU snapshot REPEATABLE READ (readSnapshot.service.js), berurutan lewat `tx`, tanpa locking
// read — papan tidak bisa berisi profil lama dengan jam/metode baru dari simpan yang commit di tengah-tengah, dan tidak
// menahan checkout maupun penyimpanan pengaturan. Kolom dipilih eksplisit (select): koordinat toko, aturan loyalty,
// batas waktu bayar, dan bonus ulasan tidak dibaca maupun dikirim.

const { runInReadSnapshot } = require('./readSnapshot.service');
const { toStoreProfile, toOperatingHourView, toPaymentMethodView } = require('./adminSettingsRules.service');

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

const PROFILE_SELECT = Object.freeze({
  storeName: true, address: true, whatsappNumber: true, preorderCutoffTime: true, deliveryRadiusKm: true, deliveryFeePerKm: true,
});

/** GET /api/admin/settings */
async function getStoreSettings() {
  return runInReadSnapshot(async (tx) => {
    const store = await tx.storeSetting.findFirst({ orderBy: { settingId: 'asc' }, select: PROFILE_SELECT });
    if (!store) throw httpError(500, 'Pengaturan toko belum tersedia.');
    const hours = await tx.operatingHour.findMany({ orderBy: { dayOfWeek: 'asc' } });
    // Urutan sama dengan GET /api/payment-methods (filter AD-03): kelompok (urutan enum) lalu nama
    const methods = await tx.paymentMethod.findMany({ orderBy: [{ methodGroup: 'asc' }, { name: 'asc' }] });
    return {
      profile: toStoreProfile(store),
      hours: hours.map(toOperatingHourView),
      paymentMethods: methods.map(toPaymentMethodView),
    };
  });
}

module.exports = {
  getStoreSettings,
};
