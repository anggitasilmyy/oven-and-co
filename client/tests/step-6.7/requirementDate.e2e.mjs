// Uji CR-03 CP7 · §B4 "Kebutuhan bahan": T ≤ D ≤ T + 29 (WIB) — tanggal di luar jendela dinonaktifkan di UI; API menolak 400.
// Menjalankan AD-07 tab Kebutuhan Bahan di peramban berzona waktu BUKAN WIB (default Pacific/Kiritimati, UTC+14) agar
// terbukti batas dipakai dari `window` server (WIB), bukan tanggal perangkat. Prasyarat: server API + Vite mode API.
// Jalankan: BASE=http://localhost:5174 API=http://localhost:4000/api node tests/step-6.7/requirementDate.e2e.mjs
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright/index.js'); }
const B = process.env.BASE ?? 'http://localhost:5174';
const API = process.env.API ?? 'http://localhost:4000/api';
const TZ = process.env.TZ_BROWSER ?? 'Pacific/Kiritimati';
const res = [];
const check = (n, ok, x = '') => res.push([ok, `${ok ? '✓' : '✗'} ${n}${ok ? '' : ` — ${x}`}`]);
const wibToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
const plus = (key, n) => { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const b = await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: TZ });
await c.addInitScript(() => localStorage.setItem('ovenco_onboarding_done', '1'));
const p = await c.newPage();
await p.goto(`${B}/admin/login`); await p.waitForTimeout(500);
await p.fill('#admin-login-identifier', 'staf@demo.com'); await p.fill('#admin-login-password', 'demo1234');
await p.click('#admin-login-submit-btn'); await p.waitForTimeout(1200);
await p.goto(`${B}/admin/stok?tab=kebutuhan`);
await p.getByRole('heading', { name: /^Stok dialokasikan/ }).waitFor({ timeout: 10000 });
const deviceToday = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
const input = p.getByLabel('Hitung sampai tanggal');

// 1. Batas picker = WIB T … T+29 (bukan tanggal perangkat); di luar jendela tidak sah (dinonaktifkan pemilih tanggal)
const [min, max] = [await input.getAttribute('min'), await input.getAttribute('max')];
check(`min = hari ini WIB (${wibToday}); perangkat ${TZ} = ${deviceToday}`, min === wibToday, min);
check('max = T + 29 (WIB)', max === plus(wibToday, 29), max);
const validity = (v) => input.evaluate((el, value) => {
  el.value = value;
  return { under: el.validity.rangeUnderflow, over: el.validity.rangeOverflow, valid: el.checkValidity() };
}, v);
const before = await validity(plus(wibToday, -1));
const after = await validity(plus(wibToday, 30));
check('T − 1 dinonaktifkan (rangeUnderflow)', before.under && !before.valid, JSON.stringify(before));
check('T + 30 dinonaktifkan (rangeOverflow)', after.over && !after.valid, JSON.stringify(after));
check('T dan T + 29 sah', (await validity(wibToday)).valid && (await validity(plus(wibToday, 29))).valid);
await input.fill(wibToday); await p.waitForTimeout(800); // pulihkan nilai sebelum memilih

// 2. Tanggal sah tetap bisa dipilih → data dihitung untuk tanggal itu
for (const n of [1, 29]) {
  const d = plus(wibToday, n);
  await input.fill(d); await p.waitForTimeout(1200);
  const h = await p.getByRole('heading', { name: /^Stok dialokasikan/ }).innerText();
  check(`pilih T + ${n} → dihitung s.d. tanggal itu`, (await input.inputValue()) === d && !(await p.getByText(/Tanggal (di luar rentang|tidak valid)\./).count()), h);
}

// 3. API tetap menolak di luar rentang (token sesi peramban)
const token = await p.evaluate(async () => (await import('/src/stores/useAuthStore.js')).default.getState().token);
for (const [d, msg] of [[plus(wibToday, -1), 'Tanggal di luar rentang.'], [plus(wibToday, 30), 'Tanggal di luar rentang.'], ['2026-02-30', 'Tanggal tidak valid.']]) {
  const r = await fetch(`${API}/admin/material-requirements?date=${d}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await r.json();
  check(`API ${d} → 400 "${msg}"`, r.status === 400 && body.message === msg, `${r.status} ${body.message}`);
}
for (const d of [wibToday, plus(wibToday, 29)]) {
  const r = await fetch(`${API}/admin/material-requirements?date=${d}`, { headers: { Authorization: `Bearer ${token}` } });
  check(`API ${d} → 200`, r.status === 200, String(r.status));
}
// UI: tanggal di luar rentang yang diketik manual → pesan 400 dari API ditampilkan
await input.fill(plus(wibToday, 30)); await p.waitForTimeout(1200);
check('UI: ketik T + 30 → "Tanggal di luar rentang."', await p.getByText('Tanggal di luar rentang.').isVisible());

await b.close();
console.log(res.map(([, line]) => line).join('\n'));
const failed = res.filter(([ok]) => !ok).length;
console.log(`${res.length - failed}/${res.length} lulus`);
process.exit(failed ? 1 : 0);
