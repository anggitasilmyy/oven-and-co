// Uji responsif AD-06 & AD-07: overflow horizontal, sidebar/drawer < 1024, drawer form & modal di dalam viewport,
// area sentuh, kartu tidak terpotong, screenshot. Lebar uji CR-01: 360 – 1920 px.
import { chromium } from 'playwright';
const S = process.argv[2] ?? '.';
await import('node:fs').then((fs) => fs.mkdirSync(`${S}/shots`, { recursive: true }));
const B = 'http://localhost:5173';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const widths = [360, 375, 430, 768, 1024, 1280, 1366, 1440, 1536, 1920];
const errors = []; let issues = 0;
for (const w of widths) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, timezoneId: 'Asia/Jakarta' });
  await ctx.clock.install({ time: new Date('2026-10-16T10:00:00+07:00') });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${w} ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${w} console: ${m.text()}`));
  const inspect = async (name) => {
    await p.waitForTimeout(900);
    const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (o.sw > o.cw) { issues++; console.log(`OVERFLOW ${w} ${name} ${o.sw}>${o.cw}`); }
    const sidebar = await p.locator('aside').first().evaluate((el) => { const r = el.getBoundingClientRect(); return r.right > 0 && r.left < innerWidth; });
    const dialog = p.getByRole('dialog');
    const open = await dialog.count();
    if (!open && sidebar !== (w >= 1024)) { issues++; console.log(`SIDEBAR ${w} ${name} ${sidebar}`); }
    if (open) {
      const box = await dialog.locator('> div').last().boundingBox();
      if (box.x < -1 || box.y < -1 || box.x + box.width > w + 1 || box.y + box.height > 901) { issues++; console.log(`DIALOG ${w} ${name}`, box); }
      const inner = await p.evaluate(() => { const d = document.querySelector('[role="dialog"]'); return [...d.querySelectorAll('input, select, textarea, button')].filter((el) => el.offsetParent).some((el) => el.getBoundingClientRect().right > innerWidth + 1); });
      if (inner) { issues++; console.log(`DIALOG-CLIP ${w} ${name}`); }
    }
    const scope = open ? '[role="dialog"]' : 'main';
    const small = await p.evaluate((sel) => [...document.querySelectorAll(`${sel} button, ${sel} a, ${sel} input:not([type="file"]), ${sel} select`)]
      .filter((el) => el.offsetParent && !el.closest('[aria-hidden="true"]'))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.height < 44 || r.width < 44)).length, scope);
    if (small) { issues++; console.log(`TOUCH ${w} ${name}: ${small} target < 44 px`); }
    const clipped = await p.evaluate(() => [...document.querySelectorAll('main .card-admin')].filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).length);
    if (clipped) { issues++; console.log(`CLIPPED ${w} ${name}: ${clipped} kartu`); }
    if (process.argv[3] !== 'noshot') await p.screenshot({ path: `${S}/shots/${w}_${name}.png`, fullPage: !open });
  };
  await p.goto(`${B}/admin/login`); await p.waitForTimeout(400);
  await p.fill('#admin-login-identifier', 'staf@demo.com'); await p.fill('#admin-login-password', 'demo1234');
  await p.click('#admin-login-submit-btn'); await p.waitForTimeout(900);

  await p.goto(`${B}/admin/produk`); await inspect('ad06-produk');
  await p.getByRole('button', { name: 'Ubah Classic Butter Croissant' }).click(); await inspect('ad06-drawer-ubah');
  await p.getByRole('button', { name: 'Tambah varian' }).click();
  await p.getByRole('button', { name: 'Simpan produk' }).click(); await inspect('ad06-drawer-error');
  await p.keyboard.press('Escape');
  await p.getByRole('button', { name: 'Tambah Produk' }).click(); await inspect('ad06-drawer-tambah');
  await p.keyboard.press('Escape');
  await p.goto(`${B}/admin/produk?tab=opsi`); await inspect('ad06-opsi');
  await p.getByRole('button', { name: 'Tambah opsi Rasa' }).click(); await inspect('ad06-modal-opsi');
  await p.keyboard.press('Escape');
  await p.goto(`${B}/admin/stok`); await inspect('ad07-harian');
  await p.fill('#plan-1', '1'); await inspect('ad07-harian-error');
  await p.goto(`${B}/admin/stok?tab=bahan`); await inspect('ad07-bahan');
  await p.getByRole('button', { name: 'Catat stok masuk Butter Prancis' }).click(); await inspect('ad07-modal-stok-masuk');
  await p.keyboard.press('Escape');
  await p.getByRole('button', { name: 'Ubah Telur ayam' }).click(); await inspect('ad07-modal-bahan');
  await p.keyboard.press('Escape');
  await ctx.close();
}
console.log('layout issues:', issues);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await b.close();
process.exit(issues || errors.length ? 1 : 0);
