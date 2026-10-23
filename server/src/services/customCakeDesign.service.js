// services/customCakeDesign.service.js
// FR-10 · UC-06 · BR-02 · C-11 Custom Cake Builder — simpan desain; harga & tanggal divalidasi ulang di server.
// Tanggal siap: ≥ H+3 (atau lead time produk bila lebih lama) dan ≤ jendela date picker, dihitung di WIB.

const prisma = require('../lib/prisma');
const { AVAILABILITY_TYPE } = require('../utils/businessConstants');
const { isValidDateKey, dateKeyToDbDate } = require('../utils/jakartaDate');
const { assertDesignTokenConfigured, signDesignToken } = require('../utils/designToken');
const {
  getEarliestReadyDate,
  getLatestSelectableDate,
} = require('./readyDate.service');

const OPTION_GROUPS = [
  'ukuran',
  'bentuk',
  'rasa',
  'krim_topping',
];

const WRITING_COLORS = new Set([
  'Cokelat',
  'Putih',
  'Pink',
  'Emas',
]);

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseDateKey(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw createError(
      'Tanggal siap harus menggunakan format YYYY-MM-DD.'
    );
  }

  if (!isValidDateKey(value)) {
    throw createError('Tanggal siap tidak valid.');
  }

  return value;
}

function parseOptionId(value, group) {
  const validNumber =
    (typeof value === 'number' && Number.isSafeInteger(value)) ||
    (typeof value === 'string' && /^[1-9]\d*$/.test(value));

  if (!validNumber || Number(value) < 1) {
    throw createError(
      `Pilihan ${group} wajib diisi dengan ID opsi yang valid.`
    );
  }

  const optionId = Number(value);

  if (!Number.isSafeInteger(optionId)) {
    throw createError(`ID opsi ${group} tidak valid.`);
  }

  return optionId;
}

function toCents(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw createError(
      'Harga produk atau opsi tidak valid di database.',
      500
    );
  }

  return Math.round(number * 100);
}

function normalizeWriting(payload) {
  let writingText = '';

  if (payload.writingText !== undefined &&
      payload.writingText !== null) {
    if (typeof payload.writingText !== 'string') {
      throw createError('Tulisan kue harus berupa teks.');
    }

    writingText = payload.writingText.trim();
  }

  if (writingText.length > 30) {
    throw createError(
      'Tulisan pada kue maksimal 30 karakter.'
    );
  }

  if (!writingText) {
    return {
      writingText: null,
      writingColor: null,
    };
  }

  if (
    typeof payload.writingColor !== 'string' ||
    !WRITING_COLORS.has(payload.writingColor)
  ) {
    throw createError(
      'Pilih warna tulisan yang tersedia.'
    );
  }

  return {
    writingText,
    writingColor: payload.writingColor,
  };
}

function normalizeReferencePhoto(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw createError('Foto referensi tidak valid.');
  }

  const referencePhoto = value.trim();

  if (!referencePhoto) {
    return null;
  }

  if (/^data:/i.test(referencePhoto)) {
    throw createError(
      'Foto referensi harus berupa URL atau path hasil upload, bukan data URL.'
    );
  }

  const isHttpUrl = /^https?:\/\/\S+$/i.test(referencePhoto);
  const isRelativePath =
    /^\/(?!\/)[^\s]*$/.test(referencePhoto);

  if (!isHttpUrl && !isRelativePath) {
    throw createError(
      'Foto referensi harus berupa URL HTTP(S) atau path relatif yang valid.'
    );
  }

  if (referencePhoto.length > 255) {
    throw createError(
      'URL foto referensi maksimal 255 karakter.'
    );
  }

  return referencePhoto;
}

