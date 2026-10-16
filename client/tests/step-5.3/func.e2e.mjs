// Uji Step 5.3 · C-12 – C-16 (FR-11 – FR-16 · BR-01 – BR-06 · BR-09 · BR-10 · BR-12)
// Jam peramban dikunci ke Jumat 16 Okt 2026 pukul 10.00 WIB agar slot, batas pre-order, dan timer deterministik.
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
const bar = () => p.locator('[data-layout="action-bar"]').innerText();
const db = (fn, arg) => p.evaluate(async ([src, a]) => {
  const { getTables } = await import('/src/services/mock/db.js');
  return new Function('getTables', 'a', `return (${src})(getTables, a)`)(getTables, a);
}, [fn.toString(), arg]);
const stockOf = (pid) => db((getTables, pid) => {
  const s = getTables('daily_stocks').daily_stocks.find((r) => r.product_id === pid && r.stock_date === '2026-10-16');
  return s.qty_planned - s.qty_sold;
}, pid);
const addProduct = async (id, times = 1) => {
  await p.goto(`${B}/produk/${id}`); await wait(800);
  for (let i = 1; i < times; i++) await p.getByRole('button', { name: 'Tambah jumlah' }).click();
  await p.getByRole('button', { name: 'Tambah ke Keranjang' }).click(); await wait(200);
};
const toPayment = async (slot) => {
  await p.goto(`${B}/keranjang`); await wait(800);
  await p.getByRole('button', { name: 'Checkout' }).click(); await wait(900);
  if (slot) { await p.getByRole('button', { name: slot }).click(); }
};

await p.goto(`${B}/katalog`); await wait();

// ── Unit: utils/rules/checkout.js & order.js
const unit = await p.evaluate(async () => {
  const R = await import('/src/utils/businessRules.js');
  const out = []; const eq = (n, a, e) => out.push([n, JSON.stringify(a) === JSON.stringify(e), JSON.stringify(a)]);
  eq('BR-03 tanggal gabungan', R.getCombinedReadyDate(['2026-10-16', '2026-10-19', '2026-10-17']), '2026-10-19');
  eq('BR-05 pickup + semua ready', R.isPayAtStoreAllowed('pickup', ['ready', 'ready']), true);
  eq('BR-05 ada pre-order', R.isPayAtStoreAllowed('pickup', ['ready', 'preorder']), false);
  eq('BR-05 delivery', R.isPayAtStoreAllowed('delivery', ['ready']), false);
  eq('BR-12 ongkir 4,2 km → 5 × 2.500', R.getDeliveryQuote(4.2).fee, 12500);
  eq('BR-12 di luar radius', R.getDeliveryQuote(10.01).withinRadius, false);
  const v = { voucher_id: 1, code: 'WEEKEND15', discount_type: 'percent', discount_value: 15, product_id: 4, quota: 5, valid_from: '2026-10-14', valid_to: '2026-10-28', is_active: true };
  const claim = { user_id: 1, voucher_id: 1, used_at: null };
  const lines = [{ product_id: 1, line_total: 56000 }, { product_id: 4, line_total: 120000 }];
  eq('voucher produk 15% = 18.000', R.evaluateVoucher({ voucher: v, claim, todayKey: '2026-10-16', lines }).discount, 18000);
  eq('voucher bukan milik pelanggan', R.evaluateVoucher({ voucher: v, claim: null, todayKey: '2026-10-16', lines }).valid, false);
  eq('voucher sudah dipakai', R.evaluateVoucher({ voucher: v, claim: { ...claim, used_at: 'x' }, todayKey: '2026-10-16', lines }).valid, false);
  eq('voucher lewat periode', R.evaluateVoucher({ voucher: v, claim, todayKey: '2026-10-29', lines }).valid, false);
  eq('voucher produk tidak ada di pesanan', R.evaluateVoucher({ voucher: v, claim, todayKey: '2026-10-16', lines: [lines[0]] }).valid, false);
  eq('voucher nominal ≤ subtotal', R.evaluateVoucher({ voucher: { ...v, product_id: null, discount_type: 'amount', discount_value: 99999 }, claim, todayKey: '2026-10-16', lines: [lines[0]] }).discount, 56000);
  eq('BR-09 tukar poin kelipatan 100', R.getRedeemablePoints(1250, 543000), { points: 1200, value: 60000 });
  eq('poin dibatasi total', R.getRedeemablePoints(1250, 12000), { points: 200, value: 10000 });
  const now = new Date(2026, 9, 16, 10, 0);
  eq('slot hari ini yang sudah mulai nonaktif', R.getTimeSlotOptions([{ start: '09:00', end: '11:00' }, { start: '11:00', end: '13:00' }], '2026-10-16', now).map((s) => s.disabled), [true, false]);
  eq('slot di luar jam operasional dibuang', R.getTimeSlotOptions([{ start: '19:00', end: '21:00' }], '2026-10-17', now).length, 0);
  eq('nomor pesanan berikutnya', R.nextOrderNumber(['OVC-261016-012', 'OVC-261015-020'], '2026-10-16'), 'OVC-261016-013');
  eq('total', R.calculateOrderTotal({ subtotal: 561000, shippingFee: 15000, voucherDiscount: 18000, pointsDiscount: 50000 }), 508000);
  eq('stok kurang', R.findStockIssues([{ product_id: 1, availability_type: 'ready', quantity: 3, remaining_today: 4 }, { product_id: 1, availability_type: 'ready', quantity: 2, remaining_today: 4 }]), [{ product_id: 1, remaining: 4 }]);
  return out;
});
unit.forEach(([n, ok, got]) => check(`unit: ${n}`, ok, got));

