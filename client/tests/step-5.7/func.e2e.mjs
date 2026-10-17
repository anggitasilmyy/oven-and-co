// Uji Step 5.7 · AD-06 Produk & Opsi Custom Cake · AD-07 Stok (FR-30 · FR-31 · FR-32 · BR-01 · BR-02 · TF-12)
// Jam peramban dikunci ke Jumat 16 Okt 2026 pukul 10.00 WIB (sama dengan uji Step 5.5/5.6) agar tanggal deterministik.
import { chromium } from 'playwright';
const B = 'http://localhost:5173';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const res = []; const errors = [];
const check = (n, ok, extra = '') => res.push([ok ? '✓' : '✗', n, ok ? '' : extra]);
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Jakarta' });
await c.clock.install({ time: new Date('2026-10-16T10:00:00+07:00') });
await c.addInitScript(() => localStorage.setItem('ovenco_onboarding_done', '1'));
const p = await c.newPage();
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
const wait = (ms = 700) => p.waitForTimeout(ms);
const TODAY = '2026-10-16';
const db = (fn, arg) => p.evaluate(async ([src, a]) => {
  const { getTables } = await import('/src/services/mock/db.js');
  return new Function('getTables', 'a', `return (${src})(getTables, a)`)(getTables, a);
}, [fn.toString(), arg]);
/** Panggil fungsi service sebagai pengguna login saat ini → {ok, value|error} */
const svc = (path, name, ...args) => p.evaluate(async ([pth, n, a]) => {
  try { return { ok: true, value: await (await import(pth))[n](...a) }; } catch (e) { return { ok: false, error: e.message }; }
}, [path, name, args]);
const PRODUCTS = '/src/services/adminProductService.js';
const STOCK = '/src/services/stockService.js';
const logout = async () => { await p.evaluate(async () => (await import('/src/stores/useAuthStore.js')).default.getState().logout()); };
const loginCustomer = async () => {
  await logout(); await p.goto(`${B}/masuk`); await wait(400);
  await p.fill('#masuk-identifier', 'pelanggan@demo.com'); await p.fill('#masuk-password', 'demo1234');
  await p.click('#masuk-submit-btn'); await wait(900);
};
const loginAdmin = async (email) => {
  await logout(); await p.goto(`${B}/admin/login`); await wait(400);
  await p.fill('#admin-login-identifier', email); await p.fill('#admin-login-password', 'demo1234');
  await p.click('#admin-login-submit-btn'); await wait(900);
};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const png = (name) => ({ name, mimeType: 'image/png', buffer: PNG });
const toastText = async () => (await p.getByRole('alert').allInnerTexts()).join(' | ');
const product = (name) => db((getTables, n) => {
  const t = getTables('products', 'product_images', 'product_variants');
  const row = t.products.find((x) => x.name === n);
  return row && { ...row, images: t.product_images.filter((i) => i.product_id === row.product_id).sort((a, x) => a.sort_order - x.sort_order), variants: t.product_variants.filter((v) => v.product_id === row.product_id) };
}, name);
const stockOf = (pid) => db((getTables, a) => getTables('daily_stocks').daily_stocks.find((s) => s.product_id === a.pid && s.stock_date === a.d), { pid, d: TODAY });

await p.goto(`${B}/katalog`); await wait();