async function createCustomCakeDesign(payload = {}, userId = null, now = new Date()) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    throw createError('Data desain custom cake tidak valid.');
  }

  if (
    !payload.selections ||
    typeof payload.selections !== 'object' ||
    Array.isArray(payload.selections)
  ) {
    throw createError('Pilihan custom cake wajib diisi.');
  }

  const selections = {};

  for (const group of OPTION_GROUPS) {
    selections[group] = parseOptionId(
      payload.selections[group],
      group
    );
  }

  const selectedIds = OPTION_GROUPS.map(
    (group) => selections[group]
  );

  if (new Set(selectedIds).size !== selectedIds.length) {
    throw createError(
      'Setiap kelompok harus memiliki opsi yang sesuai.'
    );
  }

  const { writingText, writingColor } =
    normalizeWriting(payload);

  const referencePhotoUrl = normalizeReferencePhoto(
    payload.referencePhoto
  );

  const readyDateKey = parseDateKey(payload.readyDate);

  let normalizedUserId = null;

  if (userId !== undefined && userId !== null) {
    if (
      typeof userId !== 'string' ||
      !/^[1-9]\d*$/.test(userId)
    ) {
      throw createError(
        'ID pelanggan tidak valid.',
        401
      );
    }

    normalizedUserId = BigInt(userId);
  }

  // Desain tamu wajib mendapat token; pastikan kunci tersedia sebelum menulis data
  if (normalizedUserId === null) {
    assertDesignTokenConfigured();
  }

  return prisma.$transaction(async (tx) => {
    // Ambil produk custom aktif dari database.
    const product = await tx.product.findFirst({
      where: {
        isActive: true,
        availabilityType: AVAILABILITY_TYPE.CUSTOM,
      },
      orderBy: {
        productId: 'asc',
      },
      select: {
        productId: true,
        price: true,
        availabilityType: true,
        leadTimeDays: true,
      },
    });

    if (!product) {
      throw createError(
        'Custom cake sedang tidak tersedia.',
        404
      );
    }

    // Validasi ulang tanggal berdasarkan data produk di server (WIB).
    const earliestReadyDate = getEarliestReadyDate(product, now);
    const latestReadyDate = getLatestSelectableDate(product.availabilityType, now);

    if (readyDateKey < earliestReadyDate) {
      throw createError(
        `Tanggal siap paling awal adalah ${earliestReadyDate}.`
      );
    }

    if (readyDateKey > latestReadyDate) {
      throw createError(
        `Tanggal siap paling lambat adalah ${latestReadyDate}.`
      );
    }

    // Hanya opsi aktif yang dapat dipilih.
    const activeOptions = await tx.customOption.findMany({
      where: {
        optionId: {
          in: selectedIds,
        },
        isActive: true,
      },
      select: {
        optionId: true,
        optionGroup: true,
        extraPrice: true,
      },
    });

    const optionsById = new Map(
      activeOptions.map((option) => [
        option.optionId,
        option,
      ])
    );

    const selectedOptions = [];

    for (const group of OPTION_GROUPS) {
      const option = optionsById.get(selections[group]);

      if (!option) {
        throw createError(
          `Pilihan ${group} tidak tersedia atau sudah tidak aktif.`
        );
      }

      if (option.optionGroup !== group) {
        throw createError(
          `Pilihan yang dikirim tidak sesuai kelompok ${group}.`
        );
      }

      selectedOptions.push(option);
    }

    // Harga dihitung ulang di server, bukan memakai harga dari UI.
    const totalCents =
      toCents(product.price) +
      selectedOptions.reduce(
        (sum, option) => sum + toCents(option.extraPrice),
        0
      );

    const price = totalCents / 100;

    // Simpan desain dan opsi terpilih dalam satu transaksi.
    const design = await tx.customCakeDesign.create({
      data: {
        productId: product.productId,
        userId: normalizedUserId,
        writingText,
        writingColor,
        referencePhotoUrl,
        readyDate: dateKeyToDbDate(readyDateKey),
        price,
      },
      select: {
        designId: true,
        price: true,
        readyDate: true,
      },
    });

    await tx.customCakeDesignOption.createMany({
      data: selectedOptions.map((option) => ({
        designId: design.designId,
        optionId: option.optionId,
      })),
    });

    return {
      design_id: String(design.designId),
      price: Number(design.price),
      ready_date: readyDateKey,
      // Hanya desain tamu: bukti akses saat desain dipakai di keranjang (disimpan frontend bersama item)
      design_token: normalizedUserId === null ? signDesignToken(design.designId) : null,
    };
  });
}

module.exports = {
  createCustomCakeDesign,
};