// ── C-12 Keranjang (tamu)
await p.goto(`${B}/keranjang`); await wait();
check('Empty state "Keranjangmu masih kosong"', (await p.getByText('Keranjangmu masih kosong').count()) === 1);
await p.getByRole('button', { name: 'Mulai Belanja' }).click(); await wait(400);
check('Mulai Belanja → /katalog', p.url().endsWith('/katalog'), p.url());
await addProduct(1, 2); await addProduct(4); await addProduct(5);
await p.goto(`${B}/keranjang`); await wait(900);
check('Judul "Keranjang (4)"', (await p.getByRole('heading', { name: 'Keranjang (4)' }).count()) === 1);
check('Banner pre-order: siap Sabtu, 17 Okt (BR-03)', (await p.getByRole('note').innerText()).includes('Sabtu, 17 Okt'));
check('Subtotal Rp 561.000', (await bar()).includes('Rp 561.000'), await bar());
check('Catatan ongkir di checkout', (await p.getByText('Ongkir dan diskon dihitung saat checkout').count()) === 1);
const cookieStock = await stockOf(4);
const plusCookies = p.getByRole('button', { name: 'Tambah jumlah assorted cookies box' });
for (let i = 0; i < cookieStock + 2 && await plusCookies.isEnabled(); i++) await plusCookies.click();
await wait(500);
check(`Stepper berhenti di stok (${cookieStock})`, !(await plusCookies.isEnabled()));
for (let i = 1; i < cookieStock; i++) await p.getByRole('button', { name: 'Kurangi jumlah assorted cookies box' }).click();
await wait(500);
await p.getByRole('button', { name: 'Hapus Premium Birthday Cake dari keranjang' }).click(); await wait(500);
check('Hapus item → banner pre-order hilang', (await p.getByRole('note').count()) === 0);
await addProduct(5); await p.goto(`${B}/keranjang`); await wait(900);
await p.getByRole('button', { name: 'Checkout' }).click(); await wait(600);
check('Tamu Checkout → /masuk (BR-04)', p.url().endsWith('/masuk'), p.url());
await p.fill('#masuk-identifier', 'pelanggan@demo.com'); await p.fill('#masuk-password', 'demo1234');
await p.click('#masuk-submit-btn'); await wait(1300);
check('Setelah masuk kembali ke /checkout, keranjang digabung', p.url().endsWith('/checkout') && (await bar()).includes('Rp 561.000'), p.url());

