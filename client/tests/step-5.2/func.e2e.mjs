// Uji Step 5.2 · C-11 Custom Cake Builder (FR-10 · BR-02) + regresi ringan
import { chromium } from 'playwright';
const B = 'http://localhost:5173';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const res = []; const errors = [];
const check = (n, ok, extra = '') => res.push([ok ? '✓' : '✗', n, ok ? '' : extra]);
const newPage = async (w = 375) => {
  const c = await b.newContext({ viewport: { width: w, height: 900 } });
  await c.addInitScript(() => localStorage.setItem('ovenco_onboarding_done', '1'));
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  return { c, p };
};
const bar = (p) => p.locator('[data-layout="action-bar"]');
const total = async (p) => (await bar(p).innerText()).match(/Rp [\d.]+/)?.[0];
const lanjut = (p) => p.getByRole('button', { name: 'Lanjut' });
const pickOption = async (p, name) => { await p.getByRole('radio', { name: new RegExp(name) }).click(); };
const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

let { c, p } = await newPage();
await p.goto(B + '/custom-cake'); await p.waitForTimeout(500);

// ── Unit: utils/rules/customCake.js
const unit = await p.evaluate(async () => {
  const R = await import('/src/utils/businessRules.js');
  const out = [];
  const eq = (n, a, e) => out.push([n, JSON.stringify(a) === JSON.stringify(e), JSON.stringify(a)]);
  const opts = [
    { option_id: 1, option_group: 'ukuran', extra_price: 0, is_active: true },
    { option_id: 2, option_group: 'ukuran', extra_price: 150000, is_active: true },
    { option_id: 3, option_group: 'ukuran', extra_price: 300000, is_active: false },
    { option_id: 4, option_group: 'bentuk', extra_price: 50000, is_active: true },
    { option_id: 7, option_group: 'rasa', extra_price: 40000, is_active: true },
    { option_id: 10, option_group: 'krim_topping', extra_price: 60000, is_active: true },
  ];
  const g = R.groupCustomOptions(opts);
  eq('opsi nonaktif tidak tampil', g.ukuran.map((o) => o.option_id), [1, 2]);
  const sel = { ukuran: 2, bentuk: 4, rasa: 7, krim_topping: 10 };
  eq('harga = dasar + Σ extra', R.calculateCustomCakePrice(450000, R.getSelectedOptions(g, sel)), 750000);
  eq('opsi nonaktif terpilih diabaikan', R.getSelectedOptions(g, { ...sel, ukuran: 3 }).length, 3);
  const ctx = { groupedOptions: g, earliestKey: '2026-10-19' };
  const d = { selections: sel, writingText: 'Happy Birthday', writingColor: 'Cokelat', readyDate: '2026-10-19' };
  eq('desain lengkap sah', R.validateCustomCakeDesign(d, ctx), null);
  eq('ukuran kosong', R.validateCustomCakeDesign({ ...d, selections: { ...sel, ukuran: null } }, ctx), 'Pilih ukuran terlebih dahulu');
  eq('tulisan 31 karakter ditolak', R.validateCustomCakeDesign({ ...d, writingText: 'x'.repeat(31) }, ctx), 'Tulisan maksimal 30 karakter');
  eq('tulisan 30 karakter sah', R.isWritingTextValid('x'.repeat(30)), true);
  eq('tanpa tulisan sah', R.validateCustomCakeDesign({ ...d, writingText: '' }, ctx), null);
  eq('warna di luar daftar ditolak', R.isWritingColorValid('Hai', 'Hijau'), false);
  eq('tanggal < H+3 ditolak', R.validateCustomCakeDesign({ ...d, readyDate: '2026-10-18' }, ctx), 'Pilih tanggal minimal H+3');
  eq('completion', R.getCustomCakeStepCompletion({ ...d, selections: { ...sel, rasa: null } }, ctx), [true, true, false, true, true, true]);
  eq('langkah terkunci', [R.canOpenCustomCakeStep([true, false, true], 1), R.canOpenCustomCakeStep([true, false, true], 2)], [true, false]);
  eq('BR-02 custom H+3', R.getEarliestReadyDate({ availability_type: 'custom', lead_time_days: 3 }, new Date('2026-10-16T19:00:00')), '2026-10-19');
  return out;
});
unit.forEach(([n, ok, got]) => check(`unit: ${n}`, ok, got));

