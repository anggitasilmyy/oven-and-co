# Uji Step 5.3 (C-12 – C-16 Keranjang, Checkout, Pembayaran) — skrip Playwright

Sama seperti `tests/step-5.1` dan `tests/step-5.2`: tanpa dependensi baru, memakai dev server mode mock.
Jam peramban dikunci ke **Jumat, 16 Okt 2026 pukul 10.00 WIB** (`context.clock`) agar slot waktu, batas
pre-order 17.00, dan timer 30 menit bisa diuji ulang. Jangan isi `VITE_MOCK_TODAY` saat menjalankan uji ini.

```bash
cd client && cp .env.example .env && npx vite --port 5173   # terminal 1 (VITE_USE_MOCK=true)
cd client/tests/step-5.3                                     # terminal 2
CHROMIUM_PATH=/path/ke/chromium node func.e2e.mjs            # aturan murni + 3 skenario checkout + reseed
CHROMIUM_PATH=... node visual.e2e.mjs ./hasil                # overflow 360–1920 px di C-12 – C-16 + screenshot
```

Skenario uji manual (akun `pelanggan@demo.com` / `demo1234`, saldo 1.250 poin):

| Aturan | Langkah | Hasil yang diharapkan |
|---|---|---|
| FR-11 / BR-03 | Keranjang: Croissant ×2, Cookies Box, Birthday Cake (pre-order) | Subtotal Rp 561.000; banner "Semua item akan siap pada …" |
| BR-04 | Tamu menekan Checkout | Diarahkan ke Masuk, lalu kembali ke Checkout dengan keranjang digabung |
| BR-10 | Pakai kode `SALAH` / `CROISSANT20` | "Voucher tidak berlaku untuk pesanan ini" |
| BR-10 | Pakai `WEEKEND15` | Hemat Rp 18.000 (15% Assorted Cookies Box) |
| BR-09 | Aktifkan tukar poin | 1.200 poin = Rp 60.000; total Rp 483.000 |
| BR-12 | Delivery → alamat Rumah Orang Tua | "Di luar radius pengiriman 10 km", Pilih Pembayaran nonaktif |
| BR-05 | Metode Pembayaran untuk pesanan pre-order | Bayar di Toko nonaktif: "Tidak tersedia untuk pre-order dan delivery" |
| BR-06 | Bayar online, tunggu 30 menit | "Waktu pembayaran habis, pesanan dibatalkan otomatis"; stok, voucher, poin kembali |
| FR-14 | Simulasikan Lunas (dev) | Pesanan Berhasil, status Dikonfirmasi, "+N poin akan masuk setelah pesanan selesai" |
| FR-15 | Keranjang ready saja + Pickup → Bayar di Toko | Langsung Dikonfirmasi, kode pickup, "Bayar saat ambil" |
| TF-12 | Buat pesanan berisi produk ready | Sisa stok hari ini berkurang; kembali bila pesanan dibatalkan |
