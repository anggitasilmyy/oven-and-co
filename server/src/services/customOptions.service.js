// services/customOptions.service.js
// FR-10 · UC-06 · BR-02 · C-11 Custom Cake Builder — produk custom aktif, opsi aktif per kelompok,
// dan tanggal siap tercepat (H+3, WIB).

const prisma = require('../lib/prisma');
const { AVAILABILITY_TYPE } = require('../utils/businessConstants');
const { getJakartaDateKey } = require('../utils/jakartaDate');
const { getEarliestReadyDate } = require('./readyDate.service');

const { OPTION_GROUPS } = require('../validators/customCakeDesign.validator');

async function getCustomCakeBuilder(now = new Date()) {
  const product = await prisma.product.findFirst({
    where: {
      isActive: true,
      availabilityType: AVAILABILITY_TYPE.CUSTOM,
    },
    orderBy: {
      productId: 'asc',
    },
    select: {
      productId: true,
      name: true,
      description: true,
      price: true,
      availabilityType: true,
      leadTimeDays: true,
      images: {
        orderBy: [
          { sortOrder: 'asc' },
          { imageId: 'asc' },
        ],
        take: 1,
        select: {
          imageUrl: true,
        },
      },
    },
  });

  if (!product) {
    const error = new Error(
      'Custom cake sedang tidak tersedia.'
    );
    error.statusCode = 404;
    throw error;
  }

  const options = await prisma.customOption.findMany({
    where: {
      isActive: true,
    },
    orderBy: {
      optionId: 'asc',
    },
    select: {
      optionId: true,
      optionGroup: true,
      name: true,
      description: true,
      extraPrice: true,
      imageUrl: true,
      isActive: true,
    },
  });

  const groupedOptions = Object.fromEntries(
    OPTION_GROUPS.map((group) => [group, []])
  );

  for (const option of options) {
    if (!groupedOptions[option.optionGroup]) {
      continue;
    }

    groupedOptions[option.optionGroup].push({
      option_id: option.optionId,
      option_group: option.optionGroup,
      name: option.name,
      description: option.description,
      extra_price: Number(option.extraPrice),
      image_url: option.imageUrl,
      is_active: option.isActive,
    });
  }

  return {
    product: {
      product_id: String(product.productId),
      name: product.name,
      description: product.description,
      price: Number(product.price),
      lead_time_days: product.leadTimeDays,
      image_url: product.images[0]?.imageUrl ?? null,
    },
    options: groupedOptions,
    today_key: getJakartaDateKey(now),
    earliest_ready_date: getEarliestReadyDate(product, now),
  };
}

module.exports = {
  getCustomCakeBuilder,
};
