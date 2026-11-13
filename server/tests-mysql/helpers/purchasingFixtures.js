// tests-mysql/helpers/purchasingFixtures.js
// CR-04a CP5 — penyiapan & pemeriksaan bersama suite 22 – 23 (pembelian). Bahan dibuat lewat API (saldo awal ikut
// dibuat, fixture CR-04 wajib — Errata E1.1 §4); aksi yang diuji selalu lewat HTTP asli.

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { CONTAINER, DATABASE, db, rows } = require('./context');
const { call } = require('./server');
const { unique } = require('./fixtures');
const { loadLedgerMaterials } = require('../../src/services/ledgerData.service');
const { checkMaterialLedger } = require('../../src/services/ledgerRules.service');

let seq = 0;
const rid = () => `7d1e2f3a-4b5c-4d6e-9f70-${String(Date.now() % 1e6).padStart(6, '0')}${String((seq += 1)).padStart(6, '0')}`;

function context(server, { staff, owner }) {
  const api = (method, path, body, userId = staff) => call(server, method, `/api/admin${path}`, { userId, body });
  const created = [];
  async function material(stock = '10') {
    const res = await api('POST', '/raw-materials', { name: unique('Bahan P5 '), unit: 'kg', stock, min_stock: '1' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    created.push(res.body.data.material_id);
    return res.body.data.material_id;
  }
  async function supplier(materialIds, extra = {}) {
    const res = await api('POST', '/suppliers', {
      name: unique('Supplier P5 '), phone: '+6281234567890', address: 'Jl. Uji 1', email: 'uji@supplier.id', contact_person: 'Ani',
      material_ids: materialIds, request_id: rid(), ...extra,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.data.supplier_id;
  }
  async function purchaseOrder(supplierId, items, { order = true } = {}) {
    const res = await api('POST', '/purchase-orders', { supplier_id: supplierId, items, request_id: rid() });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    if (order) {
      const ordered = await api('PATCH', `/purchase-orders/${res.body.data.po_id}/status`, { from: 'draft', to: 'dipesan', request_id: rid() }, owner);
      assert.equal(ordered.status, 200, JSON.stringify(ordered.body));
      return ordered.body.data;
    }
    return res.body.data;
  }
  async function assertLedger() {
    for (const m of await loadLedgerMaterials(db, created)) assert.deepEqual(checkMaterialLedger(m), [], `bahan ${m.materialId}`);
  }
  return { api, material, supplier, purchaseOrder, assertLedger, created };
}

const stockOf = async (id) => (await rows('SELECT CAST(stock AS CHAR) AS s FROM raw_materials WHERE material_id = ?', id))[0].s;
const fingerprint = async () => (await rows(`SELECT (SELECT COUNT(*) FROM goods_receipts) AS gr, (SELECT COUNT(*) FROM goods_receipt_lines) AS grl,
  (SELECT COUNT(*) FROM material_movements) AS mm, (SELECT COUNT(*) FROM audit_logs) AS al, (SELECT COUNT(*) FROM operation_requests) AS opr,
  (SELECT COUNT(*) FROM purchase_orders) AS po, (SELECT COUNT(*) FROM purchase_order_items) AS poi, (SELECT COUNT(*) FROM suppliers) AS sp,
  (SELECT COUNT(*) FROM supplier_materials) AS sm, (SELECT CAST(SUM(stock) AS CHAR) FROM raw_materials) AS stock`))[0];

function mysqlCli(sql) {
  const password = decodeURIComponent(new URL(process.env.ROOT_DATABASE_URL).password);
  const result = spawnSync('docker', ['exec', '-i', CONTAINER, 'mysql', '-uroot', `-p${password}`, DATABASE], { input: sql, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`mysql gagal: ${result.stderr}`);
}

async function withFailingTrigger(name, table, fn) {
  mysqlCli(`CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${name}';`);
  try {
    return await fn();
  } finally {
    mysqlCli(`DROP TRIGGER IF EXISTS ${name};`);
  }
}

module.exports = { rid, context, stockOf, fingerprint, mysqlCli, withFailingTrigger };
