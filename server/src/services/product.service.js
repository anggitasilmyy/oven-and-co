
const prisma = require('../lib/prisma');

const VALID_AVAILABILITY = new Set([
  'ready',
  'preorder',
  'custom',
]);

const SORT_OPTIONS = {
  default: [
    { productId: 'asc' },
  ],
  price_asc: [
    { price: 'asc' },
    { productId: 'asc' },
  ],
  price_desc: [
    { price: 'desc' },
    { productId: 'asc' },
  ],
  name_asc: [
    { name: 'asc' },
    { productId: 'asc' },
  ],
  name_desc: [
    { name: 'desc' },
    { productId: 'asc' },
  ],
};

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function readString(value, fieldName) {
  if (value === undefined) return undefined;

  if (typeof value !== 'string') {
    throw httpError(400, `Parameter ${fieldName} tidak valid.`);
  }

  return value;
}

function parsePositiveInteger(value, fieldName, defaultValue) {
  const raw = readString(value, fieldName);

  if (raw === undefined) return defaultValue;

  if (!/^[1-9]\d*$/.test(raw)) {
    throw httpError(400, `Parameter ${fieldName} harus berupa bilangan bulat positif.`);
  }

  const parsed = Number(raw);

  if (!Number.isSafeInteger(parsed)) {
    throw httpError(400, `Parameter ${fieldName} terlalu besar.`);
  }

  return parsed;
}

function serializeProduct(product) {
  const result = {
    productId: String(product.productId),
    categoryId: product.categoryId,
    name: product.name,
    description: product.description,
    ingredients: product.ingredients,
    allergens: product.allergens,
    price: Number(product.price),
    availabilityType: product.availabilityType,
    leadTimeDays: product.leadTimeDays,
    isActive: product.isActive,
    category: product.category
      ? {
          categoryId: product.category.categoryId,
          name: product.category.name,
          sortOrder: product.category.sortOrder,
        }
      : null,
    images: (product.images || []).map((image) => ({
      imageId: String(image.imageId),
      imageUrl: image.imageUrl,
      sortOrder: image.sortOrder,
    })),
  };

  if (Array.isArray(product.variants)) {
    result.variants = product.variants.map((variant) => ({
      variantId: String(variant.variantId),
      name: variant.name,
      extraPrice: Number(variant.extraPrice),
      isActive: variant.isActive,
    }));
  }

  return result;
}

async function getProducts(query = {}) {
  const rawSearch = readString(query.q ?? query.search, 'q');
  const search = rawSearch?.trim() || '';

  if (search.length > 100) {
    throw httpError(400, 'Pencarian maksimal 100 karakter.');
  }

  const categoryId = parsePositiveInteger(
    query.categoryId,
    'categoryId',
    undefined
  );

  const page = parsePositiveInteger(query.page, 'page', 1);
  const limit = parsePositiveInteger(query.limit, 'limit', 12);

  if (limit > 50) {
    throw httpError(400, 'Parameter limit maksimal 50.');
  }

  const rawAvailability = readString(
    query.availabilityType,
    'availabilityType'
  );

  const availabilityType = rawAvailability?.trim() || undefined;

  if (
    availabilityType !== undefined &&
    !VALID_AVAILABILITY.has(availabilityType)
  ) {
    throw httpError(
      400,
      'availabilityType harus ready, preorder, atau custom.'
    );
  }

  const rawSort = readString(query.sort, 'sort');
  const sort = rawSort?.trim() || 'default';

  if (!Object.prototype.hasOwnProperty.call(SORT_OPTIONS, sort)) {
    throw httpError(
      400,
      'sort harus default, price_asc, price_desc, name_asc, atau name_desc.'
    );
  }

  const where = {
    isActive: true,
    ...(categoryId !== undefined ? { categoryId } : {}),
    ...(availabilityType ? { availabilityType } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { description: { contains: search } },
            { ingredients: { contains: search } },
          ],
        }
      : {}),
  };

  const skip = (page - 1) * limit;

  if (!Number.isSafeInteger(skip)) {
    throw httpError(400, 'Kombinasi page dan limit terlalu besar.');
  }

  const [total, rows] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: SORT_OPTIONS[sort],
      skip,
      take: limit,
      include: {
        category: {
          select: {
            categoryId: true,
            name: true,
            sortOrder: true,
          },
        },
        images: {
          orderBy: [
            { sortOrder: 'asc' },
            { imageId: 'asc' },
          ],
          select: {
            imageId: true,
            imageUrl: true,
            sortOrder: true,
          },
        },
      },
    }),
  ]);

  return {
    products: rows.map(serializeProduct),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: skip + rows.length < total,
      hasPreviousPage: page > 1,
    },
  };
}

async function getProductById(id) {
  if (
    typeof id !== 'string' ||
    !/^[1-9]\d*$/.test(id)
  ) {
    throw httpError(400, 'ID produk tidak valid.');
  }

  const productId = BigInt(id);

  if (productId > 9223372036854775807n) {
    throw httpError(400, 'ID produk terlalu besar.');
  }

  const product = await prisma.product.findFirst({
    where: {
      productId,
      isActive: true,
    },
    include: {
      category: {
        select: {
          categoryId: true,
          name: true,
          sortOrder: true,
        },
      },
      images: {
        orderBy: [
          { sortOrder: 'asc' },
          { imageId: 'asc' },
        ],
        select: {
          imageId: true,
          imageUrl: true,
          sortOrder: true,
        },
      },
      variants: {
        where: {
          isActive: true,
        },
        orderBy: {
          variantId: 'asc',
        },
        select: {
          variantId: true,
          name: true,
          extraPrice: true,
          isActive: true,
        },
      },
    },
  });

  if (!product) {
    throw httpError(404, 'Produk tidak ditemukan.');
  }

  return serializeProduct(product);
}

module.exports = {
  getProducts,
  getProductById,
};
