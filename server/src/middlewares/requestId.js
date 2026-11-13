// middlewares/requestId.js
// CR-04a CP4 · BR-31 (Draft 0.8.3 §5.1; SPEC §6 `request_id`) — satu middleware GLOBAL untuk allowlist `request_id`:
//   - operasi pada tabel allowlist → request_id wajib/opsional sesuai REQUEST_ID_POLICY (aturan murni CP3);
//   - SEMUA endpoint lain (termasuk endpoint lama, GET, laporan) yang membawa request_id di body maupun query → 400,
//     tanpa efek lain; endpoint tanpa request_id tidak berubah perilakunya.
// request_id yang sah disimpan di req.requestId lalu dihapus dari body/query sehingga validator lama tidak berubah.
// Body multipart (upload foto AD-06, C-11, C-19 — semuanya di luar allowlist) diurai multer di router, sesudah middleware
// ini; field `request_id` di sana tetap ditolak 400 sebelum service karena multer `fields: 1` (LIMIT_FIELD_COUNT) atau
// field JSON wajib hilang (tests/requestIdMultipart.test.js).

const { requestIdPolicyError } = require('../services/idempotencyRules.service');

// Draft §5.1 bagian CR-04a: [method, pola path, operasi]
const REQUEST_ID_ROUTES = Object.freeze([
  ['POST', /^\/api\/admin\/suppliers\/?$/, 'create_supplier'],
  ['PUT', /^\/api\/admin\/suppliers\/[^/]+\/?$/, 'update_supplier'],
  ['PATCH', /^\/api\/admin\/suppliers\/[^/]+\/active\/?$/, 'set_supplier_active'],
  ['POST', /^\/api\/admin\/purchase-orders\/?$/, 'create_purchase_order'],
  ['PUT', /^\/api\/admin\/purchase-orders\/[^/]+\/?$/, 'update_purchase_order'],
  ['PATCH', /^\/api\/admin\/purchase-orders\/[^/]+\/status\/?$/, 'transition_purchase_order'],
  ['POST', /^\/api\/admin\/purchase-orders\/[^/]+\/receipts\/?$/, 'receive_purchase_order'],
  ['POST', /^\/api\/admin\/goods-receipts\/[^/]+\/reverse\/?$/, 'reverse_goods_receipt'],
  ['POST', /^\/api\/admin\/goods-receipts\/[^/]+\/correct\/?$/, 'correct_goods_receipt'],
  ['POST', /^\/api\/admin\/raw-materials\/?$/, 'create_raw_material'],
  ['PUT', /^\/api\/admin\/raw-materials\/[^/]+\/?$/, 'update_raw_material'],
  ['POST', /^\/api\/admin\/raw-materials\/[^/]+\/stock-in\/?$/, 'raw_material_stock_in'],
  ['POST', /^\/api\/admin\/raw-materials\/[^/]+\/stock-counts\/?$/, 'count_stock'],
  ['POST', /^\/api\/admin\/stock-adjustments\/[^/]+\/reverse\/?$/, 'reverse_stock_in'],
  ['POST', /^\/api\/admin\/stock-adjustments\/[^/]+\/correct\/?$/, 'correct_stock_in'],
]);

function operationFor(method, path) {
  return REQUEST_ID_ROUTES.find(([m, pattern]) => m === method && pattern.test(path))?.[2] ?? null;
}

const has = (source) => source && typeof source === 'object' && Object.prototype.hasOwnProperty.call(source, 'request_id');

function requestId(req, res, next) {
  const inBody = has(req.body);
  const inQuery = has(req.query);
  const value = inBody ? req.body.request_id : inQuery ? req.query.request_id : undefined;
  const sent = inBody || inQuery;
  const operation = operationFor(req.method, req.path);
  // Tidak dikirim: diteruskan; operasi WAJIB ditolak di router SESUDAH auth (requireRequestId) agar tamu tetap 401
  const error = sent ? requestIdPolicyError(operation, value) : null;
  if (error || (inBody && inQuery)) {
    return res.status(400).json({ status: 'error', message: error?.message ?? 'request_id hanya boleh dikirim sekali.' });
  }
  if (sent) {
    req.requestId = value;
    if (inBody) delete req.body.request_id;
    if (inQuery) delete req.query.request_id;
  }
  return next();
}

/** Untuk operasi request_id WAJIB — dipanggil handler setelah auth & requireRole. 400 bila tidak dikirim. */
function requireRequestId(req) {
  const error = requestIdPolicyError(operationFor(req.method, req.originalUrl.split('?')[0]), req.requestId);
  if (error) throw Object.assign(new Error(error.message), { statusCode: error.status });
  return req.requestId;
}

module.exports = { requestId, requireRequestId, operationFor, REQUEST_ID_ROUTES };
