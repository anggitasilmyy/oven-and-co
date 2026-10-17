// Uji Step 5.6 · AD-04 Detail & Verifikasi Pesanan · AD-05 Kalender Produksi (FR-28 · FR-29 · BR-05 · BR-09 · SPEC §4)
// Jam peramban dikunci ke Jumat 16 Okt 2026 pukul 10.00 WIB (sama dengan uji Step 5.5) agar slot & tanggal deterministik.
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
const db = (fn, arg) => p.evaluate(async ([src, a]) => {
  const { getTables } = await import('/src/services/mock/db.js');
  return new Function('getTables', 'a', `return (${src})(getTables, a)`)(getTables, a);
}, [fn.toString(), arg]);
/** Panggil fungsi service sebagai pengguna login saat ini → {ok, value|error} */
const svc = (path, name, ...args) => p.evaluate(async ([pth, n, a]) => {
  try { return { ok: true, value: await (await import(pth))[n](...a) }; } catch (e) { return { ok: false, error: e.message }; }
}, [path, name, args]);
const ADMIN = '/src/services/adminOrderService.js';
const snap = (num) => db((getTables, n) => {
  const t = getTables('orders', 'payments', 'order_status_histories', 'notifications', 'point_transactions', 'daily_stocks', 'vouchers');
  const o = t.orders.find((x) => x.order_number === n);
  return {
    order: o, payment: t.payments.find((x) => x.order_id === o.order_id),
    history: t.order_status_histories.filter((h) => h.order_id === o.order_id).sort((a, x) => a.history_id - x.history_id),
    notifs: t.notifications.filter((x) => x.order_id === o.order_id).map((x) => `${x.type}:${x.title}`),
    earn: t.point_transactions.filter((x) => x.order_id === o.order_id && x.type === 'earn'),
    balance: t.point_transactions.filter((x) => x.user_id === o.user_id).reduce((s, x) => s + x.points, 0),
    stockToday: t.daily_stocks.filter((s) => s.stock_date === '2026-10-16').map((s) => `${s.product_id}:${s.qty_sold}`).join(),
    vouchers: t.vouchers.map((v) => `${v.code}:${v.quota}`).join(),
  };
}, num);
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
const item = (product_id, price) => ({ product_id, variant_id: null, design_id: null, quantity: 1, note: '', preferred_date: null, price });
const order = (extra) => svc('/src/services/orderService.js', 'createOrder', {
  items: [item(1, 28000)], fulfillment: 'pickup', address_id: null, ready_date: '2026-10-16', time_slot: '11.00–13.00',
  voucher_code: null, use_points: false, method_code: 'qris', ...extra,
});
const openDetail = async (num) => { await p.goto(`${B}/admin/pesanan/${num}`); await wait(900); };
const statusBtn = () => p.getByRole('button', { name: /^Ubah Status/ });
const confirmModal = async () => { await statusBtn().click(); await wait(300); await p.getByRole('dialog').getByRole('button', { name: /^Ya,/ }).click(); await wait(900); };

await p.goto(`${B}/katalog`); await wait();

