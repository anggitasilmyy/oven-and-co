// Uji responsif AD-08 – AD-11: overflow horizontal, sidebar/drawer < 1024, modal di dalam viewport, area sentuh,
// kartu tidak terpotong, screenshot. Lebar uji CR-01: 360 – 1920 px. Login sebagai Owner.
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
  await p.fill("#admin-login-identifier", "owner@demo.com"); await p.fill('#admin-login-password', 'demo1234');
  await p.click('#admin-login-submit-btn'); await p.waitForTimeout(900);

  await p.goto(`${B}/admin/laporan`); await inspect('ad08-mingguan');
  await p.getByRole('button', { name: 'Rentang' }).click(); await inspect('ad08-rentang');
  await p.goto(`${B}/admin/promo`); await inspect('ad09-voucher');
  await p.getByRole('button', { name: 'Buat Voucher' }).click();
  await p.getByRole('button', { name: 'Simpan voucher' }).click(); await inspect('ad09-modal-voucher');
  await p.keyboard.press('Escape');
  await p.goto(`${B}/admin/promo?tab=loyalty`); await inspect('ad09-loyalty');
  await p.goto(`${B}/admin/pelanggan`); await inspect('ad10-pelanggan');
  await p.goto(`${B}/admin/pelanggan?tab=ulasan`); await inspect('ad10-ulasan');
  await p.getByRole('button', { name: /^Balas ulasan/ }).first().click(); await inspect('ad10-modal-balas');
  await p.keyboard.press('Escape');
  await p.getByRole('button', { name: /^Sembunyikan ulasan/ }).first().click(); await inspect('ad10-modal-sembunyikan');
  await p.keyboard.press('Escape');
  await p.goto(`${B}/admin/pengaturan`); await inspect('ad11-pengaturan');
  await p.getByRole('button', { name: 'Tambah Akun', exact: true }).click(); await inspect('ad11-modal-akun');
  await p.keyboard.press('Escape');
  await ctx.close();
}
console.log('layout issues:', issues);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await b.close();
process.exit(issues || errors.length ? 1 : 0);
