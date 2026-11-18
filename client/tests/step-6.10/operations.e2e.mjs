// Uji CR-04c · FR-47 · UC-38 · AC-47.1 – AC-47.4 · AD-08 tab Operasional di peramban, mode mock atau API:
// 1. Akses: Owner membuka tab Operasional (?tab=operasional, periode tetap di URL); Staf & pelanggan tidak bisa membuka AD-08.
// 2. Tab Penjualan tidak berubah (judul, KPI, panel) dan tetap default.
// 3. Data CR-04 hari ini (dibuat lewat services/ sebagai Staf): pembelian, penerimaan, mutasi, pemakaian 0,015 × 7 = 0,105
//    (aktual 0,10 → −0,005), hasil per WO "dikoreksi", rencana vs hasil, omzet pembanding = tab Penjualan, analisis FR-40.
// 4. Ekspor Excel/PDF = respons layar (AC-47.4); tanpa overflow horizontal; error state periode tidak sah.
// Jalankan: BASE=http://localhost:5173 WIDTH=1440 node tests/step-6.10/operations.e2e.mjs   (mode API: BASE=http://localhost:5174)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright/index.js'); }
const B = process.env.BASE ?? 'http://localhost:5173';
const W = Number(process.env.WIDTH ?? 1440);
const res = []; const errors = [];
const check = (n, ok, x = '') => res.push([ok, `${ok ? '✓' : '✗'} [${W}] ${n}${ok ? '' : ` — ${x}`}`]);
const TAG = `${W}-${Date.now() % 100000}`;

const b = await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const c = await b.newContext({ viewport: { width: W, height: 900 }, timezoneId: 'Asia/Jakarta', acceptDownloads: true });
await c.addInitScript(() => localStorage.setItem('ovenco_onboarding_done', '1'));
const p = await c.newPage();
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => m.type() === 'error' && !/status of 40[0349]/.test(m.text()) && errors.push(m.text()));
const wait = (ms) => p.waitForTimeout(ms);
const mainText = async () => (await p.locator('main').innerText()).replace(/\s+/g, ' ');
const noOverflow = () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const logout = () => p.evaluate(async () => (await import('/src/stores/useAuthStore.js')).default.getState().logout());
const login = async (pathName, id, email) => {
  await p.goto(`${B}${pathName}`); await wait(500);
  await p.fill(`#${id}-identifier`, email); await p.fill(`#${id}-password`, 'demo1234');
  await p.click(`#${id}-submit-btn`); await wait(1200);
};

// ── Data CR-04 hari ini sebagai Staf (lewat services/, sama di mode mock & API)
await login('/admin/login', 'admin-login', 'staf@demo.com');
const ids = await p.evaluate(async (tag) => {
  const uuid = () => crypto.randomUUID();
  const S = await import('/src/services/stockService.js');
  const P = await import('/src/services/purchasingService.js');
  const Wo = await import('/src/services/workOrderService.js');
  const R = await import('/src/services/recipeService.js');
  const products = (await (await import('/src/services/adminProductService.js')).getAdminProducts()).rows;
  const m = await S.saveMaterial(null, { name: `Tepung Lap ${tag}`, unit: 'kg', stock: '10', min_stock: '1' }, uuid());
  const sup = await P.saveSupplier(null, { name: `Sup Lap ${tag}`, phone: '+6281234567890', address: 'Jl. 1', email: 'a@b.id', contact_person: 'S', material_ids: [m.material_id] }, uuid());
  const po = await P.savePurchaseOrder(null, { supplier_id: sup.supplier_id, items: [{ material_id: m.material_id, qty_ordered: '10', unit_price: '1500.55' }] }, uuid());
  await P.changePurchaseOrderStatus(po.po_id, { from: 'draft', to: 'dipesan' }, uuid());
  const item = (await P.getPurchaseOrder(po.po_id)).items[0].po_item_id;
  await P.receivePurchaseOrder(po.po_id, { lines: [{ po_item_id: item, qty: '4' }] }, uuid());
  const product = products.find((x) => x.name === 'Classic Butter Croissant');
  await R.saveProductRecipe(product.product_id, [{ material_id: String(m.material_id), qty_per_unit: '0.015' }]);
  const today = (await Wo.getPlanSource()).today_key;
  const wo = await Wo.saveWorkOrder(null, { product_id: String(product.product_id), production_date: today, qty_planned: 9 }, uuid());
  await Wo.changeWorkOrderStatus(wo.wo_id, { from: 'draft', to: 'diproses' }, uuid());
  await Wo.issueMaterials(wo.wo_id, { lines: [{ material_id: String(m.material_id), qty: '0.10' }] }, uuid());
  const done = await Wo.completeWorkOrder(wo.wo_id, { qty_output: 5 }, uuid());
  await Wo.reverseOrCorrectOutput(done.output_id, { qty_output: 7, reason: 'hitung ulang' }, uuid(), { correct: true });
  return { material: `Tepung Lap ${tag}`, supplier: `Sup Lap ${tag}`, wo: wo.wo_number };
}, TAG);

