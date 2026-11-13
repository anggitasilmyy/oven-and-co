// Uji CR-04a CP6 · FR-41 – FR-44 · UC-33 – UC-35 · AD-12 & AD-07 di peramban, mode mock atau API (database uji boleh berubah):
// 1. Navigasi & akses: menu Pembelian (Staf & Owner), pelanggan diarahkan keluar; tanpa overflow horizontal.
// 2. Supplier: validasi form, tambah supplier + bahan (FR-41).
// 3. PO: buat Draft (nilai PO), pesan, terima sebagian, kelebihan ditolak, terima sisa → Diterima, koreksi & pembalik
//    penerimaan; stok bahan ikut berubah tepat (FR-42, FR-43, BR-20, BR-21, BR-30).
// 4. AD-07: riwayat mutasi memuat penerimaan PO; stock opname (selisih); stok masuk lalu Balik dari riwayat (FR-44, BR-35).
// 5. Error state (PO tidak ditemukan) & empty state riwayat.
// Jalankan: BASE=http://localhost:5173 WIDTH=1440 node tests/step-6.8/purchasing.e2e.mjs   (mode API: BASE=http://localhost:5174)
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright/index.js'); }
const B = process.env.BASE ?? 'http://localhost:5173';
const W = Number(process.env.WIDTH ?? 1440);
const res = []; const errors = [];
const check = (n, ok, x = '') => res.push([ok, `${ok ? '✓' : '✗'} [${W}] ${n}${ok ? '' : ` — ${x}`}`]);
const tag = `${W}-${Date.now() % 100000}`;

const b = await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const c = await b.newContext({ viewport: { width: W, height: 900 }, timezoneId: 'Asia/Jakarta' });
await c.addInitScript(() => localStorage.setItem('ovenco_onboarding_done', '1'));
const p = await c.newPage();
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => m.type() === 'error' && !/status of 40[049]/.test(m.text()) && errors.push(m.text()));
const wait = (ms) => p.waitForTimeout(ms);
const dialog = () => p.getByRole('dialog');
const mainText = () => p.locator('main').innerText();
const noOverflow = () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const logout = () => p.evaluate(async () => (await import('/src/stores/useAuthStore.js')).default.getState().logout());
const login = async (path, id, email) => {
  await p.goto(`${B}${path}`); await wait(500);
  await p.fill(`#${id}-identifier`, email); await p.fill(`#${id}-password`, 'demo1234');
  await p.click(`#${id}-submit-btn`); await wait(1200);
};
const stockOf = (name) => p.evaluate(async (n) => (await (await import('/src/services/stockService.js')).getRawMaterials()).rows.find((m) => m.name === n)?.stock, name);
const toast = async () => { try { return await p.getByRole('alert').last().innerText({ timeout: 3000 }); } catch { return ''; } };

// ── 1. Navigasi & akses
await login('/admin/login', 'admin-login', 'staf@demo.com');
if (W < 1024) { await p.getByRole('button', { name: 'Buka menu' }).click(); await wait(300); }
await p.getByRole('link', { name: 'Pembelian' }).first().click(); await wait(1200);
check('menu Pembelian → /admin/pembelian (Staf)', p.url().endsWith('/admin/pembelian') && (await mainText()).includes('AD-12'));
const poText = await mainText();
check('tab PO: daftar atau empty state', poText.includes('Belum ada purchase order') || poText.includes('Nomor PO') || /PO-\d{6}-\d{3}/.test(poText));
check('tanpa overflow horizontal (daftar PO)', await noOverflow());

// ── 2. Supplier
await p.getByRole('tab', { name: 'Supplier' }).click(); await wait(900);
check('tab Supplier di URL', p.url().includes('tab=supplier'));
await p.getByRole('button', { name: 'Tambah Supplier' }).click(); await wait(300);
await dialog().getByRole('button', { name: 'Simpan supplier' }).click(); await wait(300);
check('validasi form supplier (nama wajib)', (await dialog().innerText()).toLowerCase().includes('wajib'));
const supplierName = `Supplier Uji ${tag}`;
await p.fill('#supplier-name', supplierName); await p.fill('#supplier-phone', '+6281234567890');
await p.fill('#supplier-email', 'uji@contoh.id'); await p.fill('#supplier-contact_person', 'Bu Sari'); await p.fill('#supplier-address', 'Jl. Uji 1');
await dialog().getByLabel(/^Butter Prancis/).check(); await dialog().getByLabel(/^Telur ayam/).check();
await dialog().getByRole('button', { name: 'Simpan supplier' }).click(); await wait(1200);
check('supplier tersimpan & tampil', (await mainText()).includes(supplierName), await toast());
check('tanpa overflow horizontal (supplier)', await noOverflow());