// ── Unit: utils/rules/adminOrder.js & production.js
const unit = await p.evaluate(async () => {
  const R = await import('/src/utils/businessRules.js');
  const out = []; const eq = (n, a, e) => out.push([n, JSON.stringify(a) === JSON.stringify(e), JSON.stringify(a)]);
  const o = (s, extra) => ({ order_id: 1, order_status: s, fulfillment_type: 'pickup', payment_option: 'online', payment_status: 'paid', pickup_code: 'PK1234', ...extra });
  eq('urutan pickup', ['dikonfirmasi', 'sedang_disiapkan', 'siap_diambil'].map((s) => R.getAdminNextStatus(o(s))), ['sedang_disiapkan', 'siap_diambil', 'selesai']);
  eq('urutan delivery', ['sedang_disiapkan', 'dalam_pengiriman'].map((s) => R.getAdminNextStatus(o(s, { fulfillment_type: 'delivery' }))), ['dalam_pengiriman', 'selesai']);
  eq('tanpa aksi admin: menunggu bayar / selesai / batal', ['menunggu_pembayaran', 'selesai', 'dibatalkan'].map((s) => R.getAdminNextStatus(o(s))), [null, null, null]);
  eq('transisi berurutan diizinkan', R.validateAdminStatusChange(o('dikonfirmasi'), { from: 'dikonfirmasi', to: 'sedang_disiapkan' }), null);
  eq('loncat ke Selesai ditolak', R.validateAdminStatusChange(o('dikonfirmasi'), { to: 'selesai' }), 'Status harus berurutan. Status berikutnya: Sedang Disiapkan.');
  eq('pickup tidak boleh Dalam Pengiriman', R.validateAdminStatusChange(o('sedang_disiapkan'), { to: 'dalam_pengiriman' })?.startsWith('Status harus berurutan'), true);
  eq('batal → Selesai ditolak', R.validateAdminStatusChange(o('dibatalkan'), { to: 'selesai', pickupCode: 'PK1234' }), 'Pesanan sudah Dibatalkan sehingga statusnya tidak bisa diubah lagi');
  eq('Selesai tidak diproses ulang', R.validateAdminStatusChange(o('selesai'), { to: 'selesai' })?.startsWith('Pesanan sudah Selesai'), true);
  eq('menunggu pembayaran ditolak', R.validateAdminStatusChange(o('menunggu_pembayaran'), { to: 'dikonfirmasi' })?.startsWith('Pesanan masih menunggu'), true);
  eq('status basi (klik ganda) ditolak', R.validateAdminStatusChange(o('sedang_disiapkan'), { from: 'dikonfirmasi', to: 'sedang_disiapkan' })?.startsWith('Status pesanan sudah berubah'), true);
  eq('kode pickup kosong/salah/benar', ['', 'PK9999', ' pk 1234 '].map((k) => R.validateAdminStatusChange(o('siap_diambil'), { to: 'selesai', pickupCode: k })),
    ['Masukkan kode pickup dari pelanggan', 'Kode pickup tidak cocok. Periksa kembali kode yang ditunjukkan pelanggan.', null]);
  const store = o('siap_diambil', { payment_option: 'pay_at_store', payment_status: 'unpaid' });
  eq('Bayar di Toko belum lunas tidak bisa Selesai', R.validateAdminStatusChange(store, { to: 'selesai', pickupCode: 'PK1234' }), 'Tandai pembayaran Bayar di Toko lunas sebelum menyelesaikan pesanan');
  eq('Dalam Pengiriman wajib nama kurir', R.validateAdminStatusChange(o('sedang_disiapkan', { fulfillment_type: 'delivery' }), { to: 'dalam_pengiriman', courierName: '  ' }), 'Isi nama kurir');
  eq('tandai lunas: boleh / online / sudah lunas / belum siap', [store, o('siap_diambil'), { ...store, payment_status: 'paid' }, { ...store, order_status: 'dikonfirmasi' }].map((x) => R.checkMarkPaidAtStore(x)),
    [null, 'Hanya pesanan Bayar di Toko yang ditandai lunas oleh admin', 'Pembayaran pesanan ini sudah lunas', 'Pembayaran di toko diterima saat pesanan berstatus Siap Diambil']);
  eq('poin penyelesaian sekali', [R.shouldAwardCompletionPoints({ order_id: 1 }, []), R.shouldAwardCompletionPoints({ order_id: 1 }, [{ type: 'earn', order_id: 1 }])], [true, false]);
  const orders = [
    { order_id: 1, order_number: 'A', order_status: 'dikonfirmasi', ready_date: '2026-10-17' },
    { order_id: 2, order_number: 'B', order_status: 'dibatalkan', ready_date: '2026-10-17' },
    { order_id: 3, order_number: 'C', order_status: 'menunggu_pembayaran', ready_date: '2026-10-17' },
    { order_id: 4, order_number: 'D', order_status: 'selesai', ready_date: '2026-10-17' },
  ];
  const products = [{ product_id: 1, availability_type: 'ready' }, { product_id: 5, availability_type: 'preorder' }, { product_id: 6, availability_type: 'custom' }];
  const items = [
    { order_id: 1, product_id: 5, quantity: 2 }, { order_id: 1, product_id: 1, quantity: 3 }, { order_id: 1, product_id: 6, quantity: 1, design_id: 9 },
    { order_id: 2, product_id: 5, quantity: 1 }, { order_id: 3, product_id: 5, quantity: 1 }, { order_id: 4, product_id: 5, quantity: 1 },
  ];
  const entries = R.buildProductionEntries({ orders, orderItems: items, products });
  eq('produksi: tanpa batal, menunggu bayar, item ready', entries.map((e) => `${e.order_number}:${e.product_id}`), ['A:5', 'A:6', 'D:5']);
  eq('pill per tanggal (pesanan campuran dihitung di keduanya)', R.countProductionByDate(entries), { '2026-10-17': { preorder: 2, custom: 1 } });
  eq('daftar per produk', R.groupProductionList(entries, '2026-10-17').map((g) => [g.product_id, g.quantity, g.orders.length]), [[5, 3, 2], [6, 1, 1]]);
  const grid = R.buildMonthGrid('2026-10');
  eq('grid Okt 2026 mulai Senin 28 Sep, 5 minggu', [grid.length, grid[0][0].date, grid[0][3].date, grid[0][0].inMonth], [5, '2026-09-28', '2026-10-01', false]);
  eq('geser bulan lintas tahun', [R.shiftMonthKey('2026-12', 1), R.shiftMonthKey('2026-01', -1)], ['2027-01', '2025-12']);
  return out;
});
unit.forEach(([n, ok, got]) => check(`unit: ${n}`, ok, got));

