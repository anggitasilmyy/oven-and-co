# Uji Step 5.1 (C-06 – C-10) — skrip Playwright

Skrip uji sementara sampai Vitest dipasang di Step 7. Tidak menambah dependensi `package.json`;
memakai Playwright yang terpasang global dan dev server mode mock.

```bash
cd client && cp .env.example .env && npx vite --port 5173   # terminal 1 (VITE_USE_MOCK=true)
cd client/tests/step-5.1                                     # terminal 2
npm i --no-save playwright   # atau pakai Playwright global (NODE_PATH)
CHROMIUM_PATH=/path/ke/chromium node unit.e2e.mjs   # fungsi murni (utils/rules, catalogQuery)
CHROMIUM_PATH=... node cart.e2e.mjs                 # identitas item keranjang & persistensi wishlist
CHROMIUM_PATH=... node func.e2e.mjs                 # alur fungsional C-06 – C-10 + regresi Step 3–4
CHROMIUM_PATH=... node visual.e2e.mjs ./shots       # overflow 375/768/1024/1440/1920 + screenshot
```

`CHROMIUM_PATH` boleh dikosongkan bila Playwright sudah mengunduh browsernya sendiri.
Uji pre-order mengikuti jam perangkat (batas pukul 17.00, BR-02).
