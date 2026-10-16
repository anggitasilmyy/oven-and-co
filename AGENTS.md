# AGENTS.md — Oven & Co. Web Bakery Mobile-First Ordering System

Kamu adalah AI coding agent untuk project mata kuliah Implementasi Sistem Informasi.
Baca file ini, `docs/SPEC.md`, dan `docs/ROADMAP.md` sebelum mengerjakan tugas apa pun.

## 1. Single Source of Truth

- Sumber kebenaran: `docs/Oven_and_Co_Analisis_Perancangan_Sistem.pdf` (diringkas di `docs/SPEC.md`).
- Desain visual per layar: file export Google Stitch di `docs/stitch/` (jika tersedia).
- JANGAN membuat fitur, halaman, tabel, kolom, atau menu baru yang tidak ada di dokumen.
  Contoh yang DILARANG: menu Bantuan, chat in-app, multi-cabang, langganan, modul keuangan/resep,
  halaman profil pribadi admin, layar audit log.
- Jika dokumen ambigu atau masih open issue, JANGAN mengarang. Pakai asumsi yang tercantum di
  `docs/SPEC.md` bagian "Asumsi Prototype", simpan sebagai konstanta/konfigurasi, lalu sebutkan di ringkasan.
- Setiap file fitur diberi komentar kode traceability di bagian atas, contoh:
  `// FR-10 · UC-06 · C-11 Custom Cake Builder`

## 2. Tech Stack (sudah diputuskan, jangan diganti)

Frontend (`client/`): React 19.3.1 + Vite 8.3.4, JavaScript (bukan TypeScript), Tailwind CSS 3.4.19, React Router,
Zustand (state keranjang & sesi), Recharts (grafik admin), lucide-react (ikon), Vitest (unit test).

Backend (`server/`): Node.js + Express 4.22.3, Prisma ORM, MySQL 8, bcrypt, jsonwebtoken, zod (validasi),
node-cron (pembatalan otomatis), multer (upload foto).

Mode data: frontend memakai lapisan `services/`. Flag `VITE_USE_MOCK=true` membaca data mock
(disimpan di localStorage agar tidak hilang saat refresh). `VITE_USE_MOCK=false` memanggil REST API.
Komponen dan halaman TIDAK BOLEH memanggil fetch/axios langsung — selalu lewat `services/`.

## 3. Struktur Folder

```
oven-and-co/
├── AGENTS.md
├── .agent/workflows/          # prompt tersimpan (/cek-spec)
├── docs/                      # dokumen sumber, SPEC, ROADMAP, export Stitch
├── client/                    # aplikasi frontend (pelanggan + admin)
│   └── src/
│       ├── main.jsx, App.jsx
│       ├── routes/            # definisi rute, ProtectedRoute, RoleRoute
│       ├── layouts/           # CustomerLayout, FocusLayout, AdminLayout, AccountLayout
│       ├── pages/customer/    # satu folder per layar C-xx
│       ├── pages/admin/       # satu folder per layar AD-xx
│       ├── components/ui/     # komponen dasar reusable (Button, Input, Badge, ...)
│       ├── components/layout/ # kerangka responsif (PageContainer, PageHeader, ResponsiveGrid,
│       │                      #   SiteHeader, BottomNav, FocusPageGrid, ActionBar, AuthSplitLayout, TableScroll)
│       ├── components/customer/
│       ├── components/admin/
│       ├── services/          # apiClient + service per domain + mock/
│       ├── stores/            # Zustand store (auth, cart)
│       ├── hooks/             # custom hook (useCountdown, useDebounce, ...)
│       ├── utils/             # format Rupiah/tanggal, aturan bisnis murni
│       ├── constants/         # status pesanan, rute, konfigurasi
│       └── assets/            # gambar & ilustrasi
└── server/
    ├── prisma/                # schema.prisma, migrations, seed.js
    └── src/
        ├── app.js, server.js
        ├── routes/            # customer/*.routes.js, admin/*.routes.js
        ├── controllers/       # terima request, panggil service, kirim response
        ├── services/          # logika bisnis (order, pricing, stock, point, payment)
        ├── middlewares/       # auth, requireRole, validate, errorHandler
        ├── validators/        # skema zod per endpoint
        ├── jobs/              # autoCancelOrders.js
        └── utils/
```

## 4. Aturan Coding

