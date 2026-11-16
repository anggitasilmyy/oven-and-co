// Uji CR-04a · AC-NF · AD-12 Pembelian & dialog CR-04a AD-07 (mode mock), lebar CR-01 360 – 1920 px: overflow horizontal,
// sidebar/drawer < 1024, dialog di dalam viewport (isi tidak terpotong), area sentuh ≥ 44 × 44 px, setiap input/select/
// textarea berlabel (label, aria-label, atau aria-labelledby), kartu tidak terpotong; error konsol/halaman = gagal.
// Status tampilan yang diperiksa: empty state, daftar, form & error validasi, detail Draft/Dipesan, penerimaan, koreksi,
// alasan pembalik/batal, stock opname, riwayat mutasi, koreksi stok masuk.
// Jalankan (Vite mode mock di :5173): node tests/step-6.8/visual.e2e.mjs <folder-hasil> [noshot]
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

  // AD-12: empty state, supplier (form kosong → error, isi), PO (form, detail Draft → Dipesan → penerimaan)
  await p.goto(`${B}/admin/pembelian`); await inspect('ad12-po-kosong');
  await p.goto(`${B}/admin/pembelian?tab=supplier`); await inspect('ad12-supplier-daftar');
  await p.getByRole('button', { name: 'Tambah Supplier' }).click(); await p.waitForTimeout(300);
  await dialog().getByRole('button', { name: 'Simpan supplier' }).click(); await inspect('ad12-supplier-form-error');
  await p.fill('#supplier-name', `Toko Visual ${w}`); await p.fill('#supplier-phone', '+6281234567890');
  await p.fill('#supplier-email', 'v@contoh.id'); await p.fill('#supplier-contact_person', 'Sari'); await p.fill('#supplier-address', 'Jl. Uji 1');
  await dialog().getByLabel(/^Butter Prancis/).check(); await dialog().getByLabel(/^Telur ayam/).check();
  await dialog().getByRole('button', { name: 'Simpan supplier' }).click(); await p.waitForTimeout(900);
  await inspect('ad12-supplier-terisi');
  await p.goto(`${B}/admin/pembelian`); await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'Buat PO' }).click(); await p.waitForTimeout(300);
  await dialog().getByRole('button', { name: 'Tambah item' }).click();
  await dialog().getByRole('button', { name: 'Simpan Draft' }).click(); await inspect('ad12-po-form-error');
  await dialog().getByLabel('Hapus item 2').click();
  await dialog().locator('select').nth(1).selectOption({ label: 'Butter Prancis (kg)' });
  await dialog().getByLabel('Jumlah').first().fill('10'); await dialog().getByLabel('Harga satuan (Rp)').first().fill('15000');
  await inspect('ad12-po-form');
  await dialog().getByRole('button', { name: 'Simpan Draft' }).click(); await p.waitForTimeout(1200);
  await inspect('ad12-po-detail-draft');
  await p.getByRole('button', { name: 'Pesan ke supplier' }).click(); await inspect('ad12-po-konfirmasi-pesan');
  await dialog().getByRole('button', { name: 'Pesan', exact: true }).click(); await p.waitForTimeout(900);
  await p.getByRole('button', { name: 'Terima barang' }).click(); await inspect('ad12-penerimaan');
  await dialog().getByLabel('Jumlah (kg)').fill('4');
  await dialog().getByRole('button', { name: 'Simpan penerimaan' }).click(); await p.waitForTimeout(1200);
  await inspect('ad12-po-detail-sebagian');
  await p.getByRole('button', { name: 'Koreksi' }).first().click(); await inspect('ad12-koreksi-penerimaan');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.getByRole('button', { name: 'Balik' }).first().click(); await inspect('ad12-alasan-pembalik');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.getByRole('button', { name: 'Batalkan PO' }).click(); await inspect('ad12-alasan-batal');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.goto(`${B}/admin/pembelian`); await inspect('ad12-po-daftar');
  await p.goto(`${B}/admin/pembelian?po=987654321`); await inspect('ad12-po-tidak-ditemukan');

  // AD-07: dialog CR-04a (opname, riwayat, koreksi & pembalik stok masuk)
  await p.goto(`${B}/admin/stok?tab=bahan`); await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'Stock opname Butter Prancis' }).first().click(); await inspect('ad07-opname');
  await dialog().getByLabel(/Stok fisik/).fill('-1'); await inspect('ad07-opname-error');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.getByRole('button', { name: 'Catat stok masuk Butter Prancis' }).first().click(); await p.waitForTimeout(300);
  await p.fill('#stock-in-qty', '2'); await dialog().getByRole('button', { name: 'Simpan' }).click(); await p.waitForTimeout(900);
  await p.getByRole('button', { name: 'Riwayat mutasi Butter Prancis' }).first().click(); await inspect('ad07-riwayat');
  await dialog().getByRole('button', { name: 'Koreksi' }).first().click(); await inspect('ad07-koreksi-stok-masuk');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400); // kembali ke dialog riwayat (tanpa dialog bertumpuk)
  await dialog().getByRole('button', { name: 'Balik' }).first().click(); await inspect('ad07-alasan-balik-stok-masuk');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.getByRole('button', { name: 'Riwayat mutasi Telur ayam' }).first().click(); await inspect('ad07-riwayat-tanpa-aksi');
  await ctx.close();
}
await b.close();
console.log(`\npemeriksaan: ${checks} (${widths.length} lebar)`);
console.log(`layout issues: ${issues}`);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
process.exit(issues || errors.length ? 1 : 0);
