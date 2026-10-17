// Uji Step 5.5 · C-20 – C-24 (FR-18 · FR-22 – FR-25 · BR-06 · BR-08 · BR-09 · BR-11 · BR-12)
// Jam peramban dikunci ke Jumat 16 Okt 2026 pukul 10.00 WIB agar notifikasi "Hari ini", slot, dan timer deterministik.
import { chromium } from 'playwright';
const B = 'http://localhost:5173';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const res = []; const errors = []; const emails = [];
const check = (n, ok, extra = '') => res.push([ok ? '✓' : '✗', n, ok ? '' : extra]);
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Jakarta' });
await c.clock.install({ time: new Date('2026-10-16T10:00:00+07:00') });
await c.addInitScript(() => localStorage.setItem('ovenco_onboarding_done', '1'));
const p = await c.newPage();
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  if (m.text().startsWith('[Oven & Co. Mock Email]')) emails.push(m.text());
});
const wait = (ms = 700) => p.waitForTimeout(ms);
const db = (fn, arg) => p.evaluate(async ([src, a]) => {
  const { getTables } = await import('/src/services/mock/db.js');
  return new Function('getTables', 'a', `return (${src})(getTables, a)`)(getTables, a);
}, [fn.toString(), arg]);
const notifsOf = (orderNumber) => db((getTables, num) => {
  const t = getTables('orders', 'notifications', 'order_status_histories');
  const o = t.orders.find((x) => x.order_number === num);
  return {
    notifs: t.notifications.filter((n) => n.order_id === o.order_id).map((n) => `${n.type}:${n.title}`),
    history: t.order_status_histories.filter((h) => h.order_id === o.order_id).map((h) => h.status),
    status: o.order_status,
  };
}, orderNumber);
const login = async (id, pw = 'demo1234') => {
  await p.goto(`${B}/masuk`); await wait(400);
  await p.fill('#masuk-identifier', id); await p.fill('#masuk-password', pw);
  await p.click('#masuk-submit-btn'); await wait(900);
};
const createOrder = async ({ usePoints = false } = {}) => {
  await p.goto(`${B}/produk/1`); await wait(800);
  await p.getByRole('button', { name: 'Tambah ke Keranjang' }).click(); await wait(200);
  await p.goto(`${B}/keranjang`); await wait(800);
  await p.getByRole('button', { name: 'Checkout' }).click(); await wait(900);
  await p.getByRole('button', { name: '11.00–13.00' }).click();
  if (usePoints) { await p.getByRole('switch').check({ force: true }); await wait(200); }
  await p.getByRole('button', { name: 'Pilih Pembayaran' }).click(); await wait(900);
  await p.getByRole('radio', { name: /QRIS/ }).click();
  await p.getByRole('button', { name: /Bayar Sekarang/ }).click(); await wait(1200);
  return p.url().split('/bayar/')[1];
};

await p.goto(`${B}/katalog`); await wait();

