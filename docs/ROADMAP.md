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

**Hasil:** aplikasi berjalan penuh dengan MySQL; data tersimpan setelah server restart; Prisma Studio bisa dipakai saat presentasi.

Catatan khusus:
- 6.1: Status: skema & seed selesai; **penerapan migrasi pada MySQL 8 sungguhan belum diverifikasi** (lingkungan cloud
  tanpa MySQL — jalankan `npm run db:migrate && npm run db:seed` di lokal lalu cek di Prisma Studio). Prisma dipin 6.19.3
  (`prisma` & `@prisma/client`; Prisma 7+ butuh driver adapter & `prisma.config.ts`), bcrypt 6.0.0 untuk hash sandi demo.
  Migrasi awal `prisma/migrations/20261017000000_init` dibuat dengan `prisma migrate diff`; `npm run db:check-spec`
  membandingkannya dengan SPEC §8 (29 tabel, 206 kolom, 40 FK). Keputusan: `@default` hanya untuk id auto-increment,
  waktu dibuat (`now()`), dan flag boolean (bukan kolom baru); semua FK `ON DELETE RESTRICT` (relasi opsional juga, agar
  rujukan di pesanan lama tidak dikosongkan) kecuali tabel penghubung M:N & `cart_items` (`CASCADE`); tidak ada UNIQUE
  di luar SPEC (mis. `order_items.design_id`). Seed pilihan A: data master SPEC §9/§10 + 9 pesanan contoh (semua status,
  termasuk OVC-261012-018), id tetap, `upsert` tanpa menimpa (idempoten). `BigInt`/`Decimal` perlu serializer di 6.2+.
- 6.3 (sebagian, belum selesai): produk, kategori, opsi custom, simpan desain, `POST /api/cart`, `GET /api/checkout/context`,
  `GET /api/promos/active`, dan akun: wishlist (`/me/wishlist`), poin (`/me/points`, `/me/points/history`),
  voucher (`/me/vouchers`), alamat (`/me/addresses`). Pesanan, ulasan, metode pembayaran, profil & kata sandi
  (`/me/profile`, `/me/password`), notifikasi (`/me/notifications`), keranjang persisten & gabung keranjang setelah
  login masih dikerjakan.
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
