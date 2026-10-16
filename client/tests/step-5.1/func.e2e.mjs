import { chromium } from 'playwright';
const B = 'http://localhost:5173';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const res = []; const errors = [];
const check = (n, ok, extra = '') => res.push([ok ? '✓' : '✗', n, extra]);
async function ctxAt(w) {
  const c = await b.newContext({ viewport: { width: w, height: 900 } });
  await c.addInitScript(() => localStorage.setItem('ovenco_onboarding_done', '1'));
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  return { c, p };
}
const cards = (p) => p.locator('ul[aria-label="Daftar produk"] > li h3').allInnerTexts();
const badge = (p) => p.locator('a[aria-label^="Keranjang belanja"]').first().getAttribute('aria-label');
async function login(p, email) {
  await p.fill('#masuk-identifier', email); await p.fill('#masuk-password', 'demo1234');
  await p.click('#masuk-submit-btn'); await p.waitForTimeout(900);
}

// ── Mobile 375: Beranda chip → Katalog terfilter
let { c, p } = await ctxAt(375);
await p.goto(B + '/'); await p.waitForTimeout(800);
await p.getByRole('link', { name: 'Pastry' }).click(); await p.waitForTimeout(800);
check('Chip Beranda Pastry → /katalog?kategori=3', p.url().endsWith('/katalog?kategori=3'), p.url());
let names = await cards(p);
check('Katalog hanya Pastry', names.length === 3 && names.every((n) => /Croissant|Pain/.test(n)), names.join(', '));
check('Tab Pastry aktif', (await p.getByRole('button', { name: 'Pastry', pressed: true }).count()) === 1);
// Sheet: ready hari ini + rating 4.5 + urut harga tertinggi
await p.getByRole('button', { name: /Filter & Urutan/ }).click();
await p.getByRole('dialog').getByRole('button', { name: 'Ready Hari Ini' }).click();
const btnText = await p.getByRole('dialog').getByRole('button', { name: /Tampilkan|Tidak ada/ }).innerText();
check('Tombol "Tampilkan N produk" ikut draf', /Tampilkan 2 produk/.test(btnText), btnText);
await p.getByRole('dialog').locator('select').selectOption('harga-tertinggi');
await p.getByRole('dialog').getByRole('button', { name: /Tampilkan/ }).click(); await p.waitForTimeout(400);
check('URL menyimpan filter', /ketersediaan=ready/.test(p.url()) && /urut=harga-tertinggi/.test(p.url()) && /kategori=3/.test(p.url()), p.url());
names = await cards(p);
check('Hasil Ready hari ini, harga tertinggi dulu', names.join('|') === 'Almond Croissant|Classic Butter Croissant', names.join('|'));
check('Badge jumlah filter = 1', (await p.getByRole('button', { name: /1 filter aktif/ }).count()) === 1);
await p.reload(); await p.waitForTimeout(700);
check('Filter bertahan setelah refresh', (await cards(p)).length === 2);
// harga & rating via URL
await p.goto(B + '/katalog?harga_min=40000&harga_max=130000&rating=4.5'); await p.waitForTimeout(700);
names = await cards(p);
check('Filter harga 40–130rb & rating ≥4,5', names.length > 0, names.join(', '));
await p.goto(B + '/katalog?harga_min=490000'); await p.waitForTimeout(700);
check('Empty state katalog', (await p.getByText('Produk tidak ditemukan').count()) === 1);
await p.getByRole('button', { name: 'Reset filter' }).click(); await p.waitForTimeout(500);
check('Reset filter', (await cards(p)).length === 11, String((await cards(p)).length));
check('Produk nonaktif (Red Velvet) tidak tampil', !(await cards(p)).includes('Red Velvet Slice'));