// ── Unit: utils/rules/adminCatalog.js & stock.js
const unit = await p.evaluate(async () => {
  const R = await import('/src/utils/businessRules.js');
  const out = []; const eq = (n, a, e) => out.push([n, JSON.stringify(a) === JSON.stringify(e), JSON.stringify(a)]);
  const categories = [{ category_id: 1, name: 'Roti' }, { category_id: 5, name: 'Custom Cake' }];
  const products = [{ product_id: 6, availability_type: 'custom', is_active: true }];
  const v = (input, productId = null) => R.validateProduct(R.normalizeProductInput({ name: 'Roti A', category_id: 1, price: 10000, availability_type: 'ready', is_active: true, ...input }), { categories, products, productId });
  eq('produk kosong: nama, kategori, harga', Object.keys(R.validateProduct(R.normalizeProductInput({ availability_type: 'ready' }), { categories, products })), ['name', 'category_id', 'price']);
  eq('harga 0 / negatif ditolak', [v({ price: 0 }).price, v({ price: -5 }).price], ['Harga harus lebih dari Rp 0', 'Harga harus lebih dari Rp 0']);
  eq('tipe wajib', v({ availability_type: '' }).availability_type, 'Pilih tipe produk');
  eq('ready → lead time dipaksa 0', [R.normalizeProductInput({ availability_type: 'ready', lead_time_days: 5 }).lead_time_days, Object.keys(v({ lead_time_days: 5 }))], [0, []]);
  eq('pre-order: 0 ditolak, 1 sah, 13 di atas maks', [v({ availability_type: 'preorder', lead_time_days: 0 }).lead_time_days, v({ availability_type: 'preorder', lead_time_days: 1 }).lead_time_days, v({ availability_type: 'preorder', lead_time_days: 13 }).lead_time_days],
    ['Pre-order minimal 1 hari (H-1)', undefined, 'Lead time maksimal 12 hari']);
  eq('pre-order lead time kosong / pecahan', [v({ availability_type: 'preorder', lead_time_days: '' }).lead_time_days, v({ availability_type: 'preorder', lead_time_days: 1.5 }).lead_time_days], ['Isi lead time dalam hari (bilangan bulat)', 'Isi lead time dalam hari (bilangan bulat)']);
  eq('custom: 2 ditolak, 3 sah', [v({ availability_type: 'custom', category_id: 5, lead_time_days: 2 }, 6).lead_time_days, Object.keys(v({ availability_type: 'custom', category_id: 5, lead_time_days: 3 }, 6))], ['Custom cake minimal 3 hari (H-3)', []]);
  eq('kategori ↔ tipe custom', [v({ category_id: 5 }).category_id, v({ availability_type: 'custom', lead_time_days: 3 }, 6).category_id],
    ['Kategori Custom Cake hanya untuk produk bertipe custom cake', 'Produk custom cake harus berada di kategori Custom Cake']);
  eq('hanya satu produk custom aktif', [v({ availability_type: 'custom', category_id: 5, lead_time_days: 3 }).is_active?.startsWith('Sudah ada produk custom'), v({ availability_type: 'custom', category_id: 5, lead_time_days: 3, is_active: false }).is_active], [true, undefined]);
  eq('maks. 5 foto', v({ photos: Array.from({ length: 6 }, (_, i) => ({ image_url: `/x${i}.webp` })) }).photos, 'Maksimal 5 foto');
  eq('varian: nama wajib, ganda, harga < 0', v({ variants: [{ name: 'Ori', extra_price: 0, is_active: true }, { name: ' ori ', extra_price: -1, is_active: true }, { name: '', extra_price: 0 }] }).variants,
    [null, { name: 'Nama varian sudah dipakai', extra_price: 'Harga tambahan minimal Rp 0' }, { name: 'Isi nama varian' }]);
  eq('custom dengan varian aktif ditolak', v({ availability_type: 'custom', category_id: 5, lead_time_days: 3, variants: [{ name: 'A', extra_price: 0, is_active: true }] }, 6).variantsGeneral?.startsWith('Custom cake memakai'), true);
  eq('label tipe', ['ready', 'preorder', 'custom'].map((t) => R.getProductTypeLabel({ availability_type: t, lead_time_days: t === 'custom' ? 3 : 2 })), ['Ready', 'Pre-order H-2', 'Custom H-3']);
  const options = [{ option_id: 1, option_group: 'rasa', name: 'Vanilla', is_active: true }, { option_id: 2, option_group: 'rasa', name: 'Cokelat', is_active: false }, { option_id: 3, option_group: 'ukuran', name: 'Kecil', is_active: true }, { option_id: 4, option_group: 'ukuran', name: 'Besar', is_active: true }];
  const o = (input, id = null) => R.validateCustomOption(R.normalizeCustomOptionInput({ option_group: 'rasa', name: 'Pandan', extra_price: 0, ...input }), options, id);
  eq('opsi sah', o({}), {});
  eq('opsi: nama kosong, ganda (huruf beda), harga < 0', [o({ name: ' ' }).name, o({ name: 'vanilla' }).name, o({ extra_price: -1 }).extra_price, o({ extra_price: '' }).extra_price],
    ['Isi nama opsi', 'Nama sudah dipakai di kelompok Rasa', 'Harga tambahan minimal Rp 0', 'Harga tambahan minimal Rp 0']);
  eq('opsi: nama sama boleh di kelompok lain & saat mengubah dirinya', [o({ name: 'Kecil' }).name, o({ name: 'Vanilla' }, 1).name], [undefined, undefined]);
  eq('opsi aktif terakhir di kelompok tidak boleh dinonaktifkan', [R.checkOptionDeactivation(options, 1), R.checkOptionDeactivation(options, 3), R.checkOptionDeactivation(options, 2)],
    ['Kelompok Rasa harus punya minimal satu opsi aktif', null, null]);
  eq('rencana stok: kosong, negatif, pecahan, < terjual, sah', ['', -1, 1.5, 3, 5].map((q) => R.validateDailyPlan(q, 4)),
    ['Isi jumlah dalam bilangan bulat', 'Stok tidak boleh negatif', 'Isi jumlah dalam bilangan bulat', 'Minimal 4 (sudah terjual 4)', null]);
  eq('status stok harian', [null, { qty_planned: 0, qty_sold: 0 }, { qty_planned: 5, qty_sold: 5 }, { qty_planned: 5, qty_sold: 2 }].map(R.getDailyStockStatus), ['belum_diisi', 'belum_diisi', 'habis', 'tersedia']);
  eq('status bahan: habis / menipis (= minimum) / aman', [{ stock: 0, min_stock: 2 }, { stock: 3, min_stock: 3 }, { stock: 3.1, min_stock: 3 }].map(R.getMaterialStatus), ['habis', 'menipis', 'aman']);
  const L = { nameMax: 100, unitMax: 20, qtyMax: 99999999.99 };
  eq('bahan sah', R.validateMaterial({ name: 'Keju', unit: 'kg', stock: '0', min_stock: '2.5' }, [{ material_id: 1, name: 'Butter' }], null, L), {});
  eq('bahan: kosong, nama ganda, stok negatif, 3 desimal', R.validateMaterial({ name: ' butter ', unit: '', stock: '-1', min_stock: '1.234' }, [{ material_id: 1, name: 'Butter' }], null, L),
    { name: 'Bahan dengan nama ini sudah ada', unit: 'Isi satuan, mis. kg atau butir', stock: 'Stok tidak boleh negatif', min_stock: 'Maksimal 2 angka desimal' });
  eq('stok masuk: 0, negatif, kosong, 3 desimal, melebihi batas, sah', ['0', '-2', '', '1.234', '5', '2.5'].map((q, i) => R.validateStockIn(q, i === 4 ? 99999999 : 6.5, 99999999.99)),
    ['Jumlah masuk harus lebih dari 0', 'Jumlah masuk tidak boleh negatif', 'Isi jumlah masuk', 'Maksimal 2 angka desimal', 'Stok baru melebihi batas penyimpanan', null]);
  eq('penjumlahan desimal tanpa galat', [R.addDecimal(6.5, '0.1'), R.addDecimal(0.1, 0.2)], [6.6, 0.3]);
  const { mergeAdminDailyStocks } = await import('/src/services/mock/userRows.js');
  const merged = mergeAdminDailyStocks(
    [{ stock_id: 1, product_id: 1, stock_date: 'D', qty_planned: 40, qty_sold: 6 }, { stock_id: 2, product_id: 2, stock_date: 'D', qty_planned: 30, qty_sold: 0 }],
    [{ stock_id: 1000001, product_id: 1, stock_date: 'D', qty_planned: 4, qty_sold: 9 }, { stock_id: 1000002, product_id: 9, stock_date: 'D', qty_planned: 5, qty_sold: 3 }],
  );
  eq('gabung rencana admin: ganti baris contoh, rencana ≥ terjual contoh, qty_sold dari seed', merged.map((s) => `${s.stock_id}:${s.product_id}:${s.qty_planned}:${s.qty_sold}`), ['2:2:30:0', '1000001:1:6:6', '1000002:9:5:0']);
  return out;
});
unit.forEach(([n, ok, got]) => check(`unit: ${n}`, ok, got));