// ── Skenario 1: pembayaran online habis 30 menit (BR-06) → batal otomatis, stok/voucher/poin kembali
check('Pilih Pembayaran nonaktif sebelum slot', await p.getByRole('button', { name: 'Pilih Pembayaran' }).isDisabled());
check('Slot 09.00–11.00 hari H+1 aktif (pre-order)', await p.getByRole('button', { name: '09.00–11.00' }).isEnabled());
await p.getByRole('button', { name: '11.00–13.00' }).click();
await p.getByRole('button', { name: 'Pakai voucher' }).click();
await p.fill('#kode-voucher', 'SALAH'); await p.getByRole('button', { name: 'Pakai', exact: true }).click();
check('Voucher salah → "Voucher tidak berlaku untuk pesanan ini"', (await p.getByText('Voucher tidak berlaku untuk pesanan ini').count()) === 1);
await p.fill('#kode-voucher', 'CROISSANT20'); await p.getByRole('button', { name: 'Pakai', exact: true }).click();
check('Voucher kedaluwarsa ditolak', (await p.getByText('Voucher tidak berlaku untuk pesanan ini').count()) === 1);
await p.getByRole('button', { name: 'HEMAT10' }).click(); await wait(200);
check('Voucher HEMAT10 → Hemat Rp 10.000', (await p.getByText('Hemat Rp 10.000').count()) === 1);
await p.getByRole('switch').check({ force: true }); await wait(200);
check('Tukar 1.200 poin → total Rp 491.000', (await bar()).includes('Rp 491.000'), await bar());
await p.getByRole('radio', { name: 'Delivery' }).click(); await wait(200);
check('Delivery: alamat utama + ongkir', /Ongkir \(3,\d+ km\)/.test(await p.locator('section[aria-label="Ringkasan biaya"]').innerText()));
await p.getByRole('button', { name: 'Ubah' }).click();
await p.getByRole('radio', { name: /Rumah Orang Tua/ }).click(); await wait(200);
check('Alamat di luar radius ditolak', (await p.getByText('Di luar radius pengiriman 10 km').count()) >= 1 && await p.getByRole('button', { name: 'Pilih Pembayaran' }).isDisabled());
await p.getByRole('radio', { name: 'Pickup di Toko' }).click(); await wait(200);
const stockBefore = await stockOf(1);
await p.getByRole('button', { name: 'Pilih Pembayaran' }).click(); await wait(900);
check('→ /checkout/pembayaran', p.url().endsWith('/checkout/pembayaran'), p.url());
check('Bayar di Toko nonaktif (pre-order) + teks bantuan', await p.getByRole('radio', { name: /Bayar di Toko/ }).isDisabled() && (await p.getByText('Tidak tersedia untuk pre-order dan delivery').count()) === 1);
await p.getByRole('radio', { name: /GoPay/ }).click();
await p.getByRole('button', { name: /Bayar Sekarang/ }).click(); await wait(1200);
const order1 = p.url().split('/bayar/')[1];
check('Pesanan dibuat → /bayar/OVC-261016-NNN', /^OVC-261016-\d{3}$/.test(order1 ?? ''), p.url());
check('Timer 30 menit', /Selesaikan pembayaran dalam 30:00|29:5\d/.test(await p.getByRole('timer').innerText()), await p.getByRole('timer').innerText());
check('Kode pembayaran e-wallet tampil', /EW\d{8}/.test(await p.locator('main').innerText()));
check('Stok ready berkurang saat pesanan dibuat (TF-12)', (await stockOf(1)) === stockBefore - 2, `${stockBefore} → ${await stockOf(1)}`);
const after1 = await db((getTables, num) => {
  const t = getTables('orders', 'user_vouchers', 'point_transactions');
  const o = t.orders.find((x) => x.order_number === num);
  return { o, used: t.user_vouchers.find((c) => c.user_id === 1 && c.voucher_id === 2).used_at, bal: t.point_transactions.filter((x) => x.user_id === 1).reduce((s, x) => s + x.points, 0) };
}, order1);
check('Pesanan: menunggu_pembayaran, ready_date 17 Okt, poin 1.200, voucher', after1.o.order_status === 'menunggu_pembayaran' && after1.o.ready_date === '2026-10-17'
  && after1.o.points_used === 1200 && after1.o.voucher_discount === 10000 && after1.o.total === 491000 && after1.o.pickup_code?.startsWith('PK'), JSON.stringify(after1.o));