// ── Akses: Staf tidak bisa membuka AD-08
await p.goto(`${B}/admin/laporan?tab=operasional`); await wait(1000);
check('Staf tidak bisa membuka AD-08 (tab Operasional)', !p.url().includes('/admin/laporan'), p.url());
await logout();
await login('/admin/login', 'admin-login', 'owner@demo.com');

// ── Tab Penjualan tetap default & tidak berubah
await p.goto(`${B}/admin/laporan`); await wait(1500);
let text = await mainText();
check('tab Penjualan default: judul & isi lama', text.includes('Laporan Penjualan') && ['Omzet', 'Jumlah Transaksi', 'Penjualan per Hari', 'Produk Terlaris', 'Metode Pembayaran'].every((t) => text.includes(t)));
check('tab Penjualan & Operasional tersedia', (await p.getByRole('tab', { name: 'Operasional' }).count()) === 1 && (await p.getByRole('tab', { name: 'Penjualan' }).getAttribute('aria-selected')) === 'true');
const sales = await p.evaluate(async () => (await import('/src/services/reportService.js')).getSalesReport({ period: 'harian' }));

// ── Tab Operasional
await p.getByRole('button', { name: 'Harian' }).first().click(); await wait(800);
await p.getByRole('tab', { name: 'Operasional' }).click(); await wait(1800);
check('tab Operasional di URL & periode tetap', p.url().includes('tab=operasional') && p.url().includes('periode=harian'), p.url());
text = await mainText();
const ops0 = await p.evaluate(async () => (await import('/src/services/reportService.js')).getOperationsReport({ period: 'harian' }));
check('judul & bagian laporan operasional tampil', text.includes('Laporan Operasional') && ['Pembelian dipesan', 'Penerimaan', 'Sisa dibatalkan', 'Mutasi stok', 'Pemakaian bahan', 'Hasil produksi', 'Rencana vs hasil', 'Analisis kebutuhan bahan'].every((t) => text.includes(t)));
check('pembelian dipesan: supplier × bahan & nilai 2 desimal Rp 15.005,50 (= respons 15005.5)', text.includes(ids.supplier) && text.includes('Rp 15.005,50') && ops0.purchases.ordered.rows.some((r) => r.supplier_name === ids.supplier && r.value === 15005.5));
check('penerimaan bersih 4 kg, Rp 6.002,20', text.includes('Rp 6.002,20'));
const usageRow = (await p.getByRole('region', { name: 'Pemakaian bahan standar, aktual, dan selisih' }).innerText()).replace(/\s+/g, ' ');
check('pemakaian: standar 0,105 · aktual 0,1 · selisih −0,005 (IT-23)', usageRow.includes(`${ids.material} 0,105 kg 0,1 kg -0,005 kg`), usageRow.slice(0, 300));
const prod = (await p.getByRole('region', { name: 'Hasil produksi per work order' }).innerText()).replace(/\s+/g, ' ');
check('hasil per WO: 7, label dikoreksi', prod.includes(ids.wo) && /dikoreksi/.test(prod), prod.slice(0, 200));
const ops = await p.evaluate(async () => (await import('/src/services/reportService.js')).getOperationsReport({ period: 'harian' }));
check('omzet pembanding = tab Penjualan (IT-29)', ops.revenue.revenue === sales.kpi.revenue && ops.revenue.transactions === sales.kpi.transactions, JSON.stringify([ops.revenue, sales.kpi]));
check('analisis FR-40 hari ini + teks keterangan wajib', text.includes('Estimasi ini tidak mengurangi stok bahan'));
check('tanpa overflow horizontal (tab Operasional)', await noOverflow());

