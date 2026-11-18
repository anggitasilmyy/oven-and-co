// Uji CR-04c · AC-NF · AD-08 tab Operasional (mode mock), lebar CR-01 360 – 1920 px: overflow horizontal, sidebar/drawer
// < 1024, area sentuh ≥ 44 × 44 px, setiap input berlabel, kartu tidak terpotong; error konsol/halaman = gagal.
// Status tampilan: tab Penjualan (regresi), tab Operasional kosong (rentang lampau) & berisi (data CR-04 hari ini), rentang
// tidak sah (error), periode bulanan.
// Jalankan (Vite mode mock di :5173): node tests/step-6.10/visual.e2e.mjs <folder-hasil> [noshot]
import { chromium } from 'playwright';

const S = process.argv[2] ?? '.';
await import('node:fs').then((fs) => fs.mkdirSync(`${S}/shots`, { recursive: true }));
const B = process.env.BASE ?? 'http://localhost:5173';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const widths = [360, 375, 430, 768, 1024, 1280, 1366, 1440, 1536, 1920];
const errors = []; let issues = 0; let checks = 0;
const fail = (msg) => { issues += 1; console.log(msg); };

for (const w of widths) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, timezoneId: 'Asia/Jakarta' });
  await ctx.addInitScript(() => localStorage.setItem('ovenco_onboarding_done', '1'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${w} ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && !/status of 40[0349]/.test(m.text()) && errors.push(`${w} console: ${m.text()}`));
  const dialog = () => p.getByRole('dialog');
  const inspect = async (name) => {
    checks += 1;
    await p.waitForTimeout(700);
    const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (o.sw > o.cw) fail(`OVERFLOW ${w} ${name} ${o.sw}>${o.cw}`);
    const open = await dialog().count();
    const sidebar = await p.locator('aside').first().evaluate((el) => { const r = el.getBoundingClientRect(); return r.right > 0 && r.left < innerWidth; });
    if (!open && sidebar !== (w >= 1024)) fail(`SIDEBAR ${w} ${name} ${sidebar}`);
    if (open) {
      const box = await dialog().locator('> div').last().boundingBox();
      if (box.x < -1 || box.y < -1 || box.x + box.width > w + 1 || box.y + box.height > 901) fail(`DIALOG ${w} ${name} ${JSON.stringify(box)}`);
      const clip = await p.evaluate(() => [...document.querySelector('[role="dialog"]').querySelectorAll('input, select, textarea, button')]
        .filter((el) => el.offsetParent).some((el) => el.getBoundingClientRect().right > innerWidth + 1));
      if (clip) fail(`DIALOG-CLIP ${w} ${name}`);
    }
    const scope = open ? '[role="dialog"]' : 'main';
    const small = await p.evaluate((sel) => [...document.querySelectorAll(`${sel} button, ${sel} a, ${sel} input:not([type="file"]):not([type="checkbox"]), ${sel} select, ${sel} label:has(input[type="checkbox"])`)]
      .filter((el) => el.offsetParent && !el.closest('[aria-hidden="true"]'))
      .map((el) => [el.outerHTML.slice(0, 90), el.getBoundingClientRect()])
      .filter(([, r]) => r.width > 0 && (r.height < 44 || r.width < 44)).map(([h]) => h), scope);
    if (small.length) fail(`TOUCH ${w} ${name}: ${small.length} target < 44 px — ${small.slice(0, 3).join(' | ')}`);
    const unlabeled = await p.evaluate((sel) => [...document.querySelectorAll(`${sel} input, ${sel} select, ${sel} textarea`)]
      .filter((el) => el.offsetParent && el.type !== 'hidden')
      .filter((el) => !(el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')))
      .map((el) => el.outerHTML.slice(0, 90)), scope);
    if (unlabeled.length) fail(`LABEL ${w} ${name}: ${unlabeled.length} tanpa label — ${unlabeled.slice(0, 2).join(' | ')}`);
    const clipped = await p.evaluate(() => [...document.querySelectorAll('main .card-admin')]
      .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).length);
    if (clipped) fail(`CLIPPED ${w} ${name}: ${clipped} kartu`);
    if (process.argv[3] !== 'noshot') await p.screenshot({ path: `${S}/shots/${w}_${name}.png`, fullPage: !open });
  };

  await p.goto(`${B}/admin/login`); await p.waitForTimeout(400);
  await p.fill('#admin-login-identifier', 'owner@demo.com'); await p.fill('#admin-login-password', 'demo1234');
  await p.click('#admin-login-submit-btn'); await p.waitForTimeout(900);

  // Data CR-04 hari ini (mode mock; satu konteks per lebar → data sendiri)
  await p.evaluate(async () => {
    const auth = (await import('/src/stores/useAuthStore.js')).default;
    const owner = auth.getState();
    auth.setState({ user: { ...owner.user, role: 'staf' } });
    const uuid = () => crypto.randomUUID();
    const S = await import('/src/services/stockService.js');
    const P = await import('/src/services/purchasingService.js');
    const Wo = await import('/src/services/workOrderService.js');
    const m = await S.saveMaterial(null, { name: 'Tepung Visual', unit: 'kg', stock: '10', min_stock: '1' }, uuid());
    const sup = await P.saveSupplier(null, { name: 'Sup Visual', phone: '+6281234567890', address: 'Jl. 1', email: 'a@b.id', contact_person: 'S', material_ids: [m.material_id] }, uuid());
    const po = await P.savePurchaseOrder(null, { supplier_id: sup.supplier_id, items: [{ material_id: m.material_id, qty_ordered: '10', unit_price: '1500' }] }, uuid());
    await P.changePurchaseOrderStatus(po.po_id, { from: 'draft', to: 'dipesan' }, uuid());
    const item = (await P.getPurchaseOrder(po.po_id)).items[0].po_item_id;
    await P.receivePurchaseOrder(po.po_id, { lines: [{ po_item_id: item, qty: '4' }] }, uuid());
    const products = (await (await import('/src/services/adminProductService.js')).getAdminProducts()).rows;
    const today = (await Wo.getPlanSource()).today_key;
    const wo = await Wo.saveWorkOrder(null, { product_id: String(products.find((x) => x.name === 'Classic Butter Croissant').product_id), production_date: today, qty_planned: 9 }, uuid());
    await Wo.changeWorkOrderStatus(wo.wo_id, { from: 'draft', to: 'diproses' }, uuid());
    await Wo.issueMaterials(wo.wo_id, { lines: [{ material_id: String(m.material_id), qty: '0.5' }] }, uuid());
    const done = await Wo.completeWorkOrder(wo.wo_id, { qty_output: 5 }, uuid());
    await Wo.reverseOrCorrectOutput(done.output_id, { qty_output: 7, reason: 'x' }, uuid(), { correct: true });
    auth.setState(owner);
  });

  await p.goto(`${B}/admin/laporan`); await inspect('ad08-penjualan');
  await p.goto(`${B}/admin/laporan?tab=operasional&periode=rentang&dari=2026-01-01&sampai=2026-01-07`); await inspect('ad08-operasional-kosong');
  await p.goto(`${B}/admin/laporan?tab=operasional&periode=harian`); await inspect('ad08-operasional-harian');
  await p.goto(`${B}/admin/laporan?tab=operasional&periode=bulanan`); await inspect('ad08-operasional-bulanan');
  await p.goto(`${B}/admin/laporan?tab=operasional&periode=rentang&dari=2026-11-10&sampai=2026-11-01`); await inspect('ad08-operasional-error');
  await ctx.close();
}
await b.close();
console.log(`\npemeriksaan: ${checks} (${widths.length} lebar)`);
console.log(`layout issues: ${issues}`);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
process.exit(issues || errors.length ? 1 : 0);