// ── Builder: langkah, harga berjalan, preview
check('Judul "Design Your Celebration Cake"', (await p.getByRole('heading', { name: 'Design Your Celebration Cake' }).count()) === 1);
check('Harga awal = harga dasar Rp 450.000', (await total(p)) === 'Rp 450.000', await total(p));
check('Lanjut nonaktif sebelum memilih', await lanjut(p).isDisabled());
check('Langkah 2 di stepper terkunci', await p.getByRole('button', { name: /^Langkah 2: Bentuk/ }).isDisabled());
const preview0 = await p.locator('svg[role="img"]').innerHTML();
await pickOption(p, 'Diameter 20 cm');
check('Harga berjalan +150.000 → Rp 600.000', (await total(p)) === 'Rp 600.000', await total(p));
check('Preview berubah saat ukuran dipilih', (await p.locator('svg[role="img"]').innerHTML()) !== preview0);
await lanjut(p).click();
check('Langkah 2 · Bentuk', (await p.getByText('Langkah 2 dari 6 · Bentuk').count()) === 1);
await pickOption(p, 'Hati'); await lanjut(p).click();
await pickOption(p, 'Red Velvet'); await lanjut(p).click();
await pickOption(p, 'Whipped'); 
check('Total 4 opsi = Rp 750.000', (await total(p)) === 'Rp 750.000', await total(p));
// Kembali lewat stepper lalu ganti ukuran
await p.getByRole('button', { name: /^Langkah 1: Ukuran/ }).click();
check('Stepper: kembali ke langkah selesai', (await p.getByText('Langkah 1 dari 6 · Ukuran').count()) === 1);
await pickOption(p, 'Diameter 15 cm');
check('Ganti ukuran → harga turun ke Rp 600.000', (await total(p)) === 'Rp 600.000', await total(p));
await p.getByRole('button', { name: /^Langkah 5: Tulisan/ }).click();
check('Lompat ke langkah 5 (semua sebelumnya selesai)', (await p.getByText('Langkah 5 dari 6 · Tulisan').count()) === 1);
// Tulisan maks. 30
await p.fill('#tulisan-kue', 'Happy Birthday, Nadia! Semoga panjang umur');
const val = await p.inputValue('#tulisan-kue');
check('Tulisan dipotong 30 karakter', val.length === 30, `${val.length}`);
check('Penghitung 30/30', (await p.getByText('30/30').count()) === 1);
await p.fill('#tulisan-kue', 'Happy Birthday, Nadia!');
check('Tulisan tampil di preview', (await p.locator('svg[role="img"] text').innerHTML()).includes('Happy Birthday, Nadia!'));
await p.getByRole('button', { name: 'Pink', exact: true }).click();
// Foto referensi (PNG 2x2)
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVQImWP8z8DwnxEIGMEEAwMDAwB2tgL/0r3LJQAAAABJRU5ErkJggg==', 'base64');
await p.setInputFiles('input[type="file"]', { name: 'ref.png', mimeType: 'image/png', buffer: png });
await p.waitForTimeout(400);
check('Foto referensi tampil', (await p.getByAltText('Foto referensi yang diunggah').count()) === 1);
await lanjut(p).click();
// Tanggal ≥ H+3
const dates = await p.locator('[role="radio"][data-date]').evaluateAll((els) => els.map((e) => ({ d: e.dataset.date, dis: e.disabled, sel: e.getAttribute('aria-checked') })));
const today = new Date(); const h3 = new Date(today); h3.setDate(h3.getDate() + 3);
check('H, H+1, H+2 dinonaktifkan', dates.slice(0, 3).every((x) => x.dis), JSON.stringify(dates.slice(0, 4)));
check(`Default tanggal = H+3 (${keyOf(h3)})`, dates[3].d === keyOf(h3) && !dates[3].dis && dates[3].sel === 'true', JSON.stringify(dates[3]));
check('Helper text H-3', (await p.getByText('Custom cake butuh minimal 3 hari untuk dibuat with care.').count()) === 1);
const later = dates[6].d;
await p.locator(`[data-date="${later}"]`).click();
check('Ringkasan berisi semua pilihan', /Diameter 15 cm[\s\S]*Hati[\s\S]*Red Velvet[\s\S]*Whipped[\s\S]*Happy Birthday, Nadia![\s\S]*Pink[\s\S]*foto referensi/.test(await p.locator('#ringkasan-desain').locator('..').innerText()));
await p.getByRole('button', { name: 'Ubah Bentuk' }).click();
check('Ubah → buka langkah Bentuk', (await p.getByText('Langkah 2 dari 6 · Bentuk').count()) === 1);
await pickOption(p, 'Kotak');
await p.getByRole('button', { name: /^Langkah 6: Tanggal/ }).click();
check('Kotak (+25.000) → Rp 575.000', (await total(p)) === 'Rp 575.000', await total(p));
await p.getByRole('button', { name: 'Tambah ke Keranjang' }).click(); await p.waitForTimeout(500);
check('Toast "Ditambahkan ke keranjang"', (await p.getByRole('alert').innerText()).includes('Ditambahkan ke keranjang'));
check('Builder kembali ke langkah 1', (await p.getByText('Langkah 1 dari 6 · Ukuran').count()) === 1);
let cart = await p.evaluate(() => JSON.parse(localStorage.getItem('ovenco_mock_cart_guest')));
const item = cart[0];
check('Keranjang: design_id, harga, tanggal, foto produk WebP', cart.length === 1 && item.product_id === 6 && item.design_id >= 1000000
  && item.price === 575000 && item.preferred_date === later && item.quantity === 1 && /\.webp$/.test(item.image_url), JSON.stringify(item));
