# Oven & Co. — Web Bakery Ordering System

> Freshly Baked, Made With Care

Aplikasi pemesanan online mandiri untuk UMKM bakery Oven & Co., menggantikan pemesanan manual via WhatsApp.

Aplikasi berbentuk **responsive web application**: tampilan pelanggan menyesuaikan HP (< 768 px, bottom
navigation), tablet (768–1023 px), dan desktop (≥ 1024 px, top navigation & layout multi-kolom); panel admin
dirancang untuk desktop dengan sidebar yang menjadi drawer di layar < 1024 px. Lihat CR-01 di `docs/SPEC.md`.

## Struktur Monorepo

```
oven-and-co/
├── client/     # Frontend: React 19 + Vite 8 + Tailwind CSS
└── server/     # Backend: Node.js + Express + Prisma + MySQL
```

---

## Prasyarat

- Node.js ≥ 20.19
- npm ≥ 9
- MySQL 8 (hanya diperlukan mulai Step 6)

---

## Instalasi

### 1. Clone & masuk ke direktori

```bash
git clone <repo-url>
cd oven-and-co
```

### 2. Install dependencies client

```bash
cd client
npm install
```

### 3. Install dependencies server

```bash
cd ../server
npm install
```

---

## Konfigurasi Environment

### Client (`client/.env`)

Salin dari contoh (**wajib** sebelum `npm run dev`):
```bash
cp client/.env.example client/.env
```

> Tanpa `client/.env`, `VITE_USE_MOCK` tidak bernilai `true` sehingga aplikasi memanggil REST API
> (baru tersedia di Step 6) dan bagian Beranda/Dashboard menampilkan pesan "gagal dimuat".
> Setelah mengubah `.env`, hentikan lalu jalankan ulang `npm run dev`.

| Variabel | Default | Keterangan |
|---|---|---|
| `VITE_USE_MOCK` | `true` | `true` = data mock localStorage; `false` = REST API |
| `VITE_API_URL` | `http://localhost:4000/api` | Base URL backend |
| `VITE_MOCK_TODAY` | (kosong) | Opsional, mode mock: tanggal "hari ini" data contoh (`YYYY-MM-DD`) agar hasil uji bisa diulang |

### Server (`server/.env`)

Salin dari contoh:
```bash
cp server/.env.example server/.env
```

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `4000` | Port Express |
| `CLIENT_URL` | `http://localhost:5173` | URL frontend (untuk CORS) |
| `DATABASE_URL` | `mysql://root:password@localhost:3306/oven_and_co` | Koneksi MySQL 8 untuk Prisma (Step 6.1) |
| `SEED_ANCHOR_DATE` | `2026-10-16` | Opsional: tanggal acuan data contoh seed (`YYYY-MM-DD`) |
| `JWT_SECRET` | — | Diisi saat Step 6.2 |
| `DESIGN_TOKEN_SECRET` | (kosong) | Opsional (Step 6.3): kunci HMAC token desain custom cake tamu; bila kosong diturunkan dari `JWT_SECRET` |
| `UPLOAD_DIR` | `server/uploads` | Opsional (Step 6.3): folder file unggahan lokal (foto referensi custom cake di `custom-cakes/`) |

---

## Menjalankan secara Lokal

### Client (development)

```bash
cd client
npm run dev
```