// ── Hak akses (SPEC §2: Staf & Owner)
check('Tamu: service produk admin ditolak', (await svc(PRODUCTS, 'getAdminProducts')).error === 'Silakan masuk terlebih dahulu');
await loginCustomer();
for (const path of ['/admin/produk', '/admin/stok']) {
  await p.goto(`${B}${path}`); await wait(600);
  check(`Pelanggan tidak bisa membuka ${path}`, !p.url().includes('/admin'), p.url());
}
check('Pelanggan: service produk/stok ditolak', [(await svc(PRODUCTS, 'saveProduct', 1, {})).error, (await svc(STOCK, 'recordStockIn', 1, 5)).error].every((e) => e === 'Akses ditolak untuk peran ini'));
await loginAdmin('owner@demo.com');
await p.goto(`${B}/admin/produk`); await wait(900);
check('Owner: AD-06 terbuka dengan tabel produk', (await p.getByRole('table', { name: 'Daftar produk' }).count()) === 1);
await loginAdmin('staf@demo.com');
const nav = await p.locator('aside nav').innerText();
check('Staf: menu Produk & Custom Cake dan Stok tersedia', nav.includes('Produk & Custom Cake') && nav.includes('Stok'));
await p.goto(`${B}/admin/produk`); await wait(900);
const tableText = await p.getByRole('table', { name: 'Daftar produk' }).innerText();
check('AD-06 menampilkan produk nonaktif & kolom spec', tableText.includes('Red Velvet Slice') && ['FOTO', 'KATEGORI', 'TIPE', 'HARGA', 'STOK HARI INI', 'RATING', 'AKTIF'].every((h) => tableText.toUpperCase().includes(h)), tableText.slice(0, 200));
check('AD-06 tipe & stok: Pre-order H-1, Custom H-3, Pain au Chocolat Habis', tableText.includes('Pre-order H-1') && tableText.includes('Custom H-3') && /Pain au Chocolat[\s\S]*?Habis/.test(tableText));

