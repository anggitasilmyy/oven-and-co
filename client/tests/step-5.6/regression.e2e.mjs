// Regresi Step 3 · Step 4 · Step 5.4 yang belum punya folder uji sendiri (dijalankan bersama uji Step 5.6):
// login & proteksi rute per peran, Beranda (kartu poin), Dashboard Owner & Daftar Pesanan admin,
// riwayat C-17, tracking C-18, batal (BR-08), Pesan Lagi (FR-19), form ulasan C-19 (BR-11, +20 poin).
import { chromium } from 'playwright';
const B = 'http://localhost:5173';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const res = []; const errors = [];
const check = (n, ok, extra = '') => res.push([ok ? '✓' : '✗', n, ok ? '' : extra]);
const c = await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Jakarta' });
await c.clock.install({ time: new Date('2026-10-16T10:00:00+07:00') });
await c.addInitScript(() => localStorage.setItem('ovenco_onboarding_done', '1'));
const p = await c.newPage();
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
const wait = (ms = 800) => p.waitForTimeout(ms);
const db = (fn, arg) => p.evaluate(async ([src, a]) => {
  const { getTables } = await import('/src/services/mock/db.js');
  return new Function('getTables', 'a', `return (${src})(getTables, a)`)(getTables, a);
}, [fn.toString(), arg]);
const logout = () => p.evaluate(async () => (await import('/src/stores/useAuthStore.js')).default.getState().logout());
const loginCustomer = async (pw = 'demo1234') => {
  await p.goto(`${B}/masuk`); await wait(400);
  await p.fill('#masuk-identifier', 'pelanggan@demo.com'); await p.fill('#masuk-password', pw);
  await p.click('#masuk-submit-btn'); await wait(900);
};
const loginAdmin = async (email) => {
  await logout(); await p.goto(`${B}/admin/login`); await wait(400);
  await p.fill('#admin-login-identifier', email); await p.fill('#admin-login-password', 'demo1234');
  await p.click('#admin-login-submit-btn'); await wait(1000);
};

// ── Step 3: autentikasi & proteksi rute
await p.goto(`${B}/checkout`); await wait(500);
check('Tamu /checkout → /masuk', p.url().includes('/masuk'), p.url());
await p.goto(`${B}/admin/pesanan`); await wait(500);
check('Tamu /admin/pesanan → login', /\/(admin\/login|masuk)/.test(p.url()), p.url());
await loginCustomer('salah123');
check('Login salah → pesan error SPEC §6', (await p.getByText('Email/HP atau kata sandi salah').count()) === 1);
await loginCustomer();
check('Login pelanggan → Beranda', new URL(p.url()).pathname === '/', p.url());
check('Beranda: kartu poin 1.250 · Gold', (await p.locator('main').innerText()).includes('1.250'));
await p.goto(`${B}/admin/dashboard`); await wait(500);
check('Pelanggan /admin/dashboard ditolak', !p.url().includes('/admin/dashboard'), p.url());
await loginAdmin('owner@demo.com');
check('Owner → Dashboard', p.url().endsWith('/admin/dashboard'), p.url());
const dash = await p.locator('main').innerText();
check('Step 4 Dashboard: 4 KPI', ['Omzet Hari Ini', 'Pesanan Hari Ini', 'Perlu Diproses', 'Rating Rata-rata'].every((t) => dash.includes(t)), dash.slice(0, 200));
const ownerMenu = await p.locator('aside').innerText();
check('Owner: 9 menu sidebar', ['Dashboard', 'Pesanan', 'Kalender Produksi', 'Laporan', 'Promo & Loyalty', 'Pengaturan'].every((m) => ownerMenu.includes(m)));
await loginAdmin('staf@demo.com');
check('Staf → Daftar Pesanan', p.url().endsWith('/admin/pesanan'), p.url());
const tabCounts = await p.getByRole('tab').allInnerTexts().catch(() => []);
const total = await db((getTables) => getTables('orders').orders.length);
check('Step 4 AD-03: daftar & jumlah tab Semua sesuai data', (await p.locator('main').innerText()).includes(`dari ${total} pesanan`), `${total} ${tabCounts.join('|')}`);
await p.goto(`${B}/admin/pesanan?tab=selesai`); await wait(900);
const statuses = await p.locator('main table tbody tr').evaluateAll((rows) => rows.map((r) => r.innerText));
check('AD-03 tab Selesai hanya berisi Selesai', statuses.length > 0 && statuses.every((t) => t.includes('Selesai')));