// ── Ekspor = layar (AC-47.4)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-'));
const [xlsx] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Export Excel' }).click()]);
const xlsxPath = path.join(dir, xlsx.suggestedFilename()); await xlsx.saveAs(xlsxPath);
check('Export Excel → laporan-operasional-…xlsx (zip PK)', /^laporan-operasional-oven-and-co_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.xlsx$/.test(xlsx.suggestedFilename()) && fs.readFileSync(xlsxPath).subarray(0, 2).toString() === 'PK', xlsx.suggestedFilename());
const [pdf] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Export PDF' }).click()]);
const pdfPath = path.join(dir, pdf.suggestedFilename()); await pdf.saveAs(pdfPath);
check('Export PDF → %PDF', fs.readFileSync(pdfPath).subarray(0, 4).toString() === '%PDF');
check('PDF memuat rupiah 2 desimal yang sama dengan layar (Rp 15.005,50)', fs.readFileSync(pdfPath, 'latin1').includes('Rp 15.005,50'));
try {
  const styles = execFileSync('unzip', ['-p', xlsxPath, 'xl/styles.xml']).toString();
  check('Excel: format rupiah 2 desimal ("Rp "#,##0.00)', styles.includes('#,##0.00'), styles.slice(0, 200));
} catch (e) { check('Excel: format rupiah 2 desimal', false, e.message); }
const tables = await p.evaluate(async (r) => (await import('/src/utils/operationsExport.js')).buildOperationsExportTables(r), ops);
const usageExport = tables.find((t) => t.title === 'Pemakaian bahan').rows.find((row) => row[0] === ids.material);
check('isi ekspor = respons layar (pemakaian)', JSON.stringify(usageExport) === JSON.stringify([ids.material, 'kg', 0.105, 0.1, -0.005]), JSON.stringify(usageExport));

// ── Error state & kembali ke Penjualan
await p.goto(`${B}/admin/laporan?tab=operasional&periode=rentang&dari=2026-11-10&sampai=2026-11-01`); await wait(1500);
check('rentang tidak sah → pesan validasi', (await mainText()).includes('Tanggal mulai harus sebelum atau sama dengan tanggal selesai'));
await p.goto(`${B}/admin/laporan?tab=operasional`); await wait(1200);
await p.getByRole('tab', { name: 'Penjualan' }).click(); await wait(1200);
check('kembali ke tab Penjualan (tanpa ?tab)', !p.url().includes('tab=') && (await mainText()).includes('Laporan Penjualan'), p.url());

await logout(); await login('/masuk', 'masuk', 'pelanggan@demo.com');
await p.goto(`${B}/admin/laporan?tab=operasional`); await wait(1000);
check('pelanggan diarahkan keluar dari AD-08', !p.url().includes('/admin/laporan'), p.url());

console.log(res.map((r) => r[1]).join('\n'));
console.log(`\n${res.filter((r) => r[0]).length}/${res.length} lulus`);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await b.close();
process.exit(res.some((r) => !r[0]) || errors.length ? 1 : 0);
