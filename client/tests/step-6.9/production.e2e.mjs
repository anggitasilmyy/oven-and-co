// Uji CR-04b CP5 · FR-45, FR-46 · UC-36, UC-37 · AD-13 di peramban, mode mock atau API (database uji boleh berubah):
// 1. Navigasi & akses: menu Produksi (Staf & Owner, K09), keterangan K13, pelanggan diarahkan keluar; tanpa overflow.
// 2. WO: validasi form, acuan perencanaan hanya baca (K10), buat Draft (WO-YYMMDD-NNN), ubah Draft, mulai (snapshot resep).
// 3. Pengeluaran bahan: catat (stok berkurang tepat), duplikat ditolak, koreksi (alasan wajib, Δ), pembalik (BR-26, BR-30).
// 4. Selesaikan WO + standar/aktual/selisih (AC-46.5), koreksi & pembalik hasil (§8.2), stok produk ready tetap (K13).
// 5. Batalkan WO Draft; AD-07 riwayat mutasi memuat pengeluaran produksi; error state WO tidak ditemukan.
// Jalankan: BASE=http://localhost:5173 WIDTH=1440 node tests/step-6.9/production.e2e.mjs   (mode API: BASE=http://localhost:5174)
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright/index.js'); }
const B = process.env.BASE ?? 'http://localhost:5173';
const W = Number(process.env.WIDTH ?? 1440);
const res = []; const errors = [];
const check = (n, ok, x = '') => res.push([ok, `${ok ? '✓' : '✗'} [${W}] ${n}${ok ? '' : ` — ${x}`}`]);

const b = await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const c = await b.newContext({ viewport: { width: W, height: 900 }, timezoneId: 'Asia/Jakarta' });
await c.addInitScript(() => localStorage.setItem('ovenco_onboarding_done', '1'));
const p = await c.newPage();
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => m.type() === 'error' && !/status of 40[049]/.test(m.text()) && errors.push(m.text()));
const wait = (ms) => p.waitForTimeout(ms);
const dialog = () => p.getByRole('dialog');
const mainText = () => p.locator('main').innerText();
const section = (label) => p.getByRole('region', { name: label, exact: true });
const noOverflow = () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const logout = () => p.evaluate(async () => (await import('/src/stores/useAuthStore.js')).default.getState().logout());
const login = async (path, id, email) => {
  await p.goto(`${B}${path}`); await wait(500);
  await p.fill(`#${id}-identifier`, email); await p.fill(`#${id}-password`, 'demo1234');
  await p.click(`#${id}-submit-btn`); await wait(1200);
};
const stockOf = (name) => p.evaluate(async (n) => (await (await import('/src/services/stockService.js')).getRawMaterials()).rows.find((m) => m.name === n)?.stock, name);
const readyBoard = () => p.evaluate(async () => JSON.stringify((await (await import('/src/services/stockService.js')).getDailyStocks()).rows));
const cents = (v) => Math.round(v * 1000);
const FLOUR = 'Tepung terigu protein tinggi';
const PRODUCT = 'Classic Butter Croissant';
const flourOption = `${FLOUR} (kg) · resep`;

// ── 1. Navigasi & akses
await login('/admin/login', 'admin-login', 'staf@demo.com');
if (W < 1024) { await p.getByRole('button', { name: 'Buka menu' }).click(); await wait(300); }
await p.getByRole('link', { name: 'Produksi', exact: true }).first().click(); await wait(1200);
const listText = await mainText();
check('menu Produksi → /admin/produksi (Staf), AD-13', p.url().endsWith('/admin/produksi') && listText.includes('AD-13'));
check('keterangan K13: hasil tidak menambah stok jual', listText.includes('tidak menambah stok produk siap jual'));
check('daftar WO atau empty state', listText.includes('Belum ada work order') || /WO-\d{6}-\d{3}/.test(listText));
check('tanpa overflow horizontal (daftar WO)', await noOverflow());
const board0 = await readyBoard();
// Komposisi produk uji ditetapkan sendiri (database uji mode API dapat sudah diubah uji lain): tepung 0,060 · butter 0,015
await p.evaluate(async ([product, names]) => {
  const products = (await (await import('/src/services/adminProductService.js')).getAdminProducts()).rows;
  const materials = (await (await import('/src/services/stockService.js')).getRawMaterials()).rows;
  const id = (n) => String(materials.find((m) => m.name === n).material_id);
  await (await import('/src/services/recipeService.js')).saveProductRecipe(products.find((x) => x.name === product).product_id,
    [{ material_id: id(names[0]), qty_per_unit: '0.060' }, { material_id: id(names[1]), qty_per_unit: '0.015' }]);
}, [PRODUCT, [FLOUR, 'Butter Prancis']]);