// ── Step 5.4: riwayat, tracking, batal, Pesan Lagi, ulasan
await logout(); await loginCustomer();
await p.goto(`${B}/pesanan`); await wait(900);
check('C-17: tab Aktif & Selesai', (await p.getByRole('tab', { name: /Aktif/ }).count()) === 1 && (await p.getByRole('tab', { name: /Selesai/ }).count()) === 1);
const done = await db((getTables) => {
  const t = getTables('orders', 'order_items', 'reviews');
  const reviewed = new Set(t.reviews.map((r) => r.order_item_id));
  const mine = t.orders.filter((o) => o.user_id === 1 && o.order_status === 'selesai');
  return mine.find((o) => t.order_items.some((i) => i.order_id === o.order_id && !reviewed.has(i.order_item_id)))?.order_number;
});
await p.goto(`${B}/pesanan/${done}`); await wait(900);
check('C-18: tracking pesanan Selesai + Beri Ulasan + Pesan Lagi', (await p.getByRole('region', { name: 'Riwayat status' }).count() + await p.locator('section[aria-label="Riwayat status"]').count()) > 0
  && (await p.getByText('Beri Ulasan').count()) > 0 && (await p.getByRole('button', { name: 'Pesan Lagi' }).count()) === 1);
const pointsBefore = await db((getTables) => getTables('point_transactions').point_transactions.filter((x) => x.user_id === 1).reduce((s, x) => s + x.points, 0));
await p.goto(`${B}/pesanan/${done}/ulasan`); await wait(900);
await p.getByRole('radio', { name: '5 bintang' }).first().click();
await p.getByRole('button', { name: 'Kirim Ulasan' }).click(); await wait(1200);
const pointsAfter = await db((getTables) => getTables('point_transactions').point_transactions.filter((x) => x.user_id === 1).reduce((s, x) => s + x.points, 0));
check('C-19: kirim ulasan → +20 poin (BR-11)', pointsAfter === pointsBefore + 20, `${pointsBefore}→${pointsAfter}`);
await p.goto(`${B}/pesanan/${done}`); await wait(900);
await p.getByRole('button', { name: 'Pesan Lagi' }).click(); await wait(1200);
const cartCount = await p.evaluate(async () => (await import('/src/stores/useCartStore.js')).default.getState().items.length);
check('FR-19 Pesan Lagi menyalin item ke keranjang', cartCount > 0, String(cartCount));
const pastPrep = await db((getTables) => getTables('orders').orders.find((o) => o.user_id === 1
  && ['sedang_disiapkan', 'siap_diambil', 'dalam_pengiriman', 'selesai'].includes(o.order_status)).order_number);
await p.goto(`${B}/pesanan/${pastPrep}`); await wait(900);
check('BR-08: Batalkan disembunyikan setelah Sedang Disiapkan', (await p.getByRole('heading', { name: 'Detail Pesanan' }).count()) === 1
  && (await p.getByRole('button', { name: 'Batalkan Pesanan' }).count()) === 0);
// Data contoh akun demo tidak selalu punya pesanan Dikonfirmasi → buat pesanan Bayar di Toko (langsung Dikonfirmasi)
const cancellable = await p.evaluate(async () => (await (await import('/src/services/orderService.js')).createOrder({
  items: [{ product_id: 1, variant_id: null, design_id: null, quantity: 1, note: '', preferred_date: null, price: 28000 }],
  fulfillment: 'pickup', address_id: null, ready_date: '2026-10-16', time_slot: '11.00–13.00',
  voucher_code: null, use_points: false, method_code: 'pay_at_store',
})).order_number);
await p.goto(`${B}/pesanan/${cancellable}`); await wait(900);
await p.getByRole('button', { name: 'Batalkan Pesanan' }).click(); await wait(300);
await p.fill('#cancel-reason', 'Uji regresi');
await p.getByRole('dialog').getByRole('button', { name: 'Batalkan Pesanan' }).click(); await wait(1200);
const cancelled = await db((getTables, n) => getTables('orders').orders.find((o) => o.order_number === n), cancellable);
check('FR-20: batal sebelum Sedang Disiapkan → Dibatalkan', cancelled.order_status === 'dibatalkan' && cancelled.cancel_reason === 'Uji regresi');

console.log(res.map((r) => r.join(' ')).join('\n'));
console.log(`\n${res.filter((r) => r[0] === '✓').length}/${res.length} lulus`);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await b.close();
process.exit(res.some((r) => r[0] === '✗') || errors.length ? 1 : 0);
