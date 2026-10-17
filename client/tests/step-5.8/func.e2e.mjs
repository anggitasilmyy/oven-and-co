// Uji Step 5.8 · AD-08 Laporan · AD-09 Promo & Loyalty · AD-10 Pelanggan & Ulasan · AD-11 Pengaturan
// (FR-33 – FR-36 · BR-05 · BR-09 · BR-10 · BR-11 · BR-12). Jam peramban dikunci ke Jumat 16 Okt 2026 pukul 10.00 WIB.
import { chromium } from 'playwright';
const B = 'http://localhost:5173';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const res = []; const errors = [];
const check = (n, ok, extra = '') => res.push([ok ? '✓' : '✗', n, ok ? '' : extra]);
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Jakarta', acceptDownloads: true });
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
const svc = (path, name, ...args) => p.evaluate(async ([pth, n, a]) => {
  try { return { ok: true, value: await (await import(pth))[n](...a) }; } catch (e) { return { ok: false, error: e.message }; }
}, [path, name, args]);
const REPORT = '/src/services/reportService.js';
const PROMO = '/src/services/adminPromoService.js';
const CUST = '/src/services/adminCustomerService.js';
const SET = '/src/services/settingsService.js';
const logout = async () => { await p.evaluate(async () => (await import('/src/stores/useAuthStore.js')).default.getState().logout()); };
const loginCustomer = async () => {
  await logout(); await p.goto(`${B}/masuk`); await wait(400);
  await p.fill('#masuk-identifier', 'pelanggan@demo.com'); await p.fill('#masuk-password', 'demo1234');
  await p.click('#masuk-submit-btn'); await wait(900);
};
const loginAdmin = async (email, password = 'demo1234') => {
  await logout(); await p.goto(`${B}/admin/login`); await wait(400);
  await p.fill('#admin-login-identifier', email); await p.fill('#admin-login-password', password);
  await p.click('#admin-login-submit-btn'); await wait(900);
};
const toastText = async () => (await p.getByRole('alert').allInnerTexts()).join(' | ');

await p.goto(`${B}/katalog`); await wait();

