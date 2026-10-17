# Uji Step 5.8 (AD-08 Laporan · AD-09 Promo & Loyalty · AD-10 Pelanggan & Ulasan · AD-11 Pengaturan) — skrip Playwright

Sama seperti `tests/step-5.1` – `5.7`: tanpa dependensi baru, memakai dev server mode mock. Jam peramban dikunci ke
**Jumat, 16 Okt 2026 pukul 10.00 WIB**. Jangan isi `VITE_MOCK_TODAY` saat menjalankan uji ini.

```bash
cd client && cp .env.example .env && npx vite --port 5173   # terminal 1 (VITE_USE_MOCK=true)
cd client/tests/step-5.8                                     # terminal 2
CHROMIUM_PATH=/path/ke/chromium node func.e2e.mjs            # aturan murni + alur AD-08 – AD-11 + hak akses + efek di web pelanggan + persistensi
CHROMIUM_PATH=... node visual.e2e.mjs ./hasil                # overflow, sidebar/drawer, modal, area sentuh 360–1920 px
```

Skrip memakai paket `playwright` (tidak ditambahkan ke `package.json`). Bila terpasang global, buat tautan agar import
ESM menemukannya: `mkdir -p client/tests/node_modules && ln -s "$(npm root -g)/playwright" client/tests/node_modules/`.

## Aturan yang diterapkan

| Hal | Aturan | Sumber |
|---|---|---|
| Hak akses | AD-08, AD-09, AD-11 hanya Owner; AD-10 Staf & Owner; service menolak peran lain | SPEC §2, §7 |
| Transaksi laporan | Pesanan lunas & tidak dibatalkan, berdasarkan tanggal pesan (definisi sama dengan Dashboard AD-02) | FR-33 |
| Periode | Harian = hari ini · Mingguan = 7 hari terakhir (default) · Bulanan = bulan berjalan s.d. hari ini · Rentang: mulai ≤ selesai ≤ hari ini, maks. 92 hari (asumsi) | A-08, UI/UX Spec Batch 7 |
| Ekspor | Excel (.xlsx, satu sheet per tabel) & PDF (A4) dari data laporan yang tampil; library dimuat saat diklik | FR-33, UC-28, ROADMAP 5.8 |
| Voucher | Kode huruf besar/angka maks. 20 & unik, judul maks. 100, persen 1–100 / nominal > 0, kuota (sisa) 0–100.000, mulai ≤ berakhir; tidak dihapus, hanya dinonaktifkan | FR-34, SPEC §8, BR-10 |
| Status voucher | Nonaktif → Berakhir → Kuota habis → Terjadwal → Aktif (urutan sama dengan voucher berlaku di checkout) | FR-34 |
| Aturan loyalty | Belanja per poin, poin & nilai penukaran, ambang Gold/Platinum: bilangan bulat > 0, Platinum > Gold. Langsung dipakai poin Selesai, tukar poin C-13, level C-05/C-21/AD-10 | FR-34, BR-09 |
| Pelanggan | Total pesanan = pesanan tidak dibatalkan; total belanja = pesanan lunas; level dari poin tahun berjalan | FR-35, TF-11 |
| Ulasan | Balasan wajib, maks. 500 karakter (asumsi) → tampil di C-09/C-10; sembunyikan dengan konfirmasi → hilang dari C-09/C-10 & rating; bisa ditampilkan lagi | FR-35, BR-11 |
| Profil toko | Nama (maks. 100), alamat, WhatsApp +62, batas pre-order (jam), radius > 0 km (2 desimal), tarif ≥ 0 | FR-36, OI-01/02/04 |
| Jam operasional | Hari buka: jam buka < jam tutup; minimal satu hari buka; hari tutup tanpa slot checkout; jam tutup = batas Bayar di Toko (C-18) | FR-36, TF-10, BR-07 |
| Metode bayar | Metode nonaktif hilang dari C-14; minimal satu metode online aktif | FR-36, BR-05 |
| Akun staf | Validasi Registrasi (email/HP unik, +62, sandi ≥ 8), peran Staf/Owner; nonaktif tidak bisa masuk; tidak bisa menonaktifkan akun sendiri; minimal satu Owner aktif | FR-36, FR-26 |
| Persistensi | `vouchers`, `store_settings`, `payment_methods`, `operating_hours` masuk ADMIN_TABLES — tidak ditimpa saat data contoh dibuat ulang; kuota voucher tidak dikurangi dua kali | `services/mock/db.js` |

## Skenario uji manual

Akun: Owner `owner@demo.com`, Staf `staf@demo.com`, Pelanggan `pelanggan@demo.com` (sandi `demo1234`).

| Requirement | Langkah | Hasil yang diharapkan |
|---|---|---|
| FR-26 | Login Staf, buka `/admin/laporan`, `/admin/promo`, `/admin/pengaturan` | Dialihkan; menu tidak tampil di sidebar |
| FR-33 | Owner → Laporan (Mingguan) | Omzet = jumlah grafik 7 hari Dashboard; KPI, grafik per hari, produk terlaris, donut metode bayar, tabel transaksi |
| FR-33 | Rentang 14 → 12 Okt, Tampilkan | "Tanggal mulai harus sebelum atau sama dengan tanggal selesai" |
| UC-28 | Export Excel / Export PDF | File `laporan-penjualan-oven-and-co_<dari>_<sampai>.xlsx/.pdf` terunduh; toast "diunduh" |
| FR-34 | Promo → Buat Voucher → Simpan kosong | Error inline semua field wajib |
| FR-34 | Kode `weekend15` | "Kode voucher sudah dipakai" |
| FR-34 | Buat ROTI5K Rp 5.000, kuota 20 | Status Aktif; banner promo Beranda menampilkan voucher |
| FR-34 | Toggle ROTI5K nonaktif | Status Nonaktif; banner promo hilang |
| BR-09 | Aturan Loyalty: Gold 300, Platinum 1.200, nilai penukaran Rp 10.000 → Simpan | C-21 level & "hemat" mengikuti aturan baru; Platinum ≤ Gold ditolak |
| FR-35 | Pelanggan & Ulasan → cari "anisa" | 1 pelanggan; total pesanan, belanja, level, pesanan terakhir |
| FR-35 | Ulasan → Balas | Balasan tampil di C-10 di bawah ulasan |
| FR-35 | Sembunyikan → konfirmasi | Ulasan hilang dari C-10, jumlah ulasan & rating berkurang; badge "Disembunyikan" di admin; Tampilkan → kembali |
| FR-36 | Pengaturan → WhatsApp `0812` | "Nomor WhatsApp harus diawali +62" |
| BR-12 | Radius 5 km, tarif Rp 3.000 → Simpan | Checkout: alamat > 5 km ditolak, ongkir = km dibulatkan ke atas × Rp 3.000 |
| FR-36 | Jumat → Tutup → Simpan jam | Checkout hari Jumat: "Toko tutup pada tanggal ini. Pilih tanggal lain" |
| BR-05 | Matikan semua metode online | Metode online terakhir ditolak: "Minimal satu metode bayar online harus aktif" |
| FR-36 | Tambah Akun Staf baru → login dengannya | Masuk & landing Pesanan |
| FR-36 | Nonaktifkan Budi Staf → login staf@demo.com | "Akun tidak aktif. Hubungi toko." |
