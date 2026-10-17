# Uji Step 5.5 (C-20 – C-24 Akun, Voucher & Poin, Alamat, Wishlist, Notifikasi) — skrip Playwright

Sama seperti `tests/step-5.1` – `5.3`: tanpa dependensi baru, memakai dev server mode mock. Jam peramban dikunci ke
**Jumat, 16 Okt 2026 pukul 10.00 WIB**. Jangan isi `VITE_MOCK_TODAY` saat menjalankan uji ini.

```bash
cd client && cp .env.example .env && npx vite --port 5173   # terminal 1 (VITE_USE_MOCK=true)
cd client/tests/step-5.5                                     # terminal 2
CHROMIUM_PATH=/path/ke/chromium node func.e2e.mjs            # aturan murni + alur C-20 – C-24 + notifikasi status
CHROMIUM_PATH=... node visual.e2e.mjs ./hasil                # overflow, bottom nav, sidebar akun, area sentuh 360–1920 px
```

Catatan: data contoh memakai jam referensi 14.00 (`MOCK_REFERENCE_TIME`), sehingga bila aplikasi dibuka sebelum
pukul 14.00, notifikasi contoh "hari ini" bisa tercatat lebih baru daripada notifikasi pesanan yang baru dibuat.

Skenario uji manual (akun `pelanggan@demo.com` / `demo1234`):

| Requirement | Langkah | Hasil yang diharapkan |
|---|---|---|
| FR-22 / C-20 | Buka Akun | Profil, kartu Gold Member 1.250 poin + progres, menu Pesanan Saya … Ubah Profil, Keluar; badge jumlah notifikasi belum dibaca |
| FR-24 / C-20 | Ubah Profil: HP `0812…`, lalu email `staf@demo.com` | "Nomor HP harus diawali +62"; "Email sudah terdaftar" |
| FR-24 / TF-15 | Ubah kata sandi (sandi lama salah, lalu benar), keluar, masuk dengan sandi baru | Error lalu toast sukses; login berhasil |
| FR-24 / BR-12 / C-22 | Tambah alamat: simpan kosong, isi, ketuk peta, aktifkan "Jadikan alamat utama" | Error wajib per field; jarak & status radius tampil; hanya satu badge "Utama" |
| C-22 | Hapus alamat utama | Konfirmasi; alamat lain otomatis menjadi utama; Checkout delivery memakai alamat utama baru |
| FR-23 / C-21 | Voucher & Poin → Voucher / Riwayat Poin | WEEKEND15 & HEMAT10 "Bisa dipakai" + Pakai; CROISSANT20 "Tidak berlaku"; riwayat +/− poin dengan nomor pesanan |
| FR-25 / C-23 | Wishlist → tekan hati | Produk hilang + toast; kosong → "Simpan favoritmu di sini" |
| FR-18 / C-24 | Buat pesanan → Simulasikan Lunas → batalkan (dengan tukar poin) | Notifikasi "Pesanan dibuat", "Pesanan dikonfirmasi", "Pesanan dibatalkan" + "+N poin"; salinan email di console |
| FR-18 / BR-06 | Biarkan pesanan online lewat 30 menit | Pesanan batal otomatis + notifikasi "Pesanan dibatalkan" |
| C-24 | Ketuk notifikasi belum dibaca | Titik peach hilang, menuju detail pesanan / riwayat poin / voucher |
