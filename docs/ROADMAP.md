# ROADMAP — Oven & Co.

Kerjakan berurutan. Setiap step: salin prompt ke Agent Antigravity (Planning mode),
review implementation plan, setujui, lalu cek hasil sebelum lanjut. Commit ke Git setiap step selesai.

Prinsip urutan: fitur dibangun dulu dengan data mock (Step 1–5) agar UI cepat bisa dipresentasikan,
lalu disambungkan ke database (Step 6). Lapisan `services/` membuat pergantian ini tidak mengubah halaman.

---

## Prompt Pembuka (sekali, sebelum Step 1)

```
Baca AGENTS.md, docs/SPEC.md, dan docs/ROADMAP.md. Jangan menulis kode dulu.
Jelaskan ulang secara singkat: tujuan aplikasi, aktor, daftar layar, stack, dan aturan kerja.
Sebutkan jika ada bagian dokumen yang menurutmu bertentangan.
```

---

## Step 1 — Setup Project

**Tujuan:** monorepo `client/` dan `server/` siap jalan, design token terpasang.

**File:** `client/` (Vite + React, `tailwind.config.js`, `index.css` dengan font, `.env.example`),
`server/` (`package.json`, `src/app.js`, `src/server.js`, `.env.example`), `.gitignore`, `README.md`.

**Hasil:** `npm run dev` di client menampilkan halaman uji dengan warna & font brand;
`npm run dev` di server menjawab `GET /api/health`.

```
Kerjakan Step 1 dari docs/ROADMAP.md.
Buat client dengan Vite + React (JavaScript) + Tailwind + React Router + Zustand + lucide-react,
daftarkan semua warna, font, radius, dan ukuran dari AGENTS.md bagian 5 ke Tailwind config,
dan buat halaman uji yang menampilkan contoh warna, tipografi, dan tombol.
Buat server Express dengan endpoint GET /api/health, CORS, dan dotenv.
Buat README berisi cara install dan menjalankan keduanya.
```

---

## Step 2 — Layout Utama & Komponen Dasar

**Tujuan:** kerangka navigasi lengkap untuk 35 layar.

**File:** `layouts/CustomerLayout.jsx` (header + ikon keranjang + bottom nav 4 tab),
`layouts/FocusLayout.jsx` (header kembali + sticky bottom bar), `layouts/AdminLayout.jsx` (sidebar 9 menu + topbar),
`routes/` (semua rute dari SPEC bagian 7), `components/ui/` (Button, Input, Badge, Card, BottomSheet,
Toast, EmptyState, Skeleton, Stepper, Modal), `constants/` (orderStatus, roles, routes),
`utils/format.js` (formatRupiah, formatDate), halaman placeholder untuk semua C-xx dan AD-xx.

**Hasil:** semua rute bisa dibuka, bottom nav & sidebar berfungsi, belum ada data.

```
Kerjakan Step 2 dari docs/ROADMAP.md.
Buat tiga layout, seluruh rute dari docs/SPEC.md bagian 7 dengan halaman placeholder
(judul + kode layar), komponen UI dasar di components/ui, constants status pesanan dan peran,
serta utils format Rupiah dan tanggal Indonesia. Belum perlu proteksi login.
```

---

## Step 2.5 — Responsive foundation (PR A) dan penerapan halaman (PR B)

**Tujuan:** aplikasi pelanggan menjadi responsive web application (CR-01, lihat `docs/SPEC.md` bagian 11).
CSS tetap mobile-first; desktop memakai layout desktop sungguhan.

| Bagian | Cakupan |
|---|---|
| PR A — Foundation | Token `max-w-content/narrow/auth`, `.page-container`, `components/layout/` (PageContainer, PageHeader, ResponsiveGrid, SiteHeader, BottomNav, FocusPageGrid + ActionBar, AuthSplitLayout, TableScroll, AccountSidebar), `constants/breakpoints.js`, `hooks/useMediaQuery.js`, layout Customer/Focus/Admin responsif, `layouts/AccountLayout.jsx` (belum dipasang), overlay responsif (BottomSheet, Modal, Toast), badge keranjang, dokumentasi |
| PR B — Penerapan halaman | Auth C-02 – C-04 & AD-01 split-screen ≥ 1024 (AuthSplitLayout), onboarding hero dua kolom, semua halaman placeholder memakai PageContainer/PageHeader/FocusPageGrid + ActionBar dengan `PlaceholderPanel`, halaman `/akun` & `/akun/*` dibungkus AccountLayout (sidebar ≥ 1024), perbaikan logout dari halaman terproteksi (`hooks/useLogout.js`) |

**Hasil:** bottom nav hanya < 768 px, top nav ≥ 768 px, drawer admin < 1024 px, tanpa horizontal overflow
di semua rute pada 375–1920 px.

---

## Step 3 — Authentication

**Tujuan:** daftar, masuk, lupa sandi, login admin, dan proteksi rute berbasis peran (mode mock).

**File:** `services/apiClient.js`, `services/authService.js`, `services/mock/` (data user demo),
`stores/useAuthStore.js`, `stores/useCartStore.js` (keranjang tamu), `routes/ProtectedRoute.jsx`,
`routes/RoleRoute.jsx`, halaman C-01, C-02, C-03, C-04, AD-01.

**Hasil:** onboarding hanya tampil sekali; checkout & akun meminta login lalu kembali ke halaman asal;
Owner diarahkan ke Dashboard, Staf ke Pesanan; menu admin dibatasi sesuai peran.

```
Kerjakan Step 3 dari docs/ROADMAP.md dengan VITE_USE_MOCK=true.
Buat lapisan services (apiClient yang memilih mock atau API berdasarkan env),
authService, useAuthStore, useCartStore, ProtectedRoute, dan RoleRoute.
Buat layar C-01, C-02, C-03, C-04, AD-01 sesuai SPEC dan validation rules bagian 6.
Akun demo: 1 pelanggan, 1 staf, 1 owner. Keranjang tamu digabung ke akun saat login (FR-04, BR-04).
Jika ada export Stitch di docs/stitch untuk layar ini, ikuti tampilannya.
```

---

## Step 4 — Halaman Awal Setiap Role

**Tujuan:** layar pertama yang dilihat tiap peran sudah berisi data contoh.

**File:** C-05 Beranda (pelanggan & tamu), AD-02 Dashboard (Owner), AD-03 Daftar Pesanan (landing Staf),
`services/mock/` (produk, kategori, pesanan contoh), `services/productService.js`, `services/adminOrderService.js`,
komponen `ProductCard`, `MemberCard`, `KpiCard`, `DataTable`, `StatusBadge`.

**Hasil:** Beranda menampilkan sapaan, kartu poin (bila login), promo, kategori, Fresh from Oven Today,
Best Sellers, banner custom cake; Dashboard menampilkan KPI, grafik 7 hari, pesanan per status,
pesanan terbaru, produk terlaris, stok menipis; Pesanan admin punya tab status & filter.

```
Kerjakan Step 4 dari docs/ROADMAP.md.
Buat data mock sesuai docs/SPEC.md bagian 9, lalu layar C-05 (FR-05), AD-02 (FR-27), dan AD-03 (FR-28 bagian daftar).
Fresh from Oven Today hanya produk ready dengan stok tersedia hari ini.
Gunakan Recharts untuk grafik dashboard. Jangan menambah KPI selain yang ada di SPEC.
```

---

## Step 5 — Fitur Utama

Kerjakan per sub-step, satu prompt per sub-step. Logika bisnis ditulis di `utils/businessRules.js`.

| Sub-step | Cakupan | Layar |
|---|---|---|
| 5.1 | Katalog, filter, urutan, pencarian, detail produk, ulasan, toggle wishlist | C-06 – C-10 |
| 5.2 | Custom Cake Builder 6 langkah, preview, harga berjalan, tanggal ≥ H+3 | C-11 |
| 5.3 | Keranjang, checkout, metode bayar, halaman bayar 30 menit, pesanan berhasil | C-12 – C-16 |
| 5.4 | Riwayat, tracking, batal, Pesan Lagi, form ulasan | C-17 – C-19 |
| 5.5 | Akun, ubah profil, voucher & poin, alamat, wishlist, notifikasi | C-20 – C-24 |
| 5.6 | Detail & verifikasi pesanan, ubah status, tandai lunas, cetak struk, kalender produksi | AD-04, AD-05 |
| 5.7 | Produk & opsi custom cake, stok harian & bahan baku | AD-06, AD-07 |
| 5.8 | Laporan & ekspor, promo & loyalty, pelanggan & ulasan, pengaturan | AD-08 – AD-11 |

**Hasil akhir Step 5:** alur lengkap BFD-2 dan BFD-3 bisa didemokan dari pemesanan sampai Selesai dengan data mock.

Template prompt (ganti nomor sub-step):

```
Kerjakan Step 5.3 dari docs/ROADMAP.md.
Ikuti FR, business rules (SPEC bagian 5), dan validation rules (SPEC bagian 6) yang terkait layar tersebut.
Tulis logika perhitungan sebagai fungsi murni di utils/businessRules.js.
Jangan menambah elemen UI yang tidak disebut di SPEC atau export Stitch.
Di akhir, tunjukkan skenario uji manual untuk aturan bisnis yang tercakup.
```

Catatan khusus:
- 5.1: filter C-07 tetap BottomSheet di < 768 dan dialog di ≥ 768; di desktop (≥ 1024) tambahkan sidebar filter di kiri grid Katalog (ditunda dari Step 2.5 PR B karena isi filter baru dibuat di step ini). Grid produk memakai ResponsiveGrid (2 kolom HP, 3 tablet, 4 desktop) menggantikan PlaceholderPanel.
- 5.3: Bayar di Toko nonaktif bila ada item pre-order/custom atau delivery (BR-05); stok ready berkurang saat pesanan dibuat; tombol "Simulasikan Lunas" hanya muncul di mode development.
- 5.4: tombol Batalkan hanya sebelum `sedang_disiapkan`; batal mengembalikan stok & poin.
- 5.6: modal konfirmasi sebelum ubah status; pickup wajib verifikasi kode; Bayar di Toko wajib ditandai lunas sebelum Selesai.
  Status: selesai (AD-04 detail, ubah status, verifikasi kode pickup, tandai lunas, cetak struk; AD-05 kalender produksi).
  Keputusan: admin tidak mengubah Menunggu Pembayaran (dipicu sistem) dan belum bisa membatalkan pesanan (alasan & refund
  belum diatur dokumen); tandai lunas Bayar di Toko saat Siap Diambil; checkbox "Selesai diproduksi" (Stitch) tidak dibuat
  karena tidak ada kolomnya di SPEC §8. Uji: `client/tests/step-5.6/`.
- 5.7: Status: selesai (AD-06 produk + foto maks. 5 + varian + toggle aktif, tab Opsi Custom Cake; AD-07 rencana stok
  harian produk ready + bahan baku dengan Catat Stok Masuk). Keputusan: produk/varian/opsi tidak dihapus, hanya
  dinonaktifkan (A-05); kategori Custom Cake ↔ tipe custom dan hanya satu produk custom aktif (dasar builder C-11);
  setiap kelompok opsi wajib ≥ 1 opsi aktif; lead time maks. 12 hari (jendela tanggal 14 hari); stok harian hanya
  untuk hari ini, rencana ≥ terjual. Uji: `client/tests/step-5.7/`.
- 5.8: ekspor Excel/PDF boleh memakai library (sebutkan alasannya).
  Status: selesai (AD-08 laporan Harian/Mingguan/Bulanan/Rentang + KPI, grafik per hari, terlaris, metode bayar, transaksi,
  Export Excel/PDF; AD-09 voucher + aturan poin & ambang level; AD-10 pelanggan + balas/sembunyikan ulasan; AD-11 profil
  toko, jam operasional, batas pre-order, radius & ongkir, metode bayar, akun staf). Library: `write-excel-file` (xlsx,
  1 dependensi) dan `jspdf` + `jspdf-autotable` (PDF), dimuat dinamis saat tombol ekspor diklik. Keputusan: transaksi
  laporan = lunas & tidak dibatalkan (sama dengan Dashboard); voucher tidak dihapus, kuota = sisa pemakaian; minimal satu
  metode bayar online aktif (BR-05); Owner tidak bisa menonaktifkan akunnya sendiri & minimal satu Owner aktif; pengaturan,
  voucher, metode bayar, dan tabel `operating_hours` disimpan sebagai tabel admin (tidak ditimpa data contoh) dan langsung
  dipakai web pelanggan. Uji: `client/tests/step-5.8/`.

---

## Step 6 — Integrasi Database

| Sub-step | Isi | File utama |
|---|---|---|
| 6.1 | Prisma schema 29 tabel persis sesuai SPEC bagian 8, migrasi MySQL, seed | `server/prisma/schema.prisma`, `seed.js` |
| 6.2 | Auth API (register, login, OTP ke console, JWT), middleware `auth` & `requireRole`, errorHandler | `routes/customer/auth.routes.js`, `middlewares/` |
| 6.3 | API pelanggan: produk, kategori, opsi custom, keranjang, checkout, pesanan, ulasan, akun | `routes/customer/*`, `services/*` |
| 6.4 | API admin: pesanan & status, kalender, produk, stok, pelanggan, dashboard, laporan, promo, pengaturan | `routes/admin/*` |
| 6.5 | Payment simulasi + webhook, job `autoCancelOrders` (BR-06, BR-07), notifikasi, riwayat status, audit log | `services/paymentService.js`, `jobs/` |
| 6.6 | Ganti `VITE_USE_MOCK=false`, sesuaikan service frontend, uji semua layar | `client/src/services/*` |
| 6.7 | Inventory & Recipe Management: master bahan baku, komposisi bahan per produk (recipe/BOM), satuan, kebutuhan bahan otomatis, stok tersedia & dialokasikan | lihat "Step 6.7 – 6.10" di bawah (file ditetapkan setelah CR disetujui) |
| 6.8 | Supplier & Purchasing Management: master supplier, supplier ↔ bahan baku, purchase order, penerimaan bahan, riwayat pembelian | idem |
| 6.9 | Manufacturing Management: perencanaan produksi, kebutuhan bahan, work order, pemakaian bahan, hasil produksi & produk selesai | idem |
| 6.10 | Advanced Reporting: omzet, penggunaan bahan baku, pembelian, produksi, analisis penjualan & kebutuhan produksi | idem |

**Hasil (target akhir Step 6):** aplikasi berjalan penuh dengan MySQL; data tersimpan setelah server restart; Prisma Studio
bisa dipakai saat presentasi. Setelah 6.7 – 6.10: bahan baku, resep, pengadaan, dan produksi tercatat di database dan
saling terhubung; laporan terintegrasi (penjualan, bahan, pembelian, produksi) dapat ditampilkan melalui antarmuka admin
sesuai hak akses yang ditetapkan dalam CR.
**Sudah terverifikasi (per `5b74ba6`):** migrasi & seed pada MySQL 8.0.46 lewat harness `tests-mysql/run.sh`, integrasi
51/51 (lihat catatan 6.1). **Belum terverifikasi:** aplikasi penuh di mode API (6.6), data tetap ada setelah server
restart, dan pemeriksaan Prisma Studio.

Catatan khusus:
- 6.1: Status: skema & seed selesai; **harness migrasi & seed berhasil dijalankan pada MySQL 8.0.46** dengan hasil
  integrasi **51/51 pada commit `5b74ba6`** (sebelumnya 42/42 pada `b53296a`). Harness `server/tests-mysql/run.sh`
  dijalankan langsung lewat Git Bash (`bash tests-mysql/run.sh` dari folder `server/`): container MySQL 8 baru (tmpfs)
  → `prisma migrate deploy` (migrasi repo apa adanya) → `prisma db seed` pada database kosong → seluruh skenario
  integrasi. **Bukan** lewat npm script: `npm run test:mysql` dari PowerShell sebelumnya gagal karena Node.js tidak
  ditemukan di WSL, jadi keberhasilan npm script tersebut belum diverifikasi. Uji 6.3/6.4 sebelumnya juga memakai MySQL 8
  sementara dengan migrasi + seed. Belum tercatat: `npm run db:migrate` (`migrate dev`) di database lokal pengembang dan
  pemeriksaan Prisma Studio (dibutuhkan untuk presentasi, lihat "Hasil" Step 6). Prisma dipin 6.19.3
  (`prisma` & `@prisma/client`; Prisma 7+ butuh driver adapter & `prisma.config.ts`), bcrypt 6.0.0 untuk hash sandi demo.
  Migrasi awal `prisma/migrations/20261017000000_init` dibuat dengan `prisma migrate diff`; `npm run db:check-spec`
  membandingkannya dengan SPEC §8 (29 tabel, 206 kolom, 40 FK). Keputusan: `@default` hanya untuk id auto-increment,
  waktu dibuat (`now()`), dan flag boolean (bukan kolom baru); semua FK `ON DELETE RESTRICT` (relasi opsional juga, agar
  rujukan di pesanan lama tidak dikosongkan) kecuali tabel penghubung M:N & `cart_items` (`CASCADE`); tidak ada UNIQUE
  di luar SPEC (mis. `order_items.design_id`). Seed pilihan A: data master SPEC §9/§10 + 9 pesanan contoh (semua status,
  termasuk OVC-261012-018), id tetap, `upsert` tanpa menimpa (idempoten). `BigInt`/`Decimal` perlu serializer di 6.2+.