// ── Unit: utils/rules/notification.js & account.js
const unit = await p.evaluate(async () => {
  const R = await import('/src/utils/businessRules.js');
  const out = []; const eq = (n, a, e) => out.push([n, JSON.stringify(a) === JSON.stringify(e), JSON.stringify(a)]);
  const order = { order_id: 7, order_number: 'OVC-261016-001', user_id: 1, pickup_code: 'PK1234' };
  eq('notif status: tipe & judul', [R.buildOrderStatusNotification(order, 'dikonfirmasi').type, R.buildOrderStatusNotification(order, 'dikonfirmasi').title], ['order_status', 'Pesanan dikonfirmasi']);
  eq('notif Siap Diambil menyebut kode pickup', R.buildOrderStatusNotification(order, 'siap_diambil').body.includes('PK1234'), true);
  eq('notif Dibatalkan menyebut alasan', R.buildOrderStatusNotification(order, 'dibatalkan', { note: 'Salah tanggal' }).body.endsWith('Alasan: Salah tanggal'), true);
  eq('notif semua status ≤ 100/255 karakter', ['menunggu_pembayaran', 'dikonfirmasi', 'sedang_disiapkan', 'siap_diambil', 'dalam_pengiriman', 'selesai', 'dibatalkan']
    .every((s) => { const n = R.buildOrderStatusNotification(order, s, { note: 'x'.repeat(300) }); return n.title.length <= 100 && n.body.length <= 255; }), true);
  eq('notif poin', R.buildPointsNotification({ user_id: 1, points: 1200, reason: 'x' }).title, '+1.200 poin');
  const g = R.groupNotificationsByDay([
    { created_at: new Date(2026, 9, 15, 9).toISOString() }, { created_at: new Date(2026, 9, 16, 8).toISOString() }, { created_at: new Date(2026, 9, 16, 9).toISOString() },
  ], '2026-10-16');
  eq('kelompok Hari ini / Sebelumnya', g.map((x) => [x.label, x.items.length]), [['Hari ini', 2], ['Sebelumnya', 1]]);
  eq('belum dibaca', R.countUnread([{ is_read: false }, { is_read: true }]), 1);
  eq('profil valid', R.validateProfileInput({ name: 'A', email: 'a@b.co', phone: '+6281234567' }), {});
  eq('profil: HP tanpa +62', Object.keys(R.validateProfileInput({ name: 'A', email: 'a@b.co', phone: '0812345678' })), ['phone']);
  eq('alamat kosong → semua wajib', Object.keys(R.validateAddressInput({ recipient_phone: '' })).sort(), ['full_address', 'label', 'pin', 'recipient_name', 'recipient_phone']);
  eq('label > 30 karakter', R.validateAddressInput({ label: 'x'.repeat(31), recipient_name: 'A', recipient_phone: '+6281234567', full_address: 'J', latitude: 1, longitude: 1 }).label, 'Label maksimal 30 karakter');
  const rows = [{ address_id: 1, user_id: 1, is_primary: true }, { address_id: 2, user_id: 1, is_primary: false }, { address_id: 3, user_id: 9, is_primary: true }];
  eq('satu alamat utama', R.normalizePrimaryAddress(rows, 1, 2).map((a) => a.is_primary), [false, true, true]);
  eq('utama dihapus → alamat pertama jadi utama', R.normalizePrimaryAddress(rows.slice(1), 1).map((a) => a.is_primary), [true, true]);
  const store = { latitude: -6.2, longitude: 106.8 };
  const pt = R.offsetToCoordinates(store, 3, 4);
  eq('pin peta → jarak 5 km', Math.round(R.distanceKm(store, pt)), 5);
  const v = { is_active: true, quota: 5, valid_from: '2026-10-14', valid_to: '2026-10-28' };
  eq('status voucher', [R.getVoucherState({ used_at: null }, v, '2026-10-16'), R.getVoucherState({ used_at: 'x' }, v, '2026-10-16'), R.getVoucherState({ used_at: null }, v, '2026-10-29')], ['usable', 'used', 'expired']);
  return out;
});
unit.forEach(([n, ok, got]) => check(`unit: ${n}`, ok, got));

// ── Akses: tamu diarahkan ke Masuk
await p.goto(`${B}/akun`); await wait(500);
check('Tamu /akun → /masuk', p.url().includes('/masuk'), p.url());
await login('pelanggan@demo.com');

// ── C-20 Akun
await p.goto(`${B}/akun`); await wait(900);
const akun = await p.locator('main').innerText();
check('C-20: nama, email, Gold Member, 1.250 poin', akun.includes('Anisa Pelanggan') && akun.includes('pelanggan@demo.com') && akun.includes('Gold Member') && akun.includes('1.250'), akun.slice(0, 300));
const sidebar = await p.locator('[data-layout="account-sidebar"]').innerText();
check('Sidebar ≥ lg: 6 menu + Keluar (tanpa Bantuan)', ['Pesanan Saya', 'Voucher & Poin', 'Alamat Tersimpan', 'Wishlist', 'Notifikasi', 'Ubah Profil', 'Keluar'].every((m) => sidebar.includes(m)) && !sidebar.includes('Bantuan'), sidebar);
await p.setViewportSize({ width: 390, height: 844 }); await wait(400);
const menu = p.getByRole('navigation', { name: 'Menu akun' });
check('HP: daftar menu akun tampil', await menu.isVisible());
const unreadBefore = await db((getTables) => getTables('notifications').notifications.filter((n) => n.user_id === 1 && !n.is_read).length);
check('Badge Notifikasi = jumlah belum dibaca', unreadBefore > 0 && (await menu.getByRole('link', { name: /Notifikasi/ }).innerText()).includes(String(unreadBefore)), `${unreadBefore}`);
await p.setViewportSize({ width: 1440, height: 900 }); await wait(300);