// ── 2. Buat WO Draft
await p.getByRole('button', { name: 'Buat WO' }).click(); await wait(800);
check('acuan perencanaan hanya baca tampil (K10)', (await dialog().innerText()).includes('Acuan perencanaan'));
await dialog().locator('#wo-product').selectOption({ label: PRODUCT });
await dialog().getByRole('button', { name: 'Simpan Draft' }).click(); await wait(300);
check('validasi: jumlah rencana wajib bilangan bulat', (await dialog().innerText()).includes('Harus bilangan bulat 1'));
await p.fill('#wo-qty', '10');
await dialog().getByRole('button', { name: 'Simpan Draft' }).click(); await wait(1500);
let detail = await mainText();
const woNumber = detail.match(/WO-\d{6}-\d{3}/)?.[0];
check('WO Draft dibuat → detail (nomor WO-YYMMDD-NNN, Draft)', Boolean(woNumber) && p.url().includes('wo=') && detail.includes('Draft'), detail.slice(0, 200));
await p.getByRole('button', { name: 'Ubah', exact: true }).click(); await wait(600);
await p.fill('#wo-qty', '12');
await dialog().getByRole('button', { name: 'Simpan Draft' }).click(); await wait(1200);
check('ubah Draft: rencana 12', (await section('Work order ' + woNumber).innerText()).includes('12'));
await p.getByRole('button', { name: 'Mulai produksi' }).click(); await wait(300);
await dialog().getByRole('button', { name: 'Mulai', exact: true }).click(); await wait(1200);
detail = await mainText();
check('mulai → Diproses, Ubah hilang, resep dibekukan (bahan resep di tabel)', detail.includes('Diproses') && (await p.getByRole('button', { name: 'Ubah', exact: true }).count()) === 0 && (await section('Pemakaian bahan').innerText()).includes(FLOUR));

// ── 3. Pengeluaran bahan
const flour0 = await stockOf(FLOUR);
await p.getByRole('button', { name: 'Catat pengeluaran' }).click(); await wait(400);
await dialog().locator('select').first().selectOption({ label: flourOption });
await dialog().getByLabel('Jumlah (kg)').first().fill('0,8');
await dialog().getByRole('button', { name: 'Tambah bahan' }).click();
await dialog().locator('select').nth(1).selectOption({ label: flourOption });
await dialog().getByLabel('Jumlah').nth(1).fill('1');
await dialog().getByRole('button', { name: 'Simpan pengeluaran' }).click(); await wait(300);
check('bahan ganda ditolak', (await dialog().innerText()).includes('Bahan sudah ada di dokumen'));
await dialog().getByRole('button', { name: 'Hapus bahan 2' }).click();
await dialog().getByRole('button', { name: 'Simpan pengeluaran' }).click(); await wait(1500);
const flour1 = await stockOf(FLOUR);
check('pengeluaran 0,8 kg: stok −0,8', cents(flour0) - cents(flour1) === 800, `${flour0} → ${flour1}`);
const issues = () => section('Riwayat pengeluaran bahan');
await issues().getByRole('button', { name: 'Koreksi' }).first().click(); await wait(400);
await dialog().getByLabel('Jumlah (kg)').first().fill('0,72');
await dialog().getByRole('button', { name: 'Simpan koreksi' }).click(); await wait(300);
check('koreksi tanpa alasan → alasan wajib', (await dialog().innerText()).includes('Alasan wajib diisi'));
await dialog().getByLabel('Alasan koreksi').fill('Salah timbang');
await dialog().getByRole('button', { name: 'Simpan koreksi' }).click(); await wait(1500);
const flour2 = await stockOf(FLOUR);
check('koreksi 0,8 → 0,72: stok +0,08, dokumen asal tidak berlaku lagi', cents(flour2) - cents(flour1) === 80 && (await issues().innerText()).includes('tidak berlaku lagi'), `${flour1} → ${flour2}`);
check('pemakaian aktual 0,72 kg', (await section('Pemakaian bahan').innerText()).includes('0,72'));