// ── Pencarian & riwayat
await p.goto(B + '/cari'); await p.waitForTimeout(500);
check('Chip populer tampil', (await p.getByRole('button', { name: 'Birthday Cake' }).count()) === 1);
await p.getByRole('button', { name: 'Birthday Cake' }).click(); await p.waitForTimeout(800);
let sr = await p.locator('ul[aria-label="Hasil pencarian"] h3').allInnerTexts();
check('Cari "Birthday Cake"', sr.join() === 'Premium Birthday Cake', sr.join());
await p.fill('#cari-produk', 'pastry'); await p.press('#cari-produk', 'Enter'); await p.waitForTimeout(800);
sr = await p.locator('ul[aria-label="Hasil pencarian"] h3').allInnerTexts();
check('Cari berdasarkan kategori "pastry"', sr.length === 3, sr.join());
await p.fill('#cari-produk', 'brownies'); await p.press('#cari-produk', 'Enter'); await p.waitForTimeout(800);
check('Empty state "Belum ada hasil untuk “brownies”"', (await p.getByText('Belum ada hasil untuk “brownies”').count()) === 1);
const hist = await p.evaluate(() => JSON.parse(localStorage.getItem('ovenco_search_history')));
check('Riwayat tersimpan di ovenco_search_history', JSON.stringify(hist) === JSON.stringify(['brownies', 'pastry', 'Birthday Cake']), JSON.stringify(hist));
await p.getByRole('button', { name: 'Hapus kata kunci' }).click(); await p.waitForTimeout(400);
await p.getByRole('button', { name: 'Hapus "brownies" dari riwayat' }).click();
check('Hapus satu riwayat', (await p.evaluate(() => JSON.parse(localStorage.getItem('ovenco_search_history')))).length === 2);
await p.reload(); await p.waitForTimeout(500);
check('Riwayat tampil setelah refresh', (await p.getByRole('button', { name: 'pastry', exact: true }).count()) === 1);

// ── Detail produk ready: varian, stok, tambah keranjang
await p.goto(B + '/produk/1'); await p.waitForTimeout(800);
const stock = Number(await p.locator('text=Sisa stok hari ini').locator('span').innerText());
await p.getByRole('button', { name: /Almond/ }).click();
check('Harga varian Almond = Rp 34.000', (await p.locator('[data-layout="action-bar"]').innerText()).includes('Rp 34.000'));
check('Varian nonaktif Matcha tidak tampil', (await p.getByRole('button', { name: /Matcha/ }).count()) === 0);
const plus = p.getByRole('button', { name: 'Tambah jumlah' });
for (let i = 0; i < stock + 5 && await plus.isEnabled(); i++) await plus.click();
const qty = Number(await p.locator('output').innerText());
check(`Stepper berhenti di stok (${stock})`, qty === stock && !(await plus.isEnabled()), `qty=${qty}`);
for (let i = 0; i < stock - 2; i++) await p.getByRole('button', { name: 'Kurangi jumlah' }).click();
await p.fill('#catatan-toko', 'Tolong hangatkan');
await p.getByRole('button', { name: 'Tambah ke Keranjang' }).click(); await p.waitForTimeout(300);
check('Toast "Ditambahkan ke keranjang"', (await p.getByRole('alert').innerText()).includes('Ditambahkan ke keranjang'));
const cart = await p.evaluate(() => JSON.parse(localStorage.getItem('ovenco_mock_cart_guest')));
check('Item keranjang: varian, harga, catatan', cart[0].variant_id === 2 && cart[0].price === 34000 && cart[0].note === 'Tolong hangatkan' && cart[0].name.includes('Almond'), JSON.stringify(cart[0]));
check(`Sisa maks. setelah di keranjang = ${stock - 2}`, (await p.getByText(`maks. ${stock - 2} lagi`).count()) === 1);

await p.goto(B + '/katalog'); await p.waitForTimeout(600);
check('Badge keranjang (header Katalog) = 2', (await badge(p)) === 'Keranjang belanja, 2 item', await badge(p));
await p.getByRole('button', { name: 'Tambah Signature Cinnamon Roll ke keranjang' }).click(); await p.waitForTimeout(200);
check('Quick add "+" di Katalog → badge 3', (await badge(p)) === 'Keranjang belanja, 3 item', await badge(p));
// ── Produk habis
await p.goto(B + '/produk/8'); await p.waitForTimeout(800);
check('Produk habis: tombol nonaktif', await p.getByRole('button', { name: 'Stok habis' }).isDisabled());

