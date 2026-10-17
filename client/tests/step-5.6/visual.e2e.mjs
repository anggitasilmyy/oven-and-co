// Uji responsif AD-04 & AD-05: overflow horizontal, sidebar/drawer < 1024, modal di dalam viewport, area sentuh, screenshot
import { chromium } from 'playwright';
const S = process.argv[2] ?? '.';
await import('node:fs').then((fs) => fs.mkdirSync(`${S}/shots`, { recursive: true }));
const B = 'http://localhost:5173';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const widths = [360, 375, 430, 768, 1024, 1280, 1366, 1440, 1536, 1920];
const errors = []; let issues = 0;
for (const w of widths) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, timezoneId: 'Asia/Jakarta' });
  await ctx.clock.install({ time: new Date('2026-10-16T15:00:00+07:00') });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${w} ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${w} console: ${m.text()}`));
  const inspect = async (name) => {
    await p.waitForTimeout(900);
    const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (o.sw > o.cw) { issues++; console.log(`OVERFLOW ${w} ${name} ${o.sw}>${o.cw}`); }
    const sidebar = await p.locator('aside').first().evaluate((el) => { const r = el.getBoundingClientRect(); return r.right > 0 && r.left < innerWidth; });
    if (sidebar !== (w >= 1024)) { issues++; console.log(`SIDEBAR ${w} ${name} ${sidebar}`); }
    const dialog = p.getByRole('dialog');
    if (await dialog.count()) {
      const box = await dialog.locator('> div').last().boundingBox();
      if (box.x < 0 || box.y < 0 || box.x + box.width > w || box.y + box.height > 900) { issues++; console.log(`MODAL ${w} ${name}`, box); }
    }
    const scope = (await dialog.count()) ? '[role="dialog"]' : 'main';
    const small = await p.evaluate((sel) => [...document.querySelectorAll(`${sel} button, ${sel} a, ${sel} input`)]
      .filter((el) => el.offsetParent && !el.closest('[aria-hidden="true"]'))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.height < 24 || r.width < 24)).length, scope);
    if (small) { issues++; console.log(`TOUCH ${w} ${name}: ${small} target < 24 px`); }
    const clipped = await p.evaluate(() => [...document.querySelectorAll('main .card-admin')].filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).length);
    if (clipped) { issues++; console.log(`CLIPPED ${w} ${name}: ${clipped} kartu`); }
    if (process.argv[3] !== 'noshot') await p.screenshot({ path: `${S}/shots/${w}_${name}.png`, fullPage: true });
  };
  await p.goto(`${B}/admin/login`); await p.waitForTimeout(400);
  await p.fill('#admin-login-identifier', 'staf@demo.com'); await p.fill('#admin-login-password', 'demo1234');
  await p.click('#admin-login-submit-btn'); await p.waitForTimeout(900);
  const nums = await p.evaluate(async () => {
    const { getTables } = await import('/src/services/mock/db.js');
    const t = getTables('orders', 'order_items', 'products');
    const custom = new Set(t.products.filter((x) => x.availability_type === 'custom').map((x) => x.product_id));
    const customOrder = t.order_items.find((i) => custom.has(i.product_id));
    return {
      store: t.orders.find((o) => o.order_status === 'siap_diambil' && o.payment_option === 'pay_at_store')?.order_number
        ?? t.orders.find((o) => o.order_status === 'siap_diambil').order_number,
      custom: t.orders.find((o) => o.order_id === customOrder.order_id).order_number,
      delivery: t.orders.find((o) => o.fulfillment_type === 'delivery' && o.order_status === 'dikonfirmasi')?.order_number,
    };
  });
  await p.goto(`${B}/admin/pesanan`); await inspect('ad03-pesanan');
  await p.goto(`${B}/admin/pesanan/${nums.store}`); await inspect('ad04-pickup');
  if (await p.getByRole('button', { name: 'Tandai Lunas' }).count()) {
    await p.getByRole('button', { name: 'Tandai Lunas' }).click(); await inspect('ad04-modal-lunas');
    await p.keyboard.press('Escape');
  }
  await p.goto(`${B}/admin/pesanan/${nums.custom}`); await inspect('ad04-custom-cake');
  if (nums.delivery) {
    await p.goto(`${B}/admin/pesanan/${nums.delivery}`); await p.waitForTimeout(700);
    await p.getByRole('button', { name: /^Ubah Status/ }).click(); await inspect('ad04-modal-status');
    await p.keyboard.press('Escape');
  }
  await p.goto(`${B}/admin/kalender`); await inspect('ad05-kalender');
  await p.goto(`${B}/admin/kalender?bulan=2026-09&tanggal=2026-09-01`); await inspect('ad05-kosong');
  await ctx.close();
}
console.log('layout issues:', issues);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await b.close();