// ── C-24 Notifikasi
await p.goto(`${B}/notifikasi`); await wait(900);
check('C-24: kelompok Hari ini & Sebelumnya', (await p.getByRole('heading', { name: 'Hari ini' }).count()) === 1 && (await p.getByRole('heading', { name: 'Sebelumnya' }).count()) === 1);
check('C-24: "N belum dibaca"', (await p.getByText(`${unreadBefore} belum dibaca`).count()) === 1);
check('C-24: ada notifikasi status, promo, poin', await db((getTables) => {
  const types = new Set(getTables('notifications').notifications.filter((n) => n.user_id === 1).map((n) => n.type));
  return types.has('order_status') && types.has('promo') && types.has('points');
}));
const firstUnread = p.locator('li button', { has: p.getByText('Belum dibaca') }).filter({ hasText: /Pesanan/ }).first();
await firstUnread.click(); await wait(900);
check('Buka notifikasi status → detail pesanan', /\/pesanan\/OVC-\d{6}-\d{3}$/.test(p.url()), p.url());
check('Notifikasi ditandai dibaca', (await db((getTables) => getTables('notifications').notifications.filter((n) => n.user_id === 1 && !n.is_read).length)) === unreadBefore - 1);

// ── FR-18: setiap perubahan status memicu notifikasi + riwayat (SPEC §4)
const order1 = await createOrder({ usePoints: true });
let n1 = await notifsOf(order1);
check('Pesanan dibuat → notif "Pesanan dibuat"', n1.notifs.includes('order_status:Pesanan dibuat') && n1.history.join() === 'menunggu_pembayaran', JSON.stringify(n1));
await p.getByRole('button', { name: 'Simulasikan Lunas' }).click(); await wait(1200);
n1 = await notifsOf(order1);
check('Simulasi lunas → notif "Pesanan dikonfirmasi"', n1.notifs.includes('order_status:Pesanan dikonfirmasi') && n1.history.join() === 'menunggu_pembayaran,dikonfirmasi', JSON.stringify(n1));
await p.goto(`${B}/pesanan/${order1}`); await wait(900);
await p.getByRole('button', { name: 'Batalkan Pesanan' }).click(); await wait(300);
await p.fill('#cancel-reason', 'Salah pilih tanggal');
await p.getByRole('dialog').getByRole('button', { name: 'Batalkan Pesanan' }).click(); await wait(1200);
n1 = await notifsOf(order1);
check('Batal (BR-08) → notif "Pesanan dibatalkan" + notif poin dikembalikan', n1.status === 'dibatalkan' && n1.notifs.includes('order_status:Pesanan dibatalkan') && n1.notifs.some((x) => x.startsWith('points:+')), JSON.stringify(n1));
check('Salinan email notifikasi di console (TF-14)', emails.some((e) => e.includes('pelanggan@demo.com') && e.includes(order1)), emails.slice(-3).join(' | '));
await p.goto(`${B}/notifikasi`); await wait(900);
// Catatan: data contoh memakai jam referensi 14.00 (MOCK_REFERENCE_TIME), jadi pada jam uji 10.00 notifikasi contoh
// hari ini bisa tercatat lebih "baru" daripada notifikasi buatan uji. Yang diuji: masuk kelompok Hari ini & urut waktu.
const today = await p.locator('section').first().innerText();
const times = await p.evaluate(async () => (await (await import('/src/services/notificationService.js')).getMyNotifications()).items.map((n) => n.created_at));
check('C-24: notifikasi pesanan baru masuk kelompok Hari ini', today.toLowerCase().startsWith('hari ini') && today.includes(`Pesanan ${order1} dibatalkan`), today.slice(0, 120));
check('C-24: daftar terurut terbaru dulu', times.length > 0 && times.every((t, i) => i === 0 || times[i - 1] >= t));

// BR-06: batal otomatis 30 menit juga memicu notifikasi
const order2 = await createOrder();
await c.clock.fastForward('31:00'); await wait(400);
await p.goto(`${B}/notifikasi`); await wait(900);
const n2 = await notifsOf(order2);
check('BR-06 batal otomatis → notif "Pesanan dibatalkan" (sistem)', n2.status === 'dibatalkan' && n2.notifs.at(-1) === 'order_status:Pesanan dibatalkan', JSON.stringify(n2));