// ── FR-30: tambah produk (validasi inline, foto, varian)
await p.getByRole('button', { name: 'Tambah Produk' }).click(); await wait(400);
await p.getByRole('button', { name: 'Simpan produk' }).click(); await wait(300);
const drawer = p.getByRole('dialog');
const dtext = await drawer.innerText();
check('Simpan kosong → error inline nama, kategori, harga', ['Isi nama produk', 'Pilih kategori', 'Harga harus lebih dari Rp 0'].every((t) => dtext.includes(t)), dtext.slice(0, 400));
const countBefore = await db((getTables) => getTables('products').products.length);
await p.fill('#product-name', 'Banana Bread');
await p.selectOption('#product-category', { label: 'Roti' });
await p.fill('#product-price', '36000');
await p.selectOption('#product-type', 'preorder');
check('Ganti tipe ke Pre-order → lead time default 1', (await p.inputValue('#product-lead')) === '1');
await p.fill('#product-lead', '0'); await p.locator('#product-lead').blur(); await wait(200);
check('Lead time pre-order 0 → error H-1', (await drawer.innerText()).includes('Pre-order minimal 1 hari (H-1)'));
await p.fill('#product-lead', '2');
await p.fill('#product-allergens', 'Gluten, telur, pisang');
await p.getByRole('button', { name: 'Tambah varian' }).click();
await drawer.locator('input[id^="variant-name-"]').first().fill('Original');
await p.getByRole('button', { name: 'Tambah varian' }).click();
await drawer.locator('input[id^="variant-name-"]').nth(1).fill('Walnut');
await drawer.locator('input[id^="variant-price-"]').nth(1).fill('8000');
await drawer.locator('input[type="file"]').setInputFiles([png('a.png'), png('b.png')]); await wait(600);
check('2 foto terunggah (data URL) + foto utama', (await drawer.locator('img').count()) === 2 && (await drawer.getByText('Utama', { exact: true }).count()) === 1);
await drawer.getByRole('button', { name: 'Jadikan foto 2 foto utama' }).click();
await p.getByRole('button', { name: 'Simpan produk' }).click(); await wait(900);
const banana = await product('Banana Bread');
check('Produk baru tersimpan (+1, id ≥ 1.000.000, lead 2, aktif)', banana && (await db((getTables) => getTables('products').products.length)) === countBefore + 1 && banana.product_id >= 1000000 && banana.lead_time_days === 2 && banana.is_active && banana.price === 36000, JSON.stringify(banana)?.slice(0, 300));
check('Foto & varian tersimpan (2 foto data URL, 2 varian)', banana?.images.length === 2 && banana.images.every((i) => i.image_url.startsWith('data:image/jpeg')) && banana.variants.map((x) => `${x.name}:${x.extra_price}`).join() === 'Original:0,Walnut:8000');
check('Toast sukses & drawer tertutup', (await toastText()).includes('Produk ditambahkan') && (await p.getByRole('dialog').count()) === 0);
check('Tabel AD-06 memuat produk baru', (await p.getByRole('table', { name: 'Daftar produk' }).innerText()).includes('Banana Bread'));

// Pelanggan melihat produk baru di katalog dengan tanggal siap H-2
await loginCustomer();
const catalog = (await svc('/src/services/catalogService.js', 'getCatalogProducts')).value;
const bananaView = catalog.find((x) => x.name === 'Banana Bread');
check('Katalog pelanggan memuat produk baru + foto utama', Boolean(bananaView) && bananaView.image_url === banana.images[0].image_url);
const detail = (await svc('/src/services/productDetailService.js', 'getProductDetail', banana.product_id)).value;
check('Detail produk: tanggal siap tercepat H+2 & varian aktif', detail?.earliest_ready_date === '2026-10-18' && detail.variants.length === 2, JSON.stringify(detail)?.slice(0, 200));
await p.goto(`${B}/produk/${banana.product_id}`); await wait(900);
check('Halaman detail produk baru terbuka', (await p.getByRole('heading', { name: 'Banana Bread' }).count()) >= 1);

