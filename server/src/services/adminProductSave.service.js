// services/adminProductSave.service.js
// Step 6.4 · FR-30 · UC-23 · AD-06 — tambah (POST) & ubah (PUT) produk beserta varian dan foto (maks. 5).
// Port server dari client/src/services/mock/adminCatalogWrites.js saveAdminProduct dengan aturan & pesan sama.
//
// Foto (keputusan Step 6.4): `photos` = [{ image_id } | { file_index }]; urutan array = sort_order (pertama = utama).
//   - image_id wajib milik produk ini; file_index merujuk file ke-n pada field multipart `photos`;
//   - tanpa referensi ganda, setiap file yang diunggah wajib dirujuk tepat sekali, total ≤ 5;
//   - data URL ditolak (foto baru wajib dikirim sebagai file multipart);
//   - PUT tanpa properti `photos` → foto lama dipertahankan apa adanya.
// File baru ditulis SEBELUM transaksi (URL dibutuhkan baris product_images) dan dihapus bila penyimpanan gagal;
// file unggahan lama yang dilepas dihapus SETELAH commit. Foto data contoh (/images/…) tidak pernah dihapus.
// Varian & produk tidak dihapus (A-05): varian tersimpan yang tidak dikirim tetap ada (ditaruh di akhir agar indeks
// error = indeks form).

const prisma = require('../lib/prisma');
const { PRODUCT_PHOTO_MAX } = require('../utils/businessConstants');
const { saveProductPhoto, deleteProductPhoto } = require('../utils/productPhotoStorage');
const { normalizeProductInput, validateProduct, validationError } = require('./adminCatalogRules.service');
const { lockAdminMasterData } = require('./adminMasterDataLock.service');
const { NOT_FOUND_MESSAGE, mapVariant, loadValidationContext } = require('./adminProduct.service');

const PHOTO_ERROR = Object.freeze({
  DATA_URL: 'Foto baru harus diunggah sebagai file, bukan data URL.',
  INVALID: 'Data foto tidak valid. Muat ulang halaman.',
  NOT_FOUND: 'Foto tidak ditemukan. Muat ulang halaman.',
  DUPLICATE: 'Foto yang sama dikirim lebih dari sekali.',
  FILE_INDEX: 'Foto baru tidak ditemukan pada unggahan.',
  UNREFERENCED: 'Setiap foto yang diunggah harus dicantumkan di daftar foto.',
  MAX: `Maksimal ${PRODUCT_PHOTO_MAX} foto`,
});

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

const photoError = (message) => validationError({ photos: message });

/**
 * Cek referensi foto yang tidak butuh database (dilakukan sebelum file ditulis).
 * @param {Array|undefined} refs — photos dari body (undefined = tidak dikirim)
 * @param {number} fileCount — jumlah file multipart
 * @returns {Array<{imageId: string}|{fileIndex: number}>|null} null bila foto dipertahankan (PUT tanpa photos)
 */
function resolvePhotoRefs(refs, fileCount, isCreate) {
  if (refs === undefined) {
    if (fileCount > 0) throw photoError(PHOTO_ERROR.UNREFERENCED);
    return isCreate ? [] : null;
  }
  const seenImages = new Set();
  const seenFiles = new Set();
  const entries = refs.map((ref) => {
    if (typeof ref.image_url === 'string' && ref.image_url.trim().toLowerCase().startsWith('data:')) {
      throw photoError(PHOTO_ERROR.DATA_URL);
    }
    const hasImage = ref.image_id != null && ref.image_id !== '';
    const hasFile = ref.file_index != null;
    if (hasImage === hasFile) throw photoError(PHOTO_ERROR.INVALID);
    if (hasImage) {
      const id = String(ref.image_id);
      if (!/^[1-9]\d{0,18}$/.test(id)) throw photoError(PHOTO_ERROR.NOT_FOUND);
      if (seenImages.has(id)) throw photoError(PHOTO_ERROR.DUPLICATE);
      seenImages.add(id);
      return { imageId: id };
    }
    if (ref.file_index < 0 || ref.file_index >= fileCount) throw photoError(PHOTO_ERROR.FILE_INDEX);
    if (seenFiles.has(ref.file_index)) throw photoError(PHOTO_ERROR.DUPLICATE);
    seenFiles.add(ref.file_index);
    return { fileIndex: ref.file_index };
  });
  if (seenFiles.size !== fileCount) throw photoError(PHOTO_ERROR.UNREFERENCED);
  if (entries.length > PRODUCT_PHOTO_MAX) throw photoError(PHOTO_ERROR.MAX);
  return entries;
}

/** Varian kiriman (id lama wajib milik produk) + varian tersimpan yang tidak dikirim (tetap ada, di akhir) */
function buildVariants(sent, ownVariants) {
  const ownIds = new Set(ownVariants.map((v) => v.variant_id));
  const rows = sent.map((v) => {
    const id = v.variant_id == null || v.variant_id === '' ? null : String(v.variant_id);
    if (id != null && !ownIds.has(id)) throw httpError(400, 'Varian tidak ditemukan. Muat ulang halaman.');
    return { ...v, variant_id: id };
  });
  const sentIds = new Set(rows.map((v) => v.variant_id).filter(Boolean));
  return { rows, kept: ownVariants.filter((v) => !sentIds.has(v.variant_id)) };
}

