// Uji responsif C-20 – C-24: overflow horizontal di viewport CR-01, bottom nav < 768, sidebar akun ≥ 1024, screenshot
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
  await ctx.addInitScript(() => localStorage.setItem('ovenco_onboarding_done', '1'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${w} ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${w} console: ${m.text()}`));
  const inspect = async (name, { account = true } = {}) => {
    await p.waitForTimeout(900);
    const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (o.sw > o.cw) { issues++; console.log(`OVERFLOW ${w} ${name} ${o.sw}>${o.cw}`); }
    if (account) {
      const sidebar = await p.locator('[data-layout="account-sidebar"]').isVisible();
      if (sidebar !== (w >= 1024)) { issues++; console.log(`SIDEBAR ${w} ${name} ${sidebar}`); }
    }
    const small = await p.evaluate(() => [...document.querySelectorAll('main button, main a, main [role="switch"]')]
      .filter((el) => el.offsetParent && !el.closest('[aria-hidden="true"]'))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.height < 24 || r.width < 24)).length);
    if (small) { issues++; console.log(`TOUCH ${w} ${name}: ${small} target < 24 px`); }
    const broken = await p.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length);
    if (broken) { issues++; console.log(`BROKEN IMG ${w} ${name}`); }
    if (process.argv[3] !== 'noshot') await p.screenshot({ path: `${S}/shots/${w}_${name}.png`, fullPage: true });
  };
  await p.goto(`${B}/masuk`); await p.waitForTimeout(400);
  await p.fill('#masuk-identifier', 'pelanggan@demo.com'); await p.fill('#masuk-password', 'demo1234');
  await p.click('#masuk-submit-btn'); await p.waitForTimeout(900);
  await p.goto(`${B}/akun`); await inspect('c20-akun');
  const bottomNav = await p.locator('nav[aria-label="Navigasi bawah"]').isVisible();
  if (bottomNav !== (w < 768)) { issues++; console.log(`BOTTOMNAV ${w} ${bottomNav}`); }
  await p.goto(`${B}/akun/ubah-profil`); await inspect('c20-ubah-profil');
  await p.goto(`${B}/akun/voucher-poin`); await inspect('c21-voucher');
  await p.goto(`${B}/akun/voucher-poin?tab=poin`); await inspect('c21-riwayat-poin');
  await p.goto(`${B}/akun/alamat`); await inspect('c22-alamat');
  await p.getByRole('button', { name: 'Tambah Alamat' }).click();
  const map = p.getByRole('application'); const box = await map.boundingBox();
  await p.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.3);
  await inspect('c22-form-alamat');
  await p.keyboard.press('Escape');
  await p.goto(`${B}/akun/wishlist`); await inspect('c23-wishlist');
  await p.goto(`${B}/notifikasi`); await inspect('c24-notifikasi', { account: false });
  await ctx.close();
}
console.log('layout issues:', issues);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await b.close();