// ── Ubah produk & nonaktifkan (FR-30: produk nonaktif disembunyikan dari web)
await loginAdmin('staf@demo.com');
await p.goto(`${B}/admin/produk`); await wait(900);
await p.getByRole('button', { name: 'Ubah Banana Bread' }).click(); await wait(800);
check('Form ubah terisi data tersimpan', (await p.inputValue('#product-name')) === 'Banana Bread' && (await p.inputValue('#product-lead')) === '2' && (await p.getByRole('dialog').locator('img').count()) === 2);
await p.fill('#product-price', '38000');
await p.getByRole('dialog').getByRole('switch', { name: 'Tampilkan di katalog (aktif)' }).click();
await p.getByRole('button', { name: 'Simpan produk' }).click(); await wait(900);
const banana2 = await product('Banana Bread');
check('Ubah harga & nonaktif tersimpan; id, foto, varian tetap', banana2.price === 38000 && !banana2.is_active && banana2.product_id === banana.product_id && banana2.images.length === 2 && banana2.variants.length === 2);
await loginCustomer();
const catalog2 = (await svc('/src/services/catalogService.js', 'getCatalogProducts')).value;
check('Produk nonaktif hilang dari katalog, pencarian, dan detail', !catalog2.some((x) => x.name === 'Banana Bread')
  && !(await svc('/src/services/catalogService.js', 'searchProducts', 'banana')).value.length
  && (await svc('/src/services/productDetailService.js', 'getProductDetail', banana.product_id)).value === null);
await loginAdmin('staf@demo.com');
await p.goto(`${B}/admin/produk`); await wait(900);
await p.getByRole('switch', { name: 'Aktifkan Banana Bread' }).click(); await wait(800);
check('Toggle tabel: aktif kembali + toast', (await product('Banana Bread')).is_active && (await toastText()).includes('Banana Bread aktif'));

// Batas 5 foto di UI & service
await p.getByRole('button', { name: 'Ubah Banana Bread' }).click(); await wait(800);
await p.getByRole('dialog').locator('input[type="file"]').setInputFiles([png('c.png'), png('d.png'), png('e.png'), png('f.png')]); await wait(800);
const dtext2 = await p.getByRole('dialog').innerText();
check('Unggah melebihi 5 foto: hanya 5 diterima + pesan, tombol tambah hilang', (await p.getByRole('dialog').locator('img').count()) === 5 && dtext2.includes('Maksimal 5 foto. 1 foto tidak ditambahkan.') && (await p.getByRole('dialog').locator('input[type="file"]').count()) === 0);
await p.getByRole('dialog').getByRole('button', { name: 'Hapus foto 5' }).click();
await p.getByRole('button', { name: 'Simpan produk' }).click(); await wait(900);
check('Hapus foto lalu simpan → 4 foto', (await product('Banana Bread')).images.length === 4);
const six = Array.from({ length: 6 }, (_, i) => ({ image_id: null, image_url: `/images/products/x${i}.webp` }));
const svc6 = await svc(PRODUCTS, 'saveProduct', banana.product_id, { ...banana2, is_active: true, photos: six, variants: banana2.variants });
check('Service menolak 6 foto', svc6.error === 'Maksimal 5 foto');
const otherImage = await db((getTables) => getTables('product_images').product_images.find((i) => i.product_id === 1).image_id);
check('Service menolak foto milik produk lain', (await svc(PRODUCTS, 'saveProduct', banana.product_id, { ...banana2, photos: [{ image_id: otherImage, image_url: 'x' }], variants: banana2.variants })).error === 'Foto tidak ditemukan. Muat ulang halaman.');

// Aturan katalog lain
const custom = await product('Custom Celebration Cake');
check('Tidak bisa mengaktifkan produk custom kedua', (await svc(PRODUCTS, 'saveProduct', null, { name: 'Custom Kedua', category_id: 5, price: 300000, availability_type: 'custom', lead_time_days: 3, is_active: true })).error?.startsWith('Sudah ada produk custom cake aktif'));
check('Lead time custom < 3 ditolak service', (await svc(PRODUCTS, 'saveProduct', custom.product_id, { ...custom, lead_time_days: 2, photos: custom.images, variants: [] })).error === 'Custom cake minimal 3 hari (H-3)');
const croissant = await product('Classic Butter Croissant');
const almond = croissant.variants.find((x) => x.name === 'Almond');
await svc(PRODUCTS, 'saveProduct', croissant.product_id, { ...croissant, price: 30000, photos: croissant.images, variants: croissant.variants.map((x) => (x.variant_id === almond.variant_id ? { ...x, is_active: false } : x)) });
await loginCustomer();
const cDetail = (await svc('/src/services/productDetailService.js', 'getProductDetail', croissant.product_id)).value;
check('Perubahan harga & varian nonaktif tercermin di detail pelanggan', cDetail.price === 30000 && !cDetail.variants.some((x) => x.name === 'Almond') && cDetail.images.length === croissant.images.length);
check('Foto lama tetap memakai berkas WebP lokal', cDetail.images.every((u) => u.startsWith('/images/products/') && u.endsWith('.webp')));