// ── Unit: utils/rules/report, adminPromo, adminCustomer, settings
const unit = await p.evaluate(async () => {
  const R = await import('/src/utils/businessRules.js');
  const out = []; const eq = (n, a, e) => out.push([n, JSON.stringify(a) === JSON.stringify(e), JSON.stringify(a)]);
  const T = '2026-10-16';
  eq('periode harian/mingguan/bulanan', ['harian', 'mingguan', 'bulanan'].map((period) => { const r = R.resolveReportRange({ period }, T); return [r.from, r.to]; }), [[T, T], ['2026-10-10', T], ['2026-10-01', T]]);
  eq('rentang: dari > sampai, lewat hari ini, > 92 hari, kosong', [
    R.resolveReportRange({ period: 'rentang', from: '2026-10-12', to: '2026-10-10' }, T).error,
    R.resolveReportRange({ period: 'rentang', from: '2026-10-12', to: '2026-10-17' }, T).error,
    R.resolveReportRange({ period: 'rentang', from: '2026-07-01', to: T }, T).error,
    R.resolveReportRange({ period: 'rentang', from: '', to: T }, T).error,
  ], ['Tanggal mulai harus sebelum atau sama dengan tanggal selesai', 'Tanggal selesai tidak boleh melewati hari ini', 'Rentang maksimal 92 hari', 'Pilih tanggal mulai dan tanggal selesai']);
  const orders = [
    { order_id: 1, order_number: 'A', user_id: 9, created_at: '2026-10-15T03:00:00.000Z', total: 100000, payment_status: 'paid', order_status: 'selesai', payment_option: 'online', fulfillment_type: 'pickup' },
    { order_id: 2, order_number: 'B', user_id: 9, created_at: '2026-10-16T03:00:00.000Z', total: 50000, payment_status: 'paid', order_status: 'dikonfirmasi', payment_option: 'pay_at_store', fulfillment_type: 'pickup' },
    { order_id: 3, order_number: 'C', user_id: 9, created_at: '2026-10-16T03:00:00.000Z', total: 70000, payment_status: 'unpaid', order_status: 'menunggu_pembayaran', payment_option: 'online', fulfillment_type: 'delivery' },
    { order_id: 4, order_number: 'D', user_id: 9, created_at: '2026-10-16T03:00:00.000Z', total: 90000, payment_status: 'refunded', order_status: 'dibatalkan', payment_option: 'online', fulfillment_type: 'pickup' },
  ];
  const rep = R.buildSalesReport({
    orders, order_items: [{ order_id: 1, product_id: 1, quantity: 3 }, { order_id: 2, product_id: 2, quantity: 2 }, { order_id: 3, product_id: 1, quantity: 9 }],
    payments: [{ order_id: 1, method_code: 'qris' }, { order_id: 2, method_code: 'pay_at_store' }, { order_id: 3, method_code: 'qris' }],
    payment_methods: [{ method_code: 'qris', name: 'QRIS', method_group: 'qris' }, { method_code: 'pay_at_store', name: 'Bayar di Toko', method_group: 'store' }],
    products: [{ product_id: 1, name: 'Croissant' }, { product_id: 2, name: 'Roll' }], users: [{ user_id: 9, name: 'Rina' }],
  }, { from: '2026-10-10', to: T, bestSellerLimit: 5 });
  eq('laporan hanya lunas & tidak batal (KPI)', rep.kpi, { revenue: 150000, transactions: 2, average: 75000, itemsSold: 5 });
  eq('laporan per hari, terlaris, metode, transaksi', [rep.daily.length, rep.daily.at(-1).revenue, rep.bestSellers.map((x) => x.name), rep.paymentMethods.map((m) => m.name), rep.transactions.map((t) => t.order_number)],
    [7, 50000, ['Croissant', 'Roll'], ['QRIS', 'Bayar di Toko'], ['B', 'A']]);
  const v = (x, id = null) => R.validateVoucher(R.normalizeVoucherInput({ code: 'HEMAT5', title: 'Hemat', discount_type: 'amount', discount_value: 5000, quota: 10, valid_from: T, valid_to: T, ...x }), { vouchers: [{ voucher_id: 1, code: 'WEEKEND15' }], voucherId: id, products: [{ product_id: 1 }] });
  eq('voucher kosong → semua field wajib', Object.keys(R.validateVoucher(R.normalizeVoucherInput({}), { vouchers: [], products: [] })).sort(), ['code', 'discount_type', 'discount_value', 'quota', 'title', 'valid_from', 'valid_to']);
  eq('voucher: kode ganda, spasi, persen > 100, periode terbalik', [v({ code: 'weekend15' }).code, v({ code: 'A B' }).code, v({ discount_type: 'percent', discount_value: 120 }).discount_value, v({ valid_to: '2026-10-01' }).valid_to],
    ['Kode voucher sudah dipakai', 'Kode hanya huruf dan angka tanpa spasi', 'Persen diskon berupa bilangan bulat 1–100', 'Tanggal berakhir tidak boleh sebelum tanggal mulai']);
  eq('voucher sah & kode sendiri boleh saat ubah', [v({}), v({ code: 'WEEKEND15' }, 1)], [{}, {}]);
  const st = (x) => R.getAdminVoucherStatus({ is_active: true, quota: 5, valid_from: '2026-10-10', valid_to: '2026-10-20', ...x }, T);
  eq('status voucher', [st({}), st({ is_active: false }), st({ quota: 0 }), st({ valid_to: '2026-10-15' }), st({ valid_from: '2026-10-17' })], ['aktif', 'nonaktif', 'kuota_habis', 'berakhir', 'terjadwal']);
  const lr = (x) => R.validateLoyaltyRules(R.normalizeLoyaltyInput({ earn_amount_per_point: 1000, redeem_points_unit: 100, redeem_value: 5000, gold_min_points: 500, platinum_min_points: 2000, ...x }));
  eq('loyalty: sah, platinum ≤ gold, 0, pecahan', [lr({}), lr({ platinum_min_points: 500 }).platinum_min_points, lr({ earn_amount_per_point: 0 }).earn_amount_per_point, lr({ redeem_points_unit: 1.5 }).redeem_points_unit],
    [{}, 'Ambang Platinum harus lebih besar dari ambang Gold', 'Belanja per poin berupa bilangan bulat lebih dari 0', 'Poin per penukaran berupa bilangan bulat lebih dari 0']);
  const sp = (x) => R.validateStoreProfile(R.normalizeStoreProfile({ store_name: 'Oven & Co.', address: 'Jl. A', whatsapp_number: '+6281234567890', preorder_cutoff_time: '17:00', delivery_radius_km: 10, delivery_fee_per_km: 2500, ...x }));
  eq('profil toko: sah, WA tanpa +62, radius 0, tarif negatif', [sp({}), sp({ whatsapp_number: '0812345678' }).whatsapp_number, sp({ delivery_radius_km: 0 }).delivery_radius_km, sp({ delivery_fee_per_km: -1 }).delivery_fee_per_km],
    [{}, 'Nomor WhatsApp harus diawali +62', 'Radius harus lebih dari 0 km', 'Tarif berupa bilangan bulat rupiah ≥ 0']);
  eq('jam operasional: tutup < buka, semua tutup', [R.validateOperatingHours([{ day_of_week: 1, is_open: true, open_time: '20:00', close_time: '07:00' }])[1], R.validateOperatingHours([{ day_of_week: 1, is_open: false }]).all], ['Jam tutup harus setelah jam buka', 'Minimal satu hari toko buka']);
  eq('jam per tanggal (Jumat = 5) & hari tutup tanpa slot', [R.dayOfWeekOf(T), R.getOperatingHoursFor([{ day_of_week: 5, open_time: '09:00', close_time: '15:00', is_open: true }], T).open_time,
    R.getTimeSlotOptions([{ start: '09:00', end: '11:00' }], T, new Date(2026, 9, 16, 8), { is_open: false }).length,
    R.getTimeSlotOptions([{ start: '07:00', end: '09:00' }, { start: '09:00', end: '11:00' }], '2026-10-17', new Date(2026, 9, 16, 8), { open_time: '09:00', close_time: '15:00', is_open: true }).map((s) => s.label)], [5, '09:00', 0, ['09.00–11.00']]);
  const methods = [{ method_code: 'qris', method_group: 'qris', is_active: true }, { method_code: 'gopay', method_group: 'ewallet', is_active: false }, { method_code: 'pay_at_store', method_group: 'store', is_active: true }];
  eq('BR-05: metode online terakhir tidak boleh dimatikan, Bayar di Toko boleh', [R.validatePaymentMethodToggle(methods, 'qris', false) !== '', R.validatePaymentMethodToggle(methods, 'pay_at_store', false)], [true, '']);
  const users = [{ user_id: 2, role: 'staf', email: 'staf@demo.com', phone: '+6281234567891', is_active: true }, { user_id: 3, role: 'owner', email: 'owner@demo.com', phone: '+6281234567892', is_active: true }];
  eq('akun admin: email & HP ganda, sandi < 8', (({ email, phone, password }) => [email, phone, password])(R.validateAdminAccount({ name: 'A', email: 'STAF@demo.com', phone: '+6281234567891', password: '123', role: 'staf' }, users)),
    ['Email sudah terdaftar', 'Nomor HP sudah terdaftar', 'Kata sandi minimal 8 karakter']);
  eq('nonaktif: akun sendiri & owner terakhir ditolak, staf boleh', [R.validateAdminDeactivation(users[1], users, 3), R.validateAdminDeactivation(users[1], users, 99), R.validateAdminDeactivation(users[0], users, 3)],
    ['Tidak dapat menonaktifkan akun yang sedang dipakai', 'Minimal satu akun Owner harus tetap aktif', '']);
  const rows = [{ name: 'Rina Wulandari', email: 'rina@x.com', phone: '+628000000101' }, { name: 'Dimas', email: 'd@x.com', phone: '+628000000102' }];
  eq('cari pelanggan nama / HP', [R.filterCustomers(rows, 'rina').length, R.filterCustomers(rows, '0102').map((r) => r.name)], [1, ['Dimas']]);
  eq('balasan kosong & terlalu panjang', [R.validateAdminReply('  '), R.validateAdminReply('x'.repeat(501))], ['Tulis balasan terlebih dahulu', 'Balasan maksimal 500 karakter']);
  return out;
});
unit.forEach(([n, ok, a]) => check(`Unit: ${n}`, ok, a));