Buka: [http://localhost:5173](http://localhost:5173)

#### Cek cepat mode mock (`VITE_USE_MOCK=true`)

| Peran | Login | Email | Sandi | Halaman awal |
|---|---|---|---|---|
| Pelanggan | `/masuk` | `pelanggan@demo.com` | `demo1234` | `/` Beranda (C-05) — kartu 1.250 poin · Gold |
| Owner | `/admin/login` | `owner@demo.com` | `demo1234` | `/admin/dashboard` (AD-02) |
| Staf | `/admin/login` | `staf@demo.com` | `demo1234` | `/admin/pesanan` (AD-03) |

Akun di atas hanya data demo mode mock (bukan kredensial nyata).

### Server (development)

```bash
cd server
npm run dev
```

Health check: [http://localhost:4000/api/health](http://localhost:4000/api/health)

### Database MySQL (Step 6.1 · Prisma)

Skema `server/prisma/schema.prisma` berisi 29 tabel persis SPEC §8 (nama tabel/kolom snake_case lewat `@@map`/`@map`).
Migrasi awal ada di `server/prisma/migrations/20261017000000_init/migration.sql`.

```bash
# 1. Buat database kosong di MySQL 8 lalu isi DATABASE_URL di server/.env
mysql -u root -p -e "CREATE DATABASE oven_and_co CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

cd server
npm run db:migrate      # prisma migrate dev — terapkan migrasi + generate client (+ seed otomatis bila database baru)
npm run db:seed         # isi data contoh (aman dijalankan berulang: baris yang sudah ada tidak ditimpa)
npm run db:studio       # Prisma Studio di http://localhost:5555
```

Perintah lain: `npm run db:deploy` (terapkan migrasi tanpa membuat migrasi baru, mis. di server produksi),
`npm run db:reset` (hapus semua data → migrasi ulang → seed; **menghapus data**), `npm run db:validate`,
`npm run db:check-spec` (bandingkan SQL migrasi dengan Data Dictionary SPEC §8, tanpa database).

Isi seed (SPEC §9 & §10): 5 kategori, 12 produk + foto + varian, opsi custom cake, bahan baku, 10 metode bayar,
`store_settings` (radius 10 km, Rp 2.500/km, batas pre-order 17.00, timeout 30 menit, aturan poin BR-09),
jam operasional 07.00–20.00, voucher WEEKEND15/HEMAT10/CROISSANT20, akun demo (sandi `demo1234` di-hash bcrypt) +
10 pelanggan contoh (tanpa sandi), dan 9 pesanan contoh yang mencakup semua status SPEC §4, termasuk `OVC-261012-018`.
Saldo pelanggan demo 1.250 poin (Gold) dibentuk dari `point_transactions`. Waktu `DATETIME` disimpan dalam UTC.
Seed memakai id tetap, jadi jalankan pada database hasil migrasi (bukan database yang sudah berisi data lain).

---

## Perintah Berguna

| Perintah | Direktori | Keterangan |
|---|---|---|
| `npm run dev` | `client/` | Jalankan dev server Vite |
| `npm run build` | `client/` | Build produksi |
| `npm run preview` | `client/` | Preview build produksi |
| `npm run dev` | `server/` | Jalankan server dengan nodemon |
| `npm start` | `server/` | Jalankan server tanpa nodemon |
| `npm run db:migrate` · `db:seed` · `db:studio` | `server/` | Migrasi MySQL, seed data contoh, Prisma Studio (Step 6.1) |

---

## Catatan Pengembangan

- Mode mock (`VITE_USE_MOCK=true`) menyimpan data di `localStorage` dengan awalan `ovenco_mock_`.
- Step 4: data contoh (produk, stok harian, pesanan 7 hari, ulasan, poin) disimpan per tabel SPEC §8
  (`ovenco_mock_products`, `ovenco_mock_orders`, …). Data dibuat deterministik relatif terhadap hari ini
  (status pesanan hari ini dihitung terhadap jam referensi 14.00) dan dibuat ulang otomatis saat tanggal
  berganti atau versi seed naik. Hapus key `ovenco_mock_meta` untuk memaksa pembuatan ulang.
- Step 5.2: desain Custom Cake Builder (C-11) disimpan di `ovenco_mock_custom_cake_designs` dan
  `ovenco_mock_custom_cake_design_options` dengan `design_id` ≥ 1.000.000; baris ini tidak ikut ditimpa
  saat data contoh dibuat ulang. Foto referensi diperkecil (sisi maks. 640 px) dan disimpan sebagai data URL.
- Step 5.3: pesanan pelanggan (`orders`, `order_items`, `payments`, `point_transactions`) memakai id ≥ 1.000.000
  dan juga dipertahankan; efeknya pada stok harian & kuota voucher diterapkan ulang. Alamat (`addresses`) dan
  voucher milik pelanggan (`user_vouchers`) adalah tabel pengguna. Pembayaran disimulasikan: tombol
  "Simulasikan Lunas" hanya muncul di `npm run dev`; pesanan online yang tidak dibayar 30 menit dibatalkan
  otomatis saat pesanan dibuka lagi (pengganti job `autoCancelOrders` Step 6.5).
- Step 5.4: riwayat status pesanan disimpan di `ovenco_mock_order_status_histories` (SPEC §8) dan dipakai stepper
  tracking C-18; data contoh diturunkan dari status akhir pesanan contoh (`SEED_VERSION` 5). Ulasan pelanggan (C-19),
  foto ulasan (data URL, sisi maks. 480 px), dan riwayat status buatan pengguna memakai id ≥ 1.000.000 dan
  dipertahankan — kecuali yang merujuk pesanan contoh, yang ikut dibuat ulang saat tanggal berganti. Pembatalan oleh
  pelanggan mengembalikan stok, voucher, dan poin; pesanan lunas dicatat `refunded`, yang belum dibayar `failed`.
  "Pesan Lagi" menyalin item yang masih tersedia (custom cake perlu didesain ulang; produk ready dibatasi stok hari ini).
- Step 5.6: Staf/Owner memproses pesanan di AD-04 (`/admin/pesanan/:orderNumber`) — ubah status berurutan dengan modal
  konfirmasi, verifikasi kode pickup (kode tidak ditampilkan ke admin), tandai lunas Bayar di Toko, cetak struk
  (`window.print`, hanya struk yang tercetak). Setiap perubahan dicatat di riwayat status + notifikasi pelanggan; Selesai
  menambah poin sekali per pesanan. AD-05 (`/admin/kalender`) membaca pesanan tersimpan (pre-order & custom per tanggal siap).
  Perubahan admin pada pesanan contoh ikut dibuat ulang saat tanggal berganti; pesanan buatan pelanggan dipertahankan.
- Step 5.7: AD-06 (`/admin/produk`, tab `?tab=opsi`) mengelola produk (foto maks. 5, varian, tipe & lead time, aktif) dan
  opsi custom cake; AD-07 (`/admin/stok`, tab `?tab=bahan`) mengisi rencana stok produk ready hari ini dan bahan baku
  (Catat Stok Masuk, status Aman/Menipis/Habis). Tabel `products`, `product_images`, `product_variants`, `custom_options`,
  dan `raw_materials` kini tabel admin: diisi dari seed hanya bila belum ada, lalu tidak ditimpa saat data contoh dibuat
  ulang. Rencana stok yang diisi admin (`stock_id` ≥ 1.000.000) juga dipertahankan. Foto produk baru diperkecil (sisi
  maks. 1024 px) dan disimpan sebagai data URL; foto contoh tetap berkas WebP lokal.
- Step 5.8: AD-08 (`/admin/laporan?periode=`) laporan transaksi lunas + Export Excel/PDF (dibuat di peramban);
  AD-09 (`/admin/promo`, tab `?tab=loyalty`) voucher & aturan loyalty; AD-10 (`/admin/pelanggan`, tab `?tab=ulasan`)
  pelanggan & moderasi ulasan; AD-11 (`/admin/pengaturan`) profil toko, jam operasional, ongkir, metode bayar, akun staf.
  `vouchers`, `store_settings`, `payment_methods`, dan tabel baru `operating_hours` kini tabel admin (tidak ditimpa saat
  data contoh dibuat ulang). Akun staf baru disimpan di `ovenco_mock_users`. Perubahan langsung berlaku di web pelanggan.
- Riwayat pencarian dan status onboarding menggunakan awalan `ovenco_` (persisten di kedua mode).
- Semua halaman menggunakan lapisan `client/src/services/` — **jangan** memanggil `fetch`/`axios` langsung dari komponen/halaman.