// ── Pre-order: tanggal
await p.goto(B + '/produk/5'); await p.waitForTimeout(800);
const dates = await p.locator('[role="radio"]').evaluateAll((els) => els.map((e) => ({ d: e.dataset.date, dis: e.disabled, sel: e.getAttribute('aria-checked') })));
const earliest = dates.find((x) => !x.dis);
const now = new Date(); const late = now.getHours() * 60 + now.getMinutes() > 17 * 60;
const exp = new Date(now); exp.setDate(exp.getDate() + (late ? 2 : 1));
const expKey = `${exp.getFullYear()}-${String(exp.getMonth() + 1).padStart(2, '0')}-${String(exp.getDate()).padStart(2, '0')}`;
check(`Tanggal siap tercepat = ${expKey} (jam ${now.getHours()}:${now.getMinutes()}, batas 17.00)`, earliest.d === expKey && earliest.sel === 'true', JSON.stringify(dates.slice(0, 3)));
check('Tanggal sebelum batas dinonaktifkan', dates.filter((x) => x.d < expKey).every((x) => x.dis) && dates[0].dis);
const third = dates.filter((x) => !x.dis)[2].d;
await p.locator(`[data-date="${third}"]`).click();
await p.getByRole('button', { name: /Red Velvet/ }).click();
await p.getByRole('button', { name: 'Tambah ke Keranjang' }).click(); await p.waitForTimeout(300);
const cart2 = await p.evaluate(() => JSON.parse(localStorage.getItem('ovenco_mock_cart_guest')));
check('Pre-order: preferred_date & harga varian', cart2[2]?.preferred_date === third && cart2[2]?.price === 425000, JSON.stringify(cart2[2]));
await p.goto(B + '/cari'); await p.waitForTimeout(500);
check('Badge keranjang = 4', (await badge(p)) === 'Keranjang belanja, 4 item', await badge(p));
// custom
await p.goto(B + '/produk/6'); await p.waitForTimeout(800);
check('Produk custom → /custom-cake', p.url().endsWith('/custom-cake'), p.url());
await p.goto(B + '/produk/11'); await p.waitForTimeout(800);
check('Produk nonaktif → "Produk tidak ditemukan"', (await p.getByText('Produk tidak ditemukan').count()) === 1);

// ── Ulasan
await p.goto(B + '/produk/1/ulasan'); await p.waitForTimeout(800);
const total = Number((await p.getByText(/^\d+ ulasan$/).innerText()).split(' ')[0]);
const allCards = await p.locator('section[aria-label="Daftar ulasan"] article').count();
check('Jumlah kartu = ringkasan', total === allCards, `${total} vs ${allCards}`);
await p.getByRole('button', { name: /Dengan Foto/ }).click();
const photoCards = await p.locator('section[aria-label="Daftar ulasan"] article').evaluateAll((a) => a.every((x) => x.querySelector('ul[aria-label="Foto ulasan"]')));
check('Filter Dengan Foto', photoCards);
await p.getByRole('button', { name: 'Bintang 4' }).click();
const r4 = await p.locator('section[aria-label="Daftar ulasan"] article [role="img"]').evaluateAll((a) => a.every((x) => x.getAttribute('aria-label').startsWith('Rating 4 ')));
check('Filter bintang 4', r4);
const hiddenCheck = await p.evaluate(async () => {
  const { getTables } = await import('/src/services/mock/db.js');
  const t = getTables('reviews', 'order_items');
  const items = new Set(t.order_items.filter((i) => i.product_id === 1).map((i) => i.order_item_id));
  const mine = t.reviews.filter((r) => items.has(r.order_item_id));
  return { visible: mine.filter((r) => !r.is_hidden).length, hidden: mine.filter((r) => r.is_hidden).length, allHidden: t.reviews.filter((r) => r.is_hidden).length };
});
check(`Ulasan is_hidden tidak tampil (produk 1: ${hiddenCheck.hidden} tersembunyi, total ${hiddenCheck.allHidden})`, hiddenCheck.visible === total);

