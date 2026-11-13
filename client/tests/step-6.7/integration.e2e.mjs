// Uji CR-03 CP8 · integrasi lintas CP (AD-06 ↔ AD-07) di peramban, mode mock atau API (prasyarat sama dengan
// requirementDate.e2e.mjs; mode API memakai database uji yang boleh berubah):
// 1. FR-39 → FR-40: ubah takaran Butter pada Komposisi Classic Butter Croissant (modal AD-06) → total kebutuhan Butter di
//    tab Kebutuhan Bahan bertambah tepat Δtakaran × rencana croissant hari ini (BR-14/BR-15, tanpa pembulatan).
// 2. AC-40.12: Catat Stok Masuk Butter di tab Bahan Baku → stok & sisa di Kebutuhan Bahan ikut bertambah.
// 3. Hak akses: Owner & Staf membuka AD-06/AD-07; pelanggan diarahkan keluar dari admin dan service ditolak.
// 4. CR-04a CP6: teks keterangan wajib tab Kebutuhan Bahan yang tampil = E-6 versi CR-04a (teks aktif SPEC bagian 10).
// Jalankan: BASE=http://localhost:5173 node tests/step-6.7/integration.e2e.mjs   (mode API: BASE=http://localhost:5174)
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright/index.js'); }
const B = process.env.BASE ?? 'http://localhost:5173';
const res = []; const errors = [];
const check = (n, ok, x = '') => res.push([ok, `${ok ? '✓' : '✗'} ${n}${ok ? '' : ` — ${x}`}`]);
const milli = (n) => Math.round(Number(n) * 1000); // nilai respons maks. 3 desimal → bilangan bulat milli

const b = await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Jakarta' });
await c.addInitScript(() => localStorage.setItem('ovenco_onboarding_done', '1'));
const p = await c.newPage();
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => m.type() === 'error' && !/status of 40[03]/.test(m.text()) && errors.push(m.text()));
const logout = () => p.evaluate(async () => (await import('/src/stores/useAuthStore.js')).default.getState().logout());
const loginAdmin = async (email) => {
  await p.goto(`${B}/admin/login`); await p.waitForTimeout(500);
  await p.fill('#admin-login-identifier', email); await p.fill('#admin-login-password', 'demo1234');
  await p.click('#admin-login-submit-btn'); await p.waitForTimeout(1200);
};
const svc = (name, ...args) => p.evaluate(async ([n, a]) => {
  try { return { ok: true, value: await (await import('/src/services/stockService.js'))[n](...a) }; } catch (e) { return { ok: false, error: e.message }; }
}, [name, args]);
const butterOf = async () => {
  const r = await svc('getMaterialRequirements', '');
  return r.value.rows.find((m) => m.name === 'Butter Prancis');
};

await loginAdmin('staf@demo.com');
// Rencana croissant hari ini harus > 0 agar Δ bermakna; bila kosong (mis. seed API berlabuh di tanggal lain) diisi lewat
// fitur Stok Produk Harian AD-07 yang sudah ada.
let croissant = (await svc('getDailyStocks')).value.rows.find((r) => r.name === 'Classic Butter Croissant');
if (!croissant.qty_planned) {
  await svc('updateDailyStocks', [{ product_id: croissant.product_id, qty_planned: Math.max(10, croissant.qty_sold) }]);
  croissant = (await svc('getDailyStocks')).value.rows.find((r) => r.name === 'Classic Butter Croissant');
}
const plan = croissant.qty_planned;
check('rencana croissant hari ini > 0', plan > 0, String(plan));
const before = await butterOf();

// 1. Komposisi → Kebutuhan Bahan
await p.goto(`${B}/admin/produk`);
await p.getByRole('button', { name: 'Komposisi bahan Classic Butter Croissant' }).first().click();
const dialog = p.getByRole('dialog');
await dialog.getByLabel('Bahan 1', { exact: true }).waitFor({ timeout: 10000 });
const butterIndex = await dialog.locator('select').evaluateAll((els) => els.findIndex((el) => el.selectedOptions[0]?.textContent.startsWith('Butter Prancis')));
const qtyInput = dialog.getByLabel('Takaran').nth(butterIndex);
const oldQty = await qtyInput.inputValue();
const newQty = (milli(oldQty) + 10) / 1000; // + 0,010 kg per pcs
await qtyInput.fill(String(newQty));
await p.getByRole('button', { name: 'Simpan', exact: true }).click(); await p.waitForTimeout(1500);
check('simpan komposisi croissant', (await p.getByRole('dialog').count()) === 0);
const afterRecipe = await butterOf();
check(`Δ total Butter = 0,010 × rencana croissant hari ini (${plan})`, milli(afterRecipe.cumulative_need) - milli(before.cumulative_need) === 10 * plan,
  `${before.cumulative_need} → ${afterRecipe.cumulative_need}`);