// ── Persiapan: pelanggan membuat pesanan lewat service yang sama dengan checkout
await loginCustomer();
const storeOrder = (await order({ method_code: 'pay_at_store' })).value.order_number; // pickup, Bayar di Toko → Dikonfirmasi
const addressId = await db((getTables) => getTables('addresses').addresses.find((a) => a.user_id === 1 && a.is_primary).address_id);
const deliveryOrder = (await order({ fulfillment: 'delivery', address_id: addressId })).value.order_number;
await svc('/src/services/orderService.js', 'simulatePaymentPaid', deliveryOrder);
const unpaidOrder = (await order()).value.order_number; // online, belum dibayar
const preorder = (await order({ items: [item(5, 385000)], ready_date: '2026-10-17' })).value.order_number;
check('Persiapan: 4 pesanan dibuat', [storeOrder, deliveryOrder, unpaidOrder, preorder].every(Boolean), [storeOrder, deliveryOrder, unpaidOrder, preorder].join());
const otherCustomerOrder = await db((getTables) => getTables('orders').orders.find((o) => o.user_id !== 1).order_number);

// ── Hak akses
await p.goto(`${B}/admin/pesanan/${storeOrder}`); await wait(600);
check('Pelanggan tidak bisa membuka AD-04', !p.url().includes('/admin'), p.url());
check('Pelanggan: service detail admin ditolak', (await svc(ADMIN, 'getAdminOrderDetail', storeOrder)).error === 'Akses ditolak untuk peran ini');
check('Pelanggan: service ubah status ditolak', (await svc(ADMIN, 'updateAdminOrderStatus', storeOrder, { from: 'dikonfirmasi', to: 'sedang_disiapkan' })).ok === false);
await p.goto(`${B}/pesanan/${otherCustomerOrder}`); await wait(900);
check('Pesanan akun lain tidak bisa dibuka lewat rute pelanggan', (await p.getByText('Pesanan tidak ditemukan').count()) > 0 && (await svc('/src/services/orderHistoryService.js', 'getMyOrderDetail', otherCustomerOrder)).error === 'Pesanan tidak ditemukan');
const before = await snap(storeOrder);

