// CR-04a CP4 · BR-31 (Draft 0.8.3 §5.1; SPEC §6 `request_id`) — `request_id` sebagai FIELD body multipart pada tiga
// endpoint upload (AD-06 produk, C-11 desain custom cake, C-19 ulasan) — semuanya di luar allowlist. Middleware global
// tidak melihat body multipart (diurai multer di router), tetapi kontrak "ditolak 400 tanpa efek" tetap terpenuhi:
//   (a) request_id + field JSON wajib → multer `fields: 1` → LIMIT_FIELD_COUNT → 400 sebelum handler;
//   (b) request_id saja → field JSON wajib (product/design/review) tidak ada → parser → 400 sebelum service.
// Uji ini memakai middleware & parser asli dengan handler pengganti yang mencatat bila service sempat dipanggil.

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { requestId } = require('../src/middlewares/requestId');
const productPhotoUpload = require('../src/middlewares/productPhotoUpload');
const referencePhotoUpload = require('../src/middlewares/referencePhotoUpload');
const reviewPhotoUpload = require('../src/middlewares/reviewPhotoUpload');
const { parseMultipartProduct } = require('../src/validators/adminCatalog.validator');
const { parseMultipartDesign } = require('../src/validators/customCakeDesign.validator');
const { parseMultipartReview } = require('../src/validators/review.validator');

const RID = '3b1f6c2e-8a4d-4f1b-9c2d-000000000001';
const CASES = [
  ['produk AD-06', productPhotoUpload, parseMultipartProduct, 'product'],
  ['desain custom cake C-11', referencePhotoUpload, parseMultipartDesign, 'design'],
  ['ulasan C-19', reviewPhotoUpload, parseMultipartReview, 'review'],
];

async function post(upload, parse, form) {
  let reachedService = false;
  const app = express();
  app.use(express.json());
  app.use(requestId);
  app.post('/x', upload, (req, res, next) => {
    try {
      if (req.is('multipart/form-data')) parse(req.body);
      reachedService = true;
      res.status(201).json({ ok: true });
    } catch (err) { next(err); }
  });
  app.use((err, req, res, _next) => res.status(err.statusCode ?? 500).json({ message: err.message }));
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/x`, { method: 'POST', body: form });
    return { status: res.status, reachedService };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('request_id sebagai field multipart di endpoint luar allowlist → 400 sebelum service (tanpa efek)', async () => {
  for (const [label, upload, parse, field] of CASES) {
    const withJson = new FormData();
    withJson.append(field, '{}');
    withJson.append('request_id', RID);
    assert.deepEqual(await post(upload, parse, withJson), { status: 400, reachedService: false }, `${label}: + field JSON`);
    const only = new FormData();
    only.append('request_id', RID);
    assert.deepEqual(await post(upload, parse, only), { status: 400, reachedService: false }, `${label}: request_id saja`);
    const normal = new FormData();
    normal.append(field, '{}');
    assert.deepEqual(await post(upload, parse, normal), { status: 201, reachedService: true }, `${label}: kontrol tanpa request_id`);
  }
});