// ── FR-31: opsi custom cake
await loginAdmin('staf@demo.com');
await p.goto(`${B}/admin/produk?tab=opsi`); await wait(900);
check('Tab Opsi Custom Cake: 4 kelompok + lead time H-3', (await p.getByRole('heading', { level: 2 }).allInnerTexts()).filter((h) => ['Ukuran', 'Bentuk', 'Rasa', 'Krim & Topping'].includes(h)).length === 4 && (await p.locator('main').innerText()).includes('Lead time minimal custom cake: 3 hari (H-3)'));
await p.getByRole('button', { name: 'Tambah opsi Rasa' }).click(); await wait(300);
await p.fill('#option-name', 'vanilla'); await p.fill('#option-price', '-1000');
await p.getByRole('button', { name: 'Simpan opsi' }).click(); await wait(300);
const otext = await p.getByRole('dialog').innerText();
check('Opsi: nama ganda & harga negatif ditolak inline', otext.includes('Nama sudah dipakai di kelompok Rasa') && otext.includes('Harga tambahan minimal Rp 0'));
await p.fill('#option-name', 'Pandan'); await p.fill('#option-description', 'Pandan wangi'); await p.fill('#option-price', '30000');
await p.getByRole('button', { name: 'Simpan opsi' }).click(); await wait(900);
check('Opsi Pandan ditambahkan + toast', (await toastText()).includes('Opsi ditambahkan') && (await p.locator('main').innerText()).includes('Pandan'));
await p.getByRole('button', { name: 'Ubah opsi Kotak' }).click(); await wait(300);
await p.fill('#option-price', '35000'); await p.getByRole('button', { name: 'Simpan opsi' }).click(); await wait(900);
await p.getByRole('switch', { name: 'Nonaktifkan opsi Red Velvet' }).click(); await wait(800);
await p.getByRole('switch', { name: 'Nonaktifkan opsi Diameter 20 cm' }).click(); await wait(800);
await p.getByRole('switch', { name: 'Nonaktifkan opsi Diameter 24 cm' }).click(); await wait(800);
await p.getByRole('switch', { name: 'Nonaktifkan opsi Diameter 15 cm' }).click(); await wait(800);
check('Opsi aktif terakhir di kelompok ditolak + toast error', (await toastText()).includes('Kelompok Ukuran harus punya minimal satu opsi aktif')
  && (await db((getTables) => getTables('custom_options').custom_options.find((o) => o.name === 'Diameter 15 cm').is_active)));
await p.reload(); await wait(900);
check('Status opsi tersimpan setelah muat ulang (Nonaktif tampil)', (await p.getByRole('switch', { name: 'Aktifkan opsi Red Velvet' }).count()) === 1);
await loginCustomer();
const builder = (await svc('/src/services/customCakeService.js', 'getCustomCakeBuilder')).value;
check('Builder: Pandan muncul, Red Velvet & 20/24 cm hilang, Kotak +35.000', builder.options.rasa.some((o) => o.name === 'Pandan' && o.extra_price === 30000)
  && !builder.options.rasa.some((o) => o.name === 'Red Velvet') && builder.options.ukuran.length === 1 && builder.options.bentuk.find((o) => o.name === 'Kotak').extra_price === 35000);
const pandan = builder.options.rasa.find((o) => o.name === 'Pandan');
const design = await svc('/src/services/customCakeService.js', 'createCustomCakeDesign', {
  selections: { ukuran: builder.options.ukuran[0].option_id, bentuk: builder.options.bentuk.find((o) => o.name === 'Kotak').option_id, rasa: pandan.option_id, krim_topping: builder.options.krim_topping[0].option_id },
  writingText: '', writingColor: null, referencePhoto: null, readyDate: '2026-10-19',
});
check('Harga desain = dasar + opsi terbaru (450.000 + 35.000 + 30.000)', design.value?.price === 515000, JSON.stringify(design));
check('Opsi nonaktif ditolak saat menyimpan desain', (await svc('/src/services/customCakeService.js', 'createCustomCakeDesign', {
  selections: { ukuran: builder.options.ukuran[0].option_id, bentuk: builder.options.bentuk[0].option_id, rasa: 9, krim_topping: builder.options.krim_topping[0].option_id },
  writingText: '', writingColor: null, referencePhoto: null, readyDate: '2026-10-19',
})).ok === false);