check('Voucher terpakai & saldo poin 50', Boolean(after1.used) && after1.bal === 50, JSON.stringify(after1));
await p.getByRole('button', { name: 'Cek Status Pembayaran' }).click(); await wait(600);
check('Cek Status → "Pembayaran belum diterima"', (await p.getByRole('alert').innerText()).includes('Pembayaran belum diterima'));
await c.clock.fastForward('31:00'); await wait(2500);
check('Waktu habis → "Waktu pembayaran habis, pesanan dibatalkan otomatis"', (await p.getByText('Waktu pembayaran habis, pesanan dibatalkan otomatis').count()) === 1);
const after2 = await db((getTables, num) => {
  const t = getTables('orders', 'user_vouchers', 'point_transactions', 'payments');
  const o = t.orders.find((x) => x.order_number === num);
  return { o, pay: t.payments.find((x) => x.order_id === o.order_id).status, used: t.user_vouchers.find((c) => c.user_id === 1 && c.voucher_id === 2).used_at, bal: t.point_transactions.filter((x) => x.user_id === 1).reduce((s, x) => s + x.points, 0) };
}, order1);
check('BR-06: dibatalkan, payment expired', after2.o.order_status === 'dibatalkan' && after2.pay === 'expired' && /BR-06/.test(after2.o.cancel_reason), JSON.stringify(after2));
check('Stok, voucher, dan poin kembali', (await stockOf(1)) === stockBefore && after2.used === null && after2.bal === 1250, `${await stockOf(1)} ${after2.used} ${after2.bal}`);
await p.getByRole('button', { name: 'Belanja Lagi' }).click(); await wait(400);
check('Belanja Lagi → /katalog', p.url().endsWith('/katalog'));

// ── Skenario 1b (BR-06): pesanan ditinggal — halaman Bayar TIDAK dibuka lagi. Pembatalan harus terbaca dari
// jalur lain (katalog, data admin AD-03) dan stok, voucher, serta poin kembali.
const adminRow = (num) => p.evaluate(async (n) => {
  const { getAdminOrderRows } = await import('/src/services/mock/orderViews.js');
  return getAdminOrderRows().find((r) => r.order_number === n);
}, num);
const walletOf = () => db((getTables) => {
  const t = getTables('user_vouchers', 'vouchers', 'point_transactions');
  return { used: t.user_vouchers.find((c) => c.user_id === 1 && c.voucher_id === 2).used_at,
    quota: t.vouchers.find((v) => v.voucher_id === 2).quota,
    bal: t.point_transactions.filter((x) => x.user_id === 1).reduce((s, x) => s + x.points, 0) };
});
await addProduct(2);
const stock1b = await stockOf(2);
const wallet1b = await walletOf();
await toPayment('13.00–15.00');
await p.getByRole('button', { name: 'Pakai voucher' }).click();
await p.getByRole('button', { name: 'HEMAT10' }).click(); await wait(200);
await p.getByRole('switch').check({ force: true }); await wait(200);
await p.getByRole('button', { name: 'Pilih Pembayaran' }).click(); await wait(900);
await p.getByRole('radio', { name: /OVO/ }).click();
await p.getByRole('button', { name: /Bayar Sekarang/ }).click(); await wait(1200);
const order1b = p.url().split('/bayar/')[1];
await p.goto(`${B}/katalog`); await wait();
const placed1b = await walletOf();
check('1b: pesanan dibuat dengan voucher & poin (stok, voucher, poin terpakai)', (await stockOf(2)) === stock1b - 1 && Boolean(placed1b.used)
  && placed1b.quota === wallet1b.quota - 1 && placed1b.bal < wallet1b.bal, JSON.stringify({ wallet1b, placed1b }));