// ── Hak akses (SPEC §2): AD-08/09/11 Owner saja; AD-10 Staf & Owner
await loginCustomer();
await p.goto(`${B}/admin/laporan`); await wait();
check('Pelanggan dialihkan dari /admin/laporan', !p.url().includes('/admin'), p.url());
check('Service menolak pelanggan (ulasan admin)', !(await svc(CUST, 'getAdminReviews', 'semua')).ok);
await loginAdmin('staf@demo.com');
for (const path of ['laporan', 'promo', 'pengaturan']) { await p.goto(`${B}/admin/${path}`); await wait(500); check(`Staf tidak bisa membuka /admin/${path}`, !p.url().endsWith(`/admin/${path}`), p.url()); }
check('Service menolak Staf (laporan, voucher, pengaturan)', !(await svc(REPORT, 'getSalesReport', { period: 'harian' })).ok && !(await svc(PROMO, 'getAdminVouchers')).ok && !(await svc(SET, 'getStoreSettings')).ok);
await p.goto(`${B}/admin/pelanggan`); await wait();
check('Staf membuka Pelanggan & Ulasan', await p.getByRole('heading', { name: 'Pelanggan & Ulasan' }).isVisible());

// ── AD-10: balas, sembunyikan (konfirmasi), tampilkan
await p.goto(`${B}/admin/pelanggan?tab=ulasan&rating=5`); await wait(900);
const first = (await svc(CUST, 'getAdminReviews', '5')).value.rows.find((r) => !r.is_hidden && !r.admin_reply);
check('Filter rating 5 hanya bintang 5', (await svc(CUST, 'getAdminReviews', '5')).value.rows.every((r) => r.rating === 5));
await p.getByRole('button', { name: `Balas ulasan ${first.reviewer_name} untuk ${first.product_name}` }).first().click(); await wait(300);
await p.getByRole('button', { name: 'Kirim balasan' }).click(); await wait(300);
check('Balasan kosong ditolak', (await p.locator('#review-reply-error').innerText()).includes('Tulis balasan'));
await p.fill('#review-reply', 'Terima kasih, Kak! Sampai jumpa lagi.'); await p.getByRole('button', { name: 'Kirim balasan' }).click(); await wait(800);
check('Toast balasan dikirim', (await toastText()).includes('Balasan dikirim'));
const pub = (await svc('/src/services/reviewService.js', 'getProductReviews', first.product_id)).value.reviews.find((r) => r.review_id === first.review_id);
check('Balasan tampil di ulasan produk pelanggan (C-10)', pub?.admin_reply === 'Terima kasih, Kak! Sampai jumpa lagi.', JSON.stringify(pub));
const countBefore = (await svc('/src/services/reviewService.js', 'getProductReviews', first.product_id)).value.summary.count;
await p.getByRole('button', { name: `Sembunyikan ulasan ${first.reviewer_name} untuk ${first.product_name}` }).first().click(); await wait(300);
check('Modal konfirmasi sembunyikan', await p.getByRole('dialog').getByText('Sembunyikan ulasan?').isVisible());
await p.getByRole('dialog').getByRole('button', { name: 'Sembunyikan' }).click(); await wait(800);
const afterHide = (await svc('/src/services/reviewService.js', 'getProductReviews', first.product_id)).value;
check('Ulasan disembunyikan hilang dari C-10 & tidak dihitung rating', !afterHide.reviews.some((r) => r.review_id === first.review_id) && afterHide.summary.count === countBefore - 1, `${afterHide.summary.count}/${countBefore}`);
check('Ulasan tersembunyi tetap tampil untuk admin (badge)', await p.getByText('Disembunyikan', { exact: true }).first().isVisible());
await p.getByRole('button', { name: `Tampilkan ulasan ${first.reviewer_name} untuk ${first.product_name}` }).first().click(); await wait(800);
check('Tampilkan kembali', (await svc('/src/services/reviewService.js', 'getProductReviews', first.product_id)).value.summary.count === countBefore);
await p.goto(`${B}/admin/pelanggan`); await wait(800);
await p.fill('#customer-search', 'anisa'); await wait(300);
check('Cari pelanggan "anisa" → akun demo, level dari poin tahun ini', (await p.locator('main').innerText()).includes('Anisa Pelanggan') && (await p.locator('main').innerText()).includes('1 dari'));

