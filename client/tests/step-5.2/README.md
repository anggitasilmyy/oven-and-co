# Uji Step 5.2 (C-11 Custom Cake Builder) — skrip Playwright

Sama seperti `tests/step-5.1`: skrip uji sementara sampai Vitest dipasang di Step 7, tanpa menambah
dependensi `package.json`, memakai dev server mode mock.

```bash
cd client && cp .env.example .env && npx vite --port 5173   # terminal 1 (VITE_USE_MOCK=true)
cd client/tests/step-5.2                                     # terminal 2
npm i --no-save playwright   # atau pakai Playwright global (NODE_PATH)
CHROMIUM_PATH=/path/ke/chromium node func.e2e.mjs            # aturan murni + alur 6 langkah + keranjang + regresi
CHROMIUM_PATH=... node visual.e2e.mjs ./hasil                # overflow 360–1920 px tiap langkah + screenshot
```

Skenario uji manual:

| Aturan | Langkah | Hasil yang diharapkan |
|---|---|---|
| FR-10 Lanjut nonaktif | Buka `/custom-cake`, jangan pilih ukuran | Tombol Lanjut nonaktif, "Pilih salah satu opsi untuk lanjut" |
| Harga berjalan (SPEC §5) | Pilih Diameter 20 cm, Hati, Red Velvet, Whipped cream | Total Rp 450.000 → Rp 750.000 (dasar + Σ extra_price) |
| Kembali ke langkah | Klik lingkaran langkah 1 di stepper / "Ubah" di ringkasan | Langkah terbuka, pilihan lain tetap tersimpan |
| Tulisan maks. 30 | Ketik lebih dari 30 karakter | Input berhenti di 30, penghitung 30/30 |
| BR-02 H+3 | Buka langkah Tanggal | Hari ini s.d. H+2 dicoret & nonaktif; H+3 terpilih otomatis |
| Tambah ke Keranjang | Klik di langkah Tanggal | Toast "Ditambahkan ke keranjang", badge keranjang +1, item punya `design_id` & `preferred_date` |
| FR-04 | Desain sebagai tamu lalu masuk | Item custom cake tetap ada di keranjang akun |