// ── 3. PO Draft → Dipesan → penerimaan
await p.getByRole('tab', { name: 'Purchase Order' }).click(); await wait(900);
await p.getByRole('button', { name: 'Buat PO' }).click(); await wait(400);
await dialog().locator('#po-supplier').selectOption({ label: supplierName }); await wait(200);
await dialog().locator('select').nth(1).selectOption({ label: 'Butter Prancis (kg)' });
await dialog().getByLabel('Jumlah').first().fill('10'); await dialog().getByLabel('Harga satuan (Rp)').first().fill('15000');
check('nilai PO dihitung (Rp 150.000)', (await dialog().innerText()).includes('Rp 150.000'));
await dialog().getByRole('button', { name: 'Simpan Draft' }).click(); await wait(1500);
const detailText = await mainText();
const poNumber = detailText.match(/PO-\d{6}-\d{3}/)?.[0];
check('PO Draft dibuat → detail (nomor PO, status Draft)', Boolean(poNumber) && p.url().includes('po=') && detailText.includes('Draft'), detailText.slice(0, 200));
await p.getByRole('button', { name: 'Pesan ke supplier' }).click(); await wait(300);
await dialog().getByRole('button', { name: 'Pesan', exact: true }).click(); await wait(1200);
check('PO dipesan → status Dipesan, tombol Ubah hilang', (await mainText()).includes('Dipesan') && (await p.getByRole('button', { name: 'Ubah', exact: true }).count()) === 0);

const butter0 = await stockOf('Butter Prancis');
await p.getByRole('button', { name: 'Terima barang' }).click(); await wait(400);
await dialog().getByLabel('Jumlah (kg)').fill('4');
await dialog().getByRole('button', { name: 'Simpan penerimaan' }).click(); await wait(1500);
const butter1 = await stockOf('Butter Prancis');
check('terima sebagian 4 kg → Diterima Sebagian, stok +4', (await mainText()).includes('Diterima Sebagian') && Math.round((butter1 - butter0) * 100) === 400, `${butter0} → ${butter1}`);
await p.getByRole('button', { name: 'Terima barang' }).click(); await wait(400);
await dialog().getByLabel('Jumlah (kg)').fill('7');
await dialog().getByRole('button', { name: 'Simpan penerimaan' }).click(); await wait(1200);
check('kelebihan dari sisa (7 > 6) ditolak, dialog tetap terbuka, stok tetap', (await dialog().count()) === 1 && (await stockOf('Butter Prancis')) === butter1, await dialog().innerText().catch(() => ''));
await dialog().getByLabel('Jumlah (kg)').fill('6');
await dialog().getByRole('button', { name: 'Simpan penerimaan' }).click(); await wait(1500);
const butter2 = await stockOf('Butter Prancis');
check('terima sisa 6 kg → Diterima, stok +6', (await mainText()).includes('Diterima') && !(await mainText()).includes('Diterima Sebagian') && Math.round((butter2 - butter1) * 100) === 600);
check('tanpa overflow horizontal (detail PO)', await noOverflow());

// koreksi penerimaan pertama 4 → 3 (stok −1), lalu balik penerimaan kedua (stok −6)
await p.getByRole('button', { name: 'Koreksi' }).first().click(); await wait(400);
await dialog().getByLabel('Jumlah (kg)').fill('3');
await dialog().getByRole('button', { name: 'Simpan koreksi' }).click(); await wait(300);
check('koreksi tanpa alasan → alasan wajib', (await dialog().innerText()).includes('Alasan wajib diisi'));
await dialog().getByLabel('Alasan koreksi').fill('Salah hitung');
await dialog().getByRole('button', { name: 'Simpan koreksi' }).click(); await wait(1500);
const butter3 = await stockOf('Butter Prancis');
check('koreksi 4 → 3: stok −1, status Diterima Sebagian', Math.round((butter2 - butter3) * 100) === 100 && (await mainText()).includes('Diterima Sebagian'), `${butter2} → ${butter3}`);
await p.getByRole('button', { name: 'Balik' }).first().click(); await wait(400);
await dialog().getByLabel('Alasan').fill('Barang dikembalikan');
await dialog().getByRole('button', { name: 'Balik penerimaan' }).click(); await wait(1500);
const butter4 = await stockOf('Butter Prancis');
check('pembalik penerimaan: stok berkurang sejumlah dokumen', butter4 < butter3 && (await mainText()).includes('tidak berlaku lagi'), `${butter3} → ${butter4}`);