- Clean code, nama variabel jelas dalam bahasa Inggris (`readyDate`, `shippingFee`), teks UI Bahasa Indonesia.
- Satu komponen per file. Batas lunak: ±150 baris per file; jika lebih, pecah menjadi komponen/hook.
- Komponen reusable masuk `components/`; halaman hanya merangkai komponen.
- Logika bisnis (hitung harga, tanggal siap, syarat Bayar di Toko, poin) ditulis sebagai fungsi murni
  di `client/src/utils/businessRules.js` dan `server/src/services/` agar bisa dites.
- Status pesanan, peran, dan kode lain HANYA diambil dari `constants/` — jangan menulis string literal berulang.
- Gunakan async/await dan tangani error (toast di frontend, `errorHandler` di backend).
- Jangan menambah library baru tanpa menyebut alasannya di ringkasan.
- Komentar secukupnya dalam Bahasa Indonesia untuk bagian yang tidak jelas.

## 5. Aturan Desain (dari UI/UX Spec)

- Aplikasi adalah **responsive web application** (CR-01). CSS tetap mobile-first: kelas dasar untuk HP,
  lalu `md:` / `lg:` / `xl:`. Desktop memakai layout desktop sungguhan, bukan tampilan HP yang diperbesar.
- Breakpoint (default Tailwind, konstanta di `constants/breakpoints.js`):
  - Mobile < 768 px: bottom navigation 4 tab, satu kolom, sticky action bar, bottom sheet.
  - Tablet 768–1023 px: top navigation ringkas (logo, 4 menu, keranjang), area sentuh ≥ 44 px,
    grid 2–3 kolom, action bar tetap di bawah.
  - Desktop ≥ 1024 / 1280 / 1536 px: top navigation penuh, container lebar (maks. 1280 px), grid multi-kolom;
    panel aksi menjadi kartu sticky di kolom kanan bila halaman membutuhkannya.
  - Jangan memaksakan dua kolom di semua halaman; pakai sesuai kebutuhan halaman.
- Halaman baru WAJIB dirangkai dengan komponen di `components/layout/` (PageContainer, PageHeader,
  ResponsiveGrid, FocusPageGrid + ActionBar, AuthSplitLayout, TableScroll). DILARANG memakai
  `max-w-[480px]` atau kelas `mobile-container` (sudah dihapus); gunakan `max-w-content` / `max-w-narrow` /
  `max-w-auth` atau `.page-container`.
- `hooks/useMediaQuery` hanya untuk perubahan perilaku komponen; perubahan tampilan memakai kelas CSS responsif.
- Admin: desktop 1440 × 1024 px, sidebar kiri; < 1024 px sidebar menjadi drawer; tabel dibungkus `TableScroll`.
- Warna (daftarkan di Tailwind config):
  cream `#FBF6EE` (background), surface `#FFFDF9`, beige `#F1E6D6`, primary `#8B5E3C`,
  cocoa `#5C3D2E` (judul), peach `#F4C7AB` (pre-order/promo), pink `#F2D4D7` (custom cake),
  sage `#C9D8C5` (ready/sukses), error `#C0564B`.
- Font: Playfair Display (judul), Plus Jakarta Sans (teks, tombol, harga).
- Komponen: kartu radius 20 px, tombol 52 px radius 14 px, input 48 px, badge pill, grid 8 px,
  margin samping 20 px (mobile) / 32 px (tablet) / 40 px (desktop) lewat `.page-container`. Admin: kartu putih radius 16 px, gap 24 px, angka tabel tabular.
- Aksesibilitas: kontras teks ≥ 4.5:1, area sentuh ≥ 44 × 44 px, setiap input punya label.
- Format: `Rp 28.000`, tanggal `Selasa, 13 Okt`, nomor pesanan `OVC-YYMMDD-NNN`.
- Selalu sediakan loading (skeleton), empty state, dan umpan balik (toast/pesan error).

## 6. Cara Bekerja

1. Gunakan Planning mode. Sebelum menulis kode, buat implementation plan berisi daftar file
   yang akan dibuat/diubah dan kode FR/C-xx/AD-xx yang dicakup. Tunggu persetujuan.
2. Kerjakan HANYA step yang diminta dari `docs/ROADMAP.md`. Jangan loncat ke step berikutnya.
3. Setelah selesai, berikan ringkasan dengan format:
   - File yang dibuat/diubah (path lengkap) dan fungsinya
   - Requirement yang tercakup (FR / BR / layar)
   - Asumsi yang dipakai
   - Cara menjalankan dan cara mengecek hasilnya
4. Jalankan aplikasi dan cek di browser bawaan sebelum menyatakan selesai.
5. Jangan menghapus atau menulis ulang file di luar cakupan step tanpa izin.