// ── Wishlist tamu
await p.goto(B + '/katalog'); await p.waitForTimeout(700);
await p.getByRole('button', { name: 'Simpan Classic Butter Croissant ke wishlist' }).click(); await p.waitForTimeout(500);
check('Tamu → /masuk', p.url().endsWith('/masuk'), p.url());
await login(p, 'pelanggan@demo.com');
check('Setelah login kembali ke /katalog', p.url().endsWith('/katalog'), p.url());
check('Keranjang tamu digabung (FR-04) badge = 4', (await badge(p)) === 'Keranjang belanja, 4 item', await badge(p));
check('Wishlist seed pelanggan (Birthday Cake) aktif', (await p.getByRole('button', { name: 'Hapus Premium Birthday Cake dari wishlist' }).count()) === 1);
await p.getByRole('button', { name: 'Simpan Classic Butter Croissant ke wishlist' }).click(); await p.waitForTimeout(500);
check('Pelanggan simpan wishlist', (await p.getByRole('button', { name: 'Hapus Classic Butter Croissant dari wishlist' }).count()) === 1);
let wl = await p.evaluate(() => JSON.parse(localStorage.getItem('ovenco_mock_wishlists')));
check('Tersimpan di ovenco_mock_wishlists', wl.some((w) => w.user_id === 1 && w.product_id === 1), JSON.stringify(wl));
await p.goto(B + '/produk/1'); await p.waitForTimeout(800);
await p.getByRole('button', { name: 'Hapus Classic Butter Croissant dari wishlist' }).click(); await p.waitForTimeout(500);
wl = await p.evaluate(() => JSON.parse(localStorage.getItem('ovenco_mock_wishlists')));
check('Hapus wishlist dari detail', !wl.some((w) => w.product_id === 1) && wl.length === 2);
await c.close();

// ── Desktop 1440: sidebar langsung menerapkan filter
({ c, p } = await ctxAt(1440));
await p.goto(B + '/katalog'); await p.waitForTimeout(700);
check('≥lg: tombol Filter & Urutan tersembunyi', !(await p.getByRole('button', { name: /^Filter & Urutan/ }).isVisible()));
const side = p.locator('[data-layout="catalog-filter-sidebar"]');
await side.getByRole('button', { name: 'Pre-order' }).click(); await p.waitForTimeout(300);
names = await cards(p);
check('Sidebar: Pre-order', names.join('|') === 'Sourdough Country Loaf|Premium Birthday Cake' || names.length === 2, names.join('|'));
await side.locator('#sidebar-harga-max').fill('100000'); await side.locator('#sidebar-harga-max').press('Enter'); await p.waitForTimeout(300);
check('Sidebar: harga maks 100.000 → URL', /harga_max=100000/.test(p.url()) && (await cards(p)).join() === 'Sourdough Country Loaf', p.url());
await side.getByRole('button', { name: 'Reset' }).click(); await p.waitForTimeout(300);
check('Sidebar reset', (await cards(p)).length === 11);
await p.goto(B + '/produk/1'); await p.waitForTimeout(800);
const pos = await p.locator('[data-layout="action-bar"]').evaluate((e) => getComputedStyle(e).position);
check('≥lg: ActionBar sticky di kanan', pos === 'sticky', pos);
await c.close();

// ── Regresi Step 3–4
({ c, p } = await ctxAt(1440));
await p.goto(B + '/'); await p.waitForTimeout(900);
check('Beranda: Fresh from Oven Today & Best Sellers', (await p.getByRole('heading', { name: 'Fresh from Oven Today' }).count()) === 1 && (await p.locator('#best-sellers').count()) === 1);
await p.goto(B + '/akun'); await p.waitForTimeout(500);
check('ProtectedRoute /akun → /masuk', p.url().endsWith('/masuk'));
await p.goto(B + '/admin/login'); await p.waitForTimeout(500);
await p.fill('input[type=email], input[name=identifier], #admin-identifier', 'owner@demo.com').catch(() => {});
const inputs = p.locator('input'); await inputs.nth(0).fill('owner@demo.com'); await inputs.nth(1).fill('demo1234');
await p.getByRole('button', { name: /^Masuk/ }).last().click(); await p.waitForTimeout(1500);
check('Owner → Dashboard', p.url().endsWith('/admin/dashboard'), p.url());
check('Dashboard KPI tampil', (await p.getByText(/Omzet/i).count()) > 0);
await p.goto(B + '/admin/pesanan'); await p.waitForTimeout(900);
check('AD-03 daftar pesanan berisi', (await p.getByText(/OVC-\d{6}-\d{3}/).count()) > 0);
await c.close();

let fail = 0;
for (const r of res) { console.log(r.join(' ')); if (r[0] === '✗') fail++; }
console.log(`\n${res.length - fail}/${res.length} lulus; page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
await b.close();
