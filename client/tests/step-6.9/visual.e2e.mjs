// Uji CR-04b CP5 · AC-NF · AD-13 Produksi (mode mock), lebar CR-01 360 – 1920 px: overflow horizontal, sidebar/drawer
// < 1024, dialog di dalam viewport (isi tidak terpotong), area sentuh ≥ 44 × 44 px, setiap input/select/textarea berlabel,
// kartu tidak terpotong; error konsol/halaman = gagal. Status tampilan: daftar (empty state & isi), form WO (error validasi,
// acuan perencanaan), detail Draft/Diproses/Selesai/Dibatalkan, konfirmasi mulai/batal, pengeluaran (error & isi), koreksi
// pengeluaran, alasan pembalik, selesaikan WO, koreksi hasil, WO tidak ditemukan.
// Jalankan (Vite mode mock di :5173): node tests/step-6.9/visual.e2e.mjs <folder-hasil> [noshot]
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
  await p.fill('#admin-login-identifier', 'staf@demo.com'); await p.fill('#admin-login-password', 'demo1234');
  await p.click('#admin-login-submit-btn'); await p.waitForTimeout(900);

  // AD-13: empty state/daftar, form WO (error, isi), detail per status, dialog aksi
  await p.goto(`${B}/admin/produksi`); await inspect('ad13-daftar-awal');
  await p.getByRole('button', { name: 'Buat WO' }).click(); await p.waitForTimeout(600);
  await dialog().getByRole('button', { name: 'Simpan Draft' }).click(); await inspect('ad13-form-error');
  await p.fill('#wo-qty', '12'); await inspect('ad13-form');
  await dialog().getByRole('button', { name: 'Simpan Draft' }).click(); await p.waitForTimeout(1200);
  await inspect('ad13-detail-draft');
  await p.getByRole('button', { name: 'Mulai produksi' }).click(); await inspect('ad13-konfirmasi-mulai');
  await dialog().getByRole('button', { name: 'Mulai', exact: true }).click(); await p.waitForTimeout(900);
  await inspect('ad13-detail-diproses');
  await p.getByRole('button', { name: 'Catat pengeluaran' }).click(); await p.waitForTimeout(300);
  await dialog().getByRole('button', { name: 'Tambah bahan' }).click();
  await dialog().getByRole('button', { name: 'Simpan pengeluaran' }).click(); await inspect('ad13-pengeluaran-error');
  await dialog().getByLabel('Hapus bahan 2').click();
  await dialog().locator('select').first().selectOption({ index: 1 });
  await dialog().getByLabel(/^Jumlah/).first().fill('0,5'); await inspect('ad13-pengeluaran');
  await dialog().getByRole('button', { name: 'Simpan pengeluaran' }).click(); await p.waitForTimeout(1200);
  await inspect('ad13-detail-pengeluaran');
  await p.getByRole('region', { name: 'Riwayat pengeluaran bahan', exact: true }).getByRole('button', { name: 'Koreksi' }).click(); await inspect('ad13-koreksi-pengeluaran');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.getByRole('region', { name: 'Riwayat pengeluaran bahan', exact: true }).getByRole('button', { name: 'Balik' }).click(); await inspect('ad13-alasan-balik-pengeluaran');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.getByRole('button', { name: 'Batalkan WO' }).click(); await inspect('ad13-konfirmasi-batal');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.getByRole('button', { name: 'Selesaikan WO' }).click(); await p.waitForTimeout(300);
  await dialog().getByRole('button', { name: 'Tambah bahan' }).click(); await inspect('ad13-selesaikan');
  await dialog().getByLabel('Hapus bahan 1').click();
  await dialog().getByRole('button', { name: 'Selesaikan WO' }).click(); await p.waitForTimeout(1200);
  await inspect('ad13-detail-selesai');
  await p.getByRole('region', { name: 'Riwayat hasil produksi', exact: true }).getByRole('button', { name: 'Koreksi' }).click(); await inspect('ad13-koreksi-hasil');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.getByRole('button', { name: 'Kembali ke daftar WO' }).click(); await p.waitForTimeout(600);
  await p.getByRole('button', { name: 'Buat WO' }).click(); await p.waitForTimeout(600);
  await p.fill('#wo-qty', '3'); await dialog().getByRole('button', { name: 'Simpan Draft' }).click(); await p.waitForTimeout(1200);
  await p.getByRole('button', { name: 'Batalkan WO' }).click(); await p.waitForTimeout(300);
  await dialog().getByRole('button', { name: 'Batalkan WO' }).click(); await p.waitForTimeout(900);
  await inspect('ad13-detail-dibatalkan');
  await p.goto(`${B}/admin/produksi`); await inspect('ad13-daftar');
  await p.goto(`${B}/admin/produksi?wo=987654321`); await inspect('ad13-tidak-ditemukan');
  await ctx.close();
}
await b.close();
console.log(`\npemeriksaan: ${checks} (${widths.length} lebar)`);
console.log(`layout issues: ${issues}`);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
process.exit(issues || errors.length ? 1 : 0);