const saved = await p.evaluate(async (id) => {
  const { getTables } = await import('/src/services/mock/db.js');
  const t = getTables('custom_cake_designs', 'custom_cake_design_options');
  return { d: t.custom_cake_designs.find((x) => x.design_id === id), o: t.custom_cake_design_options.filter((x) => x.design_id === id).map((x) => x.option_id) };
}, item.design_id);
check('custom_cake_designs tersimpan (tamu: user_id null)', saved.d && saved.d.user_id === null && saved.d.writing_text === 'Happy Birthday, Nadia!'
  && saved.d.writing_color === 'Pink' && saved.d.price === 575000 && saved.d.ready_date === later && saved.d.reference_photo_url?.startsWith('data:image/jpeg'), JSON.stringify({ ...saved.d, reference_photo_url: saved.d?.reference_photo_url?.slice(0, 20) }));
check('custom_cake_design_options = 4 opsi', JSON.stringify(saved.o) === JSON.stringify([1, 5, 9, 11]), JSON.stringify(saved.o));
// Desain buatan pengguna bertahan saat data contoh dibuat ulang (tanggal berganti)
const kept = await p.evaluate(async (id) => {
  const m = JSON.parse(localStorage.getItem('ovenco_mock_meta')); m.anchor_date = '2000-01-01';
  localStorage.setItem('ovenco_mock_meta', JSON.stringify(m));
  const { getTables } = await import('/src/services/mock/db.js');
  const t = getTables('custom_cake_designs', 'custom_cake_design_options', 'orders');
  return { design: t.custom_cake_designs.some((x) => x.design_id === id), opts: t.custom_cake_design_options.filter((x) => x.design_id === id).length, orders: t.orders.length };
}, item.design_id);
check('Reseed: desain pelanggan tidak hilang, data contoh terisi', kept.design && kept.opts === 4 && kept.orders > 0, JSON.stringify(kept));
// Desain kedua (tanpa tulisan) → item terpisah
await pickOption(p, 'Diameter 24 cm'); await lanjut(p).click();
await pickOption(p, 'Bulat'); await lanjut(p).click();
await pickOption(p, 'Vanilla'); await lanjut(p).click();
await pickOption(p, 'Buttercream'); await lanjut(p).click();
check('Tanpa tulisan: Lanjut aktif', await lanjut(p).isEnabled());
await lanjut(p).click();
await p.getByRole('button', { name: 'Tambah ke Keranjang' }).click(); await p.waitForTimeout(500);
cart = await p.evaluate(() => JSON.parse(localStorage.getItem('ovenco_mock_cart_guest')));
check('Desain kedua = item terpisah Rp 750.000', cart.length === 2 && cart[1].price === 750000 && cart[1].design_id !== cart[0].design_id, JSON.stringify(cart.map((i) => [i.design_id, i.price])));
await p.goto(B + '/katalog'); await p.waitForTimeout(600);
check('Badge keranjang = 2', (await p.locator('a[aria-label^="Keranjang belanja"]').first().getAttribute('aria-label')) === 'Keranjang belanja, 2 item');
// Pintu masuk C-11
await p.getByRole('link', { name: /Custom Celebration Cake/ }).first().click(); await p.waitForTimeout(600);
check('Katalog: Custom Celebration Cake → /custom-cake', p.url().endsWith('/custom-cake'), p.url());
await p.goto(B + '/'); await p.waitForTimeout(800);
await p.locator('section[aria-labelledby="custom-cake-banner"] a').first().click(); await p.waitForTimeout(600);
check('Banner Beranda → /custom-cake', p.url().endsWith('/custom-cake'), p.url());
// Login: keranjang tamu digabung (FR-04), desain pelanggan memakai user_id
await p.goto(B + '/masuk'); await p.waitForTimeout(400);
await p.fill('#masuk-identifier', 'pelanggan@demo.com'); await p.fill('#masuk-password', 'demo1234');
await p.click('#masuk-submit-btn'); await p.waitForTimeout(900);
const uc = await p.evaluate(() => JSON.parse(localStorage.getItem('ovenco_mock_cart_1') ?? '[]'));
check('Login: item custom cake tetap ada (digabung)', uc.filter((i) => i.design_id).length >= 2, JSON.stringify(uc.map((i) => i.design_id)));
await p.goto(B + '/custom-cake'); await p.waitForTimeout(600);
for (const n of ['Diameter 15 cm', 'Bulat', 'Cokelat', 'Ganache']) { await pickOption(p, n); await lanjut(p).click(); }
await lanjut(p).click();
await p.getByRole('button', { name: 'Tambah ke Keranjang' }).click(); await p.waitForTimeout(500);
const last = await p.evaluate(async () => {
  const cart = JSON.parse(localStorage.getItem('ovenco_mock_cart_1'));
  const { getTables } = await import('/src/services/mock/db.js');
  const id = cart[cart.length - 1].design_id;
  return getTables('custom_cake_designs').custom_cake_designs.find((d) => d.design_id === id);
});
check('Pelanggan login: user_id terisi, tanpa tulisan → null', last?.user_id === 1 && last.writing_text === null && last.writing_color === null && last.price === 525000, JSON.stringify(last));
await c.close();