// ── 4. Selesaikan WO + hasil
await p.getByRole('button', { name: 'Selesaikan WO' }).click(); await wait(400);
check('dialog selesai memuat keterangan K13', (await dialog().innerText()).includes('tidak menambah stok produk siap jual'));
await dialog().getByLabel(/Jumlah hasil/).fill('12');
await dialog().getByRole('button', { name: 'Selesaikan WO' }).click(); await wait(1500);
detail = await mainText();
const usage = await section('Pemakaian bahan').innerText();
check('WO Selesai, hasil bersih 12, aksi WO hilang', detail.includes('Selesai') && (await p.getByRole('button', { name: 'Catat pengeluaran' }).count()) === 0);
check('standar tepung 0,06 × 12 = 0,72; selisih 0 (AC-46.5)', /Tepung terigu protein tinggi\s+0,72 kg\s+0,72 kg\s+0 kg/.test(usage), usage.slice(0, 300));
const outputs = () => section('Riwayat hasil produksi');
await outputs().getByRole('button', { name: 'Koreksi' }).click(); await wait(400);
await dialog().getByLabel('Jumlah hasil yang benar').fill('10');
await dialog().getByLabel('Alasan koreksi').fill('Dua rusak');
await dialog().getByRole('button', { name: 'Simpan koreksi' }).click(); await wait(1500);
const out1 = await outputs().innerText();
check('koreksi hasil 12 → 10: pembalik + pengganti, standar ikut 0,6', out1.includes('Pembalik hasil') && out1.includes('Koreksi hasil (pengganti)') && (await section('Pemakaian bahan').innerText()).includes('0,6 kg'), out1);
await outputs().getByRole('button', { name: 'Balik' }).click(); await wait(400);
await dialog().getByLabel('Alasan').fill('Seluruh hasil gagal');
await dialog().getByRole('button', { name: 'Balik hasil' }).click(); await wait(1500);
check('pembalik hasil → hasil bersih 0, tidak ada dokumen berlaku (terminal)', (await outputs().getByRole('button').count()) === 0);
check('stok produk ready tidak berubah (K13)', (await readyBoard()) === board0);
check('tanpa overflow horizontal (detail WO)', await noOverflow());
await p.getByRole('button', { name: 'Balik' }).first().click(); await wait(400);
await dialog().getByLabel('Alasan').fill('Bahan dikembalikan');
await dialog().getByRole('button', { name: 'Balik pengeluaran' }).click(); await wait(1500);
check('pembalik pengeluaran pada WO Selesai: stok kembali', (await stockOf(FLOUR)) === flour0, `${flour0} vs ${await stockOf(FLOUR)}`);

// ── 5. Batal, AD-07, error, akses
await p.getByRole('button', { name: 'Kembali ke daftar WO' }).click(); await wait(1000);
await p.getByRole('button', { name: 'Buat WO' }).click(); await wait(800);
await p.fill('#wo-qty', '5'); await dialog().getByRole('button', { name: 'Simpan Draft' }).click(); await wait(1500);
await p.getByRole('button', { name: 'Batalkan WO' }).click(); await wait(300);
await dialog().getByRole('button', { name: 'Batalkan WO' }).click(); await wait(1200);
check('WO Draft dibatalkan → Dibatalkan, tanpa aksi', (await mainText()).includes('Dibatalkan') && (await p.getByRole('button', { name: 'Mulai produksi' }).count()) === 0);
await p.goto(`${B}/admin/stok?tab=bahan`); await wait(1500);
await p.getByRole('button', { name: `Riwayat mutasi ${FLOUR}` }).first().click(); await wait(1200);
const hist = await dialog().innerText();
check('riwayat mutasi AD-07 memuat pengeluaran produksi', hist.includes('(Produksi)'), hist.slice(0, 300));
await dialog().getByRole('button', { name: 'Tutup' }).last().click(); await wait(300);
await p.goto(`${B}/admin/produksi?wo=987654321`); await wait(1500);
check('WO tidak ditemukan → error state + Coba lagi', (await mainText()).includes('tidak ditemukan') && (await p.getByRole('button', { name: /Coba lagi/ }).count()) === 1);
await logout(); await login('/admin/login', 'admin-login', 'owner@demo.com');
await p.goto(`${B}/admin/produksi`); await wait(1200);
check('Owner membuka AD-13 (K09)', (await mainText()).includes('AD-13') && (await mainText()).includes(woNumber ?? '-'));
await logout(); await login('/masuk', 'masuk', 'pelanggan@demo.com');
await p.goto(`${B}/admin/produksi`); await wait(1200);
check('pelanggan diarahkan keluar dari AD-13', !p.url().includes('/admin/produksi'), p.url());

console.log(res.map((r) => r[1]).join('\n'));
console.log(`\n${res.filter((r) => r[0]).length}/${res.length} lulus`);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await b.close();
process.exit(res.some((r) => !r[0]) || errors.length ? 1 : 0);