await c.clock.fastForward('15:00'); await p.reload(); await wait();
check('1b: masih dalam 30 menit → tetap Menunggu Pembayaran', (await adminRow(order1b))?.order_status === 'menunggu_pembayaran');
await c.clock.fastForward('16:00'); await p.reload(); await wait();
const row1b = await adminRow(order1b);
check('1b: lewat 30 menit tanpa membuka /bayar → Dibatalkan di data admin AD-03', row1b?.order_status === 'dibatalkan', JSON.stringify(row1b));
const after1b = await walletOf();
check('1b: stok kembali (terbaca dari katalog)', (await stockOf(2)) === stock1b, `${stock1b} → ${await stockOf(2)}`);
check('1b: voucher & kuota kembali, poin di-refund', after1b.used === null && after1b.quota === wallet1b.quota && after1b.bal === wallet1b.bal, JSON.stringify(after1b));
const pay1b = await db((getTables, num) => {
  const t = getTables('orders', 'payments');
  const o = t.orders.find((x) => x.order_number === num);
  return { pay: t.payments.find((x) => x.order_id === o.order_id).status, reason: o.cancel_reason };
}, order1b);
check('1b: payment expired + alasan BR-06', pay1b.pay === 'expired' && /BR-06/.test(pay1b.reason), JSON.stringify(pay1b));
await p.goto(`${B}/bayar/${order1b}`); await wait(900);
check('1b: halaman Bayar menampilkan pesan waktu habis', (await p.getByText('Waktu pembayaran habis, pesanan dibatalkan otomatis').count()) === 1);
const refundCount = await db((getTables, num) => {
  const t = getTables('orders', 'point_transactions');
  const o = t.orders.find((x) => x.order_number === num);
  return t.point_transactions.filter((x) => x.order_id === o.order_id && x.type === 'refund').length;
}, order1b);
check('1b: pembatalan tidak diproses dua kali (1 refund poin)', refundCount === 1, String(refundCount));

// ── Skenario 2: pre-order campuran, WEEKEND15 + poin, QRIS → Ganti Metode VA → Simulasikan Lunas
await addProduct(1, 2); await addProduct(4); await addProduct(5);
await toPayment('09.00–11.00');
await p.getByRole('button', { name: 'Pakai voucher' }).click();
await p.getByRole('button', { name: 'WEEKEND15' }).click(); await wait(200);
check('WEEKEND15 → Hemat Rp 18.000', (await p.getByText('Hemat Rp 18.000').count()) === 1);
await p.getByRole('switch').check({ force: true }); await wait(200);
check('Total = 561.000 − 18.000 − 60.000 = Rp 483.000', (await bar()).includes('Rp 483.000'), await bar());
await p.getByRole('button', { name: 'Pilih Pembayaran' }).click(); await wait(900);
await p.getByRole('radio', { name: /QRIS/ }).click();
await p.getByRole('button', { name: /Bayar Sekarang/ }).click(); await wait(1200);
const order2 = p.url().split('/bayar/')[1];
check('QRIS: kode QR simulasi + Unduh QR', (await p.getByRole('img', { name: 'Kode QR simulasi pembayaran' }).count()) === 1 && (await p.getByRole('button', { name: 'Unduh QR' }).count()) === 1);
await p.getByRole('button', { name: 'Cara pembayaran' }).click();
check('Cara pembayaran terbuka', (await p.locator('#cara-pembayaran li').count()) === 4);
check('Keranjang dikosongkan setelah pesanan dibuat', (await p.evaluate(() => JSON.parse(localStorage.getItem('ovenco_mock_cart_1')))).length === 0);
await p.getByRole('link', { name: 'Ganti Metode' }).click(); await wait(900);
check('Ganti Metode → C-14 untuk pesanan ini', p.url().includes(`pesanan=${order2}`) && (await p.getByRole('radio', { name: /QRIS/ }).getAttribute('aria-checked')) === 'true');
await p.getByRole('radio', { name: /BCA Virtual Account/ }).click();
await p.getByRole('button', { name: /Bayar Sekarang/ }).click(); await wait(1000);
check('VA BCA: nomor VA + Salin', /8808\d{10}/.test(await p.locator('main').innerText()) && (await p.getByRole('button', { name: 'Salin' }).count()) === 1);
await p.getByRole('button', { name: 'Simulasikan Lunas' }).click(); await wait(1200);
check('Simulasikan Lunas → /pesanan-berhasil', p.url().endsWith(`/pesanan-berhasil/${order2}`), p.url());
const success = await p.locator('main').innerText();
check('C-16: terima kasih, nomor, +483 poin, Lunas · BCA', success.includes('Terima kasih, pesananmu sudah kami terima!') && success.includes(order2)
  && success.includes('+483 poin akan masuk setelah pesanan selesai') && success.includes('Lunas · BCA Virtual Account') && success.includes('Dikonfirmasi'), success);
const admin = await p.evaluate(async (num) => {
  const { getAdminOrderRows } = await import('/src/services/mock/orderViews.js');
  return getAdminOrderRows().find((r) => r.order_number === num);
}, order2);
check('Pesanan tampil di data admin AD-03 (paid, dikonfirmasi)', admin?.payment_status === 'paid' && admin.order_status === 'dikonfirmasi' && admin.method_code === 'va_bca', JSON.stringify(admin));

