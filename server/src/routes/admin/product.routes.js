// routes/admin/product.routes.js
// Step 6.4 · FR-30 · UC-23 · AD-06 — produk untuk admin (Staf & Owner). Kontrak = client services/adminProductService.js.
// POST/PUT menerima JSON (tanpa foto baru) atau multipart: file `photos` (maks. 5) + JSON `product`.

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const productPhotoUpload = require('../../middlewares/productPhotoUpload');
const adminProductService = require('../../services/adminProduct.service');
const { saveProduct } = require('../../services/adminProductSave.service');
const { validateProductPhoto } = require('../../utils/productPhotoStorage');
const {
  validateProductId, parseMultipartProduct, validateProductBody, validateActiveBody,
} = require('../../validators/adminCatalog.validator');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.use(auth, requireRole('staf', 'owner'));

/** Body produk dari JSON atau multipart; file divalidasi isinya sebelum apa pun ditulis */
function readProductRequest(req) {
  const isMultipart = req.is('multipart/form-data');
  const input = validateProductBody(isMultipart ? parseMultipartProduct(req.body) : req.body);
  const photos = isMultipart ? (req.files ?? []).map(validateProductPhoto) : [];
  return { input, photos };
}

// GET /api/admin/products → { rows, categories }
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.status(200).json({ status: 'success', data: await adminProductService.getAdminProducts() });
  })
);

// GET /api/admin/products/:id → produk + photos + variants (404 bila tidak ada)
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const productId = validateProductId(req.params.id);
    res.status(200).json({ status: 'success', data: await adminProductService.getAdminProduct(productId) });
  })
);

// POST /api/admin/products → 201 { product_id }
router.post(
  '/',
  productPhotoUpload,
  asyncHandler(async (req, res) => {
    const { input, photos } = readProductRequest(req);
    res.status(201).json({ status: 'success', data: await saveProduct(null, input, photos) });
  })
);

// PUT /api/admin/products/:id → { product_id }
router.put(
  '/:id',
  productPhotoUpload,
  asyncHandler(async (req, res) => {
    const productId = validateProductId(req.params.id);
    const { input, photos } = readProductRequest(req);
    res.status(200).json({ status: 'success', data: await saveProduct(productId, input, photos) });
  })
);

// PATCH /api/admin/products/:id/active { is_active } → { product_id, is_active }
router.patch(
  '/:id/active',
  asyncHandler(async (req, res) => {
    const productId = validateProductId(req.params.id);
    const { is_active: isActive } = validateActiveBody(req.body);
    res.status(200).json({ status: 'success', data: await adminProductService.setProductActive(productId, isActive) });
  })
);

module.exports = router;
