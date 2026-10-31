// services/adminCustomOption.service.js
// Step 6.4 · FR-31 · UC-23 · AD-06 tab "Opsi Custom Cake" (Staf & Owner). Kontrak = client
// services/mock/adminCatalogViews.js buildAdminCustomOptions & adminCatalogWrites.js (saveAdminCustomOption,
// setAdminCustomOptionActive). Opsi tidak dihapus, hanya dinonaktifkan (A-05); kelompok opsi lama tidak bisa dipindah
// karena desain custom cake menyimpan opsi per kelompok; setiap kelompok wajib menyisakan ≥ 1 opsi aktif.
// Penulisan diserialkan dengan kunci master data (adminMasterDataLock.service.js) agar nama unik per kelompok dan
// "minimal satu opsi aktif" tetap benar walau ada request bersamaan.

const prisma = require('../lib/prisma');
const { AVAILABILITY_TYPE, CUSTOM_CAKE_MIN_LEAD_DAYS } = require('../utils/businessConstants');
const { OPTION_GROUPS } = require('../validators/customCakeDesign.validator');
const {
  normalizeCustomOptionInput, validateCustomOption, checkOptionDeactivation, validationError,
} = require('./adminCatalogRules.service');
const { lockAdminMasterData } = require('./adminMasterDataLock.service');

const NOT_FOUND_MESSAGE = 'Opsi tidak ditemukan.';

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

const mapOption = (o) => ({
  option_id: o.optionId,
  option_group: o.optionGroup,
  name: o.name,
  description: o.description ?? null,
  extra_price: Number(o.extraPrice),
  image_url: o.imageUrl ?? null,
  is_active: o.isActive,
});

const loadOptions = async (client) =>
  (await client.customOption.findMany({ orderBy: { optionId: 'asc' } })).map(mapOption);

/** GET /api/admin/custom-options — opsi per kelompok (aktif & nonaktif) + produk custom aktif & lead time (BR-02 ≥ H-3) */
async function getAdminCustomOptions() {
  const [options, customProduct] = await Promise.all([
    loadOptions(prisma),
    prisma.product.findFirst({
      where: { isActive: true, availabilityType: AVAILABILITY_TYPE.CUSTOM },
      orderBy: { productId: 'asc' },
      select: { productId: true, name: true, price: true, leadTimeDays: true },
    }),
  ]);
  return {
    groups: OPTION_GROUPS.map((group) => ({ group, options: options.filter((o) => o.option_group === group) })),
    custom_product: customProduct
      ? { product_id: String(customProduct.productId), name: customProduct.name, price: Number(customProduct.price) }
      : null,
    lead_time_days: Math.max(CUSTOM_CAKE_MIN_LEAD_DAYS, customProduct?.leadTimeDays ?? 0),
  };
}

/**
 * POST /api/admin/custom-options (optionId null) & PUT /api/admin/custom-options/:id.
 * @returns {Promise<{option_id: number}>}
 */
async function saveCustomOption(optionId, input) {
  return prisma.$transaction(async (tx) => {
    await lockAdminMasterData(tx);
    const options = await loadOptions(tx);
    const id = optionId == null ? null : Number(optionId);
    const existing = id == null ? null : options.find((o) => o.option_id === id);
    if (id != null && !existing) throw httpError(404, NOT_FOUND_MESSAGE);

    const option = normalizeCustomOptionInput({ ...input, option_group: existing?.option_group ?? input.option_group });
    const errors = validateCustomOption(option, options, existing?.option_id ?? null);
    if (existing && !option.is_active) {
      const last = checkOptionDeactivation(options, existing.option_id);
      if (last) errors.is_active = last;
    }
    if (Object.keys(errors).length) throw validationError(errors);

    const data = {
      name: option.name,
      description: option.description,
      extraPrice: option.extra_price,
      isActive: Boolean(option.is_active),
    };
    const saved = existing
      ? await tx.customOption.update({ where: { optionId: existing.option_id }, data, select: { optionId: true } })
      : await tx.customOption.create({ data: { ...data, optionGroup: option.option_group, imageUrl: null }, select: { optionId: true } });
    return { option_id: saved.optionId };
  });
}

/** PATCH /api/admin/custom-options/:id/active — kelompok wajib menyisakan minimal satu opsi aktif */
async function setCustomOptionActive(optionId, isActive) {
  return prisma.$transaction(async (tx) => {
    await lockAdminMasterData(tx);
    const options = await loadOptions(tx);
    const existing = options.find((o) => o.option_id === Number(optionId));
    if (!existing) throw httpError(404, NOT_FOUND_MESSAGE);
    if (!isActive) {
      const last = checkOptionDeactivation(options, existing.option_id);
      if (last) throw httpError(409, last);
    }
    await tx.customOption.update({ where: { optionId: existing.option_id }, data: { isActive } });
    return { option_id: existing.option_id, is_active: isActive };
  });
}

module.exports = {
  getAdminCustomOptions,
  saveCustomOption,
  setCustomOptionActive,
};