// ── 4. AD-07: riwayat, opname, stok masuk + Balik
await p.goto(`${B}/admin/stok?tab=bahan`); await wait(1500);
await p.getByRole('button', { name: 'Riwayat mutasi Butter Prancis' }).first().click(); await wait(1200);
const hist = await dialog().innerText();
check('riwayat mutasi memuat penerimaan, koreksi & pembalik PO', hist.includes('Penerimaan PO') && hist.includes('Koreksi penerimaan') && hist.includes('Pembalik penerimaan'), hist.slice(0, 300));
await dialog().getByRole('button', { name: 'Tutup' }).last().click(); await wait(300);
await p.getByRole('button', { name: 'Stock opname Butter Prancis' }).first().click(); await wait(400);
const counted = (Math.round(butter4 * 100) + 150) / 100;
await dialog().getByLabel(/Stok fisik/).fill(String(counted));
check('opname: pratinjau selisih +1,5', (await dialog().innerText()).includes('+1,5'));
await dialog().getByRole('button', { name: 'Simpan opname' }).click(); await wait(1500);
check('opname tersimpan: stok = hasil hitung', (await stockOf('Butter Prancis')) === counted, String(await stockOf('Butter Prancis')));
await p.getByRole('button', { name: 'Catat stok masuk Butter Prancis' }).first().click(); await wait(300);
await p.fill('#stock-in-qty', '2'); await dialog().getByRole('button', { name: 'Simpan' }).click(); await wait(1200);
await p.getByRole('button', { name: 'Riwayat mutasi Butter Prancis' }).first().click(); await wait(1200);
check('riwayat: opname & stok masuk tercatat', (await dialog().innerText()).includes('Stock opname') && (await dialog().innerText()).includes('Stok masuk'));
await dialog().getByRole('button', { name: 'Balik' }).first().click(); await wait(400);
await dialog().getByLabel('Alasan').fill('Salah input');
await dialog().getByRole('button', { name: 'Balik stok masuk' }).click(); await wait(1500);
check('stok masuk dibalik dari riwayat: stok kembali', (await stockOf('Butter Prancis')) === counted && (await dialog().innerText()).includes('Pembalik stok masuk'));
check('tanpa overflow horizontal (riwayat)', await noOverflow());
await dialog().getByRole('button', { name: 'Tutup' }).last().click(); await wait(300);
await p.getByRole('button', { name: 'Ubah Butter Prancis' }).first().click(); await wait(300);
check('form ubah bahan: stok hanya dibaca', (await p.locator('#material-stock').getAttribute('readonly')) !== null);
await dialog().getByRole('button', { name: 'Batal' }).click(); await wait(200);

// ── 5. Error state & akses
await p.goto(`${B}/admin/pembelian?po=987654321`); await wait(1500);
check('PO tidak ditemukan → error state + Coba lagi', (await mainText()).includes('tidak ditemukan') && (await p.getByRole('button', { name: /Coba lagi/ }).count()) === 1);
await logout(); await login('/admin/login', 'admin-login', 'owner@demo.com');
await p.goto(`${B}/admin/pembelian`); await wait(1200);
check('Owner membuka AD-12', (await mainText()).includes('AD-12') && (await mainText()).includes(poNumber ?? '-'));
await logout(); await login('/masuk', 'masuk', 'pelanggan@demo.com');
await p.goto(`${B}/admin/pembelian`); await wait(1200);
check('pelanggan diarahkan keluar dari AD-12', !p.url().includes('/admin/pembelian'), p.url());

console.log(res.map((r) => r[1]).join('\n'));
console.log(`\n${res.filter((r) => r[0]).length}/${res.length} lulus`);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await b.close();
process.exit(res.some((r) => !r[0]) || errors.length ? 1 : 0);
