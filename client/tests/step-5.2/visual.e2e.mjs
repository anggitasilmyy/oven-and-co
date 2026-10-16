// Uji responsif C-11: overflow horizontal di viewport CR-01 + screenshot tiap langkah
import { chromium } from 'playwright';
const S = process.argv[2] ?? '.';
await import('node:fs').then((fs) => fs.mkdirSync(`${S}/shots`, { recursive: true }));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const widths = [360, 375, 430, 768, 1024, 1280, 1366, 1440, 1536, 1920];
const picks = ['Diameter 20 cm', 'Hati', 'Red Velvet', 'Whipped'];
const errors = []; let issues = 0;
const overflow = (p) => p.evaluate(() => {
  const cw = document.documentElement.clientWidth;
  const out = [...document.querySelectorAll('body *')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && (r.right > cw + 1 || r.left < -1) && !el.closest('[role="radiogroup"].overflow-x-auto, .overflow-x-auto');
  }).map((el) => el.tagName + '.' + String(el.className).slice(0, 40));
  return { sw: document.documentElement.scrollWidth, cw, out: out.slice(0, 3) };
});
for (const w of widths) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('ovenco_onboarding_done', '1'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${w} ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${w} console: ${m.text()}`));
  await p.goto('http://localhost:5173/custom-cake'); await p.waitForTimeout(800);
  for (let step = 0; step < 6; step++) {
    const o = await overflow(p);
    if (o.sw > o.cw || o.out.length) { issues++; console.log(`OVERFLOW ${w} langkah ${step + 1}`, JSON.stringify(o)); }
    const bar = await p.locator('[data-layout="action-bar"]').boundingBox();
    if (!bar || bar.x < 0 || bar.x + bar.width > w + 1) { issues++; console.log(`ACTION BAR ${w}`, JSON.stringify(bar)); }
    if (process.argv[3] !== 'noshot' && [0, 4, 5].includes(step)) await p.screenshot({ path: `${S}/shots/${w}_langkah${step + 1}.png`, fullPage: true });
    if (step < 4) await p.getByRole('radio', { name: new RegExp(picks[step]) }).click();
    if (step === 4) await p.fill('#tulisan-kue', 'Happy Birthday, Nadia!');
    if (step < 5) await p.getByRole('button', { name: 'Lanjut' }).click();
  }
  const fixedBar = w < 1024;
  const pos = await p.locator('[data-layout="action-bar"]').evaluate((el) => getComputedStyle(el).position);
  if ((fixedBar && pos !== 'fixed') || (!fixedBar && pos !== 'sticky')) { issues++; console.log(`ActionBar ${w} position ${pos}`); }
  await ctx.close();
}
console.log('layout issues:', issues);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await b.close();
