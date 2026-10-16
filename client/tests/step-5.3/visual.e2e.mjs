// Uji responsif C-12 – C-16: overflow horizontal di viewport CR-01, posisi ActionBar, screenshot
import { chromium } from 'playwright';
const S = process.argv[2] ?? '.';
await import('node:fs').then((fs) => fs.mkdirSync(`${S}/shots`, { recursive: true }));
const B = 'http://localhost:5173';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const widths = [360, 375, 430, 768, 1024, 1280, 1366, 1440, 1536, 1920];
const errors = []; let issues = 0;
const CART = [
  { cart_item_id: 1, product_id: 1, quantity: 2, price: 28000, name: 'Classic Butter Croissant', note: 'Tolong dipisah per kotak' },
  { cart_item_id: 2, product_id: 4, quantity: 1, price: 120000, name: 'Assorted Cookies Box' },
  { cart_item_id: 3, product_id: 5, quantity: 1, price: 385000, name: 'Premium Birthday Cake', preferred_date: '2026-10-17' },
];
for (const w of widths) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, timezoneId: 'Asia/Jakarta' });
  await ctx.clock.install({ time: new Date('2026-10-16T10:00:00+07:00') });
  await ctx.addInitScript((cart) => {
    localStorage.setItem('ovenco_onboarding_done', '1');
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ovenco_mock_cart_guest', JSON.stringify(cart)); sessionStorage.setItem('seeded', '1'); }
  }, CART);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${w} ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${w} console: ${m.text()}`));
  const inspect = async (name) => {
    await p.waitForTimeout(900);
    const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (o.sw > o.cw) { issues++; console.log(`OVERFLOW ${w} ${name} ${o.sw}>${o.cw}`); }
    const barEl = p.locator('[data-layout="action-bar"]');
    if (await barEl.count()) {
      const pos = await barEl.evaluate((el) => getComputedStyle(el).position);
      if ((w < 1024 && pos !== 'fixed') || (w >= 1024 && pos !== 'sticky')) { issues++; console.log(`ACTIONBAR ${w} ${name} ${pos}`); }
    }
    const broken = await p.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length);
    if (broken) { issues++; console.log(`BROKEN IMG ${w} ${name}`); }
    if (process.argv[3] !== 'noshot') await p.screenshot({ path: `${S}/shots/${w}_${name}.png`, fullPage: true });
  };
  await p.goto(`${B}/keranjang`); await inspect('c12-keranjang');
  await p.goto(`${B}/masuk`); await p.waitForTimeout(400);
  await p.fill('#masuk-identifier', 'pelanggan@demo.com'); await p.fill('#masuk-password', 'demo1234');
  await p.click('#masuk-submit-btn'); await p.waitForTimeout(900);
  await p.goto(`${B}/checkout`); await p.waitForTimeout(900);
  await p.getByRole('button', { name: '11.00–13.00' }).click();
  await p.getByRole('button', { name: 'Pakai voucher' }).click();
  await p.getByRole('button', { name: 'Lihat detail' }).click();
  await inspect('c13-checkout-pickup');
  await p.getByRole('radio', { name: 'Delivery' }).click();
  await p.getByRole('button', { name: 'Ubah' }).click();
  await inspect('c13-checkout-delivery');
  await p.getByRole('radio', { name: /Rumah ·/ }).click();
  await p.getByRole('radio', { name: 'Pickup di Toko' }).click();
  await p.getByRole('button', { name: 'Pilih Pembayaran' }).click(); await inspect('c14-metode');
  await p.getByRole('radio', { name: /QRIS/ }).click();
  await p.getByRole('button', { name: /Bayar Sekarang/ }).click(); await p.waitForTimeout(900);
  await p.getByRole('button', { name: 'Cara pembayaran' }).click(); await inspect('c15-bayar-qris');
  await p.getByRole('button', { name: 'Simulasikan Lunas' }).click(); await inspect('c16-berhasil');
  await ctx.close();
}
console.log('layout issues:', issues);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await b.close();
