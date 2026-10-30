// services/customCakeDesign.service.js
// FR-10 · UC-06 · BR-02 · C-11 Custom Cake Builder — simpan desain; harga & tanggal divalidasi ulang di server.
// Tanggal siap: ≥ H+3 (atau lead time produk bila lebih lama) dan ≤ jendela date picker, dihitung di WIB.
// Foto referensi (opsional, multipart, satu-satunya sumber foto) ditulis ke disk setelah validasi request &
// file, di luar transaksi Prisma, lalu dihapus lagi bila validasi data server atau penyimpanan database gagal.

const prisma = require('../lib/prisma');
const { AVAILABILITY_TYPE } = require('../utils/businessConstants');
const { dateKeyToDbDate } = require('../utils/jakartaDate');
const { assertDesignTokenConfigured, signDesignToken } = require('../utils/designToken');
const { saveReferencePhoto, deleteReferencePhoto } = require('../utils/referencePhotoStorage');
const { OPTION_GROUPS, validateCustomCakeDesign } = require('../validators/customCakeDesign.validator');
const {
  getEarliestReadyDate,
  getLatestSelectableDate,
} = require('./readyDate.service');

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function toCents(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw createError('Harga produk atau opsi tidak valid di database.', 500);
  }

  return Math.round(number * 100);
}

function normalizeUserId(userId) {
  if (userId === undefined || userId === null) return null;

  if (typeof userId !== 'string' || !/^[1-9]\d*$/.test(userId)) {
    throw createError('ID pelanggan tidak valid.', 401);
  }

  return BigInt(userId);
}

/** Opsi aktif sesuai kelompoknya, urut OPTION_GROUPS */
async function loadSelectedOptions(tx, design) {
  const activeOptions = await tx.customOption.findMany({
    where: { optionId: { in: design.selectedIds }, isActive: true },
    select: { optionId: true, optionGroup: true, extraPrice: true },
  });

  const optionsById = new Map(activeOptions.map((option) => [option.optionId, option]));

  return OPTION_GROUPS.map((group) => {
    const option = optionsById.get(design.selections[group]);

    if (!option) {
      throw createError(`Pilihan ${group} tidak tersedia atau sudah tidak aktif.`);
    }

    if (option.optionGroup !== group) {
      throw createError(`Pilihan yang dikirim tidak sesuai kelompok ${group}.`);
    }

    return option;
  });
}

function assertReadyDate(product, readyDateKey, now) {
  const earliestReadyDate = getEarliestReadyDate(product, now);
  const latestReadyDate = getLatestSelectableDate(product.availabilityType, now);

  if (readyDateKey < earliestReadyDate) {
    throw createError(`Tanggal siap paling awal adalah ${earliestReadyDate}.`);
  }

  if (readyDateKey > latestReadyDate) {
    throw createError(`Tanggal siap paling lambat adalah ${latestReadyDate}.`);
  }
}

/**
 * @param {unknown} payload — body JSON / field `design` multipart
 * @param {string|null} userId — pelanggan login; null = tamu
 * @param {Date} [now]
 * @param {{photo?: {buffer: Buffer, extension: string}|null}} [options] — hasil validateReferencePhoto
 */
async function createCustomCakeDesign(payload = {}, userId = null, now = new Date(), { photo = null } = {}) {
  const design = validateCustomCakeDesign(payload);
  const normalizedUserId = normalizeUserId(userId);

  // Desain tamu wajib mendapat token; pastikan kunci tersedia sebelum menulis data
  if (normalizedUserId === null) {
    assertDesignTokenConfigured();
  }

  // File (sudah divalidasi di route) ditulis DI LUAR transaksi Prisma agar I/O disk tidak menahan koneksi
  // dan tidak memicu timeout transaksi interaktif. Bila penyimpanan database gagal, file dihapus lagi.
  const savedPhotoUrl = photo ? await saveReferencePhoto(photo) : null;

  try {
    return await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { isActive: true, availabilityType: AVAILABILITY_TYPE.CUSTOM },
        orderBy: { productId: 'asc' },
        select: { productId: true, price: true, availabilityType: true, leadTimeDays: true },
      });

      if (!product) {
        throw createError('Custom cake sedang tidak tersedia.', 404);
      }

      // Validasi ulang tanggal & opsi berdasarkan data server (WIB)
      assertReadyDate(product, design.readyDateKey, now);
      const selectedOptions = await loadSelectedOptions(tx, design);

      // Harga dihitung ulang di server, bukan memakai harga dari UI
      const price =
        (toCents(product.price) + selectedOptions.reduce((sum, option) => sum + toCents(option.extraPrice), 0)) / 100;

      const created = await tx.customCakeDesign.create({
        data: {
          productId: product.productId,
          userId: normalizedUserId,
          writingText: design.writingText,
          writingColor: design.writingColor,
          referencePhotoUrl: savedPhotoUrl,
          readyDate: dateKeyToDbDate(design.readyDateKey),
          price,
        },
        select: { designId: true, price: true },
      });

      await tx.customCakeDesignOption.createMany({
        data: selectedOptions.map((option) => ({ designId: created.designId, optionId: option.optionId })),
      });

      return {
        design_id: String(created.designId),
        price: Number(created.price),
        ready_date: design.readyDateKey,
        // Hanya desain tamu: bukti akses saat desain dipakai di keranjang (disimpan frontend bersama item)
        design_token: normalizedUserId === null ? signDesignToken(created.designId) : null,
      };
    });
  } catch (error) {
    // Validasi data server / transaksi gagal → file yang sudah ditulis tidak boleh tertinggal.
    // Kegagalan pembersihan hanya dicatat; error utama tetap yang dikirim ke pemanggil.
    if (savedPhotoUrl) {
      await deleteReferencePhoto(savedPhotoUrl).catch((cleanupError) => {
        console.warn('[Upload] Gagal menghapus foto referensi yatim:', savedPhotoUrl, cleanupError.code ?? cleanupError.message);
      });
    }

    throw error;
  }
}

module.exports = {
  createCustomCakeDesign,
};
