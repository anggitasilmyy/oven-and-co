import { chromium } from 'playwright';
const B = 'http://localhost:5173';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const res = []; const errors = [];
const check = (n, ok, extra = '') => res.push([ok ? '✓' : '✗', n, ok ? '' : extra]);
const newPage = async (w = 375) => {
  const c = await b.newContext({ viewport: { width: w, height: 900 } });
  await c.addInitScript(() => localStorage.setItem('ovenco_onboarding_done', '1'));
  const p = await c.newPage(); p.on('pageerror', (e) => errors.push(e.message)); return { c, p };
};
const guestCart = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('ovenco_mock_cart_guest') ?? '[]'));
const userCart = (p, id = 1) => p.evaluate((id) => JSON.parse(localStorage.getItem(`ovenco_mock_cart_${id}`) ?? '[]'), id);
const badge = (p) => p.locator('a[aria-label^="Keranjang belanja"]').first().getAttribute('aria-label');
const uniqueIds = (items) => new Set(items.map((i) => i.cart_item_id)).size === items.length;

let { c, p } = await newPage();
await p.goto(B + '/katalog'); await p.waitForTimeout(500);

// ── Unit: utils/rules/cart.js
const unit = await p.evaluate(async () => {
  const R = await import('/src/utils/rules/cart.js');
  const out = [];
  const eq = (n, a, e) => out.push([n, JSON.stringify(a) === JSON.stringify(e), JSON.stringify(a)]);
  const base = { product_id: 5, variant_id: 7, quantity: 1, preferred_date: '2026-10-17', note: '' };
  let cart = R.mergeCartItems([], [{ ...base, cart_item_id: 1 }]);
  cart = R.mergeCartItems(cart, [{ ...base, preferred_date: '2026-10-18' }]);
  eq('tanggal beda → 2 item', cart.map((i) => i.preferred_date), ['2026-10-17', '2026-10-18']);
  cart = R.mergeCartItems(cart, [{ ...base, quantity: 2 }]);
  eq('tanggal sama → digabung', cart.map((i) => i.quantity), [3, 1]);
  cart = R.mergeCartItems(cart, [{ ...base, note: 'Tulisan: Happy Birthday' }]);
  eq('catatan beda → item baru, catatan utuh', cart.map((i) => i.note), ['', '', 'Tulisan: Happy Birthday']);
  cart = R.mergeCartItems(cart, [{ ...base, note: '  Tulisan: Happy Birthday ' }]);
  eq('catatan sama (spasi dirapikan) → digabung', cart.map((i) => i.quantity), [3, 1, 2]);
  cart = R.mergeCartItems(cart, [{ ...base, variant_id: 8 }]);
  eq('varian beda → item baru', cart.length, 4);
  eq('id unik', new Set(cart.map((i) => i.cart_item_id)).size, 4);
  const legacy = [{ cart_item_id: 10, product_id: 1, quantity: 2, name: 'Croissant', price: 28000 },
                  { cart_item_id: 10, product_id: 2, quantity: 1 }, { product_id: 3, quantity: 1 }, null];
  const norm = R.normalizeCartItems(legacy);
  eq('legacy: default field', [norm[0].variant_id, norm[0].design_id, norm[0].preferred_date, norm[0].note], [null, null, null, '']);
  eq('legacy: id ganda/kosong diganti, jumlah tetap', [norm.length, new Set(norm.map((i) => i.cart_item_id)).size, norm[0].cart_item_id, norm.map((i) => i.quantity)], [3, 3, 10, [2, 1, 1]]);
  eq('legacy + item baru identik → digabung', R.mergeCartItems(legacy.slice(0, 1), [{ product_id: 1, quantity: 1, variant_id: null, note: '' }]).map((i) => i.quantity), [3]);
  const user = [{ cart_item_id: 50, product_id: 1, quantity: 1, preferred_date: null, note: '' }];
  const guest = [{ cart_item_id: 50, product_id: 5, quantity: 1, preferred_date: '2026-10-18', note: '' },
                 { cart_item_id: 51, product_id: 1, quantity: 2, preferred_date: null, note: '' }];
  const merged = R.mergeCartItems(user, guest);
  eq('merge tamu: id bentrok diganti, item sama dijumlah', [merged.length, merged[0].quantity, new Set(merged.map((i) => i.cart_item_id)).size], [2, 3, 2]);
  eq('nextCartItemId > max', R.nextCartItemId([{ cart_item_id: 9e15 }], 5) > 9e15, true);
  return out;
});
unit.forEach(([n, ok, got]) => check(`[unit] ${n}`, ok, got));