await loginAdmin('staf@demo.com');
await p.goto(`${B}/admin/dashboard`); await wait(500);
check('Staf: Dashboard Owner dialihkan ke Pesanan', p.url().endsWith('/admin/pesanan'), p.url());
await p.goto(`${B}/admin/laporan`); await wait(400);
check('Staf: Laporan (Owner) dialihkan', p.url().endsWith('/admin/pesanan'), p.url());
const sidebar = await p.locator('aside').innerText();
check('Staf: menu Kalender ada, Dashboard/Laporan/Promo/Pengaturan tidak', sidebar.includes('Kalender Produksi') && !/Dashboard|Laporan|Promo|Pengaturan/.test(sidebar), sidebar);
await p.goto(`${B}/admin/pesanan/OVC-000000-999`); await wait(900);
check('AD-04: nomor tidak dikenal → "Pesanan tidak ditemukan"', (await p.getByRole('heading', { name: 'Pesanan tidak ditemukan' }).count()) === 1);

// ── AD-04: detail sesuai data pesanan
await openDetail(storeOrder);
const main = await p.locator('main').innerText();
check('AD-04: nomor, status, pelanggan, item, metode, total', [storeOrder, 'Dikonfirmasi', 'Anisa Pelanggan', '+6281234567890', 'Classic Butter Croissant', '1 × Rp 28.000', 'Bayar di Toko', 'Bayar saat ambil', 'Rp 28.000'].every((t) => main.includes(t)), main.slice(0, 400));
check('AD-04: log status awal (oleh pelanggan) dengan waktu', main.includes('oleh Anisa Pelanggan (Pelanggan)') && main.includes('Jum, 16 Okt · 10.00'));
const detail = (await svc(ADMIN, 'getAdminOrderDetail', storeOrder)).value;
check('AD-04: kode pickup tidak dikirim ke admin', !('pickup_code' in detail.order) && !main.includes(before.order.pickup_code) && detail.order.has_pickup_code === true);
const listRow = (await svc(ADMIN, 'getAdminOrders', { search: storeOrder })).value.rows[0];
check('AD-04 konsisten dengan AD-03', listRow.total === detail.order.total && listRow.order_status === detail.order.order_status && listRow.customer_name === detail.customer.name);

// ── AD-05 ubah status: modal, transisi berurutan, riwayat & notifikasi
const skip = await svc(ADMIN, 'updateAdminOrderStatus', storeOrder, { from: 'dikonfirmasi', to: 'selesai' });
let s = await snap(storeOrder);
check('Loncat status ditolak service & tidak ada riwayat/notifikasi palsu', !skip.ok && s.order.order_status === 'dikonfirmasi' && s.history.length === 1 && s.notifs.length === before.notifs.length, JSON.stringify(skip));
await statusBtn().click(); await wait(300);
const dialog = await p.getByRole('dialog').innerText();
check('Modal konfirmasi menjelaskan tindakan', dialog.includes('Ubah status pesanan?') && dialog.includes('Dikonfirmasi') && dialog.includes('Sedang Disiapkan') && dialog.includes('notifikasi'), dialog);
await p.getByRole('dialog').getByRole('button', { name: 'Batal' }).click(); await wait(300);
check('Batal di modal tidak mengubah status', (await snap(storeOrder)).history.length === 1);
await confirmModal();
s = await snap(storeOrder);
check('Dikonfirmasi → Sedang Disiapkan: riwayat oleh staf + notifikasi', s.order.order_status === 'sedang_disiapkan' && s.history.length === 2 && s.history[1].changed_by === 2 && s.notifs.at(-1) === 'order_status:Pesanan sedang disiapkan', JSON.stringify(s.history));
await statusBtn().click(); await wait(300);
await p.getByRole('dialog').getByRole('button', { name: /^Ya,/ }).dblclick(); await wait(1200);
s = await snap(storeOrder);
check('Klik ganda konfirmasi → satu riwayat & satu notifikasi Siap Diambil', s.order.order_status === 'siap_diambil' && s.history.filter((h) => h.status === 'siap_diambil').length === 1 && s.notifs.filter((n) => n === 'order_status:Pesanan siap diambil').length === 1, JSON.stringify(s.notifs));