check('Δ sisa = −Δ total; stok tetap (BR-15, tidak mengurangi stok)', milli(afterRecipe.remaining) - milli(before.remaining) === -10 * plan && afterRecipe.stock === before.stock);
await p.getByRole('button', { name: 'Komposisi bahan Classic Butter Croissant' }).first().click();
await dialog.getByLabel('Bahan 1', { exact: true }).waitFor();
await dialog.getByLabel('Takaran').nth(butterIndex).fill(oldQty); // pulihkan takaran awal
await p.getByRole('button', { name: 'Simpan', exact: true }).click(); await p.waitForTimeout(1500);
check('takaran dipulihkan → total kembali semula', milli((await butterOf()).cumulative_need) === milli(before.cumulative_need));

// 2. Catat Stok Masuk (AD-07 Bahan Baku) → Kebutuhan Bahan
await p.goto(`${B}/admin/stok?tab=bahan`);
await p.getByRole('button', { name: 'Catat stok masuk Butter Prancis' }).first().click();
await p.fill('#stock-in-qty', '1.25');
await p.getByRole('button', { name: 'Simpan', exact: true }).click(); await p.waitForTimeout(1500);
const afterStock = await butterOf();
check('AC-40.12: stok & sisa +1,25 setelah Catat Stok Masuk', milli(afterStock.stock) - milli(before.stock) === 1250 && milli(afterStock.remaining) - milli(before.remaining) === 1250,
  `${before.stock}/${before.remaining} → ${afterStock.stock}/${afterStock.remaining}`);
await p.goto(`${B}/admin/stok?tab=kebutuhan`);
await p.getByRole('heading', { name: /^Stok dialokasikan/ }).waitFor({ timeout: 10000 });
const cellText = await p.locator('tbody tr', { hasText: 'Butter Prancis' }).innerText();
check('tab Kebutuhan Bahan menampilkan stok terbaru', cellText.includes(`${String(afterStock.stock).replace('.', ',')} kg`), cellText.replace(/\s+/g, ' '));

// 3. Hak akses
await logout();
await loginAdmin('owner@demo.com');
await p.goto(`${B}/admin/stok?tab=kebutuhan`);
check('Owner membuka tab Kebutuhan Bahan', await p.getByRole('heading', { name: /^Stok dialokasikan/ }).isVisible({ timeout: 10000 }).catch(() => false)
  || await p.getByRole('heading', { name: /^Stok dialokasikan/ }).waitFor({ timeout: 10000 }).then(() => true, () => false));
// CR-04a CP6 · E-6 versi CR-04a aktif: teks keterangan wajib yang tampil = konstanta aktif (kalimat penutup baru)
const noteText = (await p.locator('main').innerText()).replace(/\s+/g, ' ');
check('teks keterangan tampil = E-6 versi CR-04a (bukan kalimat CR-03)', noteText.includes('Estimasi ini tidak mengurangi stok bahan; stok hanya berubah lewat Catat Stok Masuk, penerimaan pembelian, stock opname, serta pembalik atau koreksi transaksi tersebut.')
  && !noteText.includes('Stok bahan tidak dikurangi otomatis'));
await logout();
await p.goto(`${B}/masuk`); await p.waitForTimeout(500);
await p.fill('#masuk-identifier', 'pelanggan@demo.com'); await p.fill('#masuk-password', 'demo1234');
await p.click('#masuk-submit-btn'); await p.waitForTimeout(1200);
await p.goto(`${B}/admin/stok?tab=kebutuhan`); await p.waitForTimeout(1500);
check('pelanggan tidak dapat membuka AD-07', !new URL(p.url()).pathname.startsWith('/admin/stok'), p.url());
const denied = await svc('getMaterialRequirements', '');
check('pelanggan: service kebutuhan bahan ditolak', !denied.ok, JSON.stringify(denied).slice(0, 120));

await b.close();
console.log(res.map(([, line]) => line).join('\n'));
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'errors: none');
const failed = res.filter(([ok]) => !ok).length;
console.log(`${res.length - failed}/${res.length} lulus`);
process.exit(failed || errors.length ? 1 : 0);
