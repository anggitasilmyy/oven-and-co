# Uji Step 5.6 (AD-04 Detail & Verifikasi Pesanan · AD-05 Kalender Produksi) — skrip Playwright

Sama seperti `tests/step-5.1` – `5.5`: tanpa dependensi baru, memakai dev server mode mock. Jam peramban dikunci ke
**Jumat, 16 Okt 2026 pukul 10.00 WIB** (uji visual 15.00). Jangan isi `VITE_MOCK_TODAY` saat menjalankan uji ini.

```bash
cd client && cp .env.example .env && npx vite --port 5173   # terminal 1 (VITE_USE_MOCK=true)
cd client/tests/step-5.6                                     # terminal 2
CHROMIUM_PATH=/path/ke/chromium node func.e2e.mjs            # aturan murni + alur AD-04/AD-05 + hak akses + struk
CHROMIUM_PATH=... node visual.e2e.mjs ./hasil                # overflow, sidebar/drawer, modal, area sentuh 360–1920 px
CHROMIUM_PATH=... node regression.e2e.mjs                    # regresi Step 3, 4, 5.4 (belum punya folder uji sendiri)
```

Skrip memakai paket `playwright` (tidak ditambahkan ke `package.json`). Bila terpasang global, buat tautan agar import
ESM menemukannya: `mkdir -p client/tests/node_modules && ln -s "$(npm root -g)/playwright" client/tests/node_modules/`.

## Aturan yang diterapkan

| Hal | Aturan | Sumber |
|---|---|---|
| Transisi admin | Dikonfirmasi → Sedang Disiapkan → Siap Diambil (pickup) / Dalam Pengiriman (delivery) → Selesai; satu langkah, berurutan | SPEC §4, PRD §6.2 |
| Bukan aksi admin | Menunggu Pembayaran → Dikonfirmasi dipicu sistem (payment gateway); pembatalan oleh admin belum diatur dokumen | PRD §6.2 |
| Kode pickup | Selesai (pickup) wajib kode yang cocok; dicek ulang oleh service saat menyimpan; kode tidak dikirim ke UI admin | UC-21, validation rule Status |
| Bayar di Toko | Ditandai lunas saat Siap Diambil; Selesai ditolak bila belum lunas | BR-05, activity diagram 7.3 |
| Dalam Pengiriman | Nama kurir wajib (`orders.courier_name`, maks. 100) | PRD §6.2 |
| Klik ganda / tab lama | Service menerima `from` (status yang dilihat admin); status berbeda → ditolak tanpa menulis apa pun | — |
| Poin | 1 poin per Rp 1.000 saat Selesai, sekali per pesanan (dicek dari `point_transactions`) | BR-09 |
| Stok & voucher | Tidak berubah oleh transisi admin (stok sudah berkurang saat pesanan dibuat) | TF-12 |
| Kalender | Item pre-order & custom per `ready_date`; status Dikonfirmasi s.d. Selesai; Menunggu Pembayaran & Dibatalkan tidak dihitung | FR-29, BR-03 |

## Skenario uji manual

Akun: Staf `staf@demo.com`, Owner `owner@demo.com`, Pelanggan `pelanggan@demo.com` (sandi `demo1234`).

| Requirement | Langkah | Hasil yang diharapkan |
|---|---|---|
| FR-26 | Login Staf, buka `/admin/dashboard` dan `/admin/laporan` | Dialihkan ke Pesanan; sidebar tanpa Dashboard/Laporan/Promo/Pengaturan |
| FR-26 | Login Pelanggan, buka `/admin/pesanan/<nomor>` | Dialihkan ke Beranda |
| AD-04 | Buka `/admin/pesanan/OVC-000000-999` | "Pesanan tidak ditemukan" |
| AD-04 | Pelanggan buat pesanan Pickup + Bayar di Toko; Staf buka detailnya | Nomor, Dikonfirmasi, pelanggan, item, "Bayar saat ambil", log status "oleh Anisa Pelanggan" |
| FR-28 | Ubah Status → modal → Batal; lalu Ubah Status → Ya | Batal tidak mengubah apa pun; status Sedang Disiapkan, log + notifikasi pelanggan |
| FR-28 | Ubah ke Siap Diambil | Tombol "Selesaikan Pesanan" nonaktif + pesan "Tandai pembayaran Bayar di Toko lunas…" |
| BR-05 | Tandai Lunas → Ya | Badge Lunas + waktu bayar; status tetap Siap Diambil; pesan berganti "Verifikasi kode pickup…" |
| UC-21 | Verifikasi: kosong, kode salah, lalu kode dari halaman tracking pelanggan | Error jelas, status tidak berubah; kode benar → "Kode pickup terverifikasi", tombol aktif |
| BR-09 | Selesaikan Pesanan | Toast "+N poin untuk pelanggan"; log berisi "Kode pickup terverifikasi"; Akun pelanggan +N poin, notifikasi "Pesanan selesai" & "+N poin" |
| FR-28 | Pesanan delivery: Kirim Pesanan tanpa nama kurir, lalu isi | "Isi nama kurir"; setelah diisi kurir tampil di kartu Delivery & log |
| FR-28 | Cetak Struk (pratinjau cetak peramban) | Hanya struk: nomor, item, jumlah × harga, rincian biaya, total, metode & status bayar; tanpa sidebar/tombol |
| FR-29 | Buka Kalender Produksi | Pill peach (pre-order) & pink (custom) per tanggal siap; panel kanan daftar per produk + nomor pesanan |
| FR-29 | Buat pesanan pre-order (belum bayar), lalu bayar | Tidak muncul saat menunggu pembayaran; muncul di tanggal siap setelah lunas |
| FR-29 | Ubah status pesanan tersebut di AD-04, kembali ke kalender | Status di panel ikut berubah, tidak ada baris ganda |
| FR-29 | Bulan berikutnya / sebelumnya / Hari ini; pilih tanggal tanpa produksi | Navigasi benar; "Belum ada produksi" |