// ── AD-08 Laporan
await loginAdmin('owner@demo.com');
const dash = (await svc('/src/services/dashboardService.js', 'getOwnerDashboard')).value;
const week = (await svc(REPORT, 'getSalesReport', { period: 'mingguan' })).value;
const day = (await svc(REPORT, 'getSalesReport', { period: 'harian' })).value;
check('Mingguan = grafik 7 hari Dashboard', week.kpi.revenue === dash.salesChart.reduce((s, d) => s + d.revenue, 0) && week.daily.length === 7, `${week.kpi.revenue}`);
check('Harian = Omzet Hari Ini Dashboard', day.kpi.revenue === dash.kpi.revenueToday && day.from === '2026-10-16');
check('Σ metode bayar = omzet; rata-rata = omzet ÷ transaksi', week.paymentMethods.reduce((s, m) => s + m.revenue, 0) === week.kpi.revenue && week.kpi.average === Math.round(week.kpi.revenue / week.kpi.transactions));
check('Bulanan mulai 1 Okt', (await svc(REPORT, 'getSalesReport', { period: 'bulanan' })).value.from === '2026-10-01');
check('Rentang tidak sah ditolak service', (await svc(REPORT, 'getSalesReport', { period: 'rentang', from: '2026-10-16', to: '2026-10-10' })).error === 'Tanggal mulai harus sebelum atau sama dengan tanggal selesai');
await p.goto(`${B}/admin/laporan`); await wait(1200);
const laporanText = await p.locator('main').innerText();
check('KPI Laporan tampil (Omzet, Jumlah Transaksi, Rata-rata, Produk Terjual) + grafik & tabel', ['Omzet', 'Jumlah Transaksi', 'Rata-rata per Transaksi', 'Produk Terjual', 'Penjualan per Hari', 'Produk Terlaris', 'Metode Pembayaran', 'Transaksi'].every((t) => laporanText.includes(t)));
await p.getByRole('button', { name: 'Rentang' }).click(); await wait(300);
await p.fill('#report-from', '2026-10-14'); await p.fill('#report-to', '2026-10-12');
await p.getByRole('button', { name: 'Tampilkan' }).click(); await wait(300);
check('Validasi inline rentang terbalik', (await p.locator('#report-to-error').innerText()).includes('Tanggal mulai harus'));
await p.fill('#report-from', '2026-10-12'); await p.fill('#report-to', '2026-10-14'); await p.getByRole('button', { name: 'Tampilkan' }).click(); await wait(1000);
check('Rentang 12–14 Okt diterapkan & disimpan di URL', p.url().includes('periode=rentang&dari=2026-10-12&sampai=2026-10-14') && (await p.locator('main').innerText()).includes('12 Okt 2026 – 14 Okt 2026'));
const [xlsx] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Export Excel' }).click()]);
const xlsxPath = await xlsx.path(); const fs = await import('node:fs');
check('Export Excel → .xlsx (zip PK)', xlsx.suggestedFilename() === 'laporan-penjualan-oven-and-co_2026-10-12_2026-10-14.xlsx' && fs.readFileSync(xlsxPath).subarray(0, 2).toString() === 'PK', xlsx.suggestedFilename());
const [pdf] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Export PDF' }).click()]);
check('Export PDF → .pdf (%PDF)', pdf.suggestedFilename().endsWith('.pdf') && fs.readFileSync(await pdf.path()).subarray(0, 4).toString() === '%PDF');
await wait(300);
check('Toast ekspor', (await toastText()).includes('diunduh'));