// ── Bayar di Toko & verifikasi kode pickup
check('Selesai nonaktif sebelum lunas + alasan jelas', await statusBtn().isDisabled() && (await p.getByText('Tandai pembayaran Bayar di Toko lunas sebelum menyelesaikan pesanan').count()) === 1);
const early = await svc(ADMIN, 'updateAdminOrderStatus', storeOrder, { from: 'siap_diambil', to: 'selesai', pickup_code: s.order.pickup_code });
check('Service menolak Selesai sebelum lunas (kode benar sekalipun)', early.error === 'Tandai pembayaran Bayar di Toko lunas sebelum menyelesaikan pesanan' && (await snap(storeOrder)).history.length === 3);
check('Membuka detail tidak menandai lunas', (await snap(storeOrder)).order.payment_status === 'unpaid');
await p.getByRole('button', { name: 'Tandai Lunas' }).click(); await wait(300);
await p.getByRole('dialog').getByRole('button', { name: 'Ya, Sudah Dibayar' }).click(); await wait(900);
s = await snap(storeOrder);
check('Tandai lunas: orders & payments konsisten, status & riwayat tetap', s.order.payment_status === 'paid' && s.payment.status === 'paid' && s.payment.paid_at?.startsWith('2026-10-16') && s.order.order_status === 'siap_diambil' && s.history.length === 3 && s.notifs.length === before.notifs.length + 2, JSON.stringify(s.payment));
check('Tandai lunas dua kali ditolak', (await svc(ADMIN, 'markOrderPaid', storeOrder)).error === 'Pembayaran pesanan ini sudah lunas');
check('Selesai masih menunggu verifikasi kode', await statusBtn().isDisabled() && (await p.getByText('Verifikasi kode pickup sebelum menyelesaikan pesanan').count()) === 1);
await p.getByRole('button', { name: 'Verifikasi' }).click(); await wait(500);
check('Kode kosong ditolak', (await p.getByText('Masukkan kode pickup dari pelanggan').count()) === 1);
await p.fill('#pickup-code-input', s.order.pickup_code === 'PK0000' ? 'PK0001' : 'PK0000'); await p.getByRole('button', { name: 'Verifikasi' }).click(); await wait(500);
check('Kode salah ditolak, status tidak berubah', (await p.getByText(/Kode pickup tidak cocok/).count()) === 1 && await statusBtn().isDisabled() && (await snap(storeOrder)).order.order_status === 'siap_diambil');
check('Service menolak Selesai dengan kode salah', (await svc(ADMIN, 'updateAdminOrderStatus', storeOrder, { from: 'siap_diambil', to: 'selesai', pickup_code: 'XX' })).ok === false && (await snap(storeOrder)).history.length === 3);
await p.fill('#pickup-code-input', ` ${s.order.pickup_code.toLowerCase()} `); await p.getByRole('button', { name: 'Verifikasi' }).click(); await wait(500);
check('Kode benar → terverifikasi & tombol Selesai aktif', (await p.getByText('Kode pickup terverifikasi').count()) >= 1 && await statusBtn().isEnabled());
await confirmModal();
s = await snap(storeOrder);
const points = Math.floor(s.order.total / 1000);
check('Selesai: riwayat lengkap berurutan + catatan verifikasi', s.order.order_status === 'selesai' && s.history.map((h) => h.status).join() === 'dikonfirmasi,sedang_disiapkan,siap_diambil,selesai' && s.history[3].note === 'Kode pickup terverifikasi', JSON.stringify(s.history.map((h) => h.status)));
check('Riwayat menyimpan waktu valid & berurutan', s.history.every((h, i) => !Number.isNaN(Date.parse(h.changed_at)) && h.changed_at.startsWith('2026-10-16') && (i === 0 || s.history[i - 1].changed_at <= h.changed_at)));
check('BR-09: poin diberikan sekali sesuai total', s.earn.length === 1 && s.earn[0].points === points && s.balance === before.balance + points, `${s.earn.length} ${s.balance - before.balance}/${points}`);
check('Notifikasi Selesai + poin', s.notifs.at(-2) === 'order_status:Pesanan selesai' && s.notifs.at(-1) === `points:+${points} poin`, JSON.stringify(s.notifs.slice(-2)));
check('Stok & voucher tidak berubah oleh transisi admin', s.stockToday === before.stockToday && s.vouchers === before.vouchers);
const again = await svc(ADMIN, 'updateAdminOrderStatus', storeOrder, { from: 'siap_diambil', to: 'selesai', pickup_code: s.order.pickup_code });
const s2 = await snap(storeOrder);
check('Selesai ulang ditolak: tanpa poin/riwayat/notifikasi tambahan', !again.ok && s2.earn.length === 1 && s2.history.length === 4 && s2.notifs.length === s.notifs.length && s2.balance === s.balance);
check('Pesanan Selesai tanpa tombol ubah status/tandai lunas', (await statusBtn().count()) === 0 && (await p.getByRole('button', { name: 'Tandai Lunas' }).count()) === 0);