// ── Legacy cart dari Step 3/4 tetap terbaca
await p.evaluate(() => localStorage.setItem('ovenco_mock_cart_guest', JSON.stringify([
  { cart_item_id: 111, product_id: 2, variant_id: null, design_id: null, quantity: 2, note: '', preferred_date: null, name: 'Signature Cinnamon Roll', price: 32000, image_url: null },
  { cart_item_id: 111, product_id: 4, quantity: 1, name: 'Assorted Cookies Box', price: 120000 },
])));
await p.reload(); await p.waitForTimeout(500);
check('Keranjang lama terbaca, badge = 3', (await badge(p)) === 'Keranjang belanja, 3 item', await badge(p));
await p.getByRole('button', { name: 'Tambah Signature Cinnamon Roll ke keranjang' }).click(); await p.waitForTimeout(200);
let cart = await guestCart(p);
check('Quick add digabung ke item lama yang identik', cart.length === 2 && cart[0].quantity === 3 && uniqueIds(cart), JSON.stringify(cart));
await p.evaluate(() => localStorage.removeItem('ovenco_mock_cart_guest')); await p.reload(); await p.waitForTimeout(300);

// ── Pre-order: tanggal berbeda, tanggal sama, catatan beda, varian beda
await p.goto(B + '/produk/5'); await p.waitForTimeout(800);
const enabled = await p.locator('[role="radio"]:not([disabled])').evaluateAll((e) => e.map((x) => x.dataset.date));
const add = async () => { await p.getByRole('button', { name: 'Tambah ke Keranjang' }).click(); await p.waitForTimeout(150); };
await p.locator(`[data-date="${enabled[0]}"]`).click(); await add();
await p.locator(`[data-date="${enabled[1]}"]`).click(); await add();
await p.locator(`[data-date="${enabled[0]}"]`).click(); await add();
cart = await guestCart(p);
check('Tanggal berbeda → 2 item; tanggal sama → digabung', cart.length === 2 && cart[0].preferred_date === enabled[0] && cart[0].quantity === 2 && cart[1].preferred_date === enabled[1], JSON.stringify(cart.map((i) => [i.preferred_date, i.quantity])));
await p.fill('#catatan-toko', 'Tulisan: Happy Birthday Nara'); await add();
cart = await guestCart(p);
check('Catatan berbeda → item terpisah, catatan tidak tertimpa', cart.length === 3 && cart[2].note === 'Tulisan: Happy Birthday Nara' && cart[0].note === '', JSON.stringify(cart.map((i) => i.note)));
await p.getByRole('button', { name: /Red Velvet/ }).click(); await add();
cart = await guestCart(p);
check('Varian berbeda → item terpisah dengan harga varian', cart.length === 4 && cart[3].variant_id === 9 && cart[3].price === 425000);
// beruntun cepat
const btn = p.getByRole('button', { name: 'Tambah ke Keranjang' });
await Promise.all([btn.click(), btn.click(), btn.click()]); await p.waitForTimeout(300);
cart = await guestCart(p);
check('Tambah beruntun (3 klik cepat) → digabung ke 1 item, id unik', cart.length === 4 && cart[3].quantity === 4 && uniqueIds(cart), JSON.stringify(cart.map((i) => [i.variant_id, i.quantity])));

// ── Ready: tambah beruntun & stok lintas varian
await p.goto(B + '/produk/1'); await p.waitForTimeout(800);
const stock = Number(await p.locator('text=Sisa stok hari ini').locator('span').innerText());
await p.getByRole('button', { name: /Almond/ }).click();
for (let i = 0; i < stock - 3; i++) await p.getByRole('button', { name: 'Tambah jumlah' }).click();
await p.getByRole('button', { name: 'Tambah ke Keranjang' }).click(); await p.waitForTimeout(150);
await p.getByRole('button', { name: /Original/ }).click();
check('Batas stok dihitung lintas varian (sisa 2)', (await p.getByText('maks. 2 lagi').count()) === 1);
const tb = p.getByRole('button', { name: 'Tambah ke Keranjang' });
for (let i = 0; i < 4; i++) { if (await tb.isEnabled()) await tb.click(); await p.waitForTimeout(60); }
check('Tombol nonaktif saat semua stok di keranjang + pesan', !(await tb.isEnabled()) && (await p.getByText('Semua stok hari ini sudah ada di keranjangmu').count()) === 1);
cart = await guestCart(p);
const croissant = cart.filter((i) => i.product_id === 1).reduce((s, i) => s + i.quantity, 0);
check(`Klik beruntun tidak melebihi stok (${croissant}/${stock})`, croissant === stock, String(croissant));
await p.goto(B + '/katalog'); await p.waitForTimeout(500);
await p.getByRole('button', { name: 'Tambah Classic Butter Croissant ke keranjang' }).click(); await p.waitForTimeout(200);
cart = await guestCart(p);
check('Quick add "+" menolak bila stok habis oleh item bervarian', cart.filter((i) => i.product_id === 1).reduce((s, i) => s + i.quantity, 0) === stock && (await p.getByRole('alert').innerText()).includes('tinggal'));