// ── Skenario 3: semua ready + pickup → Bayar di Toko → langsung Dikonfirmasi + kode pickup
await addProduct(2);
await toPayment(null);
check('Ready saja: tanggal hari ini (tanpa date picker)', (await p.getByText(/Hari ini, Jumat, 16 Okt/).count()) === 1 && (await p.locator('[data-date]').count()) === 0);
check('Slot yang sudah lewat (07.00, 09.00) nonaktif', await p.getByRole('button', { name: '07.00–09.00' }).isDisabled() && await p.getByRole('button', { name: '09.00–11.00' }).isDisabled());
await p.getByRole('button', { name: '15.00–17.00' }).click();
await p.getByRole('button', { name: 'Pilih Pembayaran' }).click(); await wait(900);
await p.getByRole('radio', { name: /Bayar di Toko/ }).click();
await p.getByRole('button', { name: /Bayar Sekarang/ }).click(); await wait(1200);
const s3 = await p.locator('main').innerText();
check('Bayar di Toko → Pesanan Berhasil, kode pickup, "Bayar saat ambil"', p.url().includes('/pesanan-berhasil/') && /PK\d{4}/.test(s3) && s3.includes('Bayar saat ambil') && s3.includes('Dikonfirmasi'), s3);
await p.getByRole('button', { name: 'Lacak Pesanan' }).click(); await wait(400);
check('Lacak Pesanan → /pesanan/:orderNumber', /\/pesanan\/OVC-261016-\d{3}$/.test(p.url()), p.url());

// ── BR-06 tidak menyentuh pesanan yang sudah lunas / Bayar di Toko / data contoh
const seedPendingBefore = await db((getTables) => getTables('orders').orders.filter((o) => o.order_id < 1000000 && o.order_status === 'menunggu_pembayaran').length);
await c.clock.fastForward('31:00'); await p.goto(`${B}/katalog`); await wait();
const paidRow = await adminRow(order2);
check('Pesanan lunas tidak menjadi expired setelah 30 menit', paidRow?.order_status === 'dikonfirmasi' && paidRow.payment_status === 'paid', JSON.stringify(paidRow));
const storeRows = await db((getTables) => getTables('orders').orders.filter((o) => o.order_id >= 1000000 && o.payment_option === 'pay_at_store').map((o) => o.order_status));
check('Pesanan Bayar di Toko tidak dibatalkan BR-06', storeRows.length === 1 && storeRows[0] === 'dikonfirmasi', JSON.stringify(storeRows));
const seedPendingAfter = await db((getTables) => getTables('orders').orders.filter((o) => o.order_id < 1000000 && o.order_status === 'menunggu_pembayaran').length);
check('Pesanan data contoh tidak disentuh', seedPendingBefore === seedPendingAfter, `${seedPendingBefore} → ${seedPendingAfter}`);

// ── Pesanan pengguna bertahan saat data contoh dibuat ulang
const kept = await p.evaluate(async () => {
  const before = JSON.parse(localStorage.getItem('ovenco_mock_daily_stocks')).find((s) => s.product_id === 2 && s.stock_date === '2026-10-16').qty_sold;
  const m = JSON.parse(localStorage.getItem('ovenco_mock_meta')); m.anchor_date = '2000-01-01';
  localStorage.setItem('ovenco_mock_meta', JSON.stringify(m));
  const { getTables } = await import('/src/services/mock/db.js');
  const t = getTables('orders', 'order_items', 'payments', 'daily_stocks');
  const mine = t.orders.filter((o) => o.order_id >= 1000000);
  return { orders: mine.length, items: t.order_items.filter((i) => i.order_id >= 1000000).length, before,
    after: t.daily_stocks.find((s) => s.product_id === 2 && s.stock_date === '2026-10-16').qty_sold };
});
check('Reseed: 4 pesanan pelanggan + item + stok terjual tetap', kept.orders === 4 && kept.items === 8 && kept.before === kept.after, JSON.stringify(kept));
await c.close();

res.forEach((r) => console.log(r.join(' ')));
console.log(`\n${res.filter((r) => r[0] === '✓').length}/${res.length} lulus`);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await b.close();