// ── Struk
await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; });
const preprint = JSON.stringify(await snap(storeOrder));
await p.getByRole('button', { name: 'Cetak Struk' }).click(); await wait(300);
check('Cetak Struk memanggil window.print tanpa mengubah data', (await p.evaluate(() => window.__printed)) === 1 && JSON.stringify(await snap(storeOrder)) === preprint);
await p.emulateMedia({ media: 'print' }); await wait(300);
const receipt = p.locator('[data-print="receipt"]');
const rText = await receipt.innerText();
check('Struk: nomor, item, jumlah × harga, metode, total sesuai transaksi', await receipt.isVisible() && [storeOrder, 'Classic Butter Croissant', '1 × Rp 28.000', 'Bayar di Toko', 'Lunas', 'Rp 28.000', 'Selesai'].every((t) => rText.includes(t)), rText);
const visibleChrome = await p.evaluate(() => [...document.querySelectorAll('aside, header, nav, button, a')].filter((el) => !el.closest('[data-print="receipt"]') && el.getClientRects().length > 0).length);
check('Tampilan cetak tanpa sidebar, topbar, navigasi, dan tombol', visibleChrome === 0, String(visibleChrome));
await p.emulateMedia({ media: 'screen' });

// ── Delivery (Owner): klik ganda di service, nama kurir wajib
await loginAdmin('owner@demo.com');
await p.goto(`${B}/admin/dashboard`); await wait(600);
check('Owner: Dashboard terbuka', p.url().endsWith('/admin/dashboard'));
const both = await p.evaluate(async (num) => {
  const S = await import('/src/services/adminOrderService.js');
  const r = await Promise.allSettled([1, 2].map(() => S.updateAdminOrderStatus(num, { from: 'dikonfirmasi', to: 'sedang_disiapkan' })));
  return r.map((x) => x.status);
}, deliveryOrder);
let d = await snap(deliveryOrder);
check('Dua permintaan bersamaan → satu berhasil, satu ditolak, satu riwayat', both.sort().join() === 'fulfilled,rejected' && d.history.filter((h) => h.status === 'sedang_disiapkan').length === 1 && d.notifs.filter((n) => n.endsWith('sedang disiapkan')).length === 1, both.join());
await openDetail(deliveryOrder);
check('Delivery: tanpa field kode pickup', (await p.locator('#pickup-code-input').count()) === 0);
await statusBtn().click(); await wait(300);
await p.getByRole('dialog').getByRole('button', { name: /^Ya,/ }).click(); await wait(600);
check('Dalam Pengiriman tanpa nama kurir ditolak', (await p.getByRole('dialog').getByRole('alert').innerText()).includes('Isi nama kurir') && (await snap(deliveryOrder)).order.order_status === 'sedang_disiapkan');
await p.fill('#courier-name-input', 'Pak Joko');
await p.getByRole('dialog').getByRole('button', { name: /^Ya,/ }).click(); await wait(900);
d = await snap(deliveryOrder);
check('Dalam Pengiriman: kurir tersimpan + catatan riwayat oleh Owner', d.order.order_status === 'dalam_pengiriman' && d.order.courier_name === 'Pak Joko' && d.history.at(-1).note === 'Kurir: Pak Joko' && d.history.at(-1).changed_by === 3);
await confirmModal();
d = await snap(deliveryOrder);
check('Delivery Selesai + poin sekali', d.order.order_status === 'selesai' && d.earn.length === 1 && d.notifs.includes('order_status:Pesanan selesai'));

