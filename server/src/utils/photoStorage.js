// utils/photoStorage.js
// Penyimpanan lokal foto unggahan (prototype) — dipakai foto referensi custom cake (FR-10) dan foto ulasan (FR-21).
// Tipe file ditentukan dari isi file (magic bytes), bukan dari nama/MIME kiriman klien; nama file selalu acak.
// File disajikan lewat express.static di app.js; URL relatif `/uploads/<folder>/<32 hex>.<ext>` muat di VARCHAR(255).

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

// Sama dengan client constants/customCake.js REFERENCE_PHOTO_MAX_BYTES & constants/orderHistory.js REVIEW_PHOTO_MAX_BYTES
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// Nama file asli hanya diperiksa (tidak pernah dipakai sebagai path)
const ORIGINAL_NAME_PATTERN = /^[\w\-. ()]{1,100}\.(jpe?g|png|webp)$/i;
const STORED_NAME_PATTERN = /^[a-f0-9]{32}\.(jpg|png|webp)$/;

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getUploadRoot() {
  return process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.resolve(__dirname, '../../uploads');
}

/** JPEG / PNG / WebP dari magic bytes; null bila bukan salah satunya */
function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', extension: 'jpg' };
  }

  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', extension: 'png' };
  }

  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', extension: 'webp' };
  }

  return null;
}

/**
 * @param {{folder: string, label: string}} options — folder di bawah UPLOAD_DIR; label untuk pesan ("foto referensi")
 */
function createPhotoStore({ folder, label }) {
  const urlPrefix = `/uploads/${folder}/`;
  const Label = label.charAt(0).toUpperCase() + label.slice(1);

  function getDir() {
    return path.join(getUploadRoot(), folder);
  }

  /**
   * Validasi file hasil multer (memoryStorage).
   * @param {{originalname: string, mimetype: string, size: number, buffer: Buffer}} file
   * @returns {{buffer: Buffer, extension: string}}
   */
  function validate(file) {
    if (!file || !Buffer.isBuffer(file.buffer) || file.size === 0) {
      throw createError(`${Label} kosong atau tidak terbaca.`);
    }

    if (file.size > PHOTO_MAX_BYTES) {
      throw createError(`Ukuran ${label} maksimal 5 MB.`);
    }

    if (typeof file.originalname !== 'string' || !ORIGINAL_NAME_PATTERN.test(file.originalname)) {
      throw createError('Nama file foto tidak valid. Gunakan file JPG, PNG, atau WebP.');
    }

    if (!PHOTO_MIME_TYPES.includes(file.mimetype)) {
      throw createError('Format foto harus JPG, PNG, atau WebP.');
    }

    const detected = detectImageType(file.buffer);

    // MIME kiriman klien harus cocok dengan isi file sebenarnya
    if (!detected || detected.mime !== file.mimetype) {
      throw createError('Isi file bukan foto JPG, PNG, atau WebP yang valid.');
    }

    return { buffer: file.buffer, extension: detected.extension };
  }

  /** Simpan foto tervalidasi dengan nama acak → URL relatif */
  async function save({ buffer, extension }) {
    const dir = getDir();
    const fileName = `${crypto.randomBytes(16).toString('hex')}.${extension}`;

    await fs.mkdir(dir, { recursive: true });
    // flag 'wx': gagal bila nama sudah ada (tidak menimpa file lain)
    await fs.writeFile(path.join(dir, fileName), buffer, { flag: 'wx' });

    return `${urlPrefix}${fileName}`;
  }

  /** Hapus foto yang sudah tersimpan (mis. data gagal disimpan). Hanya URL milik folder ini yang diproses. */
  async function remove(url) {
    if (typeof url !== 'string' || !url.startsWith(urlPrefix)) return;

    const fileName = url.slice(urlPrefix.length);

    if (!STORED_NAME_PATTERN.test(fileName)) return;

    await fs.rm(path.join(getDir(), fileName), { force: true });
  }

  return { urlPrefix, getDir, validate, save, remove };
}

module.exports = {
  PHOTO_MAX_BYTES,
  detectImageType,
  createPhotoStore,
};