// ── Regresi: halaman lain tetap jalan & foto WebP termuat
({ c, p } = await newPage(1440));
for (const r of ['/', '/katalog', '/produk/1', '/produk/5', '/cari?q=croissant', '/custom-cake']) {
  await p.goto(B + r); await p.waitForTimeout(900);
  const broken = await p.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
  check(`Regresi ${r}: tanpa gambar rusak`, broken.length === 0, broken.join(', '));
}
await c.close();
for (const [email, path] of [['owner@demo.com', '/admin/dashboard'], ['staf@demo.com', '/admin/pesanan']]) {
  ({ c, p } = await newPage(1440));
  await p.goto(B + '/admin/login'); await p.waitForTimeout(500);
  await p.fill('#admin-login-identifier', email); await p.fill('#admin-login-password', 'demo1234');
  await p.click('#admin-login-submit-btn'); await p.waitForTimeout(1500);
  check(`Admin ${email} → ${path}`, p.url().endsWith(path), p.url());
  if (email.startsWith('staf')) {
    await p.goto(B + '/admin/produk'); await p.waitForTimeout(500);
    check('Staf bisa membuka /admin/produk (placeholder AD-06 tetap)', p.url().endsWith('/admin/produk'), p.url());
  }
  await c.close();
}

res.forEach((r) => console.log(r.join(' ')));
console.log(`\n${res.filter((r) => r[0] === '✓').length}/${res.length} lulus`);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await b.close();