// ── updateQuantity & removeItem per item
const ops = await p.evaluate(async () => {
  const { default: store } = await import('/src/stores/useCartStore.js');
  const items = store.getState().items;
  const target = items.find((i) => i.product_id === 5 && i.note);
  const other = items.find((i) => i.product_id === 5 && !i.note && i.variant_id === 7);
  store.getState().updateQuantity(target.cart_item_id, 5);
  const afterUpdate = store.getState().items;
  store.getState().removeItem(other.cart_item_id);
  const afterRemove = store.getState().items;
  return {
    updated: afterUpdate.find((i) => i.cart_item_id === target.cart_item_id).quantity,
    untouched: afterUpdate.find((i) => i.cart_item_id === other.cart_item_id).quantity,
    removed: !afterRemove.some((i) => i.cart_item_id === other.cart_item_id),
    count: afterRemove.length, before: items.length,
    stored: JSON.parse(localStorage.getItem('ovenco_mock_cart_guest')).length,
  };
});
check('updateQuantity hanya mengubah item yang dituju', ops.updated === 5 && ops.untouched === 2, JSON.stringify(ops));
check('removeItem hanya menghapus item yang dituju', ops.removed && ops.count === ops.before - 1 && ops.stored === ops.count, JSON.stringify(ops));

// ── Refresh
const beforeRefresh = await guestCart(p);
await p.reload(); await p.waitForTimeout(500);
const afterRefresh = await p.evaluate(async () => (await import('/src/stores/useCartStore.js')).default.getState().items);
check('Refresh: item, tanggal, catatan, id tetap', JSON.stringify(afterRefresh) === JSON.stringify(beforeRefresh));

// ── Gabung keranjang tamu ke akun (akun sudah punya item yang sama & id bentrok)
await p.evaluate((g) => localStorage.setItem('ovenco_mock_cart_1', JSON.stringify([
  { ...g.find((i) => i.product_id === 5 && i.note), quantity: 1 },
  { cart_item_id: g[0].cart_item_id, product_id: 12, variant_id: null, design_id: null, quantity: 1, note: '', preferred_date: null, name: 'Choco Chip Cookies Jar', price: 75000 },
])), afterRefresh);
const guestTotal = afterRefresh.reduce((s, i) => s + i.quantity, 0);
await p.goto(B + '/masuk'); await p.fill('#masuk-identifier', 'pelanggan@demo.com'); await p.fill('#masuk-password', 'demo1234');
await p.click('#masuk-submit-btn'); await p.waitForTimeout(900);
const merged = await userCart(p);
const noted = merged.filter((i) => i.note === 'Tulisan: Happy Birthday Nara');
check('mergeGuestCart: item identik dijumlah, catatan & tanggal utuh', noted.length === 1 && noted[0].quantity === 6 && noted[0].preferred_date === enabled[0], JSON.stringify(noted));
check('mergeGuestCart: total & id unik', merged.reduce((s, i) => s + i.quantity, 0) === guestTotal + 2 && uniqueIds(merged) && merged.length === afterRefresh.length + 1, JSON.stringify(merged.map((i) => [i.cart_item_id, i.product_id, i.quantity])));
check('mergeGuestCart: keranjang tamu dihapus', (await p.evaluate(() => localStorage.getItem('ovenco_mock_cart_guest'))) === null);
await p.goto(B + '/katalog'); await p.waitForTimeout(400);
check('Badge = total keranjang akun', (await badge(p)) === `Keranjang belanja, ${guestTotal + 2} item`, await badge(p));
await p.reload(); await p.waitForTimeout(500);
check('Refresh saat login: keranjang akun dimuat', (await badge(p)) === `Keranjang belanja, ${guestTotal + 2} item`);

// ── Logout → keranjang tamu kosong; login lagi → keranjang akun kembali
await p.setViewportSize({ width: 1280, height: 900 }); await p.goto(B + '/akun'); await p.waitForTimeout(500);
await p.getByRole('button', { name: /Keluar/ }).first().click(); await p.waitForTimeout(800);
await p.goto(B + '/katalog'); await p.waitForTimeout(400);
check('Logout → keranjang tamu (kosong)', (await badge(p)) === 'Keranjang belanja', await badge(p));
await c.close();