/** Tulis varian: ubah yang dikirim, buat yang baru; varian tidak dikirim tidak disentuh */
async function writeVariants(tx, productId, rows) {
  for (const v of rows) {
    const data = { name: v.name, extraPrice: v.extra_price, isActive: v.is_active };
    if (v.variant_id) await tx.productVariant.update({ where: { variantId: BigInt(v.variant_id) }, data });
    else await tx.productVariant.create({ data: { ...data, productId } });
  }
}

/** Tulis foto sesuai urutan; baris yang dilepas dihapus → URL unggahan lama yang perlu dihapus setelah commit */
async function writePhotos(tx, productId, entries, savedUrls, ownImages) {
  const keep = new Set(entries.filter((e) => e.imageId).map((e) => e.imageId));
  const removed = ownImages.filter((img) => !keep.has(String(img.imageId)));
  if (removed.length) await tx.productImage.deleteMany({ where: { imageId: { in: removed.map((img) => img.imageId) } } });
  for (const [i, entry] of entries.entries()) {
    if (entry.imageId) {
      await tx.productImage.update({ where: { imageId: BigInt(entry.imageId) }, data: { sortOrder: i + 1 } });
    } else {
      await tx.productImage.create({ data: { productId, imageUrl: savedUrls[entry.fileIndex], sortOrder: i + 1 } });
    }
  }
  return removed.map((img) => img.imageUrl);
}

/**
 * POST /api/admin/products (productId null) & PUT /api/admin/products/:id.
 * @param {string|null} productId
 * @param {object} input — body hasil validators/adminCatalog.validator.js validateProductBody
 * @param {Array<{buffer: Buffer, extension: string}>} photos — file tervalidasi (validateProductPhoto), urut field
 * @returns {Promise<{product_id: string}>}
 */
async function saveProduct(productId, input, photos = []) {
  const isCreate = productId == null;
  const entries = resolvePhotoRefs(input.photos, photos.length, isCreate);
  const product = normalizeProductInput(input);

  const savedUrls = [];
  try {
    for (const photo of photos) savedUrls.push(await saveProductPhoto(photo));

    const { id, removedUrls } = await prisma.$transaction(async (tx) => {
      await lockAdminMasterData(tx);
      const existing = isCreate ? null : await tx.product.findUnique({
        where: { productId: BigInt(productId) },
        include: { variants: { orderBy: { variantId: 'asc' } }, images: { select: { imageId: true, imageUrl: true } } },
      });
      if (!isCreate && !existing) throw httpError(404, NOT_FOUND_MESSAGE);

      const ownVariants = (existing?.variants ?? []).map(mapVariant);
      const { rows, kept } = buildVariants(product.variants, ownVariants);
      const ctx = await loadValidationContext(tx);
      // Varian tersimpan yang tidak dikirim tetap dihitung saat memeriksa nama ganda / varian aktif custom cake
      const errors = validateProduct(
        { ...product, variants: [...rows, ...kept], photoCount: entries ? entries.length : 0 },
        { ...ctx, productId: existing ? String(existing.productId) : null }
      );
      if (Object.keys(errors).length) throw validationError(errors);

      // Foto lama hanya boleh dari produk ini (urutan pengecekan sama dengan mock: varian → validasi → foto)
      const ownImages = existing?.images ?? [];
      const ownImageIds = new Set(ownImages.map((img) => String(img.imageId)));
      if (entries?.some((e) => e.imageId && !ownImageIds.has(e.imageId))) throw photoError(PHOTO_ERROR.NOT_FOUND);

      const data = {
        categoryId: product.category_id,
        name: product.name,
        description: product.description,
        ingredients: product.ingredients,
        allergens: product.allergens,
        price: product.price,
        availabilityType: product.availability_type,
        leadTimeDays: product.lead_time_days,
        isActive: product.is_active,
      };
      const saved = existing
        ? await tx.product.update({ where: { productId: existing.productId }, data, select: { productId: true } })
        : await tx.product.create({ data, select: { productId: true } });

      await writeVariants(tx, saved.productId, rows);
      const removed = entries ? await writePhotos(tx, saved.productId, entries, savedUrls, ownImages) : [];
      return { id: saved.productId, removedUrls: removed };
    });

    // Setelah commit: file unggahan yang dilepas dihapus (aset /images/… diabaikan oleh deleteProductPhoto)
    await Promise.all(removedUrls.map((url) => deleteProductPhoto(url).catch((error) => {
      console.error('[Foto produk] Gagal menghapus file lama:', url, error.message);
    })));
    return { product_id: String(id) };
  } catch (error) {
    await Promise.all(savedUrls.map((url) => deleteProductPhoto(url).catch(() => {})));
    throw error;
  }
}

module.exports = {
  PHOTO_ERROR,
  resolvePhotoRefs,
  saveProduct,
};