- 6.3: **selesai — masuk `main` lewat PR #18** (hotfix konkurensi lanjutan: PR #19 aksi pesanan, PR #20 nomor
  pesanan; catatan di bawah adalah isi & hasil uji saat pengerjaan). Cakupan: produk, kategori, opsi custom, simpan desain, `POST /api/cart`, `GET /api/checkout/context`,
  `GET /api/promos/active`, dan akun: wishlist (`/me/wishlist`), poin (`/me/points`, `/me/points/history`),
  voucher (`/me/vouchers`), alamat (`/me/addresses`), profil & kata sandi (`/me/profile`, `/me/password`),
  pesanan (`POST/GET /orders`, `GET /orders/:no`, `GET|PATCH /orders/:no/payment`, `PATCH /orders/:no/cancel`,
  `POST /orders/:no/reorder`), simulasi bayar (`POST /payments/:no/simulate-paid`, ditolak di production) dan
  `GET /payment-methods` (Staf/Owner, filter AD-03), ulasan (`GET|POST /orders/:no/reviews`,
  `GET /products/:id/reviews`), notifikasi (`GET /me/notifications`, `GET /me/notifications/unread-count`,
  `PATCH /me/notifications/:id/read`), keranjang akun tersimpan (`GET|PUT /cart/items`, `POST /cart/merge`).
  Penyambungan `useCartStore` ke API keranjang server menyusul di 6.6.
  - Keranjang akun (C-12, FR-04, BR-04): hanya pelanggan login (tamu 401, staf/owner 403), disimpan di
    `carts.user_id` + `cart_items`; keranjang tamu tetap di localStorage (`carts.session_token` tidak dipakai).
    `PUT` mengganti seluruh isi; `merge` menggabung item tamu dengan aturan identitas yang sama dengan client
    (`savedCartRules.service.js` ↔ `utils/rules/cart.js`). Satu transaksi; baris `users` dikunci `FOR UPDATE`.
    Harga tidak disimpan — tampilan & harga tetap dari `POST /api/cart` (kontrak tidak berubah).
    Baris dilewati (dikembalikan di `skipped`): produk tidak ada, varian bukan milik produk, desain bukan milik
    pelanggan setelah klaim. Produk/varian nonaktif, desain kedaluwarsa, jumlah > 99, > 50 baris tetap disimpan dan
    ditandai `POST /api/cart`. Ditolak 400: > 100 baris setelah digabung, jumlah > batas INT kolom.
    Desain tamu diklaim hanya bila `design_token` sah, belum pernah dipesan, dan `user_id` masih NULL
    (`selectClaimableGuestDesignIds()` + kunci desain + `updateMany` bersyarat). Mode mock: keranjang akun = key
    localStorage pelanggan, tanpa cek token (sama dengan catatan desain di bawah).
    Catatan untuk 6.6: `cart_item_id` dibuat ulang setiap simpan (hapus + buat), jadi store perlu memakai id dari
    respons terakhir. Diuji di MySQL 8 sementara (21 skenario, termasuk merge & klaim bersamaan) dan browser mode mock.
  - Notifikasi (C-24): hanya baca & tandai dibaca milik pelanggan login (staf/owner 403); milik pelanggan lain → 404
    (sama dengan tidak ada); tandai dibaca idempoten; respons `{ items, unread, today_key }` sesuai
    `client/src/services/notificationService.js`. Pembuatan notifikasi saat status berubah tetap Step 6.5.
    Diuji di MySQL 8 (container sementara, migrasi + seed) dan browser mode API.
  - **Ditunda ke Step 6.4** (hasil audit; frontend AD-04 sudah memanggil, server belum punya rute → 404
    "Endpoint tidak ditemukan"): `PATCH /api/admin/orders/:no/status` (ubah status, mis. Dikonfirmasi → Sedang
    Disiapkan), `POST /api/admin/orders/:no/verify-pickup`, `PATCH /api/admin/orders/:no/mark-paid`.
    → Selesai di Step 6.4.2 (lihat catatan 6.4).
  - Ulasan (C-10, C-19): hanya item pesanan Selesai milik pelanggan, satu ulasan per item (UNIQUE
    `reviews.order_item_id`; P2002 → 409), rating bulat 1–5, tag dari daftar client (ganda digabung), komentar ≤ kolom
    TEXT; bonus `review_bonus` = `store_settings.review_bonus_points` dengan `review_id`, satu transaksi. Foto: multipart
    `photos` (maks. 3) + JSON `review`, aturan sama dengan foto custom cake (JPG/PNG/WebP dari isi file, 5 MB, nama acak,
    `utils/photoStorage.js`), disimpan di `uploads/reviews/` dan disajikan `/uploads/reviews/…`; data URL di JSON ditolak.
    File ditulis di luar transaksi dan dihapus bila penyimpanan gagal. Diuji di MySQL 8 sementara lewat HTTP
    (49 skenario: validasi isian & file, ulasan ganda & bersamaan, gagal tulis disk, tanpa file yatim) dan browser
    mode API (form C-19 + 1 foto → multipart 201). Pesanan Selesai disiapkan langsung di DB karena ubah status admin
    baru ada di 6.4.
  - Pesanan: harga/diskon/ongkir/total dihitung ulang di server. Efek saat DIBUAT (TF-12, sama dengan mock): stok
    ready hari ini, klaim voucher + kuota −1, poin `redeem`, riwayat status; dikembalikan saat batal (poin `refund`,
    lunas → `refunded`, pembayaran belum lunas → `failed`). Satu transaksi; baris pengguna/desain/pesanan dikunci
    `FOR UPDATE`, stok & kuota memakai UPDATE bersyarat. Diuji di MySQL 8 sementara lewat HTTP (56 skenario: validasi,
    stok termasuk 3 pesanan bersamaan, total + ongkir + voucher + poin, Bayar di Toko, kepemilikan, desain sekali
    pakai, batal mengembalikan stok/voucher/poin) dan browser mode API (Keranjang → Checkout → QRIS → Bayar).
    Klaim voucher pelanggan (`user_vouchers`) belum punya endpoint maupun pemanggil di frontend; uji memakai data DB.
  - Belum ada job `autoCancelOrders` (6.5): pembayaran yang lewat `expired_at` ditolak (simulasi & ganti metode)
    tetapi pesanan tetap Menunggu Pembayaran sampai job dibuat. Ganti ke Bayar di Toko mempertahankan `expired_at`
    awal — job BR-07 perlu memakai jam tutup tanggal siap. Notifikasi status (SPEC §4) belum ditulis (6.5).
  - Profil (C-20): frontend memakai `PATCH` (PUT juga diterima); respons = `publicUser` (bentuk user sesi login).
    Aturan nama/email/HP/kata sandi sama dengan registrasi server. Ganti kata sandi wajib kata sandi saat ini;
    token yang sudah terbit tetap berlaku sampai kedaluwarsa (JWT tanpa pencabutan — tidak ada kolom di SPEC §8).
  - Alamat (C-22): tepat satu alamat utama per pelanggan (alamat pertama otomatis utama; utama dihapus → id terkecil
    yang tersisa). Alamat yang sudah dirujuk pesanan **tidak bisa dihapus** (409) karena FK `orders.address_id` RESTRICT
    (lihat catatan 6.1) — tetap bisa diubah; pesanan memakai `delivery_address_snapshot`.
  Uji server tanpa MySQL: `cd server && npm test` (Prisma dipalsukan).
  - Aturan eksplisit SPEC yang dipakai: custom cake ≥ H+3 dan pre-order ≥ H-1 dengan batas jam pesan (BR-02),
    catatan item ≤ 255 karakter (SPEC §8), batas jam pre-order 17.00 (SPEC §10, OI-04). "Hari ini" selalu WIB
    (Asia/Jakarta) di server (`server/src/utils/jakartaDate.js`).
  - **Asumsi prototype (bukan persyaratan dokumen)**, nilainya sama di client & server:

    | Batas | Nilai | Client | Server |
    |---|---|---|---|
    | Tanggal pre-order paling lambat | hari ini + 13 (jendela 14 hari) | `constants/productDetail.js` `PREORDER_DATE_WINDOW_DAYS` | `utils/businessConstants.js` — di luar jendela: `date_out_of_range` |
    | Tanggal custom cake paling lambat | hari ini + 29 (jendela 30 hari) | `constants/customCake.js` `CUSTOM_CAKE_DATE_WINDOW_DAYS` | ditolak 400 saat desain disimpan |
    | Jumlah per baris keranjang | 99 unit | `constants/cart.js` `CART_LINE_MAX_QUANTITY` | baris ditandai `quantity_exceeds_limit` (tidak dipotong, request tidak gagal) |
    | Baris keranjang | 50 item berbeda | `constants/cart.js` `CART_MAX_LINES` (tambah item ditolak dengan pesan) | `exceeds_line_limit: true`, checkout diblokir; request > 100 item ditolak 400 |

  - Desain custom cake: desain milik pelanggan hanya untuk pemiliknya; desain tamu (`user_id` kosong) hanya dengan
    `design_token` HMAC-SHA256 yang dikembalikan `POST /api/custom-cake-designs` (tanpa kolom baru; kunci
    `DESIGN_TOKEN_SECRET` atau turunan `JWT_SECRET`). Kebijakan sekali pakai: desain yang pernah masuk pesanan tidak
    bisa dipakai lagi, termasuk bila pesanan dibatalkan. Desain dengan tanggal siap < H+3 ditolak (`design_expired`).
  - Satu `design_id` hanya boleh ada di **satu baris** keranjang/pesanan; jumlah > 1 pada baris itu boleh (kue identik).
    Baris kedua dengan desain yang sama (mis. catatan berbeda) ditandai `design_duplicate_line` dan tidak masuk subtotal;
    frontend menggabungkan item berdesain sama ke satu baris. Pembuatan pesanan nanti WAJIB memakai
    `findDuplicateDesignLines()` (`server/src/services/designAccess.service.js`) selain cek token & sekali pakai.
  - Foto referensi custom cake: `POST /api/custom-cake-designs` menerima multipart (`referencePhoto` + JSON `design`);
    JPG/PNG/WebP maks. 5 MB, tipe dicek dari isi file, nama file acak, disimpan lokal di `server/uploads/custom-cakes/`
    (atau `UPLOAD_DIR`) dan disajikan di `/uploads/custom-cakes/…` (URL relatif terhadap server API). File adalah
    satu-satunya sumber foto: field JSON `referencePhoto` (URL/path/data URL) ditolak 400. File ditulis di luar
    transaksi Prisma dan dihapus bila validasi data server/penyimpanan gagal. Frontend menampilkan path unggahan lewat
    `toUploadUrl()` (`services/apiClient.js`, origin dari `VITE_API_URL`; API relatif `/api` → path tetap relatif).
    Validasi body cart & custom cake memakai zod (`server/src/validators/`).
  - Pembatas laju pembuatan desain, **in-memory per proses** (hilang saat restart, tidak dibagi antar-instance,
    tanpa `trust proxy` sehingga pengguna di balik NAT berbagi kuota) — asumsi prototype, bukan solusi produksi:
    pembatas awal sebelum autentikasi 120 request/IP/15 menit (melindungi verifikasi JWT & query users; request
    401/403 ikut dihitung di sini), lalu pembatas utama 20 desain/IP/15 menit setelah autentikasi & cek peran
    (401/403 tidak menghabiskan kuota ini).
  - Validitas desain berbeda dari validitas jumlah: baris pertama dengan desain sah tetap "pemilik" desain walau
    jumlahnya > 99 (`quantity_exceeds_limit`); baris berikutnya dengan desain yang sama tetap `design_duplicate_line`.
  - Mode mock memeriksa kepemilikan, sekali pakai, dan kedaluwarsa desain dengan urutan yang sama dengan server
    (`utils/rules/cart.js` `checkCartDesign`), tetapi **tidak** memeriksa `design_token` (data mock hanya di perangkat
    ini, tanpa kunci server); token hanya ditegakkan di mode API.
  - Keterbatasan yang belum ditangani: bila proses server berhenti mendadak setelah foto ditulis tetapi sebelum
    transaksi selesai (atau penghapusan file gagal dan hanya dicatat di log), file yatim bisa tertinggal di
    `uploads/custom-cakes/` tanpa baris database. Perlu job pembersihan berkala (file tanpa referensi & berumur > N jam).
  - **Ditunda ke Step 6.4:** API pesanan admin (`GET /api/admin/orders/:orderNumber`) harus mengembalikan
    `design_spec` termasuk `reference_photo_url` sesuai kontrak frontend AD-04 (`components/admin/AdminOrderItems.jsx`,
    sudah memakai `toUploadUrl()`), lalu tampilan foto diuji di mode API. Saat ini foto referensi pada pesanan admin
    **belum** berfungsi end-to-end di mode API (hanya mode mock).
  - Ditunda (tanpa bukti dampak nyata): race kecil Best Sellers bila produk dinonaktifkan di antara dua query, dan
    pemecahan `cart.service.js` (> ±150 baris).
  - Sesi kedaluwarsa: 401 dengan `code: SESSION_INVALID` menghapus sesi lokal dan menampilkan notifikasi global
    (`SessionExpiredNotice`); endpoint tamu (keranjang, desain) diulang maksimal sekali tanpa token. 403 dan 401
    login gagal tidak menghapus sesi. Id produk tidak valid → 400 `code: INVALID_ID` (ditampilkan "tidak ditemukan").
  - Untuk Phase berikutnya (gabung keranjang setelah login): `selectClaimableGuestDesignIds()` di
    `server/src/services/designAccess.service.js` memilih desain tamu yang aman diklaim (token valid, belum dipesan);
    penulisan `user_id` dilakukan dengan `updateMany` bersyarat `user_id IS NULL`.