// ── AD-09 Voucher & loyalty
await p.goto(`${B}/admin/promo`); await wait(900);
await p.getByRole('button', { name: 'Buat Voucher' }).click(); await wait(300);
await p.getByRole('button', { name: 'Simpan voucher' }).click(); await wait(300);
check('Form voucher kosong: error inline', (await p.locator('#voucher-code-error').innerText()).includes('Isi kode') && (await p.locator('#voucher-value-error').innerText()).includes('lebih dari 0'));
await p.fill('#voucher-code', 'weekend15'); await p.locator('#voucher-code').blur(); await wait(200);
check('Kode ganda ditolak', (await p.locator('#voucher-code-error').innerText()).includes('sudah dipakai'));
await p.fill('#voucher-code', 'roti5k'); await p.fill('#voucher-title', 'Potongan Rp 5.000 roti');
await p.selectOption('#voucher-type', 'amount'); await p.fill('#voucher-value', '5000'); await p.fill('#voucher-quota', '20');
await p.getByRole('button', { name: 'Simpan voucher' }).click(); await wait(900);
const vlist = (await svc(PROMO, 'getAdminVouchers')).value.rows;
const roti = vlist.find((x) => x.code === 'ROTI5K');
check('Voucher ROTI5K dibuat (huruf besar, aktif, semua produk)', roti && roti.status === 'aktif' && roti.product_id == null && roti.quota === 20, JSON.stringify(roti));
check('Promo aktif Beranda memuat ROTI5K', (await svc('/src/services/promoService.js', 'getActivePromos')).value.some((x) => x.code === 'ROTI5K'));
await p.getByRole('switch', { name: 'Aktifkan voucher ROTI5K' }).click(); await wait(800);
check('Toggle nonaktif → status Nonaktif & hilang dari promo', (await svc(PROMO, 'getAdminVouchers')).value.rows.find((x) => x.code === 'ROTI5K').status === 'nonaktif' && !(await svc('/src/services/promoService.js', 'getActivePromos')).value.some((x) => x.code === 'ROTI5K'));
await p.goto(`${B}/admin/promo?tab=loyalty`); await wait(800);
await p.fill('#loyalty-platinum', '400'); await wait(200);
check('Platinum ≤ Gold ditolak inline', (await p.locator('#loyalty-platinum-error').innerText()).includes('lebih besar'));
await p.fill('#loyalty-platinum', '1200'); await p.fill('#loyalty-gold', '300'); await p.fill('#loyalty-redeem-value', '10000');
await p.getByRole('button', { name: 'Simpan aturan' }).click(); await wait(800);
check('Aturan loyalty disimpan', (await toastText()).includes('Aturan loyalty disimpan'));