// ── C-20 Ubah Profil
await p.goto(`${B}/akun/ubah-profil`); await wait(900);
await p.fill('#profil-phone', '0812'); await p.locator('#profil-phone').blur();
check('HP tanpa +62 → error di bawah field', (await p.getByText('Nomor HP harus diawali +62').count()) === 1 && await p.getByRole('button', { name: 'Simpan Perubahan' }).isDisabled());
await p.fill('#profil-phone', '+6281234567890');
await p.fill('#profil-email', 'staf@demo.com');
await p.getByRole('button', { name: 'Simpan Perubahan' }).click(); await wait(700);
check('Email milik akun lain → "Email sudah terdaftar"', (await p.getByText('Email sudah terdaftar').count()) === 1);
await p.fill('#profil-email', 'pelanggan@demo.com');
await p.fill('#profil-name', 'Anisa Putri');
await p.getByRole('button', { name: 'Simpan Perubahan' }).click(); await wait(900);
check('Profil tersimpan → toast + nama di sidebar berganti', (await p.getByText('Profil berhasil diperbarui.').count()) === 1 && (await p.locator('[data-layout="account-sidebar"]').innerText()).includes('Anisa Putri'));
await p.fill('#sandi-current', 'salah123'); await p.fill('#sandi-new', 'rahasia99'); await p.fill('#sandi-confirm', 'rahasia99');
await p.getByRole('button', { name: 'Simpan Kata Sandi' }).click(); await wait(700);
check('Sandi saat ini salah → error', (await p.getByText('Kata sandi saat ini salah').count()) === 1);
await p.fill('#sandi-current', 'demo1234');
await p.getByRole('button', { name: 'Simpan Kata Sandi' }).click(); await wait(900);
check('Sandi diubah → toast', (await p.getByText('Kata sandi berhasil diubah.').count()) === 1);
await p.goto(`${B}/akun`); await wait(600);
await p.locator('[data-layout="account-sidebar"]').getByRole('button', { name: 'Keluar' }).click(); await wait(600);
await login('pelanggan@demo.com', 'rahasia99');
check('Masuk dengan sandi baru berhasil', !p.url().includes('/masuk'), p.url());

// ── C-22 Alamat
await p.goto(`${B}/akun/alamat`); await wait(900);
const cards = p.locator('ul[aria-label="Daftar alamat"] > li');
check('C-22: 3 alamat, Rumah utama, Rumah Orang Tua di luar radius', (await cards.count()) === 3 && (await cards.first().innerText()).includes('Utama')
  && (await cards.filter({ hasText: 'Rumah Orang Tua' }).innerText()).includes('Di luar radius 10 km'));
await p.getByRole('button', { name: 'Tambah Alamat' }).click(); await wait(300);
await p.fill('#alamat-penerima', ''); await p.getByRole('button', { name: 'Simpan Alamat' }).click(); await wait(300);
const emptyErrors = await Promise.all(['Label alamat wajib diisi', 'Nama penerima wajib diisi', 'Alamat lengkap wajib diisi', 'Tentukan titik lokasi di peta']
  .map((t) => p.getByText(t).count()));
check('Form kosong → error wajib (label, penerima, alamat, pin)', emptyErrors.every((n) => n === 1), emptyErrors.join());
await p.getByRole('button', { name: 'Kantor', exact: true }).click();
await p.fill('#alamat-label', 'Kos'); await p.fill('#alamat-penerima', 'Anisa'); await p.fill('#alamat-lengkap', 'Jl. Uji No. 5, Kota Contoh');
const map = p.getByRole('application');
const box = await map.boundingBox();
await p.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.4); await wait(200);
check('Pin peta → jarak & status radius tampil', /km dari toko · dalam radius pengiriman 10 km/.test(await p.locator('#map-pin-status').innerText()), await p.locator('#map-pin-status').innerText());
await map.focus(); await p.keyboard.press('ArrowUp'); await wait(100);
await p.getByRole('switch').check({ force: true });
await p.getByRole('dialog').getByRole('button', { name: 'Simpan Alamat' }).click(); await wait(1000);
check('Alamat baru tersimpan & menjadi satu-satunya Utama', (await cards.count()) === 4 && (await cards.first().innerText()).includes('Kos')
  && (await p.locator('ul[aria-label="Daftar alamat"]').getByText('Utama', { exact: true }).count()) === 1);
