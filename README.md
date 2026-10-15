# Oven & Co. — Web Bakery Ordering System

> Freshly Baked, Made With Care

Aplikasi pemesanan online mandiri untuk UMKM bakery Oven & Co., menggantikan pemesanan manual via WhatsApp.

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

Salin dari contoh:
```bash
cp client/.env.example client/.env
```

| Variabel | Default | Keterangan |
|---|---|---|
| `VITE_USE_MOCK` | `true` | `true` = data mock localStorage; `false` = REST API |
| `VITE_API_URL` | `http://localhost:4000/api` | Base URL backend |

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
- Riwayat pencarian dan status onboarding menggunakan awalan `ovenco_` (persisten di kedua mode).
- Semua halaman menggunakan lapisan `client/src/services/` — **jangan** memanggil `fetch`/`axios` langsung dari komponen/halaman.