// ── AD-11 Pengaturan
await p.goto(`${B}/admin/pengaturan`); await wait(900);
await p.fill('#store-whatsapp', '0812'); await wait(200);
check('WhatsApp tanpa +62 ditolak inline', (await p.locator('#store-whatsapp-error').innerText()).includes('+62'));
await p.fill('#store-whatsapp', '+6281111222333'); await p.fill('#store-radius', '5'); await p.fill('#store-fee', '3000');
await p.getByRole('button', { name: 'Simpan profil' }).click(); await wait(800);
check('Profil disimpan', (await toastText()).includes('Profil & aturan operasional disimpan'));
await p.getByRole('switch', { name: 'Toko buka hari Jumat' }).click(); await wait(200);
await p.getByRole('button', { name: 'Simpan jam' }).click(); await wait(800);
check('Jam operasional disimpan (Jumat tutup)', (await db((getTables) => getTables('operating_hours').operating_hours.find((h) => h.day_of_week === 5))).is_open === false);
for (const code of ['GoPay', 'OVO', 'DANA', 'ShopeePay', 'BCA Virtual Account', 'BNI Virtual Account', 'Mandiri Virtual Account', 'BRI Virtual Account']) { await p.getByRole('switch', { name: `Aktifkan ${code}` }).click(); await wait(450); }
await p.getByRole('switch', { name: 'Aktifkan QRIS' }).click(); await wait(600);
check('BR-05: QRIS (online terakhir) tidak bisa dimatikan', (await toastText()).includes('Minimal satu metode bayar online') && (await p.getByRole('switch', { name: 'Aktifkan QRIS' }).getAttribute('aria-checked')) === 'true');
check('Owner tidak bisa menonaktifkan akun sendiri (service)', (await svc(SET, 'setAdminAccountStatus', 3, false)).error === 'Tidak dapat menonaktifkan akun yang sedang dipakai');
await p.getByRole('button', { name: 'Tambah Akun', exact: true }).click(); await wait(300);
await p.fill('#account-name', 'Dewi Staf'); await p.fill('#account-email', 'staf@demo.com'); await p.fill('#account-phone', '+6281299998888'); await p.fill('#account-password', 'rahasia123');
await p.getByRole('button', { name: 'Simpan akun' }).click(); await wait(300);
check('Email staf ganda ditolak', (await p.locator('#account-email-error').innerText()).includes('sudah terdaftar'));
await p.fill('#account-email', 'dewi@oven.co'); await p.getByRole('button', { name: 'Simpan akun' }).click(); await wait(900);
check('Akun Dewi Staf ditambahkan', (await toastText()).includes('Akun Staf Dewi Staf ditambahkan'));
await p.getByRole('button', { name: 'Nonaktifkan akun Budi Staf' }).click(); await wait(300);
await p.getByRole('dialog').getByRole('button', { name: 'Nonaktifkan' }).click(); await wait(800);
check('Budi Staf dinonaktifkan', (await toastText()).includes('Budi Staf dinonaktifkan'));