// ── FR-32: stok produk harian
await loginAdmin('staf@demo.com');
await p.goto(`${B}/admin/stok`); await wait(900);
const boardText = await p.locator('main').innerText();
check('AD-07 harian: tanggal hari ini & produk ready aktif saja', boardText.includes('Jumat, 16 Okt') && boardText.includes('Classic Butter Croissant') && !boardText.includes('Premium Birthday Cake') && !boardText.includes('Red Velvet Slice'));
const c0 = await stockOf(1);
await p.fill('#plan-1', String(c0.qty_sold - 1));
check('Rencana < terjual → error inline & Simpan nonaktif', (await p.locator('main').innerText()).includes(`Minimal ${c0.qty_sold} (sudah terjual ${c0.qty_sold})`) && await p.getByRole('button', { name: 'Simpan Stok' }).isDisabled());
await p.fill('#plan-1', '-3');
check('Rencana negatif → error', (await p.locator('main').innerText()).includes('Stok tidak boleh negatif'));
await p.fill('#plan-1', '50'); await p.fill('#plan-8', '12');
check('Pratinjau sisa & status sebelum disimpan', (await p.locator('main').innerText()).includes('2 produk diubah, belum disimpan'));
await p.getByRole('button', { name: 'Simpan Stok' }).click(); await wait(900);
const c1 = await stockOf(1); const pain = await stockOf(8);
check('Rencana tersimpan; terjual tidak berubah; baris diberi id admin', c1.qty_planned === 50 && c1.qty_sold === c0.qty_sold && c1.stock_id >= 1000000 && pain.qty_planned === 12 && (await toastText()).includes('Stok hari ini disimpan untuk 2 produk'));
check('Service menolak rencana < terjual & produk non-ready', (await svc(STOCK, 'updateDailyStocks', [{ product_id: 1, qty_planned: 0 }])).ok === false
  && (await svc(STOCK, 'updateDailyStocks', [{ product_id: 5, qty_planned: 10 }])).error === 'Produk ini bukan produk ready yang aktif');
check('Satu baris tidak sah → tidak ada yang disimpan', (await svc(STOCK, 'updateDailyStocks', [{ product_id: 2, qty_planned: 99 }, { product_id: 1, qty_planned: -1 }])).ok === false && (await stockOf(2)).qty_planned !== 99);
await loginCustomer();
const fresh = (await svc('/src/services/productService.js', 'getFreshFromOvenToday', { limit: 20 })).value;
check('Fresh from Oven: Pain au Chocolat kembali tersedia (12 − terjual)', fresh.some((x) => x.product_id === 8 && x.remaining_today === 12 - pain.qty_sold));
const order = await svc('/src/services/orderService.js', 'createOrder', {
  items: [{ product_id: 1, variant_id: null, design_id: null, quantity: 2, note: '', preferred_date: null, price: 30000 }],
  fulfillment: 'pickup', address_id: null, ready_date: TODAY, time_slot: '11.00–13.00', voucher_code: null, use_points: false, method_code: 'qris',
});
check('TF-12: pesanan mengurangi stok (terjual +2)', order.ok && (await stockOf(1)).qty_sold === c0.qty_sold + 2, JSON.stringify(order));
await svc('/src/services/orderHistoryService.js', 'cancelMyOrder', order.value.order_number, 'Salah pilih');
check('TF-12: batal mengembalikan stok', (await stockOf(1)).qty_sold === c0.qty_sold);

// Produk ready yang belum punya baris stok hari ini
await loginAdmin('staf@demo.com');
await svc(PRODUCTS, 'setProductActive', 11, true);
await p.goto(`${B}/admin/stok`); await wait(900);
check('Produk ready diaktifkan tampil "Belum diisi"', /Red Velvet Slice[\s\S]*?Belum diisi/.test(await p.locator('main').innerText()));
await p.fill('#plan-11', '6'); await p.getByRole('button', { name: 'Simpan Stok' }).click(); await wait(900);
const rv = await stockOf(11);
check('Baris stok baru dibuat (6, terjual 0)', rv?.qty_planned === 6 && rv.qty_sold === 0 && rv.stock_id >= 1000000);