// ── Pesanan yang tidak boleh diubah admin
const cancelledSeed = await db((getTables) => getTables('orders').orders.find((o) => o.order_status === 'dibatalkan').order_number);
await openDetail(cancelledSeed);
check('Pesanan Dibatalkan: tanpa tombol ubah status', (await statusBtn().count()) === 0);
check('Pesanan Dibatalkan tidak bisa diselesaikan (service)', (await svc(ADMIN, 'updateAdminOrderStatus', cancelledSeed, { to: 'selesai' })).error === 'Pesanan sudah Dibatalkan sehingga statusnya tidak bisa diubah lagi');
await openDetail(unpaidOrder);
check('Menunggu Pembayaran: tanpa tombol ubah status (dipicu sistem)', (await statusBtn().count()) === 0 && (await svc(ADMIN, 'updateAdminOrderStatus', unpaidOrder, { to: 'dikonfirmasi' })).ok === false);

// ── AD-05 Kalender produksi
const expected = await db((getTables) => {
  const t = getTables('orders', 'order_items', 'products');
  const type = new Map(t.products.map((x) => [x.product_id, x.availability_type]));
  const ok = ['dikonfirmasi', 'sedang_disiapkan', 'siap_diambil', 'dalam_pengiriman', 'selesai'];
  const out = {};
  for (const o of t.orders.filter((x) => ok.includes(x.order_status) && x.ready_date.startsWith('2026-10'))) {
    const types = new Set(t.order_items.filter((i) => i.order_id === o.order_id).map((i) => type.get(i.product_id)));
    out[o.ready_date] ??= [0, 0];
    if (types.has('preorder')) out[o.ready_date][0] += 1;
    if (types.has('custom')) out[o.ready_date][1] += 1;
  }
  return out;
});
await p.goto(`${B}/admin/kalender`); await wait(1000);
const cells = await p.locator('button[data-date^="2026-10"]').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.dataset.date, e.getAttribute('aria-label')])));
const mismatch = Object.entries(cells).filter(([date, label]) => {
  const [pre, cus] = expected[date] ?? [0, 0];
  return pre || cus ? !label.endsWith(`${pre} pre-order, ${cus} custom cake`) : !label.endsWith('tidak ada produksi');
});
check('Kalender: jumlah per tanggal siap sesuai pesanan tersimpan', mismatch.length === 0 && Object.keys(expected).length > 0, JSON.stringify(mismatch.slice(0, 3)));
check('Kalender: hari ini terpilih', (await p.locator('button[data-date="2026-10-16"]').getAttribute('aria-pressed')) === 'true');
await p.locator('button[data-date="2026-10-17"]').click(); await wait(800);
let panel = await p.locator('#production-day-title').locator('..').innerText();
check('Pre-order menunggu pembayaran tidak dihitung produksi', !panel.includes(preorder) && p.url().includes('tanggal=2026-10-17'));
await loginCustomer(); await svc('/src/services/orderService.js', 'simulatePaymentPaid', preorder);
await loginAdmin('staf@demo.com');
await p.goto(`${B}/admin/kalender?bulan=2026-10&tanggal=2026-10-17`); await wait(900);
panel = await p.locator('#production-day-title').locator('..').innerText();
check('Setelah lunas: pre-order tampil di tanggal siap 17 Okt (Dikonfirmasi)', panel.includes(preorder) && panel.includes('Premium Birthday Cake') && panel.includes('Dikonfirmasi'), panel.slice(0, 300));
await svc(ADMIN, 'updateAdminOrderStatus', preorder, { from: 'dikonfirmasi', to: 'sedang_disiapkan' });
await p.reload(); await wait(900);
panel = await p.locator('#production-day-title').locator('..').innerText();
check('Perubahan status tercermin di kalender tanpa duplikat', panel.includes('Sedang Disiapkan') && panel.split(preorder).length === 2, panel.slice(0, 300));
await loginCustomer();
const cancelPre = (await order({ items: [item(5, 385000)], ready_date: '2026-10-17' })).value.order_number;
await svc('/src/services/orderService.js', 'simulatePaymentPaid', cancelPre);
await svc('/src/services/orderHistoryService.js', 'cancelMyOrder', cancelPre, 'Salah tanggal');
await loginAdmin('staf@demo.com');
await p.goto(`${B}/admin/kalender?bulan=2026-10&tanggal=2026-10-17`); await wait(900);
panel = await p.locator('#production-day-title').locator('..').innerText();
check('Pesanan batal tidak dihitung produksi aktif', !panel.includes(cancelPre));
await p.getByRole('button', { name: 'Bulan berikutnya' }).click(); await wait(800);
check('Navigasi bulan berikutnya', (await p.locator('#calendar-month-title').innerText()).toLowerCase() === 'november 2026' && p.url().includes('bulan=2026-11'));
await p.getByRole('button', { name: 'Bulan sebelumnya' }).click(); await p.getByRole('button', { name: 'Bulan sebelumnya' }).click(); await wait(800);
check('Navigasi bulan sebelumnya', (await p.locator('#calendar-month-title').innerText()).toLowerCase() === 'september 2026');
const emptyDate = await p.locator('button[data-date^="2026-09"]').evaluateAll((els) => els.find((e) => e.getAttribute('aria-label').endsWith('tidak ada produksi'))?.dataset.date);
await p.locator(`button[data-date="${emptyDate}"]`).click(); await wait(800);
check('Tanggal tanpa produksi → empty state', (await p.getByRole('heading', { name: 'Belum ada produksi' }).count()) === 1);
await p.getByRole('button', { name: 'Hari ini' }).click(); await wait(800);
check('Tombol Hari ini kembali ke 16 Okt', (await p.locator('button[data-date="2026-10-16"]').getAttribute('aria-pressed')) === 'true');
await p.locator('#production-day-title').locator('..').getByRole('link').first().click(); await wait(900);
check('Nomor pesanan di kalender membuka AD-04', /\/admin\/pesanan\/OVC-\d{6}-\d{3}$/.test(p.url()), p.url());

// ── Pelanggan melihat status & notifikasi yang sama
await loginCustomer();
await p.goto(`${B}/pesanan/${storeOrder}`); await wait(900);
const tracking = await p.locator('main').innerText();
check('Tracking pelanggan: Selesai + tombol Beri Ulasan', tracking.includes('Selesai') && (await p.getByRole('link', { name: /Beri Ulasan/ }).count() + await p.getByRole('button', { name: /Beri Ulasan/ }).count()) > 0);
await p.goto(`${B}/notifikasi`); await wait(900);
check('Notifikasi pelanggan: Pesanan selesai + poin', (await p.getByText(`Pesanan ${storeOrder} selesai`, { exact: false }).count()) === 1 && (await p.getByText(`+${points} poin`).count()) >= 1);

console.log(res.map((r) => r.join(' ')).join('\n'));
console.log(`\n${res.filter((r) => r[0] === '✓').length}/${res.length} lulus`);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await b.close();
process.exit(res.some((r) => r[0] === '✗') || errors.length ? 1 : 0);