- 6.4 (berjalan per kelompok): 6.4.1 daftar & detail pesanan admin (PR #17, diselaraskan di 6.3).
  **Kelompok 1 — 6.4.2 aksi pesanan & 6.4.3 kalender produksi: selesai & terverifikasi** (commit `83e82ec`; branch
  disinkronkan dengan `main` setelah hotfix konkurensi Step 6.3 PR #19 digabung).
  - Endpoint (Staf & Owner, `auth` + `requireRole`): `PATCH /api/admin/orders/:no/status`
    (`{from, to, pickup_code?, courier_name?}` → `{order_number, order_status, points_awarded}`),
    `POST /api/admin/orders/:no/verify-pickup` (`{pickup_code}` → `{valid: true}`, tanpa menulis data),
    `PATCH /api/admin/orders/:no/mark-paid` (→ `{order_number, payment_status, paid_at}`),
    `GET /api/admin/calendar?month=YYYY-MM&date=YYYY-MM-DD` (→ `{month_key, today_key, weeks, counts, selected}`).
    Kontrak & pesan = mock `adminOrderWrites.js` / `productionViews.js`; aturan diport ke
    `services/adminOrderRules.service.js` dan `services/productionRules.service.js`.
  - Aturan: status berurutan (pickup → Siap Diambil, delivery → Dalam Pengiriman); Menunggu Pembayaran & status final
    ditolak; `from` ≠ status terbaru → STALE; kurir wajib ≤ 100 karakter (disimpan di `courier_name` + catatan
    riwayat); Selesai wajib lunas (Bayar di Toko: tandai lunas dulu) dan pickup wajib kode cocok (dinormalisasi, cek
    ulang saat simpan); tandai lunas hanya Bayar di Toko belum lunas saat Siap Diambil (`orders.payment_status` +
    semua baris `payments`: `paid`, `paid_at`, `amount` = total). Setiap ubah status menulis `order_status_histories`
    (`changed_by` = admin). BR-09: poin `earn` = floor(total / `earn_amount_per_point`) saat Selesai, sekali per
    pesanan. Kode pickup tidak pernah dikirim (UC-21). HTTP: isian salah 400, status pesanan tidak memungkinkan 409,
    tidak ada 404, nomor tidak valid 400 `INVALID_ID`. Notifikasi status/poin **tidak** dibuat (Step 6.5).
  - Konsistensi: satu transaksi; kunci `SELECT … WHERE order_number = ? FOR UPDATE` **harus menjadi pembacaan pertama**
    transaksi. Di InnoDB REPEATABLE READ snapshot dibuat oleh SELECT biasa pertama; pola "baca → FOR UPDATE → baca ulang"
    tetap membaca data lama (uji MySQL: 9 dari 10 request Selesai bersamaan lolos sebelum diperbaiki).
  - Kalender: item pre-order & custom dari pesanan Dikonfirmasi s.d. Selesai, per `orders.ready_date` (BR-03), query
    dibatasi rentang grid; bulan/tanggal kosong → hari ini (WIB); tanggal di luar bulan → hari ini/tgl 1 (sama dengan
    mock). Berbeda dari mock: bulan/tanggal tidak sah → 400 (mock menghitung bulan apa pun); tahun dibatasi 1000–9999
    (rentang kolom DATE MySQL) dan grid Desember 9999 ditolak.
  - Uji: `server/tests/adminOrderActionRules.test.js`, `adminOrderActionsRoute.test.js`, `adminCalendarRoute.test.js`
    (Prisma dipalsukan; `tests/helpers/whereMatch.js` + operator `lte`). MySQL 8 sementara (Docker) lewat HTTP: 13
    skenario (auth/peran, alur pickup Bayar di Toko & delivery online, basi, 10 request bersamaan untuk Selesai,
    tandai lunas, dan Mulai Disiapkan, rollback dengan trigger gagal, 404/400, detail & daftar 6.4.1, poin `/me/points`,
    kalender). Sebelum hotfix: 12/13 (admin ubah status vs pelanggan batal gagal, lihat temuan di bawah). **Setelah
    sinkronisasi dengan `main` (hotfix PR #19): 13/13 lulus.** Uji konkurensi ulang 30 putaran per skenario di branch
    yang sama: admin "Mulai Disiapkan" vs pelanggan batal (urutan kirim bergantian) → selalu tepat satu 200, kedua
    pemenang terjadi (admin 16×, batal 14×), refund poin 0 bila admin menang dan 1 bila batal menang; batal bersamaan,
    simulasi lunas/ganti metode vs batal, dan rollback — 8/8 skenario lulus. Browser mode API (1440 & 390 px): AD-04
    ubah status → verifikasi kode → tandai lunas → Selesai (+102 poin) dan AD-05 kalender, tanpa error halaman.
  - **Temuan Step 6.3 — sudah diperbaiki (PR #19, `fix/step-6.3-order-concurrency`, digabung ke `main`):**
    `cancelMyOrder` (`services/orderActions.service.js`) dan `lockPendingOrder` (`services/payment.service.js`) membaca
    pesanan sebelum `FOR UPDATE`. Di MySQL 8: 3 batal bersamaan oleh pelanggan → 3 × 200 dan **3 transaksi refund poin**
    (10/10 putaran); admin "Mulai Disiapkan" + pelanggan batal bersamaan → keduanya 200, pesanan berakhir Dibatalkan
    dengan riwayat `sedang_disiapkan,dibatalkan`. Perbaikan: `order.service.js` `lockMyOrder` (kunci = pembacaan
    pertama transaksi) dipakai keduanya; audit transaksi lain tidak menemukan pola yang sama.
  - Belum diverifikasi: foto referensi custom cake di AD-04 mode API (seed tanpa foto); notifikasi (6.5).
  **Kelompok 2 — 6.4.4 AD-06 produk & opsi custom cake, 6.4.5 AD-07 stok harian & bahan baku: selesai & terverifikasi**
  (commit `00be46a` AD-06, `4f51200` AD-07; branch disinkronkan dengan `main` setelah hotfix nomor pesanan PR #20).
  Verifikasi setelah sinkronisasi: server 377/377, client 142/142, build & lint lulus; MySQL 8 lewat HTTP — AD-07 18/18
  dengan 8 checkout bersamaan, nomor pesanan 4/8/12 checkout bersamaan × 20 putaran semua 201 tanpa nomor ganda,
  AD-06 10/10, Kelompok 1 13/13, hotfix #19 8/8 (admin vs batal: admin 17×, batal 13×); tanpa deadlock, tanpa bentrok
  nomor pesanan, tanpa HTTP 500 di luar skenario rollback yang disengaja.
  - Endpoint (Staf & Owner): `GET|POST /api/admin/products`, `GET|PUT /api/admin/products/:id`,
    `PATCH /api/admin/products/:id/active`, `GET|POST /api/admin/custom-options`, `PUT /api/admin/custom-options/:id`,
    `PATCH /api/admin/custom-options/:id/active`, `GET|PUT /api/admin/stocks/today`, `GET|POST /api/admin/raw-materials`,
    `PUT /api/admin/raw-materials/:id`, `POST /api/admin/raw-materials/:id/stock-in`. POST 201; GET/PUT/PATCH 200; produk/
    opsi/bahan tidak ada 404 (mock produk mengembalikan `null` — penyesuaian frontend di 6.6); id tidak sah 400 `INVALID_ID`.
    Kontrak & pesan = mock `adminCatalogViews/Writes.js`, `stockAdmin.js`; aturan diport ke
    `services/adminCatalogRules.service.js` dan `services/stockRules.service.js`.
  - `fieldErrors`: 400 validasi form membawa `{ message, fieldErrors }` dengan kunci mock (produk: `name`, `category_id`,
    `price`, `lead_time_days`, `variants[i]`, `variantsGeneral`, `is_active`, `photos`; stok harian: `product_id`; bahan:
    `name`, `unit`, `stock`, `min_stock`). `errorHandler` hanya menambahkannya bila error membawanya.
  - Foto produk: JSON tanpa foto baru, atau multipart (`photos` maks. 5 + JSON `product`). `photos` =
    `[{ image_id } | { file_index }]`, urutan = `sort_order`; image_id wajib milik produk, tanpa ganda, setiap file
    dirujuk tepat sekali, total ≤ 5, data URL ditolak; PUT tanpa `photos` → foto lama tetap. Penyimpanan memakai ulang
    `utils/photoStorage.js` (JPG/PNG/WebP dari isi file, 5 MB, nama acak) di `uploads/products/`, disajikan
    `/uploads/products/…`; file baru dihapus bila gagal, file unggahan yang dilepas dihapus setelah commit; aset
    `/images/…` tidak disentuh.
  - Konkurensi tanpa ubah schema: semua transaksi master data (produk, opsi, bahan, rencana stok) mengunci baris
    `store_settings` (satu baris, PK) sebagai pembacaan pertama → nama opsi per kelompok & nama bahan unik, satu produk
    custom aktif, dan ≥ 1 opsi aktif per kelompok tetap benar walau bersamaan (kontrol negatif: tanpa kunci ketiganya gagal
    di putaran pertama). Rencana stok: baris hari ini dibuat/dikunci `INSERT … ON DUPLICATE KEY UPDATE` + `FOR UPDATE`
    urut product_id naik (sama dengan checkout), validasi rencana ≥ terjual memakai nilai terkunci. Stok masuk: baris bahan
    dikunci lalu `stock + qty` dihitung DECIMAL di MySQL. Batas stok masuk dihitung dalam sen (tepat di 99.999.999,99).
  - Uji: `server/tests/adminCatalogRules.test.js`, `adminProductRoute.test.js`, `adminCustomOptionRoute.test.js`,
    `stockRules.test.js`, `adminStockRoute.test.js` (Prisma dipalsukan, `tests/helpers/catalogDb.js`) — server 375/375.
    MySQL 8 sementara lewat HTTP, 30 putaran untuk konkurensi: AD-06 10/10 (auth, data seed, efek ke katalog & builder
    pelanggan, multipart & file tersaji, validasi, rollback trigger, aktivasi custom bersamaan, nama opsi ganda bersamaan,
    opsi aktif terakhir bersamaan); AD-07 18/18 dengan checkout sungguhan `POST /api/orders` (baris stok belum ada, admin
    turunkan rencana vs checkout — admin ditolak 16× / tersimpan 14×, terjual ≤ rencana, tanpa deadlock; dua admin membuat
    baris yang sama; nama bahan ganda; 10 stok masuk bersamaan tepat +1,00; batas & rollback). Jam server uji digeser ke
    pukul 09.00 WIB lewat preload khusus uji agar slot pickup hari ini tersedia. Regresi: Kelompok 1 13/13, hotfix 8/8.
    Browser mode API (1440 & 390 px): AD-06 daftar, ubah harga (PUT JSON), toggle aktif, tab opsi; AD-07 simpan rencana,
    validasi client rencana < terjual, catat stok masuk — tanpa error halaman.
  - Perbaikan hasil review akhir (dasar tipe kolom SPEC §8, tambahan server — mock belum memeriksanya): harga produk &
    harga tambahan varian/opsi maks. 2 angka desimal (DECIMAL(12,2) MySQL membulatkan diam-diam: 0,004 → 0,00 sehingga
    "harga > 0" bisa dilanggar) → 400 `Maksimal 2 angka desimal`; deskripsi & komposisi produk maks. 65.535 byte UTF-8
    (kolom TEXT; sebelumnya > batas → 500 "Data too long") → 400 `fieldErrors.description` / `ingredients`. Berlaku
    untuk JSON & multipart; kosong/null tetap sah.
  - Keterbatasan (menunggu 6.6): form AD-06 masih mengirim foto baru sebagai data URL (ditolak server) dan `ProductImage`
    belum memakai `toUploadUrl()`, jadi unggah/tampil foto `/uploads/products/…` di browser belum bisa diuji (file diverifikasi
    lewat URL server); `apiClient` belum meneruskan `fieldErrors` (halaman hanya menampilkan pesan pertama).
  - Bahan baku — perlindungan stok masuk (hasil audit): field stok form adalah "Stok saat ini — untuk koreksi hasil
    hitung stok" (FR-32 "menyimpan stok"), sehingga dengan kontrak awal PUT menulis stok absolut dan stok masuk yang
    commit setelah form dibuka tertimpa (MySQL: hilang di 29/30 putaran). Aturan final PUT `/api/admin/raw-materials/:id`:
    · edit informasi (nama, satuan, minimum) — `stock` tidak dikirim, sama dengan `expected_stock`, atau sama dengan stok
      database → kolom stock TIDAK ditulis (nilai terbaru dipakai);
    · koreksi stok absolut (`stock` berbeda) → `expected_stock` wajib: tanpa expected → 400, expected ≠ stok database →
      409, keduanya `fieldErrors.stock`; request tanpa expected tidak pernah mengubah stok secara absolut;
    · PUT mengunci baris bahan `FOR UPDATE` (setelah kunci master data) sebelum membaca, sama dengan stok masuk.
    MySQL 30 putaran: edit nama + 5 stok masuk dan edit satuan (tanpa `stock`) + 5 stok masuk → selalu 15,00; koreksi vs
    stok masuk → 9,00 (koreksi dulu) atau 409 + 11,00; form lama (stock tanpa expected) + stok masuk → 200 atau 400,
    stok tidak pernah tertimpa; 10 stok masuk + 3 edit informasi → tepat +5,00. **Step 6.6: form AD-07 mengirim
    `expected_stock` (stok saat form dibuka); edit tanpa koreksi boleh tidak mengirim `stock`.**
  - **Temuan Step 6.3 — sudah diperbaiki (PR #20, `fix/step-6.3-order-number`, digabung ke `main`):** ≥ 4 checkout bersamaan oleh pelanggan berbeda pada hari
    yang sama → sebagian 500 (`orders_order_number_key`, P2002): semua request menghitung nomor urut yang sama dan retry
    (3×) juga serempak. MySQL 8, 10 putaran: 2–3 bersamaan selalu 201; 4 → 1 × 500; 8 → 5 × 500. Uji AD-07 memakai
    3 checkout bersamaan sebelum hotfix digabung (setelah sinkronisasi diuji ulang dengan 8). Perbaikan: penomoran diserialkan dengan kunci baris `store_settings` di checkout
    (setelah kunci pengguna, sebelum desain & stok — urutan sama dengan transaksi admin); 4/8/12 bersamaan × 20 putaran
    → semua 201, nomor unik & berurutan. Diuji bersama Kelompok 2 (worktree sementara): AD-07 dengan 8 checkout 15/15,
    AD-06 10/10, hotfix #19 8/8, Kelompok 1 13/13, tanpa deadlock.
  **Kelompok 3 — 6.4.6 AD-02 Dashboard: selesai** (commit `5300bf9`, branch `feat/step-6.4-admin-api-groups-3-4`).
  **6.4.7 AD-08: selesai** (commit `e39b5be`). **6.4.8 AD-10: selesai** (commit `2532a10`). **Kelompok 4 — 6.4.9 AD-09:
  selesai** (commit `39d4081`; perbaikan klaim voucher basi hasil audit di commit `6890692`). 6.4.10 AD-11: butir di
  bawah. Promo pesanan besar (minimum quantity, diskon bertingkat — saran dosen "Mini ERP Bakery") **tidak ada di
  dokumen sumber** dan butuh kolom baru → diajukan sebagai CR-02 terpisah; schema & kontrak API tidak diubah sebelum
  CR-02 disetujui.
  - Endpoint: `GET /api/admin/dashboard` — **hanya Owner** (Staf 403, SPEC §2). Kontrak = mock
    `services/dashboardService.js`: `{todayKey, kpi{revenueToday, revenueChange, ordersToday, needsProcessing,
    rating{average,count}}, salesChart, statusCounts, totalOrders, recentOrders, bestSellers, lowStock}`. Tanpa input,
    jadi tanpa skema zod; "hari ini" = WIB.
  - Aturan murni `services/salesRules.service.js` (port `utils/rules/sales.js`, dipakai lagi AD-08): penjualan = lunas &
    tidak dibatalkan per tanggal WIB `created_at`, dijumlah dalam sen; 8 hari diambil (hari pertama hanya pembanding omzet
    kemarin). Pesanan hari ini = semua status (sama dengan mock). Perlu diproses & donut dari satu `groupBy`. Rating =
    SUM/COUNT ulasan tidak disembunyikan, 1 desimal. Pesanan terbaru = baris AD-03 (`toAdminOrderRow`).
  - **Snapshot baca (hasil audit konsistensi):** versi awal menjalankan 7 bagian paralel tanpa transaksi — ±21 statement
    autocommit di hingga 7 koneksi pool (relasi `include` & produk terlaris = SELECT terpisah), masing-masing dengan read
    view sendiri, sehingga satu respons bisa berisi angka dari waktu berbeda (mis. "Perlu Diproses" sudah naik, omzet
    belum). Kini `services/readSnapshot.service.js` `runInReadSnapshot()` = transaksi interaktif Prisma
    `isolationLevel: RepeatableRead` (maxWait 5 s, timeout 10 s); semua query Dashboard berjalan **berurutan lewat `tx`**,
    termasuk produk terlaris (`getBestSellers(query, now, db)`, `getSalesTotals(…, db)`, `getProductRatings(…, db)` —
    parameter `db` opsional, default Prisma global), dengan satu `now`. Consistent read InnoDB: satu read view untuk semua
    SELECT, tanpa kunci baris (tanpa FOR UPDATE/FOR SHARE), tidak menahan checkout/pembayaran. Bukan READ COMMITTED
    (read view per statement) dan bukan SERIALIZABLE (SELECT menjadi locking read). Helper dipakai lagi oleh AD-08.
  - **Keputusan 6.4.6 — produk terlaris** memakai aturan server `GET /api/products/best-sellers` (produk nonaktif
    dikecualikan, posisinya diisi produk berikutnya). Mock `computeBestSellers` masih ikut menghitung produk nonaktif —
    disesuaikan/diterima di Step 6.6.
  - **Keputusan 6.4.6 — stok menipis** = bahan baku `stock ≤ min_stock` (FR-32, sama dengan mock & AD-07). **Berbeda dari
    traceability BR-018** (PDF: AD-02 ↔ `orders, order_items, reviews, daily_stocks`): `daily_stocks` hanya punya
    `qty_planned`/`qty_sold` tanpa batas minimum, sehingga "stok menipis" tidak bisa didefinisikan dari tabel itu tanpa
    menambah kolom (dilarang SPEC §8); FR-27 & UI/UX Spec AD-02 ("peringatan stok menipis", aksi "membuka stok")
    dipenuhi oleh bahan baku dengan batas minimum.
  - Perubahan kecil pada fitur selesai (kompatibel, tanpa ubah perilaku): `adminOrder.service.js` mengekspor
    `ADMIN_ORDER_ROW_INCLUDE` & `toAdminOrderRow` (include diekstrak dari `getOrders`); `product.service.js`
    `getBestSellers(query, now = new Date(), db = prisma)`, `productView.service.js` `getSalesTotals(start, end, db)` &
    `getProductRatings(ids, db)` — parameter opsional; pemanggil lain (Beranda, katalog, wishlist, AD-06) tidak berubah.
  - **Koreksi klaim uji sebelumnya:** "5 checkout + 20 Dashboard bersamaan … tiap snapshot konsisten" tidak membuktikan
    konsistensi. Pemeriksaannya (`totalOrders = Σ statusCounts`, perlu diproses = dikonfirmasi + disiapkan) berasal dari
    satu `groupBy` sehingga tidak mungkin gagal, dan checkout belum lunas tidak menyentuh omzet; uji itu hanya
    membuktikan tanpa error/500/deadlock. Diganti uji konsistensi silang di bawah.
  - Uji: `server/tests/salesRules.test.js`, `adminDashboardRoute.test.js` (Prisma dipalsukan; `$transaction` palsu
    mencatat opsi, model Prisma global dipasang sebagai penjaga yang gagal bila dipakai, klien `tx` mendeteksi query
    tumpang tindih) — server 400/400 (baseline 382 + 18). Sensitivitas: service versi lama → 10 test gagal; varian `tx` +
    `Promise.all` → hanya test "berurutan" gagal.
  - MySQL 8 sementara (Docker, InnoDB untuk 30 tabel, default REPEATABLE-READ, migrasi + seed `SEED_ANCHOR_DATE` = hari
    ini) lewat HTTP:
    · General log satu request: baru = `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`, `BEGIN`, 21 SELECT di **satu**
      koneksi, `COMMIT`; lama = SELECT autocommit di 7 koneksi. Keduanya tanpa locking read.
    · **Konsistensi saat pelunasan bersamaan** (5 putaran × 30 pesanan pre-order identik dilunasi berurutan lewat
      `simulate-paid`, 8 pekerja Dashboard terus-menerus; invarian per respons dengan k = jumlah lunas dari omzet:
      dikonfirmasi, menunggu pembayaran, perlu diproses, transaksi grafik hari ini, total/pesanan hari ini, jumlah lunas
      di Pesanan Terbaru, terjual di Produk Terlaris). **Kontrol negatif (implementasi lama): 158 dari 1.244 respons
      melanggar** (dikonfirmasi/menunggu/perlu diproses 112, terlaris 97, pesanan terbaru 22). **Implementasi baru: 0 dari
      715.**
    · Latensi (bergantian, data sama, 4 vCPU): diam p50 35 ms / p95 46 ms (lama 23/30 — query kini berurutan); 8 request
      paralel p50 96 / p95 117 ms (lama 87/103). Pool: satu request memakai 1 koneksi selama ±35 ms (lama hingga 7
      koneksi bersamaan, pool default Prisma = 2 × CPU + 1).
    · Skenario fungsional 10/10 (setiap angka = SQL independen): auth/peran, data seed, checkout sungguhan, simulasi
      lunas, batal oleh pelanggan, ulasan disembunyikan, stok bahan = minimum lalu stok masuk AD-07, produk terlaris
      dinonaktifkan lewat AD-06, batas hari WIB 23.59/00.00, 5 checkout + 20 Dashboard bersamaan (hanya bukti tanpa 500).
    · Regresi: 22 endpoint (best sellers berbagai `limit` termasuk 400, fresh-today, katalog, detail & ulasan produk,
      kategori, wishlist, daftar & detail AD-03/AD-04, produk AD-06, kalender) **identik dengan `main`** (server `HEAD`
      dan versi ini pada data yang sama); best sellers Beranda = Dashboard; 5 baris pertama AD-03 = Pesanan Terbaru.
  - Browser mode API (1440 & 390 px): login Owner → Dashboard tanpa error halaman/konsol, semua panel terisi; Staf yang
    membuka `/admin/dashboard` diarahkan ke Pesanan.
  **6.4.7 AD-08 Laporan Penjualan (FR-33 · UC-27 · UC-28 · A-08 · BR-019)**
  - Endpoint: `GET /api/admin/reports/sales?period=harian|mingguan|bulanan|rentang&from=YYYY-MM-DD&to=YYYY-MM-DD` —
    **hanya Owner** (SPEC §2 "laporan & ekspor"; Staf 403). Kontrak = mock `services/reportService.js` /
    `mock/reportViews.js`: `{todayKey, store_name, period, from, to, kpi{revenue, transactions, average, itemsSold}, daily,
    bestSellers, paymentMethods, transactions}`. **Tidak ada endpoint ekspor**: Export Excel/PDF (UC-28, A-08) dibuat di
    peramban dari respons yang sama (`client/utils/reportExport.js`), jadi isi file = isi layar.
  - Periode (asumsi prototype dari client `constants/report.js`, dipindah ke `utils/businessConstants.js`): harian = hari
    ini, mingguan = 7 hari terakhir (default bila `period` kosong), bulanan = bulan berjalan s.d. hari ini, rentang = maks.
    92 hari dan tidak melewati hari ini; tanggal = WIB `created_at`. Validasi: zod `validators/adminReport.validator.js`
    (periode tidak dikenal/ganda → 400 "Periode laporan tidak valid." — **berbeda dari mock** yang diam-diam memakai
    mingguan), aturan rentang di `services/reportRules.service.js` dengan pesan mock (tanggal tidak sah termasuk
    2026-02-30, mulai > selesai, melewati hari ini, > 92 hari → 400). Validasi dilakukan sebelum transaksi dibuka;
    `from`/`to` diabaikan untuk periode selain rentang (sama dengan mock).
  - Aturan murni `services/reportRules.service.js` (port `utils/rules/report.js`, memakai `isSalesOrder` &
    `aggregateDailySales` dari `salesRules.service.js`): transaksi = lunas & tidak dibatalkan; rupiah dijumlah dalam sen;
    rata-rata dibulatkan ke rupiah; metode = pembayaran terbaru (cadangan `payment_option` bila tidak ada baris payments),
    nama/kelompok dari `payment_methods`; terlaris urut jumlah lalu id numerik (5); transaksi terbaru dulu (seri waktu →
    id terbesar). **Keputusan 6.4.7 — produk terlaris laporan menyertakan produk yang kini nonaktif** (penjualan
    historis, sama dengan mock, dan jumlahnya tetap cocok dengan "Produk Terjual"), berbeda dari Dashboard/Beranda.
  - Snapshot: `services/salesReport.service.js` memakai `runInReadSnapshot` (REPEATABLE READ); urutan query lewat `tx`:
    nama toko, metode bayar, pesanan penjualan (+ relasi user, pembayaran terbaru, item), nama produk. Semua bagian
    laporan dihitung dari SATU hasil query pesanan, jadi omzet = Σ per hari = Σ metode = Σ tabel. Tanpa locking read.
  - Keterbatasan (tanpa ubah schema): `orders.created_at` tidak ber-index → filter rentang memindai tabel `orders`
    (sama dengan AD-02/AD-03); tabel transaksi dikirim lengkap (paginasi di client, sama dengan mock). Jam di kolom
    "Tanggal" diformat client dengan zona waktu peramban (uji browser UTC menampilkan 03.43 untuk 10.43 WIB) — Step 6.6.
  - Uji: `server/tests/reportRules.test.js` (7), `adminReportRoute.test.js` (8; penjaga Prisma global, `$transaction`
    palsu mencatat isolation level, deteksi query tumpang tindih) — server 415/415. Sensitivitas: nama produk lewat
    Prisma global → 6 test gagal; `Promise.all` di dalam transaksi → test "berurutan" gagal.
  - MySQL 8 sementara (Docker, InnoDB 30 tabel) lewat HTTP:
    · General log satu request: `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`, `BEGIN`, 7 SELECT (termasuk relasi users,
      payments, order_items) di satu koneksi, `COMMIT`; tanpa locking read.
    · Fungsional 10/10, setiap bagian (KPI, per hari, terlaris, metode, transaksi) = SQL independen untuk 5 periode
      (harian, mingguan, bulanan, rentang 92 hari, rentang lampau): hak akses (tamu 401, pelanggan/Staf 403), default &
      400 dengan pesan mock, rentang kosong, batas 23.59.59/00.00 WIB, Bayar di Toko lewat alur AD-04 (disiapkan → siap
      diambil → tandai lunas → metode "Bayar di Toko"), online simulasi lunas lalu batal pelanggan (keluar), produk
      dinonaktifkan via AD-06 (tetap di laporan, hilang dari Dashboard), omzet harian & 7 hari = Dashboard AD-02.
    · Konsistensi saat pelunasan bersamaan (5 putaran × 30 pelunasan, 8 pekerja laporan harian; 10 invarian: KPI = Σ per
      hari = Σ metode = Σ tabel, omzet = baseline + k·T, produk terjual, k pesanan terlama di tabel, QRIS, terlaris):
      **implementasi 0 dari 1.185 respons**. Kontrol negatif buatan (KPI dari `order.aggregate` terpisah di luar snapshot;
      identik saat diam) **1.084 dari 1.087 respons melanggar** — uji mampu mendeteksi angka antarbagian yang tidak cocok.
    · Latensi diam (311 pesanan, 4 vCPU): harian p50 37 ms, mingguan 38 ms, rentang 92 hari 40 ms (p95 ≤ 50 ms).
    · Regresi: 30 endpoint (termasuk Dashboard Owner/Staf/tamu, Beranda, katalog, AD-03/04/05/06/07, checkout context
      dengan `now` dinormalisasi) **identik dengan commit `5300bf9`** pada data yang sama; AD-02 fungsional 10/10 dan
      konsistensi AD-02 0 dari 411 respons.
  - Browser mode API (1440 & 390 px): Owner → Laporan harian/mingguan/bulanan/rentang (semua dari API, 200), Export Excel
    (.xlsx, omzet di file = layar) & Export PDF terunduh, tanpa error halaman/konsol; Staf yang membuka `/admin/laporan`
    diarahkan ke Pesanan.
  **6.4.8 AD-10 Pelanggan & Ulasan (FR-35 · UC-25 · A-10 · BR-021 · BR-11)**
  - Endpoint (Staf & Owner, SPEC §2; pelanggan 403, tamu 401): `GET /api/admin/customers`, `GET /api/admin/reviews?rating=
    semua|1..5`, `PUT /api/admin/reviews/:id/reply {admin_reply}`, `PATCH /api/admin/reviews/:id/hidden {is_hidden}`.
    Kontrak = mock `services/adminCustomerService.js` / `mock/customerAdmin.js`; aturan diport ke
    `services/adminCustomerRules.service.js`, validasi zod `validators/adminCustomer.validator.js` (id via
    `validateIdParam` yang kini diekspor `adminCatalog.validator.js` → 400 `INVALID_ID`).
  - Pelanggan: hanya role customer (termasuk akun nonaktif); total pesanan = tidak dibatalkan; total belanja = lunas &
    tidak dibatalkan (sama dengan AD-02/AD-08); level = poin earn + review_bonus positif tahun kalender WIB berjalan
    (TF-11) dengan ambang `store_settings` (memakai ulang `loyaltyRules.service.js`); pesanan terakhir = pesanan terbaru
    apa pun statusnya; urut pesanan terakhir ↓, nama, id. Agregat dihitung MySQL (`groupBy`), tanpa memuat semua
    pesanan; kata sandi/google_id tidak pernah dikirim; pencarian di client (sama dengan mock).
  - Ulasan: admin melihat semua (termasuk tersembunyi), terbaru lalu id ↓, ringkasan `{total, hidden, unreplied}` dari
    semua ulasan; foto = path unggahan (sama dengan endpoint ulasan pelanggan). Balasan di-trim, wajib, maks. 500
    karakter (asumsi client `ADMIN_REPLY_MAX`); `is_hidden` = nilai tujuan (idempoten). Efek ke web pelanggan memakai
    kode 6.3 yang sudah ada: balasan tampil di C-09/C-10; ulasan tersembunyi tidak tampil & tidak dihitung di rating
    produk maupun rating Dashboard. Ulasan tidak dihapus; bonus poin ulasan tidak berubah. Berbeda dari mock (lebih
    ketat): rating tidak dikenal → 400, `is_hidden` wajib boolean, `admin_reply` wajib teks.
  - Konsistensi: daftar pelanggan & daftar ulasan memakai `runInReadSnapshot` (REPEATABLE READ, query berurutan lewat
    `tx`); balas/sembunyikan = `updateMany` satu baris (tidak ada → 404) lalu baca ulang dalam satu transaksi, tanpa
    locking read. Balasan bersamaan → yang terakhir menang (sama dengan mock; form tidak membawa nilai awal).
  - Uji: `server/tests/adminCustomerRules.test.js` (4), `adminCustomerRoute.test.js` (5), `adminReviewRoute.test.js` (7)
    — server 431/431. Sensitivitas: satu `groupBy` lewat Prisma global → 5 test gagal; tanpa batas 500 karakter → 2 gagal.
  - MySQL 8 sementara lewat HTTP: fungsional 9/9 — ulasan dibuat lewat API pelanggan C-19 (+1 disisipkan SQL dengan
    foto), hak akses 4 endpoint, daftar pelanggan & ulasan (+ filter tiap rating) = SQL independen, balasan tampil di
    `/products/:id/reviews`, sembunyikan menghapus dari ulasan & ringkasan produk serta rating Dashboard lalu kembali,
    validasi/404/INVALID_ID tanpa menulis, alur checkout → lunas → AD-04 Selesai (+1.300 poin, Gold → Platinum) → batal
    sesuai SQL, 10 balasan + 10 sembunyikan serentak (semua 200, nilai akhir salah satu yang dikirim). Konsistensi daftar
    pelanggan saat 5 × 20 pembatalan pesanan lunas bersamaan (invarian: selisih total pesanan × T = selisih total
    belanja): **implementasi 0 dari 948 respons; kontrol negatif (query sama tanpa snapshot) 93 dari 1.165**. General
    log: satu koneksi, `REPEATABLE READ` untuk daftar, tanpa locking read. Regresi: 32 endpoint identik dengan commit
    `e39b5be` (termasuk Dashboard & Laporan), AD-02 10/10, AD-08 10/10.
  - Browser mode API (Staf 1440 px, Owner 390 px): tab Pelanggan & Ulasan, balas (modal), sembunyikan (konfirmasi) &
    tampilkan, filter 2 ★ — semua request 200, tanpa error konsol, DB berubah sesuai.
  - Keterbatasan (Step 6.6): `AdminReviewCard` menampilkan path foto `/uploads/reviews/…` tanpa `toUploadUrl()` sehingga
    di mode API gambar dicari di origin frontend (sama dengan foto produk AD-06).
  **6.4.9 AD-09 Promo & Loyalty (FR-34 · UC-29 · A-09 · BR-020 · BR-09 · BR-10) — sesuai SPEC saat ini, tanpa CR-02**
  - Endpoint — **hanya Owner** (SPEC §2: promo & loyalty hak Owner; Staf & pelanggan 403, tamu 401): `GET|POST
    /api/admin/vouchers`, `PUT /api/admin/vouchers/:id`, `PATCH /api/admin/vouchers/:id/active`, `GET|PUT
    /api/admin/loyalty`. POST 201, lainnya 200; voucher tidak ada 404; id tidak sah 400 `INVALID_ID`. Kontrak = mock
    `services/adminPromoService.js` / `mock/promoAdmin.js`; aturan diport ke `services/adminPromoRules.service.js`
    (pesan & `fieldErrors` sama: code, title, discount_type, discount_value, product_id, quota, valid_from, valid_to;
    loyalty: 5 field). Validasi bentuk zod `validators/adminPromo.validator.js` (salah bentuk → 400 tanpa fieldErrors).
    Voucher tidak dihapus (dirujuk pesanan & user_vouchers); papan = voucher + nama produk + terpakai (pesanan tidak
    dibatalkan) + status hari ini WIB (nonaktif → berakhir → kuota habis → terjadwal → aktif) + daftar produk, dalam satu
    snapshot REPEATABLE READ. Tidak ada minimum quantity/diskon bertingkat/promo grosir (CR-02 terpisah); schema tidak
    berubah; checkout 6.3 hanya disesuaikan lewat perbaikan klaim voucher terpisah (lihat butir "Perbaikan checkout").
  - **Kuota & `expected_quota`** (`vouchers.quota` = sisa, diubah checkout `quota − 1` & pembatalan `quota + 1` secara
    atomik): PUT mengunci baris voucher `SELECT … FOR UPDATE` sebagai pembacaan pertama transaksi, lalu — kuota form =
    `expected_quota` atau = kuota terkunci → kuota TIDAK ditulis (edit informasi tidak menimpa pemakaian); kuota berbeda →
    `expected_quota` wajib (tanpa → 400) dan harus = kuota terkunci (basi → 409), keduanya `fieldErrors.quota`. Transaksi
    voucher hanya mengunci baris voucher (checkout: users → store_settings → … → vouchers) → tanpa urutan silang. Kode
    unik: pengecekan + UNIQUE(code); P2002 bersamaan → 400 `fieldErrors.code` yang sama. Aktif/nonaktif hanya menulis
    `is_active`. Loyalty: validasi (bilangan bulat > 0, batas atas, Platinum > Gold) sebelum transaksi, lalu kunci
    `store_settings` + UPDATE 5 kolom saja (profil toko & review_bonus_points tidak tersentuh).
  - Uji: `server/tests/adminPromoRules.test.js` (7), `adminPromoRoute.test.js` (10; urutan operasi: kunci = pembacaan
    pertama, rollback, P2002) — server 446/446 saat AD-09 selesai. Sensitivitas: tanpa kunci baris → 1 gagal; kuota ditulis
    absolut → 2 gagal.
  - **`product_id` BIGINT (hasil final review):** sebelumnya regex `^[1-9]\d{0,18}$` menerima 19 digit di atas batas
    BIGINT signed → di MySQL `9223372036854775808` menghasilkan **500** (`PrismaClientUnknownRequestError`). Kini
    `isBigIntIdString` (`adminPromoRules.service.js`) memeriksa format string lalu `BigInt(value) ≤ 9223372036854775807`
    (tanpa Number); angka JSON di luar safe integer dianggap tidak sah (presisi hilang saat parse). ID tidak sah tidak pernah
    dikirim ke query → 400 `fieldErrors.product_id` "Produk tidak ditemukan" (pesan mock). Uji: valid, tepat batas
    (produk ada → 201), batas + 1, 20 digit, format tidak sah, angka JSON tidak aman, PUT; terhadap service sebelumnya test
    route gagal (ID batas + 1 sampai ke query). MySQL: lama 500 → baru 400; tepat batas dengan produk ada → 201.
  - MySQL 8 sementara lewat HTTP: fungsional 9/9 (hak akses 6 endpoint; papan = SQL; tambah + fieldErrors + 10 POST kode
    sama serentak → tepat 1 × 201; voucher baru diklaim lalu dipakai checkout & dibatalkan — kuota/terpakai benar;
    nonaktif → checkout ditolak, hilang dari `/promos/active`, C-21 `expired`; skenario form basi `expected_quota`; kuota 0
    → kuota habis; aturan loyalty → checkout context, `/me/points`, level AD-10, poin Selesai AD-04 = floor(total/2000);
    400/404/INVALID_ID). **Konkurensi kuota** (10 putaran × [20 checkout + 10 simpan judul] dan [20 batal + 10 simpan
    judul], 20 pelanggan berbeda): **implementasi 0 putaran kehilangan kuota, semua PUT 200, tanpa 5xx; kontrol negatif
    (tanpa kunci, kuota ditulis absolut) kehilangan kuota di 10/10 putaran (288 unit)**. Ubah kuota bersamaan dengan 20
    checkout (30 putaran, jeda acak): admin 200 → kuota = baru − checkout (1×), admin 409 → kuota = lama − checkout (29×),
    0 hasil tidak sah. General log: `BEGIN` → `SELECT … FROM vouchers … FOR UPDATE` → … → `COMMIT`; loyalty mengunci
    `store_settings`. Regresi: 37 endpoint identik dengan commit `2532a10` (termasuk `/me/vouchers`, `/promos/active`,
    `/checkout/context`, AD-10), AD-02 10/10, AD-08 10/10, AD-10 9/9, tulis AD-06/AD-07 & checkout voucher 6.3
    (WEEKEND15 = SQL, voucher salah produk/kode tak dikenal ditolak) 3/3.
  - Browser mode API (Owner 1440 & 390 px): buat voucher, ubah judul (tanpa checkout di antaranya), sakelar nonaktif,
    simpan & kembalikan aturan loyalty — DB berubah sesuai, tanpa error halaman (satu log jaringan 400 dari uji ubah kuota
    yang disengaja, lihat koreksi kontrak form di bawah).
  - **Koreksi hasil audit AD-09 — kontrak form (`expected_quota`), Step 6.6:** `VoucherFormModal` (Step 5.8) mengirim body
    yang sama untuk POST & PUT (`code, title, discount_type, discount_value, product_id, quota, valid_from, valid_to,
    is_active`; angka sebagai teks, `quota` = kuota saat halaman dimuat) dan **tidak mengirim `expected_quota`**. Akibatnya
    (dibuktikan lewat HTTP dengan body form yang sama): edit tanpa perubahan kuota hanya berhasil bila kuota di database belum
    berubah sejak form dibuka; **edit informasi saja (mis. judul) ditolak 400** ("…wajib menyertakan kuota awal form
    (expected_quota)…") bila sejak form dibuka ada checkout/pembatalan yang mengubah kuota — data tetap aman (judul tidak
    tersimpan, kuota tidak tertimpa), tetapi pesannya membingungkan. Mengubah kuota dari UI selalu 400. Step 6.6: form mode
    ubah mengirim `expected_quota` = kuota saat form dibuka (tidak saat membuat); 409 → tampilkan pesan & muat ulang papan
    (`apiClient` belum meneruskan `fieldErrors`); **mock `saveAdminVoucher` disesuaikan dengan aturan yang sama** agar
    kontrak mock = API. Dengan expected_quota: edit informasi berhasil & kuota terbaru utuh; ubah kuota basi → 409.
  - **Open issue — distribusi voucher (menunggu keputusan bisnis kelompok/dosen; kandidat CR terpisah):** tidak ada kode
    yang membuat baris `user_vouchers` — server hanya membaca, menandai terpakai saat checkout, dan mengosongkan `used_at`
    saat batal; klaim hanya dibuat seed (pelanggan demo) dan seed mock. Dokumen hanya menyebut `user_vouchers` "voucher milik
    pelanggan", `claimed_at` "waktu diterima", FR-23, dan validasi "milik pelanggan" — tanpa FR/UC/layar cara menerima
    voucher. Akibatnya voucher baru buatan Owner (dan kode di banner Beranda) tidak bisa dipakai pelanggan tanpa klaim
    (checkout: "Voucher tidak berlaku untuk pesanan ini"). Bukan bug AD-09/6.3; **tidak** diasumsikan semua voucher otomatis
    dimiliki pelanggan; endpoint klaim tidak dibuat.
  - **Perbaikan checkout terpisah (hasil audit AD-09, disetujui) — klaim voucher bersyarat** (`orderCreate.service.js`
    `claimVoucher`; perubahan logis terpisah dari API AD-09): sebelumnya checkout menilai voucher dari SELECT biasa
    (snapshot) lalu `UPDATE vouchers … WHERE quota > 0` saja, sehingga perubahan Owner yang commit di antaranya terlewat —
    direproduksi di MySQL: voucher dinonaktifkan tetap terpakai, diskon 10.000 → 1.000 tetap memotong 10.000. Kini UPDATE
    kuota bersyarat **pada versi terbaru setelah menunggu kunci baris** (current read): `is_active`, `valid_from ≤ hari ini
    (WIB) ≤ valid_to`, `quota > 0`, dan `code`/`discount_type`/`discount_value`/`product_id` = nilai mentah yang dievaluasi
    checkout (kuota tidak dibandingkan dengan angka lama). Gagal → 409 "Voucher tidak berlaku untuk pesanan ini" dan seluruh
    transaksi checkout di-rollback. Tanpa FOR UPDATE baru; urutan kunci tetap users → store_settings → desain → daily_stocks →
    user_vouchers → vouchers (sama dengan pembatalan: orders → daily_stocks → user_vouchers → vouchers; transaksi Owner hanya
    baris voucher). Perubahan yang tidak memengaruhi diskon (judul, kuota naik, periode diperpanjang) tidak menolak checkout.
    Uji: `server/tests/orderVoucherClaim.test.js` (16) — server 464/464 (termasuk uji BIGINT AD-09); terhadap kode
    sebelum perbaikan 9 test gagal. `assertRolledBack` memeriksa orders, order_items, payments, riwayat status, poin,
    `daily_stocks.qty_sold`, `user_vouchers.used_at`, dan `vouchers.quota` = nilai sebelum checkout (fake memulihkan seluruh
    tabel termasuk perubahan Owner; commit Owner terpisah dibuktikan di MySQL). Dua uji **checkout lebih dahulu** (hook
    setelah klaim): pesanan 201 dengan diskon yang diklaim (10.000, bukan 1.000), perubahan Owner (diskon, nonaktif, judul /
    periode) tetap tersimpan, kuota tepat −1 dan tidak tertimpa, satu klaim & satu pesanan bervoucher, checkout berikutnya
    ditolak tanpa sisa data; kedua uji ini juga lulus pada kode lama (perilaku checkout lebih dahulu memang tidak berubah).
    MySQL 8: **Owner lebih dahulu** (sesi SQL mengunci → ubah → commit saat checkout berjalan) untuk nonaktif, nilai & jenis
    diskon, produk, kode, periode berakhir/mulai, kuota 0 → **8/8 checkout 409 tanpa sisa** (orders, order_items, payments,
    riwayat, poin, stok, klaim, kuota tidak berubah); **checkout lebih dahulu** (checkout memegang kunci voucher, tertahan di
    INSERT pesanan) → checkout 201 dengan aturan lama, lalu `PATCH …/active` / `PUT` diskon (+ expected_quota) Owner 200
    sesudahnya, pemakaian tidak tertimpa, pembatalan tetap mengembalikan kuota & klaim — 2/2; server sebelum perbaikan: 7
    skenario Owner-lebih-dahulu lolos 201. 10 putaran × 20 checkout serentak + nonaktif di tengah: 108 berhasil, 92 ditolak
    409/400, 0 status lain/5xx/deadlock, kuota = klaim terpakai = pesanan aktif, checkout setelah PATCH selalu ditolak;
    108 pembatalan bersamaan dengan aktifkan ulang semua 200. Regresi setelah perbaikan: AD-09 9/9, konkurensi kuota 0
    hilang, ubah kuota vs checkout 0 tidak sah, checkout/batal 6.3 + AD-06/AD-07 3/3, AD-02 10/10, AD-08 10/10, AD-10 9/9,
    37 endpoint identik dengan `2532a10`.
  **6.4.10 AD-11 Pengaturan (FR-36 · UC-30 · A-11 · BR-022 · BR-02 · BR-05 · BR-12 · TF-10) — bertahap per checkpoint:**
  **C1 selesai** (commit `ba72b83`: aturan, validator, GET); **C2 selesai** (commit `628d04f`: PUT profil, PUT jam
  operasional, PATCH metode bayar); **C3 akun staf selesai** (commit `10f4bb5`: C3a GET, C3b POST, C3c PATCH
  aktif/nonaktif — butir C3 di bawah). **Integrasi MySQL 8 — Validasi AD-11 (C3), dengan smoke test C2: selesai**
  (commit `b53296a`; butir di bawah; termasuk perbaikan F-1 & F-2). **C4 perbaikan checkout (T1 pengaturan basi saat
  checkout → 409 + rollback; T2 metode bayar diperiksa ulang di dalam transaksi checkout & ganti metode): selesai**
  (commit `5b74ba6`) — final review tanpa temuan Critical/High; butir "C4" di bawah. Integrasi MySQL untuk C4 selesai
  (`tests-mysql/09`, `10`); C2 di MySQL: PUT profil & PATCH metode bayar asli teruji bersamaan dengan checkout (T1-c,
  T2-d, T2-e), PUT jam operasional asli baru diuji di unit test (T1-a meniru penulisannya lewat SQL).
  - Endpoint — **hanya Owner** (SPEC §2: pengaturan toko & akun staf hak Owner; Staf & pelanggan 403, tamu 401). Kontrak =
    client `services/settingsService.js` / mock `settingsAdmin.js`: `GET /api/admin/settings` → `{profile, hours,
    paymentMethods}`; `PUT /api/admin/settings` (6 field profil) → profil; `PUT /api/admin/settings/operating-hours
    {hours}` → 7 baris urut hari; `PATCH /api/admin/payment-methods/:code/active {is_active}` → `{method_code, is_active}`
    (berbeda dari `GET /api/payment-methods` filter AD-03 yang tidak diubah). Akun staf `/api/admin/staff` = C3 (butir C3).
  - File: aturan murni `services/adminSettingsRules.service.js` (profil, jam, sakelar metode) & `adminStaffRules.service.js`
    (akun, dipakai C3); pemetaan baris ⇄ respons/data tulis `services/adminSettingsView.service.js` (dipisah di C2 —
    temuan review C1 L-1; rules tetap mengekspor ulang mapper); `services/adminSettings.service.js`; validasi bentuk zod
    `validators/adminSettings.validator.js` (field di luar kontrak dibuang); rute `routes/admin/settings.routes.js` &
    `paymentMethodAdmin.routes.js`; konstanta di `utils/businessConstants.js`.
  - Lingkup (keputusan audit, disetujui): profil = 6 field mock (nama, alamat, WhatsApp, batas pre-order, radius, tarif).
    **Koordinat toko tidak diubah AD-11 (open issue OI-01)** — alamat bisa diganti tanpa menggeser titik hitung ongkir.
    `payment_timeout_minutes` & `review_bonus_points` tidak diatur AD-11 (bukan isi A-11); aturan loyalty milik AD-09.
  - Validasi (pesan & `fieldErrors` = mock): WhatsApp toko = kontrak mock (+62, 9–13 digit termasuk 62, maks. 20 karakter —
    huruf/simbol di antara digit ikut diterima seperti mock); jam operasional **tepat 7 hari unik 1–7**, hari buka jam buka
    < jam tutup, hari tutup disimpan jam null, minimal satu hari buka; minimal satu metode online aktif (BR-05) → 409;
    metode tidak ada → 404; status sama dengan tujuan → 200 tanpa UPDATE. Berbeda dari mock (lebih ketat/tepat):
    angka teks hanya desimal biasa (hex, eksponen, tanda, `.5`, `5.` ditolak — pesan sama dengan mock untuk teks bukan
    angka: "Radius harus lebih dari 0 km"); radius 1,15 diterima (mock menolak karena galat float `x * 100`).
  - **Tanpa pembulatan diam-diam (hasil final review C1, M1):** radius & tarif dinormalisasi menjadi teks desimal kanonik
    (`toDecimalText`, tanpa `Number()`), presisi dicek dari teks (radius ≤ 2 desimal, tarif bulat; nol di belakang koma
    boleh: `"1.150"` → `"1.15"`, `"2500.00"` → `"2500"`), lalu teks itu ditulis apa adanya ke kolom DECIMAL. Sebelumnya
    `"10.0000000000000001"` / `"2500.0000000000000001"` lolos karena `Number()` membulatkannya. Keterbatasan: presisi angka
    JSON (bukan teks) yang hilang saat `JSON.parse` tidak terdeteksi (sama dengan AD-09). Hasil normalisasi bisa NaN —
    penulisan hanya terjadi setelah validasi lolos.
  - **Hari tutup = jam null di respons (L1):** GET/PUT mengirim jam null untuk `is_open = false` walau data lama masih
    menyimpan jam; data DB tidak diubah oleh GET.
  - Transaksi: GET = `runInReadSnapshot` (REPEATABLE READ, 3 query berurutan lewat `tx`, tanpa locking read; `select` 6
    kolom profil). Tulis C2: validasi bentuk & isi **sebelum** transaksi (input tidak sah tidak membuka transaksi);
    di dalam transaksi `lockAdminMasterData` (`store_settings FOR UPDATE`) = operasi pertama, lalu baca kondisi terbaru
    (read view InnoDB dibuat setelah kunci), validasi bisnis (metode bayar; konflik hour_id jam operasional), UPDATE/INSERT
    berurutan tanpa `Promise.all`, lalu respons dibaca ulang lewat `tx`: profil (`findFirst`), jam (`findMany`), metode
    bayar (`findUnique` setelah UPDATE; jalur idempoten tanpa UPDATE memakai baris yang dibaca setelah kunci). Semua penulis pengaturan (profil, jam, metode, loyalty AD-09) memakai kunci yang sama →
    diserialkan: dua Owner menonaktifkan dua metode online terakhir bersamaan → satu 200, satu 409. Urutan kunci
    store_settings → operating_hours / payment_methods; checkout users → store_settings → … (kunci bersama FK
    payment_methods setelahnya) → tanpa urutan silang. Pesanan lama tidak berubah (ongkir, slot, metode tersalin).
  - Uji: `server/tests/adminSettingsRules.test.js`, `adminStaffRules.test.js`, `adminSettingsRoute.test.js` (GET, C1);
    `adminSettingsWriteRoute.test.js` & `adminPaymentMethodRoute.test.js` (C2) dengan fake `tests/helpers/settingsDb.js`
    yang meniru kunci baris (antrian FOR UPDATE), read view pada pembacaan biasa pertama, commit/rollback, serta mendeteksi
    Prisma global, query tumpang tindih, dan baca/tulis sebelum kunci. Rangkaian HTTP → zod → normalisasi → validasi →
    Prisma: nilai tertulis `"1.15"`/`"2500"` dari `"1.150"`/`"2500.00"`; `"10.0000000000000001"`, `"2500.0000000000000001"`,
    `"1.149"`, `"2500.01"` → 400 tanpa transaksi; rollback hari ke-5 jam operasional tanpa perubahan parsial; 10 putaran
    dua PATCH bersamaan → [200, 409]. Sensitivitas (mutasi): baca metode sebelum kunci → 6 gagal; tanpa kunci → 6; baca
    lewat Prisma global → 7; `Promise.all` upsert → 3; radius/tarif ditulis Number → 3; tanpa validasi isi → 2; hari tutup
    menulis jam → 1 (angka mutasi ini diukur sebelum perbaikan review C2; jam kini UPDATE/INSERT, bukan upsert).
  - **Perbaikan hasil final review C2 (L-1, L-2, L-3):**
    · L-1 PATCH metode bayar: `updateMany` wajib `count === 1` dan hasil baca ulang (`findUnique` lewat `tx`) wajib = status
      tujuan; selain itu 409 "Metode bayar gagal diperbarui karena data berubah. Muat ulang halaman lalu coba lagi." +
      rollback (tanpa sukses palsu). Respons dari baris tersimpan (`method_code` = nilai DB — collation `_ci` MySQL bisa
      menyimpan bentuk lain dari input). Urutan: kunci → baca → UPDATE → baca ulang.
    · L-2 konflik `hour_id` data lama: `hour_id` = PK TINYINT tanpa AUTO_INCREMENT. Setelah kunci, SEMUA baris
      `operating_hours` (termasuk di luar 1–7) dibaca; hari yang ada → UPDATE berdasarkan `day_of_week` (hour_id tetap),
      hari yang belum ada → INSERT `hour_id = day_of_week` — bila hour_id itu sudah dipakai baris hari lain → **409 sebelum
      menulis** dengan pesan yang menyebut hari & baris penyebab ("…Perbaiki tabel operating_hours (hour_id = day_of_week
      untuk hari 1–7), lalu simpan ulang."). ID tidak diganti otomatis. P2002 lain dari database TIDAK dipetakan ke 409
      (tetap 500 umum, rollback penuh).
    · L-3 hari di luar 1–7: GET & PUT hanya mengirim hari 1–7 (`onlyValidDays`); baris lama di luar rentang tidak dikirim,
      tidak dihapus, dan tidak diubah (PUT hanya menulis 7 hari sah). Sebelumnya baris hari ke-8 ikut terkirim sehingga form
      AD-11 mengirim 8 baris dan selalu ditolak.
    · Uji tambahan (route): count 1/0, baca ulang tidak sesuai/hilang → 409 tanpa commit, `method_code` dari DB, jalur
      idempoten tanpa tulis; konflik hour_id (termasuk baris di luar 1–7, beberapa konflik sekaligus) → 409 tanpa tulis &
      data utuh; P2002 lain → 500 & rollback; GET/PUT dengan baris hari 8 & 0 → 7 hari, baris lama utuh. Sensitivitas
      (mutasi): tanpa cek count → 1 gagal; baca ulang tidak dibandingkan → 1; respons dari input → 1; tanpa baca ulang → 3;
      baca ulang lewat Prisma global → 7; tanpa deteksi konflik → 2; deteksi mengabaikan baris di luar 1–7 → 1; baca jam
      sebelum transaksi → 9; tanpa filter hari (GET & PUT) → 2, GET saja → 1, PUT saja → 1. Server 527/527 (C2 sebelum
      perbaikan 517, baseline C1 494).
  - Keterbatasan & catatan Step 6.6: urutan metode dalam satu kelompok mengikuti `GET /api/payment-methods` (kelompok lalu
    nama), berbeda dari urutan tabel mock; `apiClient` belum meneruskan `fieldErrors`; respons PUT profil berupa number
    (dibaca ulang dari DB) walau normalisasi server memakai teks. MySQL 8 (kunci sungguhan, DECIMAL/TIME) diuji setelah
    C2–C4 selesai.
  - **C3 Akun staf (FR-36 · FR-26 · UC-30; UI/UX AD-11 "menambah atau menonaktifkan akun staf"; PRD "staff accounts with
    roles (Owner, Staf)") — selesai (commit `10f4bb5`).** Endpoint **hanya Owner aktif** (tamu 401, Staf & pelanggan 403,
    Owner nonaktif 401 `SESSION_INVALID`); kontrak = client `settingsService.js` getAdminAccounts / addAdminAccount /
    setAdminAccountStatus (mock `settingsAdmin.js`). Akun = `{user_id (string), name, email, phone, role, is_active,
    created_at}` (`toAdminAccount`). File: `services/adminStaff.service.js` (GET, POST), `adminStaffStatus.service.js`
    (PATCH; dipisah agar ±150 baris), `adminStaffRules.service.js` (aturan murni, C1 + cek ulang pelaku),
    `routes/admin/staff.routes.js`; validasi bentuk `validateStaffBody` / `validateStaffId` / `validateActiveBody` (C1).
    Tidak ada hapus akun, ubah peran, maupun ubah data akun (keputusan audit no. 7; rute itu 404). Schema tidak berubah.
    · **C3a `GET /api/admin/staff`** → akun Owner & Staf **termasuk nonaktif**, urut peran (Owner dulu) → nama → id
      numerik; pelanggan disaring di query (`role in [staf, owner]`); satu `findMany` dengan **select whitelist 7 kolom**
      tanpa transaksi (keputusan C3 D3) — `password_hash` & `google_id` tidak pernah dibaca, apalagi dikirim.
    · **C3b `POST /api/admin/staff` `{name, email, phone, password, role}` → 201.** Aturan registrasi server: nama ≤ 100,
      email valid & huruf kecil, HP dinormalisasi seperti login (spasi ( ) - dibuang) lalu `^\+62\d{8,13}$`, sandi ≥ 8
      karakter & ≤ 72 byte, peran Owner/Staf (Owner boleh membuat Owner). Urutan: validasi isi (gagal → 400 fieldErrors
      mock, tanpa query/hash/tulis) → cek unik email/HP terhadap **seluruh** tabel users (pelanggan & akun nonaktif juga;
      email tanpa beda huruf) → **bcrypt cost 12 di luar transaksi** → INSERT tunggal **tanpa kunci store_settings**
      (keputusan C3 D1: pembuatan akun hanya menambah akun aktif, jadi tidak bisa melanggar invariant Owner) → dibaca
      balik lewat select whitelist. **UNIQUE(users.email/phone) = otoritas terakhir**: dua request bersamaan yang lolos
      cek awal → yang kalah P2002 → 400 `fieldErrors.email/phone` (keputusan C3 D4) **hanya** bila `meta.target` persis
      `users_email_key`/`users_phone_key` (atau nama field `email`/`phone`); P2002 lain (google_id, PRIMARY, tak dikenal)
      tetap 500. Field di luar kontrak (`is_active`, `google_id`, `user_id`, `password_hash`, …) dibuang zod; akun baru
      selalu aktif tanpa google_id. Kata sandi asli tidak disimpan, tidak dikirim, dan tidak diteruskan ke Prisma.
    · **C3c `PATCH /api/admin/staff/:id/active` `{is_active}` → 200 akun (dibaca ulang).** Satu transaksi:
      `lockAdminMasterData` (`store_settings FOR UPDATE`, operasi pertama — kunci yang sama dengan C2 & AD-06/07/09) →
      **cek ulang pelaku setelah kunci** (nonaktif → 401 `SESSION_INVALID`, keputusan C3 D2; bukan Owner → 403) → baca
      target (select whitelist; bukan Owner/Staf / tidak ada → 404 **sebelum** UPDATE, jadi baris pelanggan tidak pernah
      dikunci) → bila menonaktifkan Owner lain: hitung ulang Owner aktif → akun sendiri 400, **Owner aktif terakhir 409**
      → status sudah sama dengan tujuan → 200 tanpa UPDATE (idempoten) → `updateMany` bersyarat `{userId, role in [staf,
      owner], isActive: !tujuan}` hanya `data: {isActive}`, `count` wajib 1 → baca ulang wajib = tujuan; selain itu 409
      "Status akun gagal diperbarui karena data berubah…" + rollback. ID tidak sah 400 `INVALID_ID`. Tanpa `FOR UPDATE`
      pada users (satu-satunya penulis `users.is_active` = endpoint ini, sudah diserialkan kunci store_settings). Urutan
      kunci: checkout users(pelanggan) → store_settings; PATCH store_settings → users(admin); transaksi lain yang menyentuh
      baris users admin (riwayat status AD-04 = kunci S lewat FK `changed_by`, reset sandi) tidak pernah menunggu
      store_settings → tanpa siklus. Penonaktifan langsung berlaku: middleware auth membaca `is_active` setiap request
      (token lama → 401), login menolak akun nonaktif.
    · **Invariant minimal satu Owner aktif** dijaga dua pengaman yang saling menutup — cek ulang pelaku (pelaku selalu
      Owner aktif, ikut terhitung) + larangan menonaktifkan akun sendiri — sehingga cabang 409 "Owner aktif terakhir"
      tidak tercapai lewat urutan normal; cek 409 dipertahankan sebagai lapis ketiga (diuji dengan hitungan yang
      dipalsukan). **Dua Owner saling menonaktifkan bersamaan:** yang pertama memegang kunci berhasil; yang kedua menunggu,
      lalu cek ulang pelaku menemukan dirinya sudah nonaktif → 401 `SESSION_INVALID` → tepat satu Owner aktif tersisa.
      Pelaku yang dinonaktifkan selagi menunggu kunci tidak bisa melanjutkan permintaan apa pun (termasuk menonaktifkan
      Owner ketiga atau dirinya sendiri).
    · Uji (Prisma dipalsukan): `adminStaffRoute.test.js` (7, GET), `adminStaffCreateRoute.test.js` (12, POST),
      `adminStaffStatusRoute.test.js` (16, PATCH), `adminStaffRules.test.js` (+1 cek pelaku). Fake
      `tests/helpers/settingsDb.js` diperluas secara kompatibel (opsi `userRows`): auth membaca data committed terbaru,
      `user.create` menegakkan UNIQUE seperti MySQL (email tanpa beda huruf, phone, google_id, PK) dengan P2002 +
      `meta.target`, `tx.user.updateMany` dievaluasi ulang pada data terbaru saat commit. Skenario: hak akses tanpa
      query/transaksi; kontrak & urutan; tanpa data sensitif (seed berisi hash & google_id); normalisasi; hash bcrypt
      (`getRounds` = 12, `compare`); duplikat terhadap Staf/Owner/pelanggan; dua POST bersamaan (keduanya lolos cek awal →
      satu 201, satu 400 dari UNIQUE); P2002 lain → 500 dan log tanpa kata sandi; login `/api/auth/login` dengan akun baru;
      PATCH Staf/Owner aktif↔nonaktif, 404 pelanggan, `INVALID_ID`, akun sendiri, idempoten, `count` 0 / baca ulang tidak
      sesuai → 409, hanya kolom `is_active` berubah (semua kolom semua pengguna dibandingkan); konkurensi 10 putaran dua
      Owner saling menonaktifkan → selalu [200, 401], tepat satu Owner aktif; skenario pelaku dinonaktifkan selagi menunggu
      kunci (deterministik: request pertama ditahan memegang kunci, request kedua lolos auth lalu menunggu) → 401, tanpa
      efek. Sensitivitas (mutasi): GET 8/8 terdeteksi (tanpa select, filter setelah baca, Staf diizinkan, …); POST 13/13
      (cek unik hanya akun admin, P2002 membabi buta / substring, cost 10, teks asli, field sisipan, kunci store_settings,
      kata sandi di log, …); PATCH 15/15 (tanpa kunci → 11 gagal; cek pelaku sebelum kunci → 11; tanpa cek pelaku → 11;
      tanpa cek pelaku + tanpa cek Owner terakhir → 12; Owner aktif dihitung sebelum kunci → 2; tanpa cek count → 1; tanpa
      baca ulang → 5; UPDATE menyentuh kolom lain → 3; `FOR UPDATE` users sebelum cek peran → 13; …). Server 563/563 (C2
      527).
    · **Batas bukti:** fake membuktikan LOGIKA transaksi (urutan, kunci sebagai operasi pertama, baca setelah kunci,
      serialisasi lewat antrian kunci tiruan, rollback). **Belum terbukti — MySQL 8 (tahap C4):** kunci baris InnoDB &
      read view setelah `BEGIN` Prisma, tidak adanya deadlock nyata dengan checkout & AD-04, bentuk `meta.target` P2002
      di Prisma 6.19.3 + MySQL, collation `_ci` email, timeout transaksi Prisma (default maxWait 2 s / timeout 5 s) saat
      antre di belakang checkout. → Kini dibuktikan di butir "Integrasi MySQL 8 — Validasi AD-11 (C3)" di bawah (dua
      temuan nyata F-1 & F-2 diperbaiki).
    · Catatan & temuan terbuka: (1) Step 6.6 — `PengaturanPage` membaca `user.user_id`, sesi API memakai `userId`, jadi
      label "Akun Anda" tidak muncul di mode API (server tetap menolak 400); `AdminAccountFormModal` mengecek email/HP ganda
      hanya terhadap akun admin (server memeriksa semua pengguna); `apiClient` belum meneruskan `fieldErrors`. (2) Regex HP
      registrasi & konstanta bcrypt 12 kini ada di `auth.service`, `profile.validator`, `profile.service`, dan
      `adminStaffRules`/`adminStaff` — pola yang sudah ada; penyatuan menyentuh fitur auth/profil di luar AD-11 (belum
      dilakukan). (3) Pesan "Email sudah terdaftar" memungkinkan Owner mengetahui email pelanggan terdaftar (Owner memang
      melihat email pelanggan di AD-10). (4) Error 500 Prisma dicatat `errorHandler`; argumen create tidak memuat kata sandi
      asli (hanya hash). (5) Audit log aksi admin (FR-37, Could) tetap Step 6.5.
  - **Integrasi MySQL 8 — Validasi AD-11 (C3), dengan smoke test C2 — selesai (commit `b53296a`).** Harness terpisah dari
    unit test: `server/tests-mysql/` (`npm run test:mysql` → `run.sh`: container MySQL 8 sementara di tmpfs, port lokal
    33306, database `ovenco_c4_test`, akun aplikasi `c4app` hanya pada database uji; guard menolak port 3306 / nama
    database tanpa `_test`; container dihapus di akhir; log & hasil di `/tmp/c4`, tidak di repo). Hasil akhir (container
    baru, MySQL 8.0.46, Prisma 6.19.3): **42/42 skenario lulus** (35 skenario C3/C2/timeout/sesi + 7 skenario I1–I7),
    **`lock_deadlocks` = 0**, unit test server **588/588**. Schema, migrasi, dan frontend tidak berubah.
    · Terbukti di MySQL nyata: read view REPEATABLE READ dibuat pada SELECT biasa pertama (bukan BEGIN / FOR UPDATE);
      invariant minimal satu Owner aktif dengan 2/3/4 Owner saling menonaktifkan (30 putaran, selalu tepat 1 tersisa);
      P2002 `meta.target` = string nama indeks (`users_email_key`, `users_phone_key`, `users_google_id_key`), sesuai
      asumsi C3b; POST bersamaan 2/5/10 → tepat satu 201; collation `utf8mb4_unicode_ci` (PAD SPACE) menyamakan huruf
      besar/kecil, `ß`=`ss`, `é`=`e` (cek awal JS meloloskan, UNIQUE + P2002 tetap → 400). Smoke C2: PUT profil
      menunggu kunci, DECIMAL/TIME tersimpan tepat, dua metode online terakhir → [200, 409].
    · **F-1 (deadlock tiga arah, diperbaiki):** urutan lama PATCH (store_settings X → UPDATE baris admin) membentuk siklus
      dengan AD-04 Selesai (S baris admin lewat FK `changed_by` → S baris pelanggan lewat FK poin) dan checkout (baris
      pelanggan X → store_settings X). Urutan baru `adminStaffStatus.service.js`: validasi target di luar transaksi
      (pelanggan / tidak ada → 404 tanpa kunci) → kunci baris target → kunci store_settings → cek ulang pelaku →
      invariant → UPDATE bersyarat → baca ulang. Siklus deterministik D2b & beban campuran D3 (3 × 50 putaran) → 0
      deadlock; `performance_schema.data_locks` membuktikan baris pelanggan tidak pernah dikunci.
    · **Deadlock checkout × pembatalan pelanggan yang sama (diperbaiki):** pembatalan memegang `daily_stocks` lalu
      menunggu kunci S baris pelanggan (INSERT riwayat/poin) sementara checkout memegang baris pelanggan lalu menunggu
      `daily_stocks` (terbukti 6/6). `cancelMyOrder` kini menulis refund poin & riwayat SEBELUM mengembalikan stok &
      voucher (isi & atomicity tetap). I6: 20/20 tanpa deadlock, data stok/kuota/klaim/pesanan/riwayat konsisten.
    · **F-2 (timeout transaksi Prisma, diperbaiki):** `timeout` Prisma tidak menghentikan pernyataan yang menunggu kunci;
      setelah P2028 dengan pernyataan masih berjalan, koneksi pool rusak (401 `SESSION_INVALID` palsu, P1017, panic
      engine, atau respons bergeser permanen). Perbaikan di `server/src/lib/`:
      `transactionLockWait.js` — setiap transaksi interaktif memasang `innodb_lock_wait_timeout` 2 s (1205 sebelum
      timeout Prisma) lalu memulihkan nilai sesi asli saat commit, rollback, dan error (global MySQL tidak diubah);
      `prismaClients.js` + `prisma.js` — dua client: utama `connection_limit` 5 (query biasa & auth) dan transaksi 4
      (`timeout` 15 s, `maxWait` 2 s; opsi per panggilan seperti `runInReadSnapshot` 10 s tetap berlaku), semua
      `prisma.$transaction` dialihkan tanpa mengubah 33 titik transaksi; `$disconnect` menutup kedua pool (SIGTERM/SIGINT
      di `server.js`); `transactionProbe.js` — `SELECT <nonce>, CONNECTION_ID()` sebagai pernyataan pertama, mismatch →
      tepat satu `SELECT` read-only tambahan (memicu Prisma membuang koneksi rusak) → retry maks. 2 kali sebelum callback
      bisnis; error bisnis tidak di-retry, callback tidak pernah dijalankan dua kali. Terbukti: I3 20/20 (koneksi rusak
      hilang dari PROCESSLIST, retry di CONNECTION_ID lain, 4 transaksi berikutnya benar, tanpa panic/P1017, koneksi sehat
      tidak terganggu); 7 lock wait berturut-turut commit (13,6 s), 8 → P2028 dengan rollback bersih lalu pulih; checkout
      10 produk yang terkena P2028 → 500 tanpa perubahan stok/pesanan, checkout berikutnya 201; auth tetap cepat saat
      pool transaksi penuh.
    · **Keterbatasan:** (1) pemulihan koneksi bergantung pada perilaku internal **Prisma 6.19.3** yang tidak
      terdokumentasi (pernyataan tambahan setelah mismatch membuat Prisma membuang koneksi; probe satu kolom terbukti
      gagal) — versi dipin persis; **setiap upgrade Prisma wajib mengulang I3–I5** (`tests-mysql/08`); (2) lebih dari 7
      lock wait berturut-turut dalam satu transaksi tetap P2028 (500), kini pulih bersih; (3) lock wait > 2 s kini 500,
      bukan sukses lambat (pemetaan error tidak diubah); (4) setelah P2028 nilai sesi 2 s bisa tertinggal di koneksi pool
      transaksi sampai transaksi berikutnya memulihkannya (query biasa tidak terdampak — pool terpisah); (5)
      `connection_limit` di `DATABASE_URL` ditimpa 5/4; (6) shutdown tanpa batas waktu paksa; (7) endpoint snapshot
      AD-02/AD-08/AD-09/AD-10 belum diuji di MySQL pada tahap ini (kode tidak berubah; hanya wrapper transaksi).
  - **C4 Perbaikan checkout T1/T2 (FR-12 – FR-16 · BR-05 · BR-06 · BR-09 · BR-12 · C-14 · C-15 · AD-11) — selesai
    (commit `5b74ba6`).** Hasil uji: unit test server **609/609**, integrasi MySQL 8 **51/51** (42 sebelumnya + 4 skenario `09` + 5
    skenario `10`), `lock_deadlocks` = 0. Schema, migrasi, kontrak API sukses, dan frontend tidak berubah.
    · **T1 pengaturan basi saat checkout → 409 + rollback.** `loadAndValidate` membaca pengaturan di luar transaksi; setelah
      `lockRows` (users X → store_settings X) checkout membaca ulang `store_settings` & `operating_hours` (SELECT biasa
      pertama → read view dibuat setelah kunci, jadi melihat commit Owner terakhir) lalu membandingkan field yang dipakai
      pesanan: selalu batas pre-order & jam operasional; pembayaran online → `payment_timeout_minutes`; delivery →
      koordinat, radius, tarif; tukar poin → `redeem_points_unit`, `redeem_value`. Berbeda → 409 "Pengaturan toko baru saja
      diperbarui. Muat ulang halaman checkout lalu coba lagi." sebelum ada tulisan apa pun. Perubahan yang tidak dipakai
      (nama, WhatsApp, poin perolehan) tetap 201. Semua penulis pengaturan (AD-11 profil/jam/metode, AD-09 loyalty)
      mengunci store_settings lebih dulu, jadi nilai yang dibaca final sampai commit.
    · **T2 metode bayar masih aktif di dalam transaksi → 409 + rollback** (pesan `PAYMENT_METHOD_UNAVAILABLE_TEXT`).
      Checkout: metode terpilih dibaca ulang setelah kunci store_settings (AD-11 satu-satunya penulis `payment_methods`
      dan mengunci store_settings lebih dulu). Ganti metode (`PATCH /api/orders/:no/payment`): baris metode tujuan dikunci
      `FOR SHARE` (locking read → nilai terbaru) sebelum UPDATE pembayaran. Urutan kunci: pesanan X → [Bayar di Toko:
      UPDATE pesanan + INSERT riwayat — S baris pelanggan lewat FK] → metode S → pembayaran X. Riwayat ditulis SEBELUM kunci
      metode agar transaksi tidak menunggu baris pelanggan sambil memegang kunci metode (InnoDB mengantrekan S di belakang
      X AD-11 yang menunggu → siklus tiga arah dengan checkout pelanggan yang sama); dibuktikan T2-d. Metode yang sudah
      nonaktif sebelum request tetap 400 "Pilih metode pembayaran." (perilaku lama).
    · File: `server/src/services/checkoutSettingsRules.service.js` (baru, aturan murni `changedCheckoutSettings`);
      `orderCreate.service.js` (`assertSettingsUnchanged`, `assertMethodStillActive`); `payment.service.js`
      (`lockActiveMethod`, urutan tulis ganti metode); `utils/businessConstants.js` (`PAYMENT_METHOD_UNAVAILABLE_TEXT`).
      Uji unit: `server/tests/orderSettingsStale.test.js` (T1), `paymentMethodStale.test.js` (T2), helper
      `tests/helpers/orderDb.js` (kait `whileWaitingSettingsLock` / `whileWaitingMethodLock`, `findUnique` metode, commit
      transaksi lain bertahan setelah rollback), `paymentRoute.test.js` (asersi kunci pesanan disesuaikan). Integrasi:
      `server/tests-mysql/09-checkout-settings.it.test.js` (T1-a batas pre-order & jam operasional berubah selagi checkout
      menunggu kunci → 409 tanpa data parsial; T1-b perubahan tidak relevan → 201; T1-c PUT profil asli × checkout asli,
      hanya 201/409, 0 deadlock) dan `10-payment-method-active.it.test.js` (T2-a checkout; T2-b/T2-c ganti metode online &
      ke Bayar di Toko → 409 + rollback pesanan/riwayat; T2-d urutan kunci tanpa deadlock; T2-e PATCH metode asli ×
      checkout × ganti metode, tanpa 5xx/deadlock/data parsial).
    · **Keterbatasan & pekerjaan lanjutan (hasil final review, implementasi tidak diubah):**
      (L1) `getCartView` membaca `preorder_cutoff_time` dalam query terpisah yang paralel dengan pembacaan pengaturan
      `loadAndValidate`; bila Owner commit tepat di antara keduanya, tanggal siap divalidasi dengan batas lama tanpa 409
      (jendela sangat sempit) — lanjutan: pakai satu pembacaan pengaturan untuk keranjang & checkout.
      (L2) Jam operasional dibandingkan untuk ketujuh hari, bukan hanya hari tanggal siap: perubahan jam hari lain juga
      menolak checkout yang sedang berjalan (aman, 409 lalu coba lagi; konservatif).
      (L3) Uji beban T1-c dan T2-e tidak mewajibkan minimal satu 409, jadi bisa lulus tanpa race benar-benar terjadi;
      bukti race ada di skenario deterministik T1-a, T2-a – T2-d.
      (L4) Judul uji "pengaturan sama → 201; ongkir … dibaca ulang setelah kunci" (`orderSettingsStale.test.js`) kurang
      tepat: quote memakai pengaturan dari `loadAndValidate` (identik dengan hasil baca ulang bila lolos T1).
      (L5) T2-d memakai asersi waktu `patch.ms < 1500` — berpotensi flaky di mesin lambat.
      (L6) Di MySQL nyata T1 baru diuji untuk batas pre-order & jam operasional; ongkir, radius, koordinat, poin, dan
      batas pembayaran online hanya diuji di unit test (jalur perbandingan sama). PUT jam operasional asli belum diuji
      bersamaan dengan checkout di MySQL.
      Catatan: lock wait > 2 s (F-2) tetap 500 — checkout yang menunggu kunci store_settings lebih lama dari itu tidak
      menjadi 409.
- 6.5 (C1–C5 selesai, di-commit & di-push; branch `feat/step-6.5-payment-notification-jobs` dari `origin/main`
  `54d5532`, belum di-merge ke `main`):
  C1 Notification System → C2 Auto-cancel Online Payment (BR-06) → C3 Auto-cancel Bayar di Toko (BR-07) → C4 Payment
  Webhook (fungsi internal, bukan endpoint HTTP) → C5 Audit Log (FR-37). Pengujian & dokumentasi lintas checkpoint.
  **C1 — Notification System (FR-18 · BR-007 · SPEC §4 · C-24) + perbaikan F-C1-1: selesai, di-commit & di-push
  `a0c3c17`.**
  - Aturan: setiap perubahan status = tepat 1 baris `order_status_histories` + 1 notifikasi `order_status` untuk PEMILIK
    pesanan; transaksi poin `earn` (Selesai), `review_bonus`, `refund` (batal) = 1 notifikasi `points`; `redeem` tidak
    dinotifikasi (sama dengan mock). Teks, tanda (+/−), format angka, dan pemotongan 100/255 karakter = client
    `constants/notification.js` & `utils/rules/notification.js`. Notifikasi promo tidak dibuat (tidak ada pemicu di
    SPEC/mock — keputusan D3).
  - Transaksi: `recordOrderStatus(tx, …)` dan `recordPointsNotice(tx, …)` selalu di transaksi yang sama dengan perubahan
    bisnisnya; hanya `logNotificationEmails` (salinan email ke console `[DEV EMAIL]`, TF-14 · SPEC §10) yang berjalan
    setelah commit lewat `emailAfterCommit`. Rollback → tanpa riwayat, notifikasi, maupun email. Satu-satunya penulis
    `order_status_histories` kini `orderStatusRecorder.service.js` (nested create di checkout diganti; jumlah riwayat per
    transisi tidak berubah).
  - Urutan kunci: INSERT notifikasi ditaruh di kelompok INSERT ber-FK `users` (setelah kunci `orders`, sebelum
    `daily_stocks` / voucher / kunci S metode). Kunci baru: simulasi lunas & AD-04 status non-Selesai kini mengambil kunci S
    baris pelanggan (FK notifikasi) setelah `orders` X — pola pembatalan pelanggan Step 6.3; bonus ulasan menambah kunci S
    baris `orders` di akhir transaksi. Terbukti tanpa deadlock di N5/N6.
  - **Perbaikan F-C1-1 (deadlock lama sejak Step 6.3, disetujui sebagai bagian C1):** batal pelanggan × checkout pelanggan
    yang SAMA. Urutan lama `cancelMyOrder`: `orders` X → UPDATE `orders` → `payment.updateMany WHERE order_id` (next-key
    lock indeks `payments_order_id_fkey`, sampai supremum bila pesanan ini entri terakhir) → INSERT poin/riwayat
    (FK → `users` S, menunggu checkout) — sementara checkout (`users` X) INSERT `payments` pesanan baru menunggu gap itu →
    siklus. Urutan baru: `orders` X → INSERT poin refund, riwayat, notifikasi (`users` S) → UPDATE `orders` → UPDATE
    `payments` → `daily_stocks` → voucher. Satu transaksi; kontrak API & efek pembatalan tidak berubah.
  - File baru: `server/src/services/notificationRules.service.js` (fungsi murni), `orderStatusRecorder.service.js`;
    uji `server/tests/notificationRules.test.js`, `orderStatusRecorder.test.js`, `notificationPathsRoute.test.js`,
    `server/tests-mysql/11-notifications.it.test.js` (N1–N6), `12-cancel-checkout-lock-order.it.test.js` (X1–X2). Diubah:
    `utils/businessConstants.js` (tipe, teks, alasan poin, prefix email), `orderCreate.service.js`, `payment.service.js`,
    `orderActions.service.js` (notifikasi + urutan F-C1-1), `adminOrderActions.service.js`, `review.service.js` (select
    `orderId` untuk tautan notifikasi), helper uji `tests/helpers/orderDb.js` (tabel `notifications`, `user.findMany`, op
    `payment.updateMany`), `tests/adminOrderActionsRoute.test.js` (+4 uji C1). `notification.service.js` tidak diubah.
    Tanpa perubahan schema/migrasi, frontend, atau dependensi.
  - **Terverifikasi:**
    · `npm test` 638/638 (sebelum C1 609/609; +29 uji; uji batal kini juga memeriksa urutan pernyataan riwayat/notifikasi
      → `payment.updateMany` → stok — urutan saja, bukan bukti locking). Mutasi: riwayat ganda → 19 uji gagal; email
      dicetak sebelum commit → 5 uji gagal.
    · MySQL 8.0.46, `npm run test:mysql` penuh pada container baru: **59/59 lulus, `lock_deadlocks` 0** (01–10 lama tetap
      lulus; 11 N1–N6; 12 X1–X2).
    · X1 deterministik × 5 (checkout memegang `users` X lalu INSERT orders + payments selagi batal asli menunggu `users`):
      0 deadlock; batal tidak memegang kunci `payments` saat menunggu; stok ready kembali tepat, kuota voucher +1, klaim
      bisa dipakai lagi, poin kembali tepat sekali, tepat 1 riwayat & 1 notifikasi Dibatalkan & 1 notifikasi poin.
      Kontrol negatif: X1 dijalankan pada urutan LAMA → gagal "Deadlock found when trying to get lock" (kode dikembalikan
      ke versi perbaikan sesudahnya). Reproduksi awal: 3/3 deadlock pada `54d5532` tanpa C1, 3/3 dengan C1 sebelum
      perbaikan.
    · X2 HTTP asli × 20 (checkout + batal pesanan terbaru pelanggan yang sama bersamaan): 20× 201 + 20× 200, 0 deadlock,
      stok/voucher/poin konsisten.
    · N6 beban campuran 3 rangkaian × 15 putaran setelah perbaikan: 0 deadlock tiap rangkaian, tanpa 5xx, jumlah riwayat =
      notifikasi status untuk setiap pesanan (sebelum perbaikan: `cancel 500` pada 2 dari 3 rangkaian).
    · N1 rollback (riwayat & notifikasi sudah di-INSERT — kunci IX `notifications` terlihat — lalu di-rollback, tanpa
      email); N2 10× Selesai bersamaan → tepat 1 riwayat/notifikasi status/notifikasi poin/earn; N3 10× simulasi lunas →
      1; N4 5× batal dengan poin → 1 refund & 1 notifikasi poin; N5 AD-04 menunggu kunci S pelanggan yang dipegang
      checkout → 0 deadlock.
  **C2 — Auto-cancel Online Payment (FR-38 · BR-06 · NFR-05): selesai, di-commit & di-push `0be9319`.**
  - Aturan: kandidat = `menunggu_pembayaran` + `online` + `unpaid` + payment terbaru `pending` + `expired_at < now`
    (batas ketat = komplemen penolakan pembayaran di `payment.service`). Efek: Dibatalkan + alasan
    `Tidak dibayar dalam 30 menit (BR-06)` (teks mock & seed; K3: `payment_timeout_minutes` tidak bisa diubah lewat
    AD-11 — validator membuangnya — dan SPEC BR-06 = 30 menit), `orders.payment_status` tetap `unpaid`, `payments.status`
    `expired` (K2; batal pelanggan tetap `failed`), stok ready kembali (TF-12), klaim voucher dibuka & kuota +1, refund
    poin, riwayat `changed_by` NULL (sistem) + catatan alasan, notifikasi status (+ poin) lewat recorder C1, email setelah
    commit.
  - Desain: `orderCancellation.service.js` `cancelOrderTx` = efek pembatalan bersama, diekstrak dari `cancelMyOrder`
    TANPA mengubah urutan/perilaku (pelanggan: `changedBy` pelanggan, `failed`; job: NULL, `expired`). Job
    `jobs/autoCancelOrders.js`: kandidat dibaca tanpa kunci (batch 100, urut `order_id`), lalu SATU transaksi per
    pesanan: `lockMyOrder` (FOR UPDATE, pembacaan pertama) → `isOverdueOnlinePayment` diperiksa ULANG → `cancelOrderTx`.
    Tidak memenuhi (sudah lunas / dibatalkan pelanggan / proses job lain / ganti ke Bayar di Toko) → dilewati tanpa
    menulis. Error per pesanan dicatat (`describeError`: kode + pesan MySQL) dan pesanan lain tetap diproses; pesanan
    itu dicoba lagi putaran berikutnya.
  - Urutan kunci (sama dengan pembatalan pelanggan setelah F-C1-1): `orders` X → INSERT refund poin, riwayat,
    notifikasi (`users` S) → UPDATE `orders` → UPDATE `payments` → `daily_stocks` X → `user_vouchers` / `vouchers`.
    Tanpa kunci baru (`changed_by` NULL → tanpa kunci baris admin).
  - Penjadwal (K1): `node-cron@4.6.0` (versi dipin, tanpa dependensi turunan) — SATU penjadwal `* * * * *` untuk semua
    pembatalan otomatis; BR-07 (C3) ditambahkan ke `runAutoCancel` yang sama. Putaran pertama saat server start, flag
    `inFlight` mencegah tumpang tindih dalam satu proses, antarproses dijamin kunci baris + pemeriksaan ulang. Nonaktif
    bila `NODE_ENV=test` atau `AUTO_CANCEL_ENABLED=false`.
  - Graceful shutdown (pemeriksaan tambahan sebelum persetujuan): versi awal menunggu putaran maks. 10 s lalu tetap
    `prisma.$disconnect` dan terus memproses kandidat berikutnya → transaksi job bisa terputus. Kini
    `stopAutoCancelJob`: hentikan cron → pasang flag `stopping` (tick tidak memulai putaran; `runAutoCancel` berhenti
    SEBELUM kandidat berikutnya, `summary.stopped`) → tunggu putaran berjalan SAMPAI SELESAI (pesanan yang sedang
    diproses commit/rollback + email) tanpa timeout pemotong (setelah 10 s hanya peringatan log). Penantian pasti
    berakhir karena setiap transaksi dibatasi Prisma (timeout 15 s, maxWait 2 s, lock wait 2 s). `server.js` baru
    memanggil `prisma.$disconnect` setelah itu.
  - Query kandidat (pemeriksaan tambahan kedua): berada di LUAR transaksi interaktif, jadi timeout transaksi 15 s tidak
    berlaku — consistent read tidak menunggu row lock, tetapi bisa menunggu metadata lock (LOCK TABLES / DDL pada
    `orders`, `lock_wait_timeout` bawaan 1 tahun) atau memindai lama. Diganti dari `findMany` ke SELECT ber-parameter
    dengan optimizer hint `/*+ MAX_EXECUTION_TIME(5000) */` (konstanta `AUTO_CANCEL_JOB.CANDIDATE_QUERY_TIMEOUT_MS`;
    filter & hasil sama, tetap tanpa kunci). Dibuktikan di MySQL 8.0.46: hint menghentikan tunggu metadata lock (1,58 s
    untuk batas 1,5 s, ER 3024) dan eksekusi lambat; `SET_VAR(lock_wait_timeout)` hanya menutup tunggu lock, jadi tidak
    dipakai. Batas ditegakkan server (statement benar-benar berhenti), bukan `Promise.race` JS yang meninggalkan query
    berjalan. Query gagal/timeout → `summary.queryError` + log `Query kandidat BR-06 gagal … P2010 (MySQL 3024): …`,
    tanpa transaksi, dicoba lagi putaran berikutnya (`describeError` kini menyertakan `meta.code` MySQL).
  - File baru: `server/src/jobs/autoCancelOrders.js`, `services/orderCancellation.service.js`,
    `services/autoCancelRules.service.js`; uji `server/tests/autoCancelRules.test.js`, `autoCancelOrders.test.js`,
    `server/tests-mysql/13-auto-cancel-online.it.test.js`. Diubah: `server.js`, `orderActions.service.js` (memanggil
    `cancelOrderTx`), `utils/businessConstants.js` (`PAYMENT_TIMEOUT_CANCEL_REASON`, `AUTO_CANCEL_PAYMENT_STATUS`,
    `AUTO_CANCEL_JOB`), `payment.service.js` (komentar), `package.json` & `package-lock.json` (`node-cron`),
    `tests/helpers/orderDb.js` (`order.findMany` menilai `payments: { some }` & `take`). Tanpa perubahan schema/migrasi,
    frontend, atau kontrak API.
  - **Terverifikasi:** `npm test` 661/661 (C1 638; +23 uji: batas sebelum/tepat/sesudah `expired_at`, pesanan
    lunas/dibatalkan/Bayar di Toko dilewati, efek lengkap, idempotensi, pemeriksaan ulang setelah kunci × 4, rollback per
    pesanan & retry, batch, penjadwal, `describeError`, shutdown: menunggu melewati batas log, tanpa query bila sudah
    berhenti, shutdown di tengah transaksi commit / rollback → urutan `tx:end` sebelum disconnect & kandidat berikutnya
    tidak diproses; query kandidat: hint & parameter, gagal/ER 3024 dicatat tanpa transaksi, shutdown saat query berjalan
    lalu selesai / timeout → disconnect setelah query berhenti & tanpa transaksi kandidat). MySQL 8.0.46 harness penuh
    01–13 pada container baru: **74/74 lulus, `lock_deadlocks` 0** (`lock_timeouts` 10 = 9 skenario 1205 disengaja G/H/I
    seperti run C1 + 1 disengaja di M9b). Run sebelumnya: 69/69 (sebelum perbaikan shutdown), 71/71 (sebelum batas query
    kandidat); run 13 dengan M7 × 30: 10/10, 0 deadlock.
    · M1 job normal (tepat pada `expired_at` belum dibatalkan; efek lengkap; idempoten). M2 job × simulate-paid dua
      urutan antre kunci → yang antre pertama menang, yang lain 409 / dilewati (tidak pernah keduanya). M3 job × batal
      pelanggan dua urutan → satu pembatalan (`expired` vs `failed`), refund sekali. M4 dua PROSES job: antre kunci yang
      sama → 1 batal + 1 lewati; 10 pesanan bersamaan → masing-masing tepat sekali, stok/kuota/poin tepat. M5 job ×
      checkout pelanggan yang sama (F-C1-1) × 3 → job menunggu `users` tanpa kunci `payments`, 0 deadlock. M6 rollback
      (trigger MySQL menolak notifikasi poin satu pesanan) → pesanan itu utuh, pesanan lain dibatalkan, log
      `MysqlError 1644`, putaran berikutnya berhasil. M7 beban × 15 (2 pelari job + simulasi lunas + batal + checkout):
      tanpa 5xx, 0 pelanggaran (lunas XOR batal, riwayat = notifikasi, stok = jumlah item pesanan aktif), 0 deadlock.
      M8 server asli `NODE_ENV=development`: putaran saat start membatalkan pesanan, email tercetak, SIGTERM exit 0.
      M9a SIGTERM saat job memegang kunci `orders` X & transaksinya berjalan → proses & transaksi tetap hidup setelah
      SIGTERM, pesanan itu commit utuh, 2 kandidat berikutnya tidak disentuh, exit 0. M9b sama tetapi kunci ditahan > 2 s →
      rollback 1205 utuh (tanpa email), kandidat berikutnya tidak disentuh, exit 0. Kontrol negatif (kode dikembalikan
      sesudahnya): tanpa pemeriksaan `stopping` → M9a gagal (kandidat berikutnya diproses); stop tanpa menunggu putaran →
      M9a gagal (proses keluar saat transaksi job masih terbuka; MySQL me-rollback pesanan itu, hasil job hilang).
      M10 metadata lock nyata (sesi mysql lain `LOCK TABLES orders WRITE`): M10a query kandidat berhenti 5006 ms (ER 3024)
      selagi lock masih dipegang, dicatat, tanpa transaksi, putaran berikutnya normal. M10b SIGTERM saat query tertahan →
      proses & query tetap hidup, query berhenti oleh MAX_EXECUTION_TIME, disconnect & exit 0 (5004 ms setelah SIGTERM,
      SEBELUM pemegang lock melepas), pesanan tidak berubah. M10c SIGTERM lalu lock dilepas sebelum batas → query selesai,
      kandidat tidak diproses (`Shutdown diminta — 1 kandidat tersisa`), exit 0. Kontrol negatif: tanpa hint → M10b gagal,
      shutdown menunggu 11,7 s sampai pemegang lock melepas (di produksi bisa sampai `lock_wait_timeout`).
  - Keterbatasan: (1) jeda hingga ±1 menit antara `expired_at` dan pembatalan (pembayaran sudah ditolak 409 sejak
    batas lewat); (2) query kandidat memindai `orders` (tidak ada indeks status/`expired_at` di SPEC §8) — dibatasi
    5 s per putaran; bila data tumbuh sampai pemindaian > 5 s, setiap putaran gagal ER 3024 (tercatat jelas) dan perlu
    indeks lewat perubahan skema yang disetujui; (3) teks
    alasan menyebut 30 menit — bila `payment_timeout_minutes` diubah langsung di database, teks tidak ikut berubah;
    (4) pesanan contoh seed `menunggu_pembayaran` ikut dibatalkan saat server dev pertama berjalan; (5) shutdown
    menunggu pesanan yang sedang diproses (maks. ±17 s per batas Prisma) — pengelola proses yang memaksa SIGKILL lebih
    cepat tetap memutus transaksi itu (MySQL me-rollback utuh); kandidat yang tidak diproses dibatalkan putaran pertama
    setelah server start lagi; gangguan jaringan pada tingkat soket (koneksi menggantung tanpa balasan server) tidak
    tertutup MAX_EXECUTION_TIME — perolehan koneksi dari pool dibatasi `pool_timeout` Prisma (bawaan 10 s), tetapi
    batas soket memerlukan parameter `socket_timeout` pada `DATABASE_URL` (konfigurasi deploy, belum diatur);
    (6) di M4b proses pertama membatalkan kesepuluh pesanan dan proses kedua melewati semuanya (bukti antre per pesanan
    ada di M4a deterministik).
  **C3 — Auto-cancel Bayar di Toko (FR-38 · BR-07 · NFR-05) + perbaikan F-C3-1: selesai, di-commit & di-push
  `f8085b3`.**
  - Aturan (keputusan D1, H1–H6): kandidat = `pay_at_store` + `orders.payment_status = unpaid` + payment `pending` + status
    Dikonfirmasi / Sedang Disiapkan / Siap Diambil + batas pengambilan pada `ready_date` (WIB) sudah lewat. Batas = jam
    tutup dari `operating_hours` TERBARU (H4; bukan `payments.expired_at`, yang salah untuk pesanan hasil ganti metode —
    sama dengan `pay_before_time` C-18), ketat `now > jam tutup`; hari tutup / `close_time` NULL (H1) → 00.00.00 WIB hari
    berikutnya, eksklusif (`now >=`), dicatat di log; baris hari tidak ada → asumsi TF-10 07.00–20.00. Efek lewat
    `cancelOrderTx` yang sama: alasan `Tidak diambil sampai jam tutup (BR-07)` (H3), `payments.status` `expired` (H2),
    `orders.payment_status` tetap `unpaid`, stok ready (termasuk Sedang Disiapkan/Siap Diambil — H5, TF-12), klaim &
    kuota voucher, refund poin, riwayat `changed_by` NULL, notifikasi status & poin (recorder C1), email setelah commit.
  - Desain: job C2 diperluas jadi daftar aturan (BR-06 lalu BR-07) dalam SATU putaran & SATU penjadwal; `stopping`
    diperiksa sebelum setiap aturan & pesanan; query kandidat gagal → putaran dihentikan, aturan berikutnya tidak di-query
    (H6); entri `failed` membawa `rule`; log per aturan. Preseleksi BR-07: snapshot jam (SELECT dengan
    `MAX_EXECUTION_TIME(5000)`) + SQL kandidat `ready_date < hari ini OR (ready_date = hari ini AND batas hari ini lewat)`
    (jam tutup tidak pernah melewati tengah malam — validasi AD-11). Keputusan final di transaksi per pesanan dengan
    urutan kunci K1: `orders` X (`lockMyOrder`) → syarat status/pembayaran → `users` S pelanggan (`FOR SHARE`) →
    `operating_hours` S hari `ready_date` (`FOR SHARE`, versi commit terbaru; baris tidak ada → gap lock S) → keputusan →
    `cancelOrderTx`. `users` S HARUS sebelum jam: urutan sebaliknya membentuk siklus job → checkout pelanggan yang sama
    (`users` X → `store_settings` X) → AD-11 (`store_settings` X → jam X) → job. Job tidak mengunci `store_settings`
    (siklus dengan checkout). Snapshot hanya preseleksi: diperpanjang → kandidat dilewati di transaksi; dimajukan →
    dibatalkan putaran berikutnya (≤ 1 menit, tidak pernah terlalu awal).
  - **Temuan F-C3-1 (ada sejak Step 6.3, terbukti, diperbaiki dengan persetujuan K2):** deadlock pembatalan × checkout
    pelanggan LAIN yang memakai produk ready yang sama. `cancelOrderTx` `UPDATE payments WHERE order_id` memegang
    next-key lock indeks `payments_order_id_fkey` sampai supremum (pesanan terbaru) lalu menunggu `daily_stocks` X; checkout
    pelanggan lain memegang `daily_stocks` X lalu INSERT `payments` → siklus (kunci `users` tidak menyerialkan pelanggan
    berbeda). Bukti pada kode lama (`0be9319`): Q1 (batal pelanggan) & Q2a (job BR-06) masing-masing 1 deadlock 1213,
    checkout pelanggan lain menjadi korban; pembatalan memegang `payments_order_id_fkey` X pada `(10,10)` & supremum.
    Perbaikan: id pembayaran dibaca tanpa kunci lalu `UPDATE … WHERE payment_id IN (…)` (PRIMARY KEY, `X,REC_NOT_GAP`
    saja); urutan F-C1-1 tetap. Sesudah perbaikan Q1/Q2a/Q2b lulus (3 run berturut-turut + harness penuh), pembatalan hanya
    memegang `payments:PRIMARY:X,REC_NOT_GAP`.
  - File baru: `server/tests/autoCancelPickup.test.js`, `server/tests-mysql/14-auto-cancel-pay-at-store.it.test.js`,
    `server/tests-mysql/helpers/autoCancelFixtures.js`. Diubah: `server/src/jobs/autoCancelOrders.js` (daftar aturan, BR-07),
    `services/autoCancelRules.service.js` (`getPickupDeadline`, `isPickupDeadlinePassed`, `isUnpaidPayAtStorePending`,
    `isPastPickupClose`), `services/orderCancellation.service.js` (F-C3-1), `utils/businessConstants.js`
    (`PICKUP_CLOSE_CANCEL_REASON`, `PICKUP_AUTO_CANCEL_STATUSES`), `tests/autoCancelRules.test.js` (+4 uji BR-07),
    `tests/helpers/orderDb.js` (SQL BR-07, jam, kunci users/jam, `payment.findMany`). Tanpa perubahan schema/migrasi,
    frontend, kontrak API, atau dependensi; uji C1/C2 tidak diubah.
  - **Terverifikasi:** `npm test` 679/679 (C2 661; +18 uji BR-07: batas sebelum/tepat/sesudah, hari & jam berbeda,
    tanggal siap kemarin/hari ini/besok, WIB pergantian hari, fallback H1, status D1 vs lunas/Selesai/Dibatalkan/online,
    efek & idempotensi, jam diperpanjang/dimajukan antara snapshot & kunci, urutan kunci orders → users S → jam S,
    pemeriksaan ulang setelah kunci, BR-06 + BR-07 satu putaran, H6, shutdown di antara aturan, rollback per pesanan, SQL
    ber-hint). MySQL 8.0.46 harness penuh 01–14 pada container baru: **100/100 lulus, `lock_deadlocks` 0**
    (`lock_timeouts` 10 — sama dengan run C2; C3 tidak menambah). Tambahan run 14 dengan P8 & H4-h × 30: 26/26, 0 deadlock.
    · P1 (tepat jam tutup belum; sesudahnya ketiga status dibatalkan; lunas/Selesai/tanggal siap mendatang tidak;
      `payments.expired_at` sudah lewat tetapi tidak dipakai; idempoten), P1b (baris jam tidak ada → 20.00; hari ditutup →
      23.59.59,999 belum, 00.00 berikutnya dibatalkan). P2 × tandai lunas, P3 × ubah status admin, P4 × batal pelanggan,
      masing-masing dua urutan antre → satu hasil bisnis, refund sekali (P3: admin ke Sedang Disiapkan lebih dulu → tetap
      dibatalkan sesuai D1). P5 dua proses job (antre kunci yang sama 1 batal + 1 lewati; 10 pesanan tepat sekali). P6 × checkout
      pelanggan yang sama × 3 → job memegang `orders` X, belum `payments`/jam, 0 deadlock. P7 rollback trigger → utuh, lalu
      pulih. P8 beban × 15 (BR-06 + BR-07 + tandai lunas + ubah status + batal + checkout): 0 pelanggaran (lunas XOR batal,
      riwayat = notifikasi, stok = item pesanan aktif + penambahan peniru), 0 deadlock. P9 SIGTERM saat transaksi BR-07
      memegang kunci → proses hidup, commit utuh, 2 kandidat berikutnya tidak disentuh, exit 0.
    · H4-a jam diperpanjang (AD-11 asli) setelah snapshot → dilewati, dibatalkan setelah 22.00. H4-b AD-11 belum commit →
      job (memegang `orders` X & `users` S) menunggu `operating_hours` S lalu membaca 22.00 → dilewati; H4-c rollback →
      20.00 → dibatalkan; H4-b2 baris jam tidak ada & AD-11 INSERT → job menunggu → 22.00 → dilewati. H4-d job lebih dulu
      memegang jam S → AD-11 asli menunggu (`X,REC_NOT_GAP ← S`) → job commit pembatalan → AD-11 200; H4-d2 baris jam tidak
      ada → job gap S, AD-11 menunggu `X,INSERT_INTENTION ← S` → 200. H4-e jam dimajukan → tidak terlalu awal, dibatalkan
      tepat setelah 20.00; dimajukan ke 19.00 selagi job menunggu → dibatalkan. H4-f hari ditutup lewat AD-11 → fallback.
      H4-g siklus tiga pihak (job × checkout × AD-11) → semua commit, 0 deadlock, job membaca 22.00. H4-h beban × 15
      (AD-11 bolak-balik): AD-11 200 semua, 0 pelanggaran, 0 deadlock; checkout 409 = aturan T1 Step 6.4.10 (jam berubah
      selagi checkout), bukan 5xx.
    · Kontrol negatif (kode dikembalikan & diverifikasi identik): `UPDATE payments WHERE order_id` → Q1/Q2a/Q2b gagal;
      keputusan dari snapshot per putaran → H4-a & H4-b gagal; jam dibaca tanpa kunci di transaksi → H4-b & H4-d gagal
      (H4-a lulus — membuktikan locking read yang menentukan); kunci jam sebelum `users` → H4-g deadlock nyata (AD-11
      menjadi korban, job membatalkan dengan jam lama 20.00).
  - Keterbatasan: (1) AD-11 menyimpan jam bisa menunggu selama sisa transaksi job setelah kunci jam (K3; tertahan > 2 s →
    1205/500 sesuai F-2 — tidak terjadi pada uji normal/beban); (2) pesanan Bayar di Toko yang tanggal siapnya hari ini
    baru diperiksa setelah batas menurut snapshot lewat → bila jam dimajukan, pembatalan paling lambat satu putaran (± 1
    menit) setelah batas baru; (3) `now` keputusan = waktu mulai putaran (tidak pernah lebih awal dari waktu nyata);
    (4) stok dikembalikan ke tanggal pesanan dibuat (TF-12) walau tanggal siap berbeda; (5) pesanan contoh seed Bayar di
    Toko (id 8) dibatalkan setelah jam tutup hari seed; (6) `jobs/autoCancelOrders.js` kini 321 baris (> batas lunak ±150,
    sudah 219 setelah C2) — pemecahan menunggu persetujuan karena menyentuh kode C2.
  **C4 — Payment Webhook sebagai FUNGSI INTERNAL (FR-14 · NFR-05 · SPEC §10): selesai, di-commit & di-push
  `5d6a5f0`.** Bukan webhook HTTP: SPEC §10 mensimulasikan gateway (tombol "Simulasikan
  Lunas", hanya development) dan tidak ada dokumen yang mewajibkan URL callback — TIDAK ada endpoint publik baru.
  - Desain (keputusan W1–W3): `services/paymentGateway.service.js` `applyGatewayPayment(tx, order, { gatewayRef, amount,
    now })` — pemanggil sudah mengunci `orders` X; hasil terstruktur `{ applied: true, notices }` /
    `{ applied: false, reason }` dengan `reason` = `NOT_PENDING` / `EXPIRED` / `INVALID_NOTIFICATION` (konstanta
    `GATEWAY_PAYMENT_REASON`), bukan respons HTTP. Urutan evaluasi: status (masih menunggu) → keabsahan notifikasi
    (`gateway_ref` = `payments.gateway_ref`, nominal = `payments.amount` dengan `Prisma.Decimal` — presisi DECIMAL, bukan
    float; metode kelompok gateway QRIS/e-wallet/VA & opsi online) → batas `expired_at < now` (ketat, sama dengan BR-06).
    Berlaku → UPDATE `payments` (PRIMARY KEY) → UPDATE `orders` → riwayat & notifikasi lewat recorder C1 (sistem).
    `simulatePaid` kini hanya urusan pelanggan: production 403 (sebelum transaksi), `lockMyOrder` (kepemilikan → 404 &
    kunci), panggil fungsi gateway dengan `gateway_ref`/nominal dari baris pembayaran sendiri (bukan dari klien), lalu
    terjemahkan: `NOT_PENDING`/`EXPIRED` → 409 dengan pesan LAMA, `INVALID_NOTIFICATION` → 409 "Notifikasi pembayaran
    tidak valid." Email setelah commit (emailAfterCommit). Rute, respons, dan frontend tidak berubah.
  - Urutan kunci TIDAK berubah dari C1–C3: `orders` X → `payments` (PK, `X,REC_NOT_GAP`) → `orders` → INSERT riwayat &
    notifikasi (`users` S pelanggan; `changed_by` NULL → tanpa kunci admin). Interaksi: BR-06 (lunas XOR batal, kunci
    `orders` sama), BR-07 (tidak beririsan — Bayar di Toko bukan jalur gateway), batal pelanggan & ganti metode
    (berurutan di `orders` X), checkout pelanggan yang sama (tanpa kunci indeks `payments_order_id_fkey`).
  - File baru: `server/src/services/paymentGateway.service.js`, `server/tests/paymentGateway.test.js`,
    `server/tests-mysql/15-payment-gateway.it.test.js`. Diubah: `services/payment.service.js` (`simulatePaid`),
    `utils/businessConstants.js` (`GATEWAY_PAYMENT_REASON`, `GATEWAY_PAYMENT_GROUPS`), `tests/helpers/orderDb.js` (op
    `payment.update`). Tanpa perubahan rute, frontend, schema/migrasi, atau dependensi; uji lama (`paymentRoute`,
    `paymentMethodStale`, C1–C3) lulus tanpa diubah.
  - **Terverifikasi:** `npm test` 691/691 (C3 679; +12 uji: batas sebelum/tepat/sesudah `expired_at`, NOT_PENDING (lunas,
    dibatalkan, Bayar di Toko, payment paid/expired/failed/refunded), INVALID_NOTIFICATION (`gateway_ref`, nominal,
    nominal bukan angka/NaN, metode Bayar di Toko, opsi bukan online), presisi DECIMAL (56500 = 56500.00; nilai yang sama
    menurut `Number` ditolak), tanpa penulisan saat tidak berlaku, urutan orders → payments (PK) → orders → riwayat →
    notifikasi, idempoten (409 pesan lama), 409 EXPIRED, production 403 tanpa transaksi, 404 pelanggan lain, nominal dari
    klien diabaikan, rollback, status berubah selagi menunggu kunci). Kontrol negatif unit: perbandingan `Number` → 1
    gagal; tanpa cek `expired_at` → 4 gagal; tanpa cek `gateway_ref` → 1 gagal; tanpa cek metode → 2 gagal.
    MySQL 8.0.46 harness penuh 01–15 pada container baru: **113/113 lulus, `lock_deadlocks` 0** (`lock_timeouts` 10 — sama
    dengan run C3).
    · G1 normal (1 riwayat sistem, 1 notifikasi, email setelah commit) & EXPIRED 409 tanpa perubahan. G2 × job BR-06 dua
      urutan antre → yang pertama menang, lunas XOR batal. G3 × batal pelanggan dua urutan (lunas lalu batal → `refunded`;
      batal lalu 409), refund poin sekali. G4 × ganti metode dua urutan: ke VA (gateway_ref tetap → lunas) & ke Bayar di
      Toko (→ simulasi 409). G5 10 simulasi lewat 2 proses server → 200 × 1 + 409 × 9, satu riwayat Dikonfirmasi. G6a ×
      checkout pelanggan yang sama × 3 → simulasi memegang `orders` X tanpa kunci `payments_order_id_fkey`, 0 deadlock; G6b
      simulasi + 2 checkout × 10 → semua 200/201, 0 deadlock. G7 rollback trigger → 500, payment tetap `pending`, lalu
      pulih. G8 server `NODE_ENV=production` → 403 tanpa perubahan. G9 beban × 15 (simulasi + job BR-06/BR-07 + batal +
      ganti metode + checkout, 2 server): tanpa 5xx, 0 pelanggaran, 0 deadlock.
    · Kontrol negatif MySQL (kode dikembalikan & diverifikasi identik): tanpa kunci pesanan → G5 200 × 8, riwayat &
      notifikasi 9 (ganda); `UPDATE payments WHERE order_id` → G6a deadlock nyata (memegang `payments_order_id_fkey` X);
      tanpa penolakan production → G8 gagal; tanpa cek `expired_at` → G1 gagal.
  - Keterbatasan: (1) notifikasi yang diproses setelah `expired_at` ditolak (W3) — bila gateway sungguhan melunasi tepat
    sebelum batas tetapi notifikasinya terlambat, pesanan tetap dibatalkan BR-06 dan dana perlu dikembalikan manual
    (SPEC §10: refund hanya dicatat; tidak ada refund otomatis); (2) belum ada callback HTTP sungguhan — rancangan bila
    kelak diperlukan: rute terpisah tanpa auth pelanggan, verifikasi tanda tangan HMAC dengan secret gateway, kunci pesanan
    berdasarkan `gateway_ref`, lalu `applyGatewayPayment` (idempoten lewat hasil `NOT_PENDING`); (3) metode yang
    dinonaktifkan AD-11 setelah pesanan dibuat tetap dianggap sah untuk notifikasi (sah = kelompok gateway, bukan
    `is_active`), karena pelanggan sudah menerima kode bayarnya.
  **C5 — Audit Log (FR-37): selesai, di-commit & di-push `773a476`** (keputusan K1–K5 & B1–B5 saat audit).
  - Tabel `audit_logs` apa adanya (tanpa perubahan schema/migrasi): `user_id` = admin pelaku, `action` (≤ 50 karakter,
    konstanta `AUDIT_ACTION`), `entity` = nama tabel (`AUDIT_ENTITY`), `entity_id` = primary key, `created_at` = `now`
    dibulatkan KE BAWAH ke detik penuh (`toAuditTime`; kolom DATETIME(0) — MySQL sendiri membulatkan ke detik terdekat,
    terbukti di A0: `…30.987` mentah tersimpan `…31`). Tanpa nilai lama/baru, tanpa data sensitif, tanpa endpoint/layar baca.
  - Service baru `services/auditLog.service.js`: `lockAuditActor(tx, actorId)` (`SELECT user_id, is_active FROM users …
    FOR SHARE`; tidak ada / nonaktif → 401 `SESSION_INVALID` "Akun tidak ditemukan atau tidak aktif." tanpa menulis apa
    pun), `recordAudit(tx, …)` di transaksi bisnis yang sama (rollback = tanpa audit; INSERT audit gagal = perubahan
    bisnis ikut batal), `decimalChanged` (Prisma.Decimal, 56500 = 56500.00).
  - Titik audit: AD-04 ubah status (`update_order_status`, `orders`/order_id), tandai lunas (`mark_order_paid`,
    `orders`/order_id), harga produk (`update_product_price`, `products`), harga varian yang sudah ada
    (`update_variant_price`, `product_variants`; dibandingkan dengan nilai tersimpan SEBELUM penulisan), harga opsi custom
    cake (`update_custom_option_price`, `custom_options`), rencana stok harian (`update_daily_stock_plan`,
    `daily_stocks`/stock_id; per baris yang `qty_planned`-nya benar-benar berubah), koreksi stok bahan
    (`correct_raw_material_stock`, `raw_materials`; hanya bila kolom `stock` ditulis), stok masuk (`raw_material_stock_in`,
    `raw_materials`/material_id). Tidak dicatat: nilai sama, data baru, edit nama/satuan/minimum bahan, 400/404/409/403/401,
    job sistem & aksi pelanggan.
  - Urutan kunci (K4/K5): master data → `users` pelaku S SEBELUM `store_settings` X; stok masuk → pelaku S → baris bahan X;
    AD-04 & tandai lunas → `orders` X → pelaku S → validasi → tulis → audit; `markOrderPaid(adminId, …)` membaca id
    pembayaran tanpa kunci lalu UPDATE `payments` berdasarkan PRIMARY KEY. `actorId` dari `req.user.userId`; rute, respons,
    dan frontend tidak berubah.
  - File baru: `server/src/services/auditLog.service.js`, `server/tests/auditLog.test.js`,
    `server/tests-mysql/16-audit-log.it.test.js`. Diubah: `utils/businessConstants.js`, `services/adminOrderActions.service.js`,
    `adminProductSave.service.js`, `adminCustomOption.service.js`, `adminDailyStock.service.js`,
    `adminRawMaterial.service.js`, rute admin `order`, `product`, `customOption`, `stock`, `rawMaterial` (meneruskan
    `req.user.userId`), uji `tests/helpers/catalogDb.js`, `adminOrderActionsRoute`, `adminCustomOptionRoute`,
    `adminProductRoute`, `adminStockRoute` (urutan kunci yang diharapkan kini diawali kunci pelaku), dan
    `tests-mysql/04-staff-deadlock.it.test.js` (lihat perubahan perilaku di bawah).
  - **Perubahan perilaku yang disengaja (B2), tercatat di uji lama:** di `04` D2-kontrol & D2a, PATCH menonaktifkan Staf
    commit lebih dulu lalu AD-04 Staf yang sama memperoleh FOR SHARE → kini 401 `SESSION_INVALID` tanpa perubahan pesanan
    (sebelum C5: 200 dengan `changed_by` admin yang sudah nonaktif). Asersi 0 deadlock & tanpa kunci tertinggal tetap.
  - **Terverifikasi:** `npm test` 707/707 (C4 691; +16: `auditLog.test.js` 10, `adminOrderActionsRoute` +6). Kontrol
    negatif unit (kode dikembalikan & diverifikasi identik): `is_active` diabaikan → 3 gagal; `created_at` tanpa pembulatan
    → 8 gagal; tanpa audit tandai lunas → 3 gagal; kunci pelaku sesudah `store_settings` → 2 gagal; entity stok masuk salah
    → 1 gagal. MySQL 8.0.46 harness penuh 01–16 pada container baru: **125/125 lulus, `lock_deadlocks` 0**
    (`lock_timeouts` 10 — sama dengan run C3/C4, semuanya skenario timeout yang disengaja).
    · A0 `created_at` = detik ke bawah. A1 8 titik audit (Staf & Owner) dengan isi baris tepat; nilai sama / data baru /
      400 / 409 → 0 audit. A2 trigger menolak INSERT `audit_logs` → 7 jenis operasi 500, data bisnis & riwayat tidak
      berubah. A3 dua admin bersamaan dengan nilai BERBEDA (harga 41000/42000, rencana 90061/90062, stok masuk 1.25/2.75) →
      2 audit per pasangan dengan pelaku masing-masing, nilai akhir = audit terakhir, stok = jumlah, 0 deadlock. A4 10×
      Selesai (Staf & Owner) → 200 × 1 + 409 × 9, tepat 1 audit dengan pelaku = `changed_by` pemenang.
    · A5 (deterministik): harness memegang `users` X pelaku + `UPDATE is_active = 0`; request admin menunggu kunci
      `S,REC_NOT_GAP` baris pelaku — commit → 401 `SESSION_INVALID` tanpa perubahan/audit; rollback → 200 + 1 audit
      (harga produk, AD-04, tandai lunas). A6 (deterministik): transaksi admin sudah memegang S pelaku (ditahan di
      `store_settings` / baris pelanggan) → PATCH nonaktif ASLI menunggu `X` baris pelaku → transaksi admin commit + audit →
      PATCH 200 → request berikutnya 401 (master data & AD-04).
    · A7 master data × ubah status akun (`users` X → `store_settings` X) × 3 → semua commit, 0 deadlock. A8 tiga pihak
      tandai lunas × ubah status akun × checkout pelanggan lain × 3 → semua commit, 0 deadlock; saat menunggu pelaku,
      tandai lunas belum memegang kunci `payments`. A9 pelanggan 403, tanpa token 401, admin nonaktif 401 → 0 audit. A10
      beban × 15 (harga ×2, rencana & tandai lunas oleh admin yang dinonaktifkan/diaktifkan bergantian lewat PATCH asli,
      stok masuk, AD-04, checkout, simulasi C4, job C2/C3): 401 hanya untuk admin yang sedang nonaktif (7 + 7), tanpa 5xx,
      audit = perubahan berhasil, 0 deadlock, tanpa kunci tertinggal.
    · Kontrol negatif MySQL (dijalankan terpisah per skenario, kode dikembalikan & diverifikasi identik): kunci pelaku
      SESUDAH `store_settings` → A7 deadlock nyata (`lock_deadlocks` 1: simpan produk memegang `store_settings` X & menunggu
      S pelaku; ubah status akun memegang X pelaku & menunggu `store_settings`); tanpa kunci pelaku di awal + `UPDATE
      payments WHERE order_id` → A8 deadlock nyata tiga pihak (`lock_deadlocks` 1: tandai lunas memegang next-key
      `payments_order_id_fkey` X & menunggu S pelaku saat INSERT audit; ubah status akun memegang X pelaku & menunggu
      `store_settings`; checkout memegang `store_settings` & menunggu insert intention `payments_order_id_fkey`).
  - Keterbatasan: (1) audit tidak menyimpan nilai lama/baru (kolom tidak ada di SPEC §8); (2) admin yang dinonaktifkan
    setelah transaksinya memperoleh kunci pelaku tetap menyelesaikan transaksi itu (A6) — penonaktifan berlaku untuk
    request berikutnya; (3) tidak ada layar/endpoint baca audit (FR-37 tanpa layar).
- 6.6 (berjalan per checkpoint; branch `feat/step-6.6-frontend-api-integration` dari `origin/main` `cbab4cf`). Urutan
  disetujui: CP0 lingkungan & baseline → CP1 error API → CP2 identitas & autentikasi → CP3 sinkron keranjang akun →
  CP4 checkout & pembayaran → CP5 foto & upload → CP6 kontrak form admin → CP7 "tidak ditemukan" & zona waktu → CP8
  verifikasi seluruh layar. Gap audit G1 – G16 (lihat laporan audit 6.6); butir di bawah hanya yang sudah dikerjakan.
  **CP0 — lingkungan & baseline: selesai (tanpa perubahan kode).** `npm ci` client & server dari lockfile (tanpa
  ketidaksesuaian), MySQL 8.0.46 di container terpisah (tmpfs) + `migrate deploy` + seed, `/api/health` ok, CORS dari
  `localhost:5173` ok. Baseline: client unit 142/142, server 707/707, build ok, lint 0 error/2 warning (`Toast.jsx`),
  smoke API 55/55, harness MySQL 01–16 **124/125**. Pengecualian baseline: `14-auto-cancel-pay-at-store` P1b gagal bila
  dijalankan setelah 17.00 WIB — fixture (`helpers/autoCancelFixtures.js`) mengasumsikan tanggal siap pre-order = besok,
  padahal setelah batas jam pre-order menjadi H+2 = hari `D()` yang ditutup uji; bukan bug BR-07 (tidak diubah). Seed
  default `SEED_ANCHOR_DATE` 2026-10-16 membuat job membatalkan pesanan contoh lama saat server start; uji layar penuh
  (CP8) memakai database baru dengan `SEED_ANCHOR_DATE` = hari uji.
  **CP1 — penanganan error API (G3, G4): selesai, commit `b9e7390`.** `apiClient` meneruskan `fieldErrors` 4xx
  (`createApiError(message, status, code, { fieldErrors, cause })`); gagal tanpa respons HTTP → status 0, kode
  `CLIENT_NETWORK_ERROR`, pesan "Tidak dapat terhubung ke server. Periksa koneksi internet Anda dan coba kembali.";
  respons tak terbaca → `CLIENT_INVALID_RESPONSE` dengan status HTTP asli; `AbortError` diteruskan apa adanya. Kode baru
  di `CLIENT_REQUEST_ERROR_CODE` (bukan `CLIENT_ERROR_CODE`) agar gangguan jaringan tidak membuang data yang tampil.
  Diuji: unit 156/156; browser mode API — AD-06 harga 3 desimal → `fieldErrors.price` tampil di field; API dimatikan →
  pesan koneksi di Dashboard & C-02.
  **CP2 — identitas & autentikasi (FR-01 – FR-03 · FR-26 · BR-04 · SPEC §2/§6/§7/§10): selesai.** Tanpa perubahan
  backend, schema, kontrak API, atau dependensi.
  - CP2a guard rute (`utils/routeAccess.js`, satu tabel peran per halaman untuk `AppRoutes`, `ProtectedRoute`,
    `RoleRoute`, dan validasi return path): tamu & sesi berakhir di `/admin/*` → `/admin/login` (sebelumnya `/masuk`);
    halaman khusus pelanggan (checkout, bayar, pesanan, akun, notifikasi) hanya peran customer — Staf/Owner dialihkan ke
    halaman awal perannya SEBELUM halaman memanggil API (dulu 403 tampil di layar); halaman publik tetap terbuka.
    Return path setelah login (C-02 & AD-01) hanya path internal yang boleh dibuka peran tersebut: URL absolut, `//host`,
    backslash, karakter kontrol, path admin tak dikenal, dan halaman login ditolak; path dinormalisasi dulu (traversal
    `/katalog/../admin/laporan` ditolak untuk Staf). Proteksi server (`auth` + `requireRole`) tidak berubah.
  - CP2b identitas: `PengaturanPage`/`AdminAccountsPanel` ("Akun Anda", temuan 6.4.10 (1)), `AkunPage`, `BerandaPage`,
    `useWishlist` memakai `getSessionUserId` / `isSameUserId` (mock `user_id` angka & API `userId` string).
  - CP2c: tombol Google tetap tampil (SPEC §10); di mode API hanya informasi "belum tersedia" tanpa request (dulu
    `POST /auth/google` → 404); mode mock tetap masuk sebagai pelanggan demo. Petunjuk OTP C-04 sesuai mode (console
    browser / console server) dengan kalimat netral "Jika … terdaftar".
  - CP2d: HP AKUN (daftar, ubah profil, akun staf) = aturan server `^\+62\d{8,13}$` setelah spasi/()/- dihapus
    (`validateAccountPhone`); dulu client menerima +62 + 7 digit (ditolak server) dan menolak +62 + 12–13 digit (sah di
    server). Temuan: server punya DUA aturan HP — HP penerima alamat & WhatsApp toko memakai 9–13 digit total
    (`address.validator`, `adminSettingsRules`), jadi `validatePhone` untuk keduanya TIDAK diubah. Pesan gagal
    autentikasi mode mock = server: login (akun tidak ada/sandi salah/nonaktif) "Email/HP atau kata sandi salah.",
    registrasi ganda "Email atau nomor HP sudah terdaftar.", lupa sandi selalu pesan yang sama (OTP hanya dibuat untuk
    akun yang ada), reset "OTP tidak valid, kedaluwarsa, atau sudah digunakan." Uji e2e lama `step-5.8` (akun nonaktif)
    disesuaikan.
  - Masa berlaku OTP mock = server (penyesuaian akhir CP2): server `auth.service` → `expiresAt` = permintaan + 10 menit,
    OTP sah hanya selama `expiresAt > now` (tepat di batas sudah ditolak), sekali pakai, dan permintaan baru menonaktifkan
    OTP aktif sebelumnya. Mock sebelumnya 5 menit dan masih menerima tepat di batas (`now > expires_at`); kini
    `OTP_VALID_MINUTES` = 10 (`constants/auth.js`) dan ditolak bila `now >= expires_at`. Permintaan baru tetap
    menggantikan OTP lama (satu record per email). Hitung mundur kirim ulang 60 detik hanya di UI (server tidak
    membatasi kirim ulang — lihat backlog keamanan). Backend tidak berubah.
  - Uji: client unit 186/186 (+30: `routeAccess` 9, `sessionUserId` 2, `authService` API 5 & mock 11 — termasuk 5 uji
    batas OTP: 10 menit, 1 ms sebelum batas sah, tepat di batas & sesudahnya ditolak, sekali pakai, permintaan baru
    menggantikan yang lama; sensitivitas: aturan lama 5 menit → 3 uji gagal, `>` di batas → 1 uji gagal —
    `accountPhone` 3);
    server 707/707; build ok; lint 0 error/2 warning; smoke API 55/55. Browser 390 & 1440 px — mode API 44/44 per lebar
    (login 3 peran, registrasi + reset sandi dengan OTP dari console server, sesi kedaluwarsa pelanggan & owner kembali
    ke halaman asal, akses per peran tanpa request API pelanggan, return path & penolakan open redirect, Google tanpa
    request); mode mock 39/39 per lebar tanpa request ke API. Data uji MySQL: akun baru tersimpan (HP dinormalisasi),
    `password_resets` terpakai. Regresi e2e mode mock lama (`tests/step-5.x`): 5.1 cart 40/40, func 55/55, unit 37/37,
    5.2 56/56, 5.3 76/76, 5.5 56/56, 5.6 80/80 + regresi 18/18, 5.7 90/90, 5.8 67/67.
  - **Backlog keamanan — pekerjaan terpisah (checkpoint/CR backend sendiri, TIDAK dikerjakan di CP2):** hasil uji CP2:
    10 login salah beruntun semuanya 401 tanpa pembatasan. Middleware `rateLimit` sudah ada (dipakai simpan desain
    custom cake) dan bisa dipakai ulang.
    · SEC-1 Pembatas laju `POST /api/auth/login` (per IP dan per identifier) — mencegah tebak sandi.
    · SEC-2 Pembatas laju `POST /api/auth/forgot-password` — mencegah banjir permintaan OTP; server saat ini tidak
      membatasi kirim ulang (hitung mundur 60 detik hanya di UI).
    · SEC-3 Pembatas laju `POST /api/auth/reset-password`.
    · SEC-4 Perlindungan percobaan OTP berulang: OTP 6 digit (10⁶ kemungkinan) bisa dicoba tanpa batas selama 10 menit;
      perlu batas percobaan gagal per OTP/akun (mis. OTP dinonaktifkan setelah N kali salah). SPEC §8 `password_resets`
      tidak punya kolom hitungan percobaan — keputusan desain (penyimpanan in-memory vs kolom baru lewat CR) termasuk
      pekerjaan ini.
    Tetap tercatat sebagai asumsi prototype (6.3): JWT di localStorage dan tanpa pencabutan token saat keluar/ganti
    sandi.

```
Kerjakan Step 6.1 dari docs/ROADMAP.md.
Buat schema.prisma untuk MySQL yang PERSIS mengikuti docs/SPEC.md bagian 8
(nama tabel snake_case dengan @@map, tipe dan panjang field, nullable, unique, relasi, composite key).
Jangan menambah atau menghapus kolom. Buat seed.js dari SPEC bagian 9 dan 10.
Tampilkan perintah migrasi dan seed.
```

Struktur endpoint mengikuti "Recommended Development Stack":
`/api/auth`, `/api/products`, `/api/categories`, `/api/custom-options`, `/api/cart`, `/api/orders`,
`/api/payments`, `/api/reviews`, `/api/me/*`, dan `/api/admin/*` (dilindungi `requireRole`).

### Step 6.7 – 6.10 — Inventory, Purchasing, Manufacturing & Advanced Reporting

Ruang lingkup keempat step di bawah **ditetapkan oleh pemilik project (2026-11-05) sebagai scope resmi** dan ditulis
apa adanya. Acceptance criteria setiap step dibagi tiga dan tidak boleh dicampur:
- **[Scope]** — turunan langsung dari ruang lingkup / arahan pemilik project (termasuk arahan "AD-07 & AD-08 tidak
  diduplikasi"). Wajib.
- **[Usulan teknis]** — usulan agent; **belum final**, berlaku setelah disetujui pemilik project (boleh lewat CR).
- **[Menunggu CR]** — keputusan bisnis yang belum ditetapkan; kriteria terkait baru ditulis setelah CR disetujui.

Prasyarat & status (berlaku untuk 6.7 – 6.10):
- **Prasyarat implementasi: Change Request yang mengubah AGENTS.md dan docs/SPEC.md.** Konflik saat ini:
  AGENTS.md §1 melarang "modul keuangan/resep" serta tabel/kolom/menu di luar dokumen, sedangkan 6.7 – 6.10 membutuhkan
  modul resep dan tabel/layar baru. Kedua dokumen **belum diubah**; perubahan dilakukan lewat CR (pola sama dengan
  CR-01/CR-02) yang mencakup FR & BR baru, tabel §8, daftar layar & rute §7, dan hak akses Staf/Owner §2.
  `npm run db:check-spec` (29 tabel) ikut disesuaikan setelah CR disetujui. Sebelum CR disetujui, schema, API, dan
  kode tidak diubah untuk step ini.
- **Belum ada desain database maupun kontrak API.** SPEC §8 hanya memuat 29 tabel; tidak ada tabel resep/BOM, satuan,
  alokasi stok, supplier, purchase order, penerimaan, work order, atau pemakaian bahan. Mock frontend, layar AD-xx, dan
  export Stitch untuk fitur ini juga belum ada.
- Tahapan per step: (1) CR + rancangan tabel & kontrak API disetujui, (2) API + uji, (3) layar admin. Mode data
  `services/` (mock vs API) untuk layar baru diputuskan di CR.
- Urutan: setelah 6.5 dan 6.6 selesai (prinsip "kerjakan berurutan"), lalu 6.7 → 6.8 → 6.9 → 6.10.
- **Fitur existing yang tidak boleh diduplikasi** (Step 5.7 & 6.4.5 AD-07, Step 5.8 & 6.4.7 AD-08, serta AD-02/AD-05
  yang memakai datanya): `raw_materials` (nama, satuan `unit` teks bebas, `stock`, `min_stock`),
  `GET|POST /api/admin/raw-materials`, `PUT /api/admin/raw-materials/:id` (edit informasi & koreksi stok dengan
  `expected_stock`), `POST /api/admin/raw-materials/:id/stock-in` (Catat Stok Masuk), stok menipis `stock ≤ min_stock`
  (AD-02, AD-07), `daily_stocks` & `GET|PUT /api/admin/stocks/today` (rencana stok harian produk ready,
  `qty_planned`/`qty_sold`), kalender produksi pre-order & custom (AD-05, `GET /api/admin/calendar`),
  `products.ingredients` (teks komposisi untuk pelanggan, bukan takaran resep), laporan penjualan AD-08
  (`GET /api/admin/reports/sales` + ekspor Excel/PDF) dan KPI omzet AD-02. Fitur baru memperluas atau memakai data
  ini, tidak membuat tabel, endpoint, atau layar kedua untuk fungsi yang sama.

**Step 6.7 — Inventory & Recipe Management**
- Tujuan: menjadi dasar pengelolaan bahan baku dan resep untuk pengadaan (6.8) dan produksi (6.9).
- Ruang lingkup: (1) master bahan baku; (2) komposisi bahan setiap produk (recipe/BOM); (3) satuan bahan baku;
  (4) perhitungan kebutuhan bahan otomatis; (5) stok tersedia dan stok yang dialokasikan.
- Existing vs lanjutan: (1) master bahan sudah ada (AD-07) → dilanjutkan, bukan dibuat ulang; (3) satuan saat ini
  teks bebas `raw_materials.unit` → bentuk pengembangannya diputuskan di CR; (2), (4), (5) belum ada.
- Dependensi: 6.4.4 AD-06 (produk & varian), 6.4.5 AD-07 (bahan baku & stok masuk); CR disetujui.
- Acceptance criteria:
  · [Scope] master bahan baku memakai `raw_materials` AD-07 yang sudah ada, tanpa tabel/endpoint/layar bahan kedua;
    satuan bahan baku dapat dikelola; komposisi bahan dapat dicatat untuk setiap produk; kebutuhan bahan dihitung
    otomatis dari komposisi tersebut; stok tersedia dan stok dialokasikan dapat dilihat per bahan.
  · [Usulan teknis] kebutuhan bahan = Σ (jumlah produk × takaran bahan di resep), ditulis sebagai fungsi murni di
    `server/src/services/`; resep hanya merujuk bahan yang ada; perilaku AD-02 (stok menipis) dan AD-07 (stok masuk,
    koreksi `expected_stock`) tidak berubah; stok tidak negatif dan tidak tertimpa saat penulisan bersamaan (memakai
    pola kunci AD-07).
  · [Menunggu CR] bentuk master satuan & konversi antar-satuan; resep per produk atau per varian, dan perlakuan custom
    cake (opsi builder); definisi & sumber alokasi (pesanan, rencana produksi, atau work order 6.9); kapan stok
    dikurangi (saat dialokasikan atau saat dipakai di 6.9); hak akses Staf/Owner.
- Kebutuhan pengujian *(usulan teknis)*: unit test aturan murni (kebutuhan bahan, satuan, alokasi); route test (auth,
  peran, validasi, 404/400/409); integrasi MySQL (alokasi × stok masuk bersamaan, rollback); regresi AD-02, AD-06,
  AD-07 dan `tests-mysql` yang ada.

**Step 6.8 — Supplier & Purchasing Management**
- Tujuan: pengadaan bahan baku memakai master bahan dari 6.7.
- Ruang lingkup: (1) master supplier; (2) hubungan supplier dengan bahan baku; (3) purchase order;
  (4) penerimaan bahan; (5) riwayat pembelian.
- Existing vs lanjutan: belum ada supplier, PO, atau riwayat (SPEC §8). "Catat Stok Masuk" AD-07 menambah
  `raw_materials.stock` tanpa catatan riwayat; (4) penerimaan bahan tidak boleh menjadi mekanisme stok kedua.
- Dependensi: 6.7 (master bahan & satuan); CR disetujui.
- Acceptance criteria:
  · [Scope] supplier dapat dikelola dan dihubungkan dengan bahan baku dari master 6.7 (bahan tidak didefinisikan ulang);
    purchase order dapat dibuat; penerimaan bahan tercatat dan memperbarui stok bahan yang sama dengan AD-07; riwayat
    pembelian dapat dilihat.
  · [Usulan teknis] PO hanya berisi bahan terdaftar; satu penerimaan menambah stok tepat sekali; penerimaan memakai
    jalur tulis stok AD-07 (kunci baris bahan, penjumlahan DECIMAL di MySQL); stok tidak hilang atau ganda saat
    penerimaan, stok masuk, dan koreksi AD-07 berjalan bersamaan; riwayat dapat ditelusuri per supplier & bahan.
  · [Menunggu CR] status/alur PO; penerimaan sebagian; apakah "Catat Stok Masuk" manual AD-07 tetap ada berdampingan
    dengan penerimaan PO; pencatatan harga beli (SPEC tidak memiliki modul keuangan); hak akses Staf/Owner.
- Kebutuhan pengujian *(usulan teknis)*: unit test aturan PO & penerimaan; route test; integrasi MySQL (penerimaan
  ganda/bersamaan × stok masuk × koreksi `expected_stock`, rollback); regresi 6.7 dan AD-07.

**Step 6.9 — Manufacturing Management**
- Tujuan: menjalankan produksi memakai resep (6.7), stok bahan (6.7), dan hasil pengadaan (6.8).
- Ruang lingkup: (1) perencanaan produksi; (2) perhitungan kebutuhan bahan; (3) work order; (4) pencatatan pemakaian
  bahan; (5) hasil produksi dan produk selesai.
- Existing vs lanjutan: rencana stok harian produk ready (`daily_stocks.qty_planned`, AD-07) dan kalender produksi
  pre-order & custom (AD-05) sudah ada → perencanaan produksi memakai/menghubungkan data ini, bukan menggantinya;
  (2) memakai perhitungan kebutuhan bahan 6.7 (tidak ditulis ulang); (3), (4), (5) belum ada. Checkbox "Selesai
  diproduksi" di Stitch sebelumnya tidak dibuat karena tidak ada kolomnya (catatan 5.6) — dibahas ulang di CR ini.
- Dependensi: 6.7 (resep, kebutuhan bahan, alokasi), 6.8 (ketersediaan bahan), AD-05, AD-07; CR disetujui.
- Acceptance criteria:
  · [Scope] perencanaan produksi tersedia dan memakai data AD-07/AD-05 yang ada (tanpa rencana stok atau kalender
    kedua); kebutuhan bahan dihitung dengan perhitungan 6.7; work order dapat dibuat; pemakaian bahan tercatat; hasil
    produksi dan produk selesai tercatat.
  · [Usulan teknis] kebutuhan bahan work order identik dengan hasil fungsi 6.7; pemakaian mengurangi stok bahan tepat
    sekali dan melepas alokasi terkait; alur pesanan, checkout, dan stok ready existing tidak berubah kecuali yang
    ditetapkan CR; tanpa deadlock dan stok negatif saat bersamaan dengan checkout & penerimaan 6.8.
  · [Menunggu CR] hubungan hasil produksi dengan `daily_stocks` (stok ready) dan pesanan pre-order/custom; apakah
    status pesanan (SPEC §4) ikut berubah; perlakuan selisih pemakaian vs resep; hak akses Staf/Owner.
- Kebutuhan pengujian *(usulan teknis)*: unit test aturan work order & pemakaian; route test; integrasi MySQL (work
  order × checkout × penerimaan 6.8 bersamaan, rollback); regresi AD-05, AD-07, checkout 6.3.

**Step 6.10 — Advanced Reporting**
- Tujuan: laporan terintegrasi dari data penjualan, inventory, purchasing, dan manufacturing.
- Ruang lingkup: (1) laporan omzet; (2) laporan penggunaan bahan baku; (3) laporan pembelian; (4) laporan produksi;
  (5) analisis penjualan dan kebutuhan produksi.
- Existing vs lanjutan: (1) omzet sudah ada di AD-08 (KPI, grafik per hari, terlaris, metode bayar, transaksi, ekspor)
  dan AD-02 → dipakai ulang, bukan dihitung ulang dengan aturan lain; (2) – (5) belum ada dan bergantung pada data
  6.7 – 6.9.
- Dependensi: AD-08 (6.4.7), AD-02 (6.4.6), 6.7, 6.8, 6.9.
- Acceptance criteria:
  · [Scope] laporan omzet memakai laporan AD-08 yang ada (tanpa laporan omzet kedua); laporan penggunaan bahan baku,
    pembelian, dan produksi tersedia dari data 6.7 – 6.9; analisis penjualan dan kebutuhan produksi tersedia.
  · [Usulan teknis] angka omzet identik dengan AD-08/AD-02 untuk periode yang sama (aturan `salesRules`/`reportRules`,
    transaksi = lunas & tidak dibatalkan); angka bahan, pembelian, dan produksi sama dengan data sumbernya; satu
    respons laporan konsisten dalam satu snapshot (`runInReadSnapshot`); validasi periode sama dengan AD-08.
  · [Menunggu CR] menjadi bagian AD-08 atau layar baru; periode & format ekspor; metode analisis kebutuhan produksi;
    hak akses (AD-08 saat ini hanya Owner).
- Kebutuhan pengujian *(usulan teknis)*: unit test agregasi; route test (peran, periode tidak sah); integrasi MySQL
  (rekonsiliasi angka laporan vs data sumber, snapshot saat ada tulisan bersamaan); regresi AD-02 & AD-08.

Dampak ke step lain: Step 7 (`docs/TEST_CASES.md`) mencakup aturan baru dari CR 6.7 – 6.10; Step 8 mencakup layar
admin baru di viewport uji. Backlog yang sudah ada (6.4.10 L1 – L6, snapshot AD-02/08/09/10 di MySQL, tunggakan 6.6,
CR-02) tidak berubah.

---

## Step 7 — Testing

**Tujuan:** membuktikan aturan bisnis dan validasi berjalan.

**File:** `client/src/utils/businessRules.test.js` (Vitest), `server/tests/api.http` (REST Client),
`docs/TEST_CASES.md` (tabel skenario uji).

**Hasil:** unit test lulus; setiap BR-01 – BR-12 dan setiap baris validation rules punya minimal satu skenario uji dengan hasil.

```
Kerjakan Step 7 dari docs/ROADMAP.md.
Buat unit test Vitest untuk fungsi di utils/businessRules.js, file api.http untuk endpoint utama,
dan docs/TEST_CASES.md berisi skenario uji (ID, requirement, langkah, data, hasil yang diharapkan, status)
untuk setiap business rule dan validation rule di SPEC. Jalankan test dan laporkan hasilnya.
```

---

## Step 8 — UI Refinement & Persiapan Presentasi

**Tujuan:** tampilan setara desain Stitch dan siap demo.

**Hasil:** kontras & area sentuh sesuai NFR-02; skeleton, empty state, toast di semua layar;
admin rapi di 1440 px dan tablet; data demo konsisten; aplikasi ter-deploy.
Viewport uji wajib (CR-01): 360, 375, 430 (mobile), 768, 1024 (tablet/desktop kecil), 1280, 1366, 1440,
1536, 1920 (desktop) — tanpa horizontal overflow, bottom nav hanya < 768, top nav ≥ 768, drawer admin < 1024.

```
Kerjakan Step 8 dari docs/ROADMAP.md.
Bandingkan setiap layar dengan export Stitch di docs/stitch dan aturan desain AGENTS.md bagian 5.
Buat daftar perbedaan dulu, tunggu persetujuan, baru perbaiki.
Periksa kontras 4.5:1, area sentuh 44 px, label input, loading, empty state, dan toast
di seluruh viewport uji Step 8.
```

Setelah itu: deploy client ke Vercel dan server + MySQL ke Railway, lalu siapkan skenario demo
(pelanggan memesan → admin memproses → pesanan Selesai → poin bertambah).