// ── FR-32: bahan baku
await p.getByRole('tab', { name: 'Bahan Baku' }).click(); await wait(900);
check('Tab Bahan Baku di URL & ringkasan status', p.url().includes('tab=bahan') && (await p.locator('main').innerText()).includes('Menipis: 3'));
await p.getByRole('button', { name: 'Catat stok masuk Butter Prancis' }).click(); await wait(300);
await p.fill('#stock-in-qty', '0');
check('Stok masuk 0 → error', (await p.getByRole('dialog').innerText()).includes('Jumlah masuk harus lebih dari 0'));
await p.fill('#stock-in-qty', '1.234');
check('Stok masuk 3 desimal → error', (await p.getByRole('dialog').innerText()).includes('Maksimal 2 angka desimal'));
await p.fill('#stock-in-qty', '2.1');
check('Pratinjau stok baru 8,6 kg', (await p.getByRole('dialog').innerText()).includes('Stok baru: 8,6 kg'));
await p.getByRole('dialog').getByRole('button', { name: 'Simpan' }).click(); await wait(900);
const butter = await db((getTables) => getTables('raw_materials').raw_materials.find((m) => m.name === 'Butter Prancis'));
check('Stok masuk tersimpan (6,5 + 2,1 = 8,6) → Aman', butter.stock === 8.6 && (await toastText()).includes('Stok Butter Prancis kini 8,6 kg') && (await p.locator('main').innerText()).includes('Menipis: 2'));
await p.getByRole('button', { name: 'Ubah Telur ayam' }).click(); await wait(300);
await p.fill('#material-stock', '-5'); await p.locator('#material-stock').blur();
check('Ubah stok negatif → error', (await p.getByRole('dialog').innerText()).includes('Stok tidak boleh negatif'));
await p.fill('#material-stock', '60'); await p.fill('#material-min', '80');
check('Peringatan stok ≤ minimum di form', (await p.getByRole('dialog').innerText()).includes('ditandai Menipis'));
await p.fill('#material-min', '50');
await p.getByRole('button', { name: 'Simpan bahan' }).click(); await wait(900);
check('Ubah bahan tersimpan → Aman', (await db((getTables) => getTables('raw_materials').raw_materials.find((m) => m.name === 'Telur ayam'))).min_stock === 50 && (await p.locator('main').innerText()).includes('Menipis: 1'));
await p.getByRole('button', { name: 'Tambah Bahan' }).click(); await wait(300);
await p.fill('#material-name', 'gula PASIR'); await p.fill('#material-unit', 'kg'); await p.fill('#material-stock', '0'); await p.fill('#material-min', '2');
await p.getByRole('button', { name: 'Simpan bahan' }).click(); await wait(300);
check('Nama bahan ganda ditolak', (await p.getByRole('dialog').innerText()).includes('Bahan dengan nama ini sudah ada'));
await p.fill('#material-name', 'Keju cheddar');
await p.getByRole('button', { name: 'Simpan bahan' }).click(); await wait(900);
check('Bahan baru stok 0 → Habis', /Keju cheddar[\s\S]*?Habis/.test(await p.getByRole('table', { name: 'Daftar bahan baku' }).innerText()) && (await p.locator('main').innerText()).includes('Habis: 1'));
check('Service menolak stok negatif', (await svc(STOCK, 'saveMaterial', 1, { name: 'Tepung terigu protein tinggi', unit: 'kg', stock: -1, min_stock: 25 })).error === 'Stok tidak boleh negatif');
await loginAdmin('owner@demo.com');
const dash = (await svc('/src/services/dashboardService.js', 'getOwnerDashboard')).value;
check('Dashboard Stok Menipis ikut data AD-07 (Cokelat & Keju; Butter/Telur tidak)', dash.lowStock.map((m) => m.name).sort().join() === 'Cokelat couverture,Keju cheddar', dash.lowStock.map((m) => m.name).join());

// ── Persistensi: muat ulang & pembuatan ulang data contoh (ganti tanggal / SEED_VERSION)
await p.reload(); await wait(700);
await p.evaluate(() => { const m = JSON.parse(localStorage.getItem('ovenco_mock_meta')); localStorage.setItem('ovenco_mock_meta', JSON.stringify({ ...m, version: 0, anchor_date: '2026-10-01' })); });
const after = await db((getTables) => {
  const t = getTables('products', 'custom_options', 'raw_materials', 'daily_stocks', 'orders');
  return {
    banana: t.products.find((x) => x.name === 'Banana Bread')?.price,
    croissant: t.products.find((x) => x.product_id === 1).price,
    pandan: t.custom_options.some((o) => o.name === 'Pandan'),
    redVelvet: t.custom_options.find((o) => o.name === 'Red Velvet').is_active,
    keju: t.raw_materials.some((m) => m.name === 'Keju cheddar'),
    butter: t.raw_materials.find((m) => m.name === 'Butter Prancis').stock,
    plan1: t.daily_stocks.filter((s) => s.product_id === 1 && s.stock_date === '2026-10-16'),
    plan11: t.daily_stocks.find((s) => s.product_id === 11 && s.stock_date === '2026-10-16')?.qty_planned,
    reseeded: JSON.parse(localStorage.getItem('ovenco_mock_meta')).version > 0,
  };
});
check('Data contoh dibuat ulang tetapi katalog admin tetap (produk, harga, opsi, bahan)', after.reseeded && after.banana === 38000 && after.croissant === 30000 && after.pandan && after.redVelvet === false && after.keju && after.butter === 8.6, JSON.stringify(after));
check('Rencana stok admin tetap (1 baris, 50) & produk baru tetap 6', after.plan1.length === 1 && after.plan1[0].qty_planned === 50 && after.plan11 === 6, JSON.stringify(after.plan1));

console.log(res.map((r) => r.join(' ')).join('\n'));
console.log(`\n${res.filter((r) => r[0] === '✓').length}/${res.length} lulus`);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await b.close();
process.exit(res.some((r) => r[0] === '✗') || errors.length ? 1 : 0);