await loginAdmin('staf@demo.com');
check('Akun nonaktif tidak bisa masuk', (await p.locator('#admin-login-error').innerText()).includes('Akun tidak aktif'));
await loginAdmin('dewi@oven.co', 'rahasia123');
check('Akun staf baru masuk & landing Pesanan', p.url().endsWith('/admin/pesanan'), p.url());

// ── Efek di web pelanggan (FR-36 "berlaku di web pelanggan", FR-34 "aturan promo dan poin berlaku")
await loginCustomer();
const ctx = (await svc('/src/services/checkoutService.js', 'getCheckoutContext')).value;
check('Checkout memakai radius 5 km & tarif Rp 3.000/km', ctx.settings.delivery_radius_km === 5 && ctx.addresses.every((a) => a.withinRadius === a.distance <= 5) && ctx.addresses.filter((a) => a.withinRadius).every((a) => a.fee === Math.ceil(a.distance) * 3000), JSON.stringify(ctx.addresses.map((a) => [a.distance, a.withinRadius, a.fee])));
check('Metode bayar nonaktif hilang dari C-14 (hanya QRIS & Bayar di Toko)', ctx.payment_methods.map((m) => m.method_code).sort().join() === 'pay_at_store,qris');
check('Jumat (hari ini) tutup → tanpa slot', ctx.operating_hours.find((h) => h.day_of_week === 5).is_open === false);
const loyal = (await svc('/src/services/loyaltyService.js', 'getMyLoyaltySummary')).value;
check('Level & nilai poin pakai aturan baru (Platinum ≥ 1.200; 100 poin = Rp 10.000)', loyal.level.key === (loyal.yearlyPoints >= 1200 ? 'platinum' : loyal.yearlyPoints >= 300 ? 'gold' : 'silver') && loyal.redeemValue === Math.floor(loyal.balance / 100) * 10000, JSON.stringify(loyal));
await p.goto(`${B}/produk/1`); await wait(900);
await p.getByRole('button', { name: 'Tambah ke Keranjang' }).click(); await wait(600);
await p.goto(`${B}/checkout`); await wait(1200);
check('Checkout hari tutup: pesan "Toko tutup pada tanggal ini"', (await p.locator('body').innerText()).includes('Toko tutup pada tanggal ini'));

// ── Persistensi: data contoh dibuat ulang (ganti tanggal / SEED_VERSION), pengaturan Owner tetap
await p.evaluate(() => { const m = JSON.parse(localStorage.getItem('ovenco_mock_meta')); localStorage.setItem('ovenco_mock_meta', JSON.stringify({ ...m, version: 0, anchor_date: '2026-10-01' })); });
const kept = await db((getTables) => {
  const t = getTables('vouchers', 'store_settings', 'operating_hours', 'payment_methods');
  return {
    reseeded: JSON.parse(localStorage.getItem('ovenco_mock_meta')).version > 0,
    roti: t.vouchers.find((v) => v.code === 'ROTI5K'), weekendQuota: t.vouchers.find((v) => v.code === 'WEEKEND15').quota,
    radius: t.store_settings.delivery_radius_km, gold: t.store_settings.gold_min_points,
    friday: t.operating_hours.find((h) => h.day_of_week === 5).is_open, gopay: t.payment_methods.find((m) => m.method_code === 'gopay').is_active,
  };
});
check('Setelah data contoh dibuat ulang: voucher, pengaturan, jam, metode bayar tetap', kept.reseeded && kept.roti?.is_active === false && kept.radius === 5 && kept.gold === 300 && kept.friday === false && kept.gopay === false && kept.weekendQuota === 50, JSON.stringify(kept));

console.log(res.map((r) => r.join(' ')).join('\n'));
console.log(`\n${res.filter((r) => r[0] === '✓').length}/${res.length} lulus`);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await b.close();
process.exit(res.some((r) => r[0] === '✗') || errors.length ? 1 : 0);
