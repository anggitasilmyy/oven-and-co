// services/address.service.js
// FR-24 · BR-12 · UC-16 · C-22 Alamat Tersimpan — kelola alamat pelanggan login (tabel addresses).
// Bentuk respons mengikuti client services/addressService.js. Aturan alamat utama sama dengan client
// utils/rules/account.js normalizePrimaryAddress: tepat satu alamat utama selama pelanggan punya alamat,
// alamat pertama otomatis utama, dan bila alamat utama dihapus alamat lain (id terkecil) menjadi utama.
// userId SELALU dari req.user (middleware auth), tidak pernah dari body/URL.

const prisma = require('../lib/prisma');
const { getDeliveryQuote, distanceKm } = require('./checkoutRules.service');
const { mapStoreSetting, mapAddress } = require('./checkout.service');

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const NOT_FOUND_MESSAGE = 'Alamat tidak ditemukan.';
// orders.address_id → addresses ON DELETE RESTRICT (ROADMAP 6.1): rujukan pesanan lama tidak dikosongkan
const IN_USE_MESSAGE = 'Alamat sudah dipakai pada pesanan sehingga tidak dapat dihapus. Kamu tetap bisa mengubahnya.';

/** Isian tervalidasi → kolom Prisma */
function toData(input) {
  return {
    label: input.label,
    recipientName: input.recipient_name,
    recipientPhone: input.recipient_phone,
    fullAddress: input.full_address,
    latitude: input.latitude,
    longitude: input.longitude,
    courierNote: input.courier_note,
  };
}

/**
 * Kunci baris pengguna selama transaksi agar perubahan alamat milik pelanggan yang sama berjalan berurutan
 * (dua request bersamaan tidak menghasilkan dua alamat utama).
 */
async function lockUser(tx, userId) {
  await tx.$queryRaw`SELECT user_id FROM users WHERE user_id = ${userId} FOR UPDATE`;
}

async function findOwnAddress(tx, userId, addressId) {
  const address = await tx.address.findFirst({
    where: { addressId, userId },
    select: { addressId: true, isPrimary: true },
  });

  if (!address) throw httpError(404, NOT_FOUND_MESSAGE);
  return address;
}

/** Jadikan `addressId` satu-satunya alamat utama milik pelanggan */
async function makePrimary(tx, userId, addressId) {
  await tx.address.updateMany({
    where: { userId, isPrimary: true, addressId: { not: addressId } },
    data: { isPrimary: false },
  });
  await tx.address.update({ where: { addressId }, data: { isPrimary: true } });
}

/** GET /api/me/addresses — { store, settings, addresses } (utama dulu) + jarak & status radius (BR-12) */
async function getMyAddresses(userId) {
  const [storeRow, rows] = await Promise.all([
    prisma.storeSetting.findFirst({ orderBy: { settingId: 'asc' } }),
    prisma.address.findMany({
      where: { userId: BigInt(userId) },
      orderBy: [{ isPrimary: 'desc' }, { addressId: 'asc' }],
    }),
  ]);

  if (!storeRow) {
    throw httpError(500, 'Pengaturan toko belum tersedia.');
  }

  const settings = mapStoreSetting(storeRow);

  return {
    store: {
      name: settings.store_name,
      address: settings.address,
      latitude: settings.latitude,
      longitude: settings.longitude,
    },
    settings,
    addresses: rows.map((row) => {
      const address = mapAddress(row);
      return { ...address, ...getDeliveryQuote(distanceKm(settings, address), settings) };
    }),
  };
}

/** POST /api/me/addresses — alamat pertama, atau `is_primary: true`, menjadi alamat utama */
async function createAddress(userId, input) {
  const owner = BigInt(userId);

  return prisma.$transaction(async (tx) => {
    await lockUser(tx, owner);

    const currentPrimary = await tx.address.findFirst({
      where: { userId: owner, isPrimary: true },
      select: { addressId: true },
    });
    const created = await tx.address.create({
      data: { ...toData(input), userId: owner, isPrimary: false },
      select: { addressId: true },
    });

    if (input.is_primary || !currentPrimary) {
      await makePrimary(tx, owner, created.addressId);
    }

    return { address_id: String(created.addressId) };
  });
}

/** PUT /api/me/addresses/:id — `is_primary: true` menjadikannya utama; false tidak mencabut status utama */
async function updateAddress(userId, addressId, input) {
  const owner = BigInt(userId);
  const id = BigInt(addressId);

  return prisma.$transaction(async (tx) => {
    await lockUser(tx, owner);
    await findOwnAddress(tx, owner, id);
    await tx.address.update({ where: { addressId: id }, data: toData(input) });

    if (input.is_primary) {
      await makePrimary(tx, owner, id);
    }

    return { address_id: String(id) };
  });
}

/** PATCH /api/me/addresses/:id/primary */
async function setPrimaryAddress(userId, addressId) {
  const owner = BigInt(userId);
  const id = BigInt(addressId);

  return prisma.$transaction(async (tx) => {
    await lockUser(tx, owner);
    await findOwnAddress(tx, owner, id);
    await makePrimary(tx, owner, id);

    return { address_id: String(id) };
  });
}

/** DELETE /api/me/addresses/:id — ditolak 409 bila dirujuk pesanan; utama dihapus → alamat lain jadi utama */
async function deleteAddress(userId, addressId) {
  const owner = BigInt(userId);
  const id = BigInt(addressId);

  try {
    return await prisma.$transaction(async (tx) => {
      await lockUser(tx, owner);
      const address = await findOwnAddress(tx, owner, id);

      if ((await tx.order.count({ where: { addressId: id } })) > 0) {
        throw httpError(409, IN_USE_MESSAGE);
      }

      await tx.address.delete({ where: { addressId: id } });

      if (address.isPrimary) {
        const next = await tx.address.findFirst({
          where: { userId: owner },
          orderBy: { addressId: 'asc' },
          select: { addressId: true },
        });
        if (next) await makePrimary(tx, owner, next.addressId);
      }

      return { address_id: String(id) };
    });
  } catch (error) {
    // Pesanan baru dibuat dengan alamat ini di sela pengecekan → FK RESTRICT menolak penghapusan
    if (error.code === 'P2003') throw httpError(409, IN_USE_MESSAGE);
    throw error;
  }
}

module.exports = {
  getMyAddresses,
  createAddress,
  updateAddress,
  setPrimaryAddress,
  deleteAddress,
};
