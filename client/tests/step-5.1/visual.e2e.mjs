import { chromium } from 'playwright';
const S = process.argv[2] ?? '.';
await import('node:fs').then((fs) => fs.mkdirSync(`${S}/shots`, { recursive: true }));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const widths = [375, 768, 1024, 1440, 1920];
const routes = ['/katalog', '/katalog?kategori=3&urut=harga-terendah', '/cari', '/cari?q=croissant', '/cari?q=brownies', '/produk/1', '/produk/5', '/produk/1/ulasan', '/produk/8'];
const errors = [];
let issues = 0;
for (const w of widths) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('ovenco_onboarding_done', '1'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${w} ${p.url()} ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${w} ${p.url()} console: ${m.text()}`));
  for (const r of routes) {
    await p.goto('http://localhost:5173' + r);
    await p.waitForTimeout(700);
    const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    const name = r.replace(/[/?=&]/g, '_');
    if (o.sw > o.cw) { issues++; console.log(`OVERFLOW ${w} ${r} ${o.sw}>${o.cw}`); }
    if (process.argv[3] !== 'noshot') await p.screenshot({ path: `${S}/shots/${w}${name}.png`, fullPage: true });
  }
  if (w < 1024) {
    await p.goto('http://localhost:5173/katalog');
    await p.waitForTimeout(600);
    await p.getByRole('button', { name: /Filter & Urutan/ }).click();
    await p.waitForTimeout(400);
    const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (o.sw > o.cw) { issues++; console.log(`OVERFLOW sheet ${w}`); }
    await p.screenshot({ path: `${S}/shots/${w}_sheet.png` });
  }
  await ctx.close();
}
console.log('overflow issues:', issues);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await b.close();
