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
| `DATABASE_URL` | — | Diisi saat Step 6 (MySQL) |
| `JWT_SECRET` | — | Diisi saat Step 6 |

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

---

## Perintah Berguna

| Perintah | Direktori | Keterangan |
|---|---|---|
| `npm run dev` | `client/` | Jalankan dev server Vite |
| `npm run build` | `client/` | Build produksi |
| `npm run preview` | `client/` | Preview build produksi |
| `npm run dev` | `server/` | Jalankan server dengan nodemon |
| `npm start` | `server/` | Jalankan server tanpa nodemon |

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
- Riwayat pencarian dan status onboarding menggunakan awalan `ovenco_` (persisten di kedua mode).
- Semua halaman menggunakan lapisan `client/src/services/` — **jangan** memanggil `fetch`/`axios` langsung dari komponen/halaman.