await cards.filter({ hasText: 'Kantor' }).getByRole('button', { name: /Jadikan Utama/ }).click(); await wait(900);
check('Jadikan Utama → Kantor di urutan pertama', (await cards.first().innerText()).includes('Kantor'));
await cards.first().getByRole('button', { name: /Hapus/ }).click(); await wait(300);
check('Konfirmasi hapus alamat utama', (await p.getByText('Alamat lain akan otomatis menjadi alamat utama.').count()) === 1);
await p.getByRole('dialog').getByRole('button', { name: 'Hapus' }).click(); await wait(900);
check('Dihapus → 3 alamat, tetap ada satu Utama', (await cards.count()) === 3 && (await p.locator('ul[aria-label="Daftar alamat"]').getByText('Utama', { exact: true }).count()) === 1);
const coords = await db((getTables) => getTables('addresses').addresses.find((a) => a.label === 'Kos'));
check('Koordinat pin tersimpan (BR-12)', Number.isFinite(coords?.latitude) && Number.isFinite(coords?.longitude), JSON.stringify(coords));
await p.goto(`${B}/produk/1`); await wait(700);
await p.getByRole('button', { name: 'Tambah ke Keranjang' }).click(); await wait(200);
await p.goto(`${B}/checkout`); await wait(900);
await p.getByRole('radio', { name: 'Delivery' }).click(); await wait(300);
const primaryNow = await db((getTables) => getTables('addresses').addresses.find((a) => a.user_id === 1 && a.is_primary).label);
check('Checkout delivery memakai alamat utama saat ini', primaryNow === 'Rumah' && (await p.locator('main').innerText()).includes('Jl. Melati No. 12'), `${primaryNow}`);

// ── C-21 Voucher & Poin
await p.goto(`${B}/akun/voucher-poin`); await wait(900);
const vlist = p.locator('ul[aria-label="Voucher saya"] > li');
check('C-21: WEEKEND15 bisa dipakai + tombol Pakai → produk', (await vlist.filter({ hasText: 'WEEKEND15' }).innerText()).includes('Bisa dipakai')
  && (await vlist.filter({ hasText: 'WEEKEND15' }).getByRole('link', { name: /Pakai/ }).getAttribute('href')) === '/produk/4');
check('C-21: CROISSANT20 tidak berlaku, tanpa tombol Pakai', (await vlist.filter({ hasText: 'CROISSANT20' }).innerText()).includes('Tidak berlaku') && (await vlist.filter({ hasText: 'CROISSANT20' }).getByRole('link').count()) === 0);
check('C-21: level member (tanpa manfaat karangan)', (await p.getByRole('heading', { name: 'Level Member' }).count()) === 1 && (await p.getByText('Level kamu').count()) === 1);
await p.getByRole('tab', { name: 'Riwayat Poin' }).click(); await wait(600);
const hist = await p.locator('ul[aria-label="Riwayat poin"]').innerText();
check('Riwayat Poin: ?tab=poin, poin ditukar & dikembalikan tercatat', p.url().endsWith('?tab=poin') && hist.includes('Ditukar saat checkout') && hist.includes('Dikembalikan (pesanan batal)') && hist.includes(order1), hist.slice(0, 200));

// ── C-23 Wishlist
await p.goto(`${B}/akun/wishlist`); await wait(900);
const wcards = p.locator('ul[aria-label="Produk wishlist"] > li');
check('C-23: 2 produk wishlist contoh', (await wcards.count()) === 2);
await wcards.first().getByRole('button', { name: /wishlist/i }).click(); await wait(800);
check('Hapus dari wishlist → hilang + toast', (await wcards.count()) === 1 && (await p.getByText(/dihapus dari wishlist/).count()) === 1);
await wcards.first().getByRole('button', { name: /wishlist/i }).click(); await wait(800);
check('Wishlist kosong → "Simpan favoritmu di sini"', (await p.getByText('Simpan favoritmu di sini').count()) === 1);
await p.reload(); await wait(900);
check('Refresh: wishlist tetap kosong', (await p.getByText('Simpan favoritmu di sini').count()) === 1);

// ── Hak akses: data akun hanya untuk peran pelanggan (requireMockRole, pengganti requireRole API)
const denied = await p.evaluate(async () => {
  const { default: store } = await import('/src/stores/useAuthStore.js');
  const prev = store.getState().user;
  store.setState({ user: { user_id: 2, role: 'staf', name: 'Budi Staf' } });
  const svc = await import('/src/services/notificationService.js');
  const out = await svc.getMyNotifications().then(() => 'ok', (e) => e.message);
  store.setState({ user: prev });
  return out;
});
check('Staf memanggil notifikasi pelanggan → ditolak', denied === 'Akses ditolak untuk peran ini', denied);
console.log(res.map((r) => r.join(' ')).join('\n'));
console.log(`${res.filter((r) => r[0] === '✓').length}/${res.length} lulus; errors: ${errors.length ? errors.join('\n') : 'none'}`);
await b.close();