// ── Wishlist persistensi
({ c, p } = await newPage(1024));
await p.goto(B + '/masuk'); await p.fill('#masuk-identifier', 'pelanggan@demo.com'); await p.fill('#masuk-password', 'demo1234');
await p.click('#masuk-submit-btn'); await p.waitForTimeout(900);
await p.goto(B + '/katalog'); await p.waitForTimeout(600);
await p.getByRole('button', { name: 'Simpan Signature Cinnamon Roll ke wishlist' }).click(); await p.waitForTimeout(400);
await p.getByRole('button', { name: 'Hapus Almond Croissant dari wishlist' }).click(); await p.waitForTimeout(400);
const wl = () => p.evaluate(() => JSON.parse(localStorage.getItem('ovenco_mock_wishlists')).filter((w) => w.user_id === 1).map((w) => w.product_id).sort((a, b) => a - b));
const isOn = (name) => p.getByRole('button', { name: `Hapus ${name} dari wishlist` }).count();
const expected = JSON.stringify([2, 5]);
check('Wishlist pengguna tersimpan', JSON.stringify(await wl()) === expected, JSON.stringify(await wl()));
await p.reload(); await p.waitForTimeout(600);
check('Refresh: wishlist tetap', JSON.stringify(await wl()) === expected && (await isOn('Signature Cinnamon Roll')) === 1 && (await isOn('Almond Croissant')) === 0);
// tanggal mock berganti → simulasikan anchor_date kemarin
await p.evaluate(() => { const m = JSON.parse(localStorage.getItem('ovenco_mock_meta')); m.anchor_date = '2000-01-01'; localStorage.setItem('ovenco_mock_meta', JSON.stringify(m)); });
await p.reload(); await p.waitForTimeout(600);
const meta1 = await p.evaluate(() => JSON.parse(localStorage.getItem('ovenco_mock_meta')));
check('Tanggal berganti: data contoh dibuat ulang, wishlist tetap', meta1.anchor_date !== '2000-01-01' && JSON.stringify(await wl()) === expected && (await isOn('Signature Cinnamon Roll')) === 1);
// versi seed naik → simulasikan meta.version lama
await p.evaluate(() => { const m = JSON.parse(localStorage.getItem('ovenco_mock_meta')); m.version = 2; delete m.user_schema; localStorage.setItem('ovenco_mock_meta', JSON.stringify(m)); });
await p.reload(); await p.waitForTimeout(600);
const meta2 = await p.evaluate(() => JSON.parse(localStorage.getItem('ovenco_mock_meta')));
check('SEED_VERSION berubah: wishlist TIDAK ditimpa', meta2.version === 3 && JSON.stringify(await wl()) === expected, JSON.stringify(await wl()));
// tabel belum ada → diisi seed
await p.evaluate(() => localStorage.removeItem('ovenco_mock_wishlists'));
await p.reload(); await p.waitForTimeout(600);
check('Tabel wishlist belum ada → diisi dari seed', JSON.stringify(await wl()) === JSON.stringify([5, 7]), JSON.stringify(await wl()));
// isolasi per pelanggan
await p.getByRole('button', { name: 'Simpan Signature Cinnamon Roll ke wishlist' }).click(); await p.waitForTimeout(300);
await p.evaluate(() => {
  const a = JSON.parse(localStorage.getItem('ovenco_auth'));
  a.state.user = { user_id: 101, name: 'Rina Wulandari', email: 'rina.w@example.com', role: 'customer' };
  localStorage.setItem('ovenco_auth', JSON.stringify(a));
});
await p.reload(); await p.waitForTimeout(600);
check('Pelanggan lain tidak melihat wishlist akun demo', (await p.locator('button[aria-label^="Hapus "][aria-label$="dari wishlist"]').count()) === 0);
await p.getByRole('button', { name: 'Simpan Pain au Chocolat ke wishlist' }).click(); await p.waitForTimeout(300);
const rows = await p.evaluate(() => JSON.parse(localStorage.getItem('ovenco_mock_wishlists')));
check('Wishlist per pelanggan terpisah', JSON.stringify(rows.filter((w) => w.user_id === 101).map((w) => w.product_id)) === '[8]' && JSON.stringify(rows.filter((w) => w.user_id === 1).map((w) => w.product_id).sort()) === '[2,5,7]', JSON.stringify(rows));
// data rusak tidak membuat halaman error
await p.evaluate(() => localStorage.setItem('ovenco_mock_wishlists', '{"rusak":true}'));
await p.reload(); await p.waitForTimeout(600);
check('Data wishlist rusak tidak membuat error', (await p.locator('ul[aria-label="Daftar produk"] > li').count()) === 11);
await c.close();

let fail = 0;
for (const r of res) { console.log(r.join(' ')); if (r[0] === '✗') fail++; }
console.log(`\n${res.length - fail}/${res.length} lulus; page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
await b.close();
