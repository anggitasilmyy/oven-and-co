# SPEC — Oven & Co. (ringkasan dokumen Analisis & Perancangan Sistem v1.0)

Ringkasan ini diturunkan dari `Oven_and_Co_Analisis_Perancangan_Sistem.pdf`.
Jika ada perbedaan, dokumen PDF yang berlaku.

## 1. Gambaran

Web pemesanan mandiri UMKM bakery Oven & Co. (tagline "Freshly Baked, Made With Care") yang
menggantikan pemesanan manual via WhatsApp. Pelanggan: katalog, custom cake, pickup/delivery,
pembayaran, tracking, loyalty. Admin (Owner & Staf): pesanan, stok, produk, promo, laporan, pengaturan.

## 2. Aktor & Hak Akses

| Aktor | Hak akses |
|---|---|
| Pengunjung | Katalog, cari, detail & ulasan, desain custom cake, isi keranjang, daftar, masuk, reset sandi |
| Pelanggan (role `customer`) | Hak Pengunjung + checkout, bayar, tracking, batal, riwayat & pesan lagi, ulasan, poin, voucher, profil & alamat, wishlist, notifikasi |
| Staf (role `staf`) | Login admin, pesanan & status, verifikasi kode pickup, kalender produksi, produk & opsi custom cake, komposisi bahan (FR-39), stok & kebutuhan bahan (FR-40), pelanggan & ulasan; supplier, purchase order, penerimaan bahan, buku mutasi & stock opname (FR-41 – FR-44, CR-04a). Landing: Pesanan |
| Owner (role `owner`) | Hak Staf + dashboard, laporan & ekspor, promo & loyalty, pengaturan toko & akun staf. Landing: Dashboard |
| Payment Gateway | Eksternal; disimulasikan pada prototype |
| Sistem | Notifikasi, riwayat status, audit log, pembatalan otomatis, saldo awal bahan (CR-04a) |

## 3. Functional Requirements

| FR | Requirement | Prioritas | Layar |
|---|---|---|---|
| FR-01 | Daftar akun pelanggan | Must | C-03 |
| FR-02 | Masuk email/HP + sandi atau Google | Must | C-02 |
| FR-03 | Reset sandi via OTP email 6 digit | Must | C-04 |
| FR-04 | Keranjang tamu tetap tersimpan setelah login (digabung) | Must | C-12 |
| FR-05 | Beranda | Must | C-05 |
| FR-06 | Katalog dengan filter & urutan | Must | C-06, C-07 |
| FR-07 | Pencarian (riwayat di perangkat) | Should | C-08 |
| FR-08 | Detail produk & tambah ke keranjang | Must | C-09 |
| FR-09 | Lihat ulasan produk | Should | C-10 |
| FR-10 | Custom Cake Builder | Must | C-11 |
| FR-11 | Kelola keranjang | Must | C-12 |
| FR-12 | Checkout pickup/delivery | Must | C-13 |
| FR-13 | Voucher & tukar poin saat checkout | Must | C-13 |
| FR-14 | Bayar online (QRIS, e-wallet, VA) | Must | C-14, C-15 |
| FR-15 | Bayar di Toko (bersyarat) | Must | C-14 |
| FR-16 | Konfirmasi pesanan berhasil | Must | C-16 |
| FR-17 | Tracking status + hubungi toko via WhatsApp | Must | C-18 |
| FR-18 | Notifikasi in-app + email | Should | C-24 |
| FR-19 | Riwayat pesanan & Pesan Lagi | Must | C-17 |
| FR-20 | Batalkan pesanan sebelum Sedang Disiapkan | Should | C-18 |
| FR-21 | Beri ulasan (+20 poin) | Should | C-19 |
| FR-22 | Poin & level member | Should | C-20, C-21 |
| FR-23 | Voucher milik pelanggan | Should | C-21 |
| FR-24 | Profil & alamat | Must | C-20, C-22 |
| FR-25 | Wishlist | Could | C-23 |
| FR-26 | Login admin sesuai peran | Must | AD-01 |
| FR-27 | Dashboard Owner | Must | AD-02 |
| FR-28 | Kelola pesanan & status, verifikasi pickup, tandai lunas, cetak struk | Must | AD-03, AD-04 |
| FR-29 | Kalender produksi pre-order & custom | Should | AD-05 |
| FR-30 | Kelola produk (maks. 5 foto) | Must | AD-06 |
| FR-31 | Kelola opsi custom cake | Must | AD-06 |
| FR-32 | Stok harian produk & bahan baku | Must | AD-07 |
| FR-33 | Laporan & ekspor Excel/PDF | Must | AD-08 |
| FR-34 | Promo & aturan loyalty | Should | AD-09 |
| FR-35 | Pelanggan & ulasan (balas/sembunyikan) | Should | AD-10 |
| FR-36 | Pengaturan operasional & akun staf | Must | AD-11 |
| FR-37 | Audit log aktivitas admin (tanpa layar) | Could | — |
| FR-38 | Pembatalan otomatis | Must | — |
| FR-39 | Kelola komposisi bahan per produk: bahan terdaftar + takaran per 1 unit produk dalam satuan bahan (CR-03) | Should | AD-06 |
| FR-40 | Lihat estimasi kebutuhan bahan s.d. tanggal target dari pesanan aktif (termasuk tertunggak) dan rencana stok produk ready hari ini, dibanding stok: harian, kumulatif (stok dialokasikan), sisa, kekurangan, produk tanpa komposisi (CR-03) | Should | AD-07 |
| FR-41 | Kelola supplier (data wajib K02 + T-01, aktif/nonaktif, tanpa hapus) & daftar bahan per supplier (CR-04a) | Must | AD-12 |
| FR-42 | Kelola purchase order: buat, ubah Draft, pesan, batal; nilai pembelian sebagai informasi (CR-04a) | Must | AD-12 |
| FR-43 | Terima bahan dari PO (sebagian berulang, tanpa kelebihan), pembalik & koreksi penerimaan (CR-04a) | Must | AD-12 |
| FR-44 | Buku mutasi stok bahan: saldo awal, Catat Stok Masuk + pembalik/koreksi, stock opname, riwayat mutasi (CR-04a) | Must | AD-07 |

FR-41 – FR-44 disetujui Pemilik Project 12 Nov 2026 (CR-04a, bagian 13); implementasi bertahap di Step 6.8 CP2 – CP7.
FR-45 – FR-47 dicadangkan untuk CR-04b/CR-04c dan **belum berlaku**.

## 4. Status Pesanan

Kode enum `order_status` (label tampilan di kanan):

```
menunggu_pembayaran → Menunggu Pembayaran
dikonfirmasi        → Dikonfirmasi
sedang_disiapkan    → Sedang Disiapkan
siap_diambil        → Siap Diambil        (pickup)
dalam_pengiriman    → Dalam Pengiriman    (delivery)
selesai             → Selesai
dibatalkan          → Dibatalkan
```

Alur: online → menunggu_pembayaran → (lunas) dikonfirmasi. Bayar di Toko → langsung dikonfirmasi
dengan label "Bayar saat ambil" + kode pickup. Lalu sedang_disiapkan → siap_diambil / dalam_pengiriman
→ selesai. Transisi harus berurutan; setiap perubahan dicatat di order_status_histories dan memicu notifikasi.
`payment_status`: unpaid, paid, refunded.

## 5. Business Rules

| Kode | Aturan |
|---|---|
| BR-01 | Produk ready dibeli selama stok tersedia, pickup/delivery hari yang sama sesuai jam operasional |
| BR-02 | Pre-order minimal H-1 dengan batas jam pemesanan harian; custom cake minimal H-3 |
| BR-03 | Pesanan campuran siap pada tanggal item dengan persiapan terlama |
| BR-04 | Wajib masuk sebelum checkout; keranjang tetap tersimpan |
| BR-05 | Bayar di Toko hanya untuk pickup dengan SEMUA item ready; pre-order, custom, dan delivery wajib online |
| BR-06 | Online harus lunas dalam 30 menit; jika tidak, batal otomatis & stok kembali |
| BR-07 | Bayar di Toko yang tidak diambil sampai jam tutup dibatalkan otomatis |
| BR-08 | Pelanggan bisa batal sebelum Sedang Disiapkan; online direfund penuh |
| BR-09 | 1 poin per Rp 1.000 setelah Selesai; 100 poin = Rp 5.000; level Silver < 500, Gold 500–1.999, Platinum ≥ 2.000 poin per tahun |
| BR-10 | Maks. 1 voucher per transaksi; boleh digabung tukar poin |
| BR-11 | Ulasan hanya untuk produk dari pesanan Selesai; satu ulasan per item; +20 poin |
| BR-12 | Ongkir otomatis dari jarak toko; radius maksimal diatur admin |
| BR-13 | Takaran komposisi dalam satuan bahan (`raw_materials.unit`) untuk 1 unit produk, presisi 3 desimal; tanpa konversi antar-satuan; mengubah satuan bahan tidak mengubah angka takaran (CR-03) |
| BR-14 | Kebutuhan bahan hanya dari: (a) item pesanan pre-order & custom berstatus Dikonfirmasi/Sedang Disiapkan, menurut `ready_date`; (b) `daily_stocks.qty_planned` hari ini (WIB) untuk produk ready. Item ready dalam pesanan tidak dihitung sebagai tambahan (sudah tercakup `qty_planned` tanggal pesanan dibuat); tanggal mendatang tanpa kontribusi produk ready (CR-03) |
| BR-15 | Estimasi tidak mengubah stok bahan. Stok dialokasikan = kebutuhan kumulatif s.d. tanggal target, dihitung saat dibaca (tidak disimpan); sisa = stok − kumulatif; kekurangan = maks(0, kumulatif − stok) (CR-03) |
| BR-16 | Custom cake memakai komposisi produk dasar custom (estimasi ukuran standar); varian & opsi builder tidak mengubah takaran; varian produk non-custom juga tidak dihitung terpisah (CR-03) |
| BR-17 | Supplier tidak dihapus, hanya dinonaktifkan; data wajib K02 + T-01; daftar bahan opsional saat dibuat (CR-04a) |
| BR-18 | PO hanya untuk supplier aktif dengan ≥ 1 bahan terdaftar; hanya bahan terdaftar; satu bahan sekali; 1 – 30 item (CR-04a) |
| BR-19 | Status PO: Draft → Dipesan → Diterima Sebagian → Diterima / Dibatalkan (K04); ubah hanya saat Draft; status (kecuali Dibatalkan) dihitung dari jumlah bersih diterima (CR-04a) |
| BR-20 | Bersih diterima per item ∈ [0, dipesan − dibatalkan]; kelebihan ditolak (CR-04a) |
| BR-21 | Pembatalan PO menyimpan `qty_cancelled` historis; penerimaan tetap; pengganti pada PO Dibatalkan hanya boleh mengurangi (CR-04a) |
| BR-22 | Nilai PO, nilai penerimaan (dari mutasi), dan nilai sisa dibatalkan (historis) dihitung terpisah; pembulatan setengah menjauhi nol per baris; satu fungsi aturan murni; bukan akuntansi (CR-04a) |
| BR-23 | Setiap perubahan stok bahan = dokumen sumber + satu mutasi bersih (≠ 0) per bahan per operasi dalam transaksi yang sama; append-only; invarian I-1 – I-11. Setiap bahan memiliki tepat satu saldo awal, dibuat oleh migrasi (terhadap snapshot M-4), oleh API dalam transaksi yang sama dengan bahan, atau oleh seed hanya untuk bahan tanpa catatan stok apa pun (CR-04a) |
| BR-24 | Setiap mutasi menjaga 0 ≤ stok ≤ 99.999.999,99; operasi yang melanggar ditolak seluruhnya (CR-04a) |
| BR-30 | Dokumen berlaku penerimaan & stok masuk: pembalik penuh sekali atau koreksi (R + P) sekali; saldo awal & opname tidak dapat dibalik/dikoreksi (CR-04a; ketentuan pengeluaran & hasil produksi berlaku di CR-04b) |
| BR-31 | `request_id` wajib/opsional per allowlist; bila dikirim, kontrak idempotensi berlaku penuh; di luar allowlist (termasuk endpoint lama) ditolak 400 (CR-04a) |
| BR-32 | Estimasi FR-40 tidak berubah (BR-14 – BR-16); teks keterangan wajib berganti per tahap (bagian 10, E-6) (CR-04a) |
| BR-34 | Semua operasi tulis Purchasing dan dokumen stok AD-07 tercatat di `audit_logs` dalam transaksi yang sama (CR-04a) |
| BR-35 | Stock opname mencatat stok fisik absolut (boleh 0) & stok sistem; mutasi = selisih; dokumen tetap dicatat bila selisih 0; dikendalikan `expected_stock` (CR-04a) |

BR-25 – BR-29, BR-33, BR-36 dicadangkan untuk CR-04b/CR-04c (`docs/change-requests/CR-04_DRAFT_0.8.3.md` §13) dan
**belum berlaku**. Padanan kode BRD BR-17 – BR-36 adalah RB-18 – RB-37.

Stok ready berkurang saat pesanan DIBUAT dan kembali saat dibatalkan (TF-12).
Harga custom cake = harga dasar + Σ extra_price opsi terpilih.

### Aturan estimasi kebutuhan bahan (CR-03 · FR-40)

Status pesanan yang dihitung (BR-14 a; konstanta terpisah `MATERIAL_DEMAND_STATUSES`, `PRODUCTION_STATUSES` AD-05
tidak diubah):

| Kelompok | Status | Dihitung? |
|---|---|---|
| Belum pasti | `menunggu_pembayaran` | Tidak (dapat batal otomatis, BR-06) |
| Masih membutuhkan bahan | `dikonfirmasi`, `sedang_disiapkan` | **Ya** (Sedang Disiapkan dihitung penuh) |
| Bahan dianggap sudah digunakan | `siap_diambil`, `dalam_pengiriman`, `selesai` | Tidak |
| Tidak diproduksi | `dibatalkan` | Tidak |

- Klasifikasi pre-order/custom vs ready memakai `products.availability_type` **saat estimasi dihitung**
  (`order_items` tidak menyimpan salinan tipe), sama dengan Kalender AD-05 dan pengembalian stok saat pembatalan.
- Produk ready (BR-14 b): hari ini (WIB) dihitung dari seluruh `daily_stocks.qty_planned` hari ini; item ready dalam
  pesanan **tidak dihitung sebagai tambahan** karena kontribusinya diasumsikan sudah tercakup dalam `qty_planned`
  tanggal pesanan dibuat (checkout & pembatalan mengubah `qty_sold` pada tanggal WIB pesanan dibuat, TF-12). Tanggal
  mendatang: kontribusi produk ready = 0. `qty_planned` adalah rencana stok, bukan catatan produksi aktual; sistem
  tidak dapat memverifikasi produksi.
- Notasi: T = hari ini (WIB), D = tanggal target (T ≤ D ≤ T + 29). Kebutuhan **harian** = Σ jumlah × takaran untuk
  satu tanggal; **tertunggak** = item pre-order/custom berstatus dihitung dengan `ready_date` < T; **kumulatif**
  (= stok dialokasikan) = tertunggak + Σ kebutuhan harian T s.d. D. Sisa = stok − kumulatif (boleh negatif);
  kekurangan = maks(0, kumulatif − stok). Perbandingan dengan stok **selalu memakai kumulatif**.
- Status per bahan dari sisa: `kurang` (sisa < 0), `menipis` (0 ≤ sisa ≤ `min_stock`), `cukup` (sisa > `min_stock`) —
  label "Cukup/Menipis/Kurang", berbeda dari status tab Bahan Baku (Aman/Menipis/Habis).
- Presisi: takaran DECIMAL(10,3); stok DECIMAL(10,2) tidak berubah. Perhitungan dalam bilangan bulat milli-satuan
  (BigInt di server), tanpa pembulatan dini. Request `qty_per_unit` **wajib string desimal** (JSON number ditolak 400),
  divalidasi sebagai teks sebelum konversi; respons angka berupa JSON number (takaran & kebutuhan maks. 3 desimal,
  stok maks. 2 desimal), ID berupa string.
- Fail-safe presisi (keputusan pemilik project, ketentuan implementasi CP3): sebelum dikirim sebagai JSON number, setiap
  nilai milli-satuan diperiksa round-trip — representasi JSON aktualnya (`JSON.stringify`) harus kembali tepat ke
  milli-satuan yang sama (termasuk tanda negatif dan notasi eksponen). Bila tidak, aturan murni melempar error
  `MILLI_PRECISION_LOST`; nilai tidak pernah dibulatkan, dipotong, atau diubah menjadi string. Pemetaan ke kontrak API
  (keputusan pemilik project, CP5): HTTP **500**, body `{ "status": "error", "code": "MILLI_PRECISION_LOST",
  "message": "Hasil perhitungan tidak dapat direpresentasikan secara aman." }` tanpa data hasil sebagian; detail teknis
  (nilai milli-satuan, path) hanya dicatat di log server. Tidak pernah dipetakan ke 400/422 (bukan kesalahan masukan
  pengguna). Satu-satunya kode error yang dikirim bersama status 500 (`middlewares/errorHandler.js`); error 500 lain
  tetap tanpa kode dengan pesan generik. Endpoint komposisi (CP4) tidak dapat memicunya (takaran maks. selalu eksak).

### Aturan buku mutasi stok bahan & pembelian (CR-04a · FR-41 – FR-44)

Rincian normatif: `docs/change-requests/CR-04_DRAFT_0.8.3.md` (§2 – §7, §10), dibaca bersama Errata E1 dan E1.1.

- **Dokumen sumber CR-04a:** `stock_adjustments` (satu bahan; `saldo_awal`, `stok_masuk`, `pembalik_stok_masuk`,
  `pengganti_stok_masuk`, `stock_opname`) dan `goods_receipts` + `goods_receipt_lines` (`normal`, `pembalik`,
  `pengganti`). **Buku mutasi** `material_movements`: satu baris bersih (≠ 0) per bahan per operasi (penerimaan: per
  item PO); `stock_after = stock_before + qty_change`.
- **Jenis mutasi CR-04a:** `saldo_awal` (hanya bila stok > 0), `stok_masuk`, `pembalik_stok_masuk`, `koreksi_stok_masuk`,
  `stock_opname` (= fisik − sistem), `penerimaan`, `pembalik_penerimaan`, `koreksi_penerimaan`. Koreksi merujuk dokumen
  pengganti P bila bahan/item ada di P, selain itu dokumen pembalik R; dampak 0 → tanpa mutasi.
- **Dokumen berlaku** = tidak dirujuk `reverses_id` maupun `replaces_id`. Koreksi yang menjadikan semua baris 0 ditolak
  (gunakan pembalik). Saldo awal & opname diperbaiki dengan opname baru.
- **Invarian:** I-1 setelah setiap transaksi selesai `SUM(material_movements.qty_change) = raw_materials.stock` per
  bahan; I-2 rantai `stock_before`/`stock_after` per bahan dimulai dari 0; I-3 batas [0, 99.999.999,99]; I-4 per item
  PO bersih diterima ≥ 0 dan + `qty_cancelled` ≤ dipesan; I-6 dokumen dibalik/diganti paling banyak sekali; I-7 setiap
  bahan memiliki tepat satu dokumen saldo awal, mutasi saldo awal ada tepat bila qty > 0; I-8 mutasi = jumlah bertanda
  dokumen per operasi & kumulatif; I-9 keterkaitan `operation_requests`; I-10 opname: mutasi tepat bila fisik ≠ sistem;
  I-11 saldo awal mendahului semua catatan stok lain bahan itu. Pemeriksa data hanya-baca `db:check-ledger` (mode
  produksi tanpa pengecualian).
- **Saldo awal:** migrasi (set-based, terhadap snapshot pra-migrasi M-4), seed (preflight hanya-baca; saldo awal hanya
  untuk bahan baru atau bahan tanpa catatan stok apa pun; inkonsistensi → seed berhenti sebelum penulisan pertama;
  idempoten), dan `POST /api/admin/raw-materials` (satu transaksi dengan bahan; gagal → rollback penuh).
- **Presisi:** kuantitas DECIMAL(10,2) sebagai string desimal (JSON number & > 2 desimal ditolak 400 pada endpoint
  CR-04a); harga DECIMAL(12,2); aritmetika BigInt milli-satuan / 1/10.000 Rupiah; tanpa `Number()`/`parseFloat`;
  MySQL `stock + CAST(? AS DECIMAL(10,2))`.
- **Nilai pembelian:** nilai baris PO = `round(qty_ordered × unit_price)`; nilai penerimaan = Σ `round(qty_change ×
  unit_price)` per mutasi (bertanda); nilai sisa dibatalkan = Σ `round(qty_cancelled × unit_price)`; `round` setengah
  menjauhi nol per baris. Bukan omzet, tanpa hutang/pembayaran/pajak.
- **Idempotensi (`request_id`, UUID v4):** payload kanonik + SHA-256; replay identik dengan header
  `Idempotent-Replay: true`; aktor/operasi/target/hash beda → 409 `REQUEST_ID_REUSED`; asli masih berjalan → 409
  `REQUEST_IN_PROGRESS`; penolakan & error tidak disimpan; nilai sementara 102 tidak pernah ter-commit.
- **Kunci & transaksi:** satu operasi = satu transaksi interaktif; urutan kunci `users` (S) → `operation_requests` →
  `store_settings` (ubah master/opname) → `suppliers` → `supplier_materials` → `purchase_orders` → dokumen asal →
  `raw_materials` urut `material_id`; lock wait 2 s; 1205/1213 → rollback penuh.
- **Kode error baru:** `REQUEST_ID_REUSED`, `REQUEST_IN_PROGRESS` (409), `DOCUMENT_ALREADY_SUPERSEDED` (409),
  `STOCK_OUT_OF_RANGE` (409), `STOCK_CHANGED` (409 opname).

## 6. Validation Rules

| Fitur | Aturan | Perilaku |
|---|---|---|
| Registrasi | Email valid; HP diawali +62; keduanya unik; sandi ≥ 8 karakter; S&K dicentang | Error di bawah field; tombol Daftar nonaktif sampai lengkap |
| Login | Kredensial cocok | "Email/HP atau kata sandi salah" |
| Reset sandi | OTP 6 digit, belum kedaluwarsa, belum dipakai | Kirim ulang setelah hitung mundur |
| Detail produk | 1 ≤ jumlah ≤ stok ready; tanggal pre-order ≥ tanggal siap tercepat | Tanggal sebelum batas dinonaktifkan |
| Custom cake | Semua langkah wajib; tulisan maks. 30 karakter; tanggal ≥ H+3 | Tombol Lanjut nonaktif; tanggal dinonaktifkan |
| Checkout | Slot dalam jam operasional; alamat delivery dalam radius | Alamat di luar radius ditolak dengan pesan jelas |
| Voucher & poin | Voucher aktif, dalam periode, milik pelanggan, sesuai produk; maks. 1; poin ≤ saldo | "Voucher tidak berlaku untuk pesanan ini" |
| Pembayaran | Bayar di Toko hanya pickup + semua item ready | Opsi nonaktif: "Tidak tersedia untuk pre-order dan delivery" |
| Pembatalan | Hanya sebelum Sedang Disiapkan | Tombol Batalkan disembunyikan setelahnya |
| Ulasan | Pesanan Selesai; 1 ulasan per item; rating 1–5; maks. 3 foto | Tombol Beri Ulasan hanya pada pesanan Selesai |
| Status (admin) | Berurutan; pickup wajib verifikasi kode; Bayar di Toko wajib ditandai lunas sebelum Selesai | Modal konfirmasi sebelum simpan |
| Produk | Nama, kategori, harga > 0, tipe & lead time wajib; maks. 5 foto | Validasi inline |
| Stok | Tidak boleh negatif | Peringatan bila ≤ minimum |
| Komposisi bahan (CR-03) | Bahan terdaftar di AD-07; satu bahan sekali per produk; takaran string desimal > 0, maks. 3 angka desimal, ≤ 9.999.999,999; maks. 30 bahan per produk | Error per baris; Simpan menyimpan semua baris atau tidak sama sekali |
| Kebutuhan bahan (CR-03) | Tanggal `YYYY-MM-DD`, hari ini s.d. hari ini + 29 (WIB) | Tanggal di luar jendela dinonaktifkan; API menolak 400 |
| Produk tanpa komposisi (CR-03) | Tidak dianggap nol secara diam-diam | Ditampilkan di daftar "Belum ada komposisi" beserta jumlahnya |
| Supplier (CR-04a) | Nama 1 – 100 (trim), unik tanpa membedakan huruf besar/kecil; telepon/WA wajib ≤ 20; alamat 1 – 255; email valid ≤ 100; kontak person 1 – 100; catatan opsional ≤ 255; daftar bahan dari master AD-07 tanpa duplikat | 400 per field |
| Purchase order (CR-04a) | Supplier aktif & ≥ 1 bahan terdaftar; 1 – 30 item; bahan terdaftar; qty string > 0, ≤ 2 desimal, ≤ 99.999.999,99; harga string > 0, ≤ 2 desimal, ≤ 9.999.999.999,99; nilai baris & PO ≤ 9.999.999.999,99 | 400 `items.<i>.*` |
| Transisi PO (CR-04a) | `{from, to}` sesuai BR-19 | 409 |
| Penerimaan (CR-04a) | PO Dipesan/Diterima Sebagian; ≥ 1 baris qty > 0, ≤ 2 desimal; ≤ sisa; saldo akhir ≤ batas | 400 / 409 |
| Pembalik (CR-04a) | Dokumen asal berlaku & dapat dibalik; alasan 1 – 255; saldo akhir ∈ [0, batas] | 400 / 409 |
| Koreksi (CR-04a) | Dokumen asal berlaku (bila tidak → 409 `DOCUMENT_ALREADY_SUPERSEDED`); alasan 1 – 255; pengganti ≥ 1 baris qty > 0; penerimaan: item PO yang sama, ≤ dipesan − dibatalkan; stok masuk: bahan yang sama; saldo akhir ∈ [0, batas] | 400 / 409 |
| Stock opname (CR-04a, baru) | `counted_stock` & `expected_stock` wajib, string desimal ≥ 0, ≤ 2 desimal, ≤ 99.999.999,99; `expected_stock` ≠ stok terkunci → 409 `STOCK_CHANGED` | 400 / 409 |
| Stok masuk & ubah bahan (lama, CR-04a) | Aturan AD-07 yang ada; kini menulis dokumen + mutasi; `request_id` opsional | Seperti sebelumnya |
| `request_id` (CR-04a) | UUID v4 kanonik; wajib/opsional per allowlist; ditolak pada endpoint di luar allowlist | 400; 409 `REQUEST_ID_REUSED` / `REQUEST_IN_PROGRESS` |

## 7. Daftar Layar & Rute

Pelanggan (responsive — lihat CR-01):

| Kode | Layar | Rute | Login? |
|---|---|---|---|
| C-01 | Splash & Onboarding (3 slide, kunjungan pertama) | /onboarding | – |
| C-02 | Masuk | /masuk | – |
| C-03 | Daftar | /daftar | – |
| C-04 | Lupa Kata Sandi (OTP) | /lupa-sandi | – |
| C-05 | Beranda | / | – |
| C-06 | Katalog | /katalog | – |
| C-07 | Filter (bottom sheet di Katalog) | – | – |
| C-08 | Pencarian | /cari | – |
| C-09 | Detail Produk | /produk/:id | – |
| C-10 | Ulasan Produk | /produk/:id/ulasan | – |
| C-11 | Custom Cake Builder (6 langkah) | /custom-cake | – |
| C-12 | Keranjang | /keranjang | – |
| C-13 | Checkout | /checkout | Ya |
| C-14 | Metode Pembayaran | /checkout/pembayaran | Ya |
| C-15 | Halaman Bayar (timer 30 menit) | /bayar/:orderNumber | Ya |
| C-16 | Pesanan Berhasil | /pesanan-berhasil/:orderNumber | Ya |
| C-17 | Riwayat Pesanan (Aktif/Selesai) | /pesanan | Ya |
| C-18 | Detail & Tracking | /pesanan/:orderNumber | Ya |
| C-19 | Form Ulasan | /pesanan/:orderNumber/ulasan | Ya |
| C-20 | Akun (+ form Ubah Profil) | /akun, /akun/ubah-profil | Ya |
| C-21 | Voucher & Poin | /akun/voucher-poin | Ya |
| C-22 | Alamat Tersimpan | /akun/alamat | Ya |
| C-23 | Wishlist | /akun/wishlist | Ya |
| C-24 | Notifikasi | /notifikasi | Ya |

Navigasi 4 menu: Beranda, Katalog, Pesanan, Akun. Ikon keranjang (dengan jumlah item) di header.
- Lebar < 768 px: bottom nav 4 tab; header berisi logo + keranjang.
- Lebar ≥ 768 px: top navigation di header (logo, 4 menu, keranjang); tanpa bottom nav.

Alur fokus (Detail, Builder, Keranjang, Checkout, Pembayaran, Bayar) memakai header kembali tanpa bottom nav:
sticky bottom bar untuk aksi utama di mobile/tablet (< 1024 px) dan panel aksi sticky di kolom kanan
pada desktop (≥ 1024 px).

Admin (layout desktop, sidebar; < 1024 px sidebar menjadi drawer):

| Kode | Layar | Rute | Peran |
|---|---|---|---|
| AD-01 | Login Admin (split screen) | /admin/login | – |
| AD-02 | Dashboard | /admin/dashboard | Owner |
| AD-03 | Daftar Pesanan | /admin/pesanan | Staf, Owner |
| AD-04 | Detail & Verifikasi Pesanan | /admin/pesanan/:orderNumber | Staf, Owner |
| AD-05 | Kalender Produksi | /admin/kalender | Staf, Owner |
| AD-06 | Produk & Opsi Custom Cake (+ modal Komposisi Bahan, CR-03) | /admin/produk | Staf, Owner |
| AD-07 | Stok (+ tab Kebutuhan Bahan, CR-03; + riwayat mutasi, stock opname, pembalik/koreksi stok masuk, CR-04a) | /admin/stok | Staf, Owner |
| AD-08 | Laporan Penjualan | /admin/laporan | Owner |
| AD-09 | Promo & Loyalty | /admin/promo | Owner |
| AD-10 | Pelanggan & Ulasan | /admin/pelanggan | Staf, Owner |
| AD-11 | Pengaturan | /admin/pengaturan | Owner |
| AD-12 | Pembelian: tab Purchase Order (default) & Supplier (`?tab=supplier`), detail PO, penerimaan (CR-04a) | /admin/pembelian | Staf, Owner |

AD-12 ditambahkan oleh CR-04a (menu sidebar baru; diimplementasikan di Step 6.8 CP6). AD-13 Produksi
(`/admin/produksi`) dan tab Operasional AD-08 dicadangkan untuk CR-04b/CR-04c dan **belum berlaku**.

## 8. Data Dictionary (39 tabel)

Notasi: `?` = nullable, `UQ` = unique, `PK/FK` sesuai ERD.

```
users: user_id BIGINT PK; name VARCHAR(100); email VARCHAR(150) UQ; phone VARCHAR(20) UQ;
  password_hash VARCHAR(255)?; google_id VARCHAR(100) UQ?; role ENUM(customer,owner,staf);
  is_active BOOLEAN; created_at DATETIME
addresses: address_id BIGINT PK; user_id FK users; label VARCHAR(30); recipient_name VARCHAR(100);
  recipient_phone VARCHAR(20); full_address TEXT; latitude DECIMAL(10,7); longitude DECIMAL(10,7);
  courier_note VARCHAR(255)?; is_primary BOOLEAN
password_resets: reset_id BIGINT PK; user_id FK; otp_hash VARCHAR(255); expires_at DATETIME; used_at DATETIME?
notifications: notification_id BIGINT PK; user_id FK; type ENUM(order_status,promo,points);
  title VARCHAR(100); body VARCHAR(255); order_id FK orders?; is_read BOOLEAN; created_at DATETIME
audit_logs: log_id BIGINT PK; user_id FK (admin); action VARCHAR(50); entity VARCHAR(50);
  entity_id BIGINT; created_at DATETIME

categories: category_id INT PK; name VARCHAR(50) UQ; sort_order INT
products: product_id BIGINT PK; category_id FK; name VARCHAR(100); description TEXT; ingredients TEXT?;
  allergens VARCHAR(255)?; price DECIMAL(12,2); availability_type ENUM(ready,preorder,custom);
  lead_time_days TINYINT (0 ready, 1 pre-order, 3 custom); is_active BOOLEAN
product_images: image_id BIGINT PK; product_id FK; image_url VARCHAR(255); sort_order TINYINT
product_variants: variant_id BIGINT PK; product_id FK; name VARCHAR(50); extra_price DECIMAL(12,2); is_active BOOLEAN
daily_stocks: stock_id BIGINT PK; product_id FK; stock_date DATE (UQ bersama product_id);
  qty_planned INT; qty_sold INT   -- sisa = qty_planned - qty_sold (tidak disimpan)
raw_materials: material_id BIGINT PK; name VARCHAR(100); unit VARCHAR(20); stock DECIMAL(10,2); min_stock DECIMAL(10,2)
product_materials: product_id BIGINT PK,FK products; material_id BIGINT PK,FK raw_materials; qty_per_unit DECIMAL(10,3)
  -- CR-03: takaran per 1 unit produk dalam raw_materials.unit; FK ON DELETE RESTRICT
custom_options: option_id INT PK; option_group ENUM(ukuran,bentuk,rasa,krim_topping); name VARCHAR(50);
  description VARCHAR(100)?; extra_price DECIMAL(12,2); image_url VARCHAR(255)?; is_active BOOLEAN
custom_cake_designs: design_id BIGINT PK; product_id FK; user_id FK?; writing_text VARCHAR(30)?;
  writing_color VARCHAR(20)?; reference_photo_url VARCHAR(255)?; ready_date DATE; price DECIMAL(12,2)
custom_cake_design_options: design_id PK,FK; option_id PK,FK

carts: cart_id BIGINT PK; user_id FK?; session_token VARCHAR(64) UQ?; updated_at DATETIME
cart_items: cart_item_id BIGINT PK; cart_id FK; product_id FK; variant_id FK?; design_id FK?;
  quantity INT; note VARCHAR(255)?; preferred_date DATE?
orders: order_id BIGINT PK; order_number VARCHAR(20) UQ; user_id FK; fulfillment_type ENUM(pickup,delivery);
  address_id FK?; delivery_address_snapshot TEXT?; distance_km DECIMAL(5,2)?; ready_date DATE;
  time_slot VARCHAR(20); subtotal DECIMAL(12,2); shipping_fee DECIMAL(12,2); voucher_id FK?;
  voucher_discount DECIMAL(12,2); points_used INT; points_discount DECIMAL(12,2); total DECIMAL(12,2);
  payment_option ENUM(online,pay_at_store); payment_status ENUM(unpaid,paid,refunded);
  order_status ENUM(lihat bagian 4); pickup_code VARCHAR(10)?; courier_name VARCHAR(100)?;
  cancel_reason VARCHAR(255)?; created_at DATETIME
order_items: order_item_id BIGINT PK; order_id FK; product_id FK; variant_id FK?; design_id FK?;
  quantity INT; unit_price DECIMAL(12,2); note VARCHAR(255)?
payments: payment_id BIGINT PK; order_id FK; method_code VARCHAR(20) FK; amount DECIMAL(12,2);
  gateway_ref VARCHAR(100)?; payment_code VARCHAR(255)?; status ENUM(pending,paid,expired,failed,refunded);
  expired_at DATETIME; paid_at DATETIME?
order_status_histories: history_id BIGINT PK; order_id FK; status ENUM; changed_by FK users?;
  note VARCHAR(255)?; changed_at DATETIME
payment_methods: method_code VARCHAR(20) PK; name VARCHAR(50); method_group ENUM(qris,ewallet,va,store); is_active BOOLEAN
  -- data: qris, gopay, ovo, dana, shopeepay, va_bca, va_bni, va_mandiri, va_bri, pay_at_store

vouchers: voucher_id BIGINT PK; code VARCHAR(20) UQ; title VARCHAR(100); discount_type ENUM(percent,amount);
  discount_value DECIMAL(12,2); product_id FK? (kosong = semua); quota INT; valid_from DATE; valid_to DATE; is_active BOOLEAN
user_vouchers: user_id PK,FK; voucher_id PK,FK; claimed_at DATETIME; used_at DATETIME?
point_transactions: point_tx_id BIGINT PK; user_id FK; type ENUM(earn,redeem,review_bonus,refund);
  points INT (+/-); order_id FK?; review_id FK?; created_at DATETIME
reviews: review_id BIGINT PK; user_id FK; order_item_id FK UQ; rating TINYINT; tags VARCHAR(255)?;
  comment TEXT?; is_hidden BOOLEAN; admin_reply TEXT?; created_at DATETIME
review_photos: photo_id BIGINT PK; review_id FK; photo_url VARCHAR(255)
wishlists: user_id PK,FK; product_id PK,FK; created_at DATETIME

store_settings (1 baris, setting_id = 1): store_name; address?; latitude?; longitude?; whatsapp_number?;
  preorder_cutoff_time TIME?; delivery_radius_km DECIMAL(5,2)?; delivery_fee_per_km DECIMAL(12,2)?;
  payment_timeout_minutes SMALLINT (30); earn_amount_per_point (1000); redeem_points_unit (100);
  redeem_value (5000); gold_min_points (500); platinum_min_points (2000); review_bonus_points (20)
operating_hours: hour_id TINYINT PK; day_of_week TINYINT UQ (1 Senin – 7 Minggu); open_time TIME?;
  close_time TIME?; is_open BOOLEAN

-- CR-04a (Step 6.8 CP2): pembelian & buku mutasi stok bahan; waktu DATETIME(3); semua FK ON DELETE/UPDATE RESTRICT
operation_requests: request_id CHAR(36) PK; operation VARCHAR(40); actor_id FK users; target_type VARCHAR(30)?;
  target_id BIGINT?; payload_hash CHAR(64); response_status SMALLINT; response_body JSON; created_at DATETIME(3)
suppliers: supplier_id BIGINT PK; name VARCHAR(100) UQ; phone VARCHAR(20); email VARCHAR(100); address VARCHAR(255);
  contact_person VARCHAR(100); note VARCHAR(255)?; is_active BOOLEAN (TRUE); created_by FK users;
  created_request_id CHAR(36) FK operation_requests UQ; created_at DATETIME(3); updated_at DATETIME(3)
supplier_materials: supplier_id PK,FK suppliers; material_id PK,FK raw_materials
purchase_orders: po_id BIGINT PK; po_number VARCHAR(20) UQ; supplier_id FK;
  status ENUM(draft,dipesan,diterima_sebagian,diterima,dibatalkan); note VARCHAR(255)?; ordered_at DATETIME(3)?;
  cancelled_at DATETIME(3)?; cancel_reason VARCHAR(255)?; created_by FK users;
  created_request_id CHAR(36) FK operation_requests UQ; created_at DATETIME(3); updated_at DATETIME(3)
purchase_order_items: po_item_id BIGINT PK; po_id FK; material_id FK (UQ bersama po_id); qty_ordered DECIMAL(10,2);
  unit_price DECIMAL(12,2); qty_cancelled DECIMAL(10,2) (0)
goods_receipts: receipt_id BIGINT PK; po_id FK; kind ENUM(normal,pembalik,pengganti); reverses_id FK goods_receipts? UQ;
  replaces_id FK goods_receipts? UQ; reason VARCHAR(255)?; note VARCHAR(255)?; operation_request_id CHAR(36) FK;
  created_by FK users; created_at DATETIME(3)
goods_receipt_lines: line_id BIGINT PK; receipt_id FK; po_item_id FK (UQ bersama receipt_id); qty DECIMAL(10,2)
stock_adjustments: adjustment_id BIGINT PK; material_id FK;
  kind ENUM(saldo_awal,stok_masuk,pembalik_stok_masuk,pengganti_stok_masuk,stock_opname); qty DECIMAL(10,2)?;
  counted_stock DECIMAL(10,2)?; system_stock DECIMAL(10,2)?; reverses_id FK stock_adjustments? UQ;
  replaces_id FK stock_adjustments? UQ; reason VARCHAR(255)?; opening_material_id BIGINT? UQ (= material_id, hanya
  saldo_awal); operation_request_id CHAR(36) FK?; created_by FK users? (NULL hanya saldo awal migrasi/seed);
  created_at DATETIME(3)
material_movements: movement_id BIGINT PK; material_id FK; type ENUM(saldo_awal,stok_masuk,pembalik_stok_masuk,
  koreksi_stok_masuk,stock_opname,penerimaan,pembalik_penerimaan,koreksi_penerimaan); qty_change DECIMAL(10,2) (≠ 0);
  stock_before DECIMAL(10,2); stock_after DECIMAL(10,2); adjustment_id FK? UQ; receipt_id FK?;
  po_item_id FK? (UQ bersama receipt_id); created_by FK users? (NULL hanya saldo_awal); created_at DATETIME(3)
```

Prinsip: saldo poin, level, sisa stok, kebutuhan & stok dialokasikan bahan, dan subtotal item TIDAK disimpan sebagai
kolom (dihitung).
Data transaksi disimpan sebagai salinan (unit_price, delivery_address_snapshot).

### Catatan tabel CR-04a (diterapkan Step 6.8 CP2)

Migrasi `20261112000000_cr04a_purchasing` (30 → 39 tabel). DDL lengkap, indeks, dan CHECK (pola anti-UNKNOWN):
`docs/change-requests/CR-04_DRAFT_0.8.3.md` §12.1 – §12.2. CHECK: `ck_opreq_fmt`, `ck_opreq_target`, `ck_supplier_text`,
`ck_po_status`, `ck_poi_values`, `ck_gr_kind`, `ck_grl_qty`, `ck_sa_kind`, `ck_mm_source`, `ck_mm_sign`, `ck_mm_balance`,
`ck_mm_actor`. Migrasi mengisi satu dokumen saldo awal per bahan (mutasi hanya bila stok > 0) tanpa mengubah
`raw_materials`. Tabel lama tidak berubah strukturnya; `raw_materials.stock` tetap DECIMAL(10,2). `npm run db:check-spec`
memeriksa tabel, FK RESTRICT/RESTRICT, CHECK, dan pengisian saldo awal; `npm run db:check-ledger` memeriksa data buku
mutasi (I-1, I-2, I-3, I-7, I-8, I-10, I-11).

## 9. Data Contoh (seed)

Produk: Classic Butter Croissant (Rp 28.000, ready, badge "Ready · Bisa diambil hari ini"),
Signature Cinnamon Roll, Chocolate Lava Cake, Assorted Cookies Box, Premium Birthday Cake
(badge "Pre-order H-1"), Custom Celebration Cake (custom, H-3).
Kategori: Roti, Cake, Pastry, Cookies, Custom Cake.
Pelanggan demo: saldo 1.250 poin · Gold Member. Contoh nomor pesanan: OVC-261012-018.
Voucher contoh: WEEKEND15.
Harga selain croissant, opsi custom cake, dan nama pelanggan: isi data dummy yang wajar dan beri
komentar `// data contoh` di file seed.
Komposisi bahan (CR-03): contoh untuk sebagian produk (`// data contoh`); minimal satu produk yang punya rencana
stok/pesanan sengaja tanpa komposisi untuk demo "Belum ada komposisi".
Saldo awal bahan (CR-04a, berlaku sejak Step 6.8 CP2): seed membuat dokumen saldo awal untuk setiap bahan seed (mutasi
hanya bila stok > 0) setelah preflight hanya-baca; seed ulang tidak mengubah stok maupun menggandakan dokumen.

## 10. Asumsi Prototype (open issue di dokumen)

Simpan semua nilai berikut di store_settings / konstanta agar mudah diganti:

| Hal | Asumsi prototype | Referensi |
|---|---|---|
| Alamat & koordinat toko, nomor WhatsApp | Data dummy | OI-01, TF-10 |
| Radius & tarif ongkir | Contoh: 10 km, Rp 2.500/km | OI-02 |
| Batas jam pre-order | Contoh: 17.00 | OI-04 |
| Jam operasional | Contoh: 07.00–20.00 setiap hari | TF-10 |
| Payment gateway | Simulasi: QR/VA dummy + tombol uji "Simulasikan Lunas" (hanya mode development) | TF-14 terkait |
| Email & OTP | OTP dicetak ke console server | TF-14 |
| Refund | Hanya mencatat payment_status = refunded | TF-09 |
| Periode level member | Tahun kalender berjalan (konstanta, mudah diganti) | TF-11 |
| Krim & topping | Satu pilihan per langkah di UI (tabel sudah mendukung ganda) | TF-08 |
| Riwayat pencarian | localStorage perangkat | TF-13 |
| Kata sandi | Minimal 8 karakter | TF-15 |
| Login Google | Tombol tersedia; OAuth asli opsional di akhir | FR-02 |
| Jendela estimasi kebutuhan bahan | Hari ini s.d. hari ini + 29 (30 hari, sama dengan custom cake) | CR-03 |
| Batas & presisi komposisi | Maks. 30 bahan per produk; takaran 3 desimal | CR-03 (D-8) |
| E-1 | Produk ready hanya dihitung untuk hari ini dari rencana stok harian; tanggal mendatang tidak termasuk | CR-03 |
| E-2 | Estimasi tanggal mendatang hanya dari pesanan pre-order/custom berstatus Dikonfirmasi/Sedang Disiapkan | CR-03 |
| E-3 | Rencana ready hari ini dihitung penuh (bisa berlebih bila sebagian sudah dibuat dan stok dikoreksi) | CR-03 |
| E-4 | Custom cake memakai takaran ukuran standar | CR-03 |
| E-5 | Pesanan Sedang Disiapkan dihitung penuh | CR-03 |
| E-6 versi CR-03 (**tidak berlaku lagi** sejak Step 6.8 CP6) | Stok bahan tidak dikurangi otomatis; akurasi bergantung pada koreksi stok AD-07 | CR-03 |
| E-6 versi CR-04a (**AKTIF** sejak Step 6.8 CP6) | Estimasi tidak mengurangi stok bahan; stok hanya berubah lewat transaksi yang dicatat — Catat Stok Masuk, penerimaan pembelian, stock opname, serta pembalik atau koreksi transaksi tersebut; akurasi bergantung pada pencatatan transaksi dan stock opname AD-07 | CR-04a |
| E-7 | Produk tanpa komposisi tidak dihitung; ditampilkan terpisah | CR-03 |
| E-8 | Item ready di pesanan campuran dihitung pada tanggal pesanan dibuat (TF-12), bukan `ready_date` | CR-03 (diterima) |
| E-9 | Klasifikasi memakai tipe produk saat estimasi; perubahan tipe setelah pesanan dibuat dapat membuat estimasi kurang/berlebih | CR-03 |
| E-10 | Varian produk non-custom tidak dihitung terpisah | CR-03 |
| Batas dokumen pembelian | Maks. 30 item per PO; nomor `PO-YYMMDD-NNN` | CR-04a |
| Pembalik & koreksi | Pembalik penuh sekali; koreksi sekali per dokumen berlaku; tanpa batas waktu koreksi; saldo awal & opname tidak dapat dibalik | CR-04a |
| Pembulatan nilai pembelian | Setengah menjauhi nol, 2 desimal, per baris | CR-04a |
| Tanggal dokumen stok & penerimaan | Waktu server (WIB) saat dicatat; tanpa tanggal mundur | CR-04a (K08) |
| Retensi `operation_requests` | Tanpa batas waktu (prototype) | CR-04a |
| Batas stok & harga | Stok/kuantitas 0 – 99.999.999,99; harga > 0 – 9.999.999.999,99 | CR-04a |
| Lock wait transaksi stok | 2 detik; 1205/1213 → rollback penuh | CR-04a |

Teks keterangan wajib di tab Kebutuhan Bahan (CR-03 + E-6 versi CR-04a, memuat E-1 – E-10, selalu tampil; **teks AKTIF**): *"Angka ini estimasi, bukan
catatan pemakaian bahan. Dihitung dari pesanan pre-order & custom yang sudah dikonfirmasi atau sedang disiapkan —
pesanan yang sedang disiapkan dihitung penuh — ditambah seluruh rencana produk ready hari ini, termasuk yang mungkin
sudah dibuat. Produk ready untuk tanggal mendatang belum termasuk. Produk ready dalam pesanan campuran dihitung pada
tanggal pesanan dibuat, bukan tanggal siap. Custom cake dihitung dengan ukuran standar, dan varian produk tidak
dihitung terpisah. Produk tanpa komposisi tidak dihitung dan ditampilkan terpisah. Jenis produk dibaca dari data
produk saat ini; bila diubah setelah pesanan dibuat, estimasi dapat kurang atau berlebih. Estimasi ini tidak mengurangi
stok bahan; stok hanya berubah lewat Catat Stok Masuk, penerimaan pembelian, stock opname, serta pembalik atau koreksi
transaksi tersebut."*

**E-6 versi CR-04a — AKTIF sejak Step 6.8 CP6** (buku mutasi & integrasi AD-07/AD-12 berfungsi di mode mock & API).
Kalimat penutup teks aktif di atas menggantikan kalimat penutup versi CR-03 ("Stok bahan tidak dikurangi otomatis;
perbarui lewat Catat Stok Masuk atau koreksi stok."); bagian awal tidak berubah. Penggantian dilakukan dalam satu commit
CP6: teks aktif di SPEC, konstanta `MATERIAL_REQUIREMENT_NOTE`, unit test K-14, dan uji integrasi/e2e yang memeriksa teks,
sehingga teks yang tampil selalu sesuai perilaku sistem yang aktif. Versi CR-04b (E-6 + E-11) dicadangkan dan belum
berlaku.

## 11. Catatan Perubahan Requirement — CR-01 (Responsive Web)

- Tanggal diusulkan: 16 Oktober 2026
- Status: **Diusulkan — menunggu persetujuan kelompok/dosen**
- Implementasi: Step 2.5 di `docs/ROADMAP.md` (PR A: responsive foundation; PR B: penerapan halaman)

| Requirement | Lama (dokumen Analisis v1.0) | Usulan baru |
|---|---|---|
| NFR-06 Compatibility | Web pelanggan dirancang untuk lebar 360–430 px dan tetap rapi di tablet/desktop dengan konten di tengah (maks. 480 px); admin panel dirancang untuk desktop 1440 px; berjalan pada browser HP modern. | Web pelanggan responsif untuk lebar 360–1920 px (mobile < 768, tablet 768–1023, desktop ≥ 1024) dengan layout desktop sungguhan, kontainer maks. 1280 px; admin panel dirancang untuk desktop 1440 px dan memakai drawer pada lebar < 1024 px; berjalan pada browser HP dan desktop modern. |
| NFR-01 Usability | … aksi utama berada pada sticky bottom bar … | … aksi utama berada pada sticky bottom bar di mobile/tablet dan pada panel aksi sticky di kolom kanan pada desktop (≥ 1024 px) … (bagian lain NFR-01 tetap). |

Yang TIDAK berubah: daftar layar & rute (bagian 7), FR, business rules, validation rules, data dictionary,
warna, font, dan identitas visual Oven & Co.

## 12. Catatan Perubahan Requirement — CR-03 (Komposisi Bahan & Estimasi Kebutuhan Bahan)

- Tanggal disetujui: 11 November 2026 (dokumen CR-03 Revisi 8)
- Status: **Disetujui pemilik project (S)** sebagai keputusan internal project. **Persetujuan akademik formal
  (kelompok/dosen) belum dikonfirmasi**; dokumen PDF BRD/PRD/Analisis tidak diubah.
- Implementasi: Step 6.7 di `docs/ROADMAP.md` (CP0 – CP8)

| Requirement | Lama (dokumen v1.0) | Baru (CR-03) |
|---|---|---|
| Di luar lingkup (BRD §10.2, PRD §13.1, Analisis) | "Manajemen keuangan, pembelian bahan, dan produksi berbasis resep" | "Manajemen keuangan, pembelian bahan, dan produksi (perencanaan, work order, pemakaian bahan). Komposisi bahan per produk dan estimasi kebutuhan bahan termasuk lingkup (CR-03)" |
| Functional requirement | FR-01 – FR-38 | + FR-39, FR-40 (bagian 3) |
| Business rule | BR-01 – BR-12 | + BR-13 – BR-16 (bagian 5); kode BRD padanannya RB-14 – RB-17 |
| Business requirement / fitur PRD / use case | — | BR-024 (BRD); A-07 diperluas (PRD); UC-31, UC-32 |
| Validation rules | — | + Komposisi bahan, Kebutuhan bahan, Produk tanpa komposisi (bagian 6) |
| Data dictionary | 29 tabel | 30 tabel: + `product_materials` (bagian 8) |
| Layar | AD-06, AD-07 | Rute tetap; AD-06 + modal Komposisi, AD-07 + tab Kebutuhan Bahan (bagian 7) |
| Hak akses | — | Staf & Owner (bagian 2); pelanggan tidak melihat komposisi |

Keputusan pemilik project yang menyertai (11 Nov 2026): status pesanan yang dihitung = Dikonfirmasi & Sedang Disiapkan;
stok dialokasikan = kumulatif + tertunggak; jendela tanggal 30 hari; maks. 30 bahan per produk; peringatan teks saat
satuan bahan diubah (tanpa memblokir); audit `update_product_recipe` (perbandingan pasangan `material_id` +
`qty_per_unit`, urutan baris diabaikan); modal di AD-06 + tab di AD-07 tanpa rute/menu baru; perluasan A-07; daftar
estimasi memuat semua bahan; rencana ready hari ini dihitung penuh; komposisi contoh untuk sebagian produk; tertunggak
masuk kumulatif; teks keterangan keterbatasan wajib tampil; keterbatasan E-8 diterima. Takaran 3 desimal (D-8).
Step 6.8 dan 6.9 ditunda (di luar lingkup); Step 6.10 ditunda untuk laporan lanjutan baru; laporan penjualan AD-08
dan KPI AD-02 tetap berlaku.

API baru (Staf & Owner): `GET /api/admin/products/:id/materials`, `PUT /api/admin/products/:id/materials` (ganti
seluruh komposisi; satu transaksi dengan kunci pelaku `users` S → `store_settings` X; last-write-wins menurut urutan
perolehan kunci & commit), `GET /api/admin/material-requirements?date=YYYY-MM-DD` (kebutuhan harian dan kumulatif
sekaligus, dibaca dalam satu snapshot; `date` kosong = hari ini WIB; 400 `Tanggal tidak valid.` / `Tanggal di luar
rentang.` (di luar T s.d. T + 29); 401/403; 500 `MILLI_PRECISION_LOST` sesuai bagian 5).

Yang TIDAK berubah: checkout, pembatalan, BR-01 – BR-12, alur & status pesanan (bagian 4), daftar rute (bagian 7),
`raw_materials` (struktur, presisi, Catat Stok Masuk, koreksi stok), `daily_stocks`, `products.ingredients`, Kalender
AD-05, Dashboard AD-02, laporan AD-08, web pelanggan. Tetap di luar lingkup: master satuan & konversi, alokasi
tersimpan, pengurangan stok bahan otomatis, resep per varian/opsi, HPP & harga beli, supplier, purchase order,
produksi/work order, laporan bahan/pembelian/produksi.

## 13. Catatan Perubahan Requirement — CR-04 (tahap CR-04a: Supplier & Purchasing)

- Tanggal disetujui: 12 November 2026 — K01 – K25, C-1 – C-13 (keputusan Pemilik Project).
- Status: **Disetujui Pemilik Project (S)** sebagai keputusan internal project. Persetujuan akademik formal **bukan
  prasyarat** (keputusan C-14 yang diubah); arahan umum dosen agar lingkup disesuaikan dengan kemampuan kelompok dicatat
  sebagai konteks, **tanpa klaim** bahwa dosen menyetujui rincian CR-04. Dokumen PDF BRD/PRD/Analisis tidak diubah.
- Dokumen sumber (`docs/change-requests/`, urutan baca): `CR-04_DRAFT_0.8.3.md` (SHA-256 `daa97c40…3e816`) →
  `CR-04_ERRATA_E1_DRAFT_0.8.3.md` (`b29849d8…c59d2`) → `CR-04_ERRATA_E1.1_DRAFT_0.8.3.md` (`0bfe4546…909da8`);
  ringkasan & register keputusan `CR-04_PAKET_PERSETUJUAN_FINAL.md`; rekaman `CR-04_Persetujuan_Pemilik_Project.md`.
- Tahap: **CR-04a** (Step 6.8) berlaku di SPEC ini. **CR-04b** (Step 6.9, produksi/work order) dan **CR-04c** (Step 6.10,
  laporan operasional) direncanakan tetapi **belum diizinkan**; kodenya dicadangkan (FR-45 – FR-47, UC-36 – UC-38,
  BR-25 – BR-29, BR-33, BR-36, AC-45 – AC-47, A-14, A-15, BR-026, BR-027, AD-13, tab Operasional AD-08).
- Implementasi: Step 6.8 di `docs/ROADMAP.md` (CP0 – CP7), hanya per CP yang diizinkan.

| Requirement | Lama | Baru (CR-04a) |
|---|---|---|
| Di luar lingkup (BRD §10.2, PRD §13.1, Analisis; CR-03) | "… pembelian bahan, dan produksi …"; supplier & purchase order di luar lingkup | Supplier, purchase order, penerimaan bahan, dan buku mutasi stok bahan **termasuk lingkup**. Tetap di luar lingkup: keuangan/akuntansi (hutang, pembayaran supplier, pajak, HPP), produksi/work order dan laporan operasional (sampai CR-04b/c disetujui), master satuan & konversi, alokasi tersimpan |
| Functional requirement | FR-01 – FR-40 | + FR-41 – FR-44 (bagian 3) |
| Business rule | BR-01 – BR-16 | + BR-17 – BR-24, BR-30 – BR-32, BR-34, BR-35 (bagian 5); padanan BRD RB-18 – RB-37 |
| Business requirement / fitur PRD / use case | — | BR-025 Pengadaan bahan terkendali (BRD); A-13 Pembelian & A-07 diperluas (PRD); UC-33 – UC-35 |
| Validation rules | — | + Supplier, PO, transisi PO, penerimaan, pembalik, koreksi, stock opname, `request_id` (bagian 6) |
| Data dictionary | 30 tabel | 39 tabel: + 9 tabel (bagian 8; diterapkan CP2) |
| Layar | AD-01 – AD-11 | + AD-12 Pembelian `/admin/pembelian`; AD-07 diperluas (bagian 7) |
| Hak akses | — | Staf & Owner setara untuk Purchasing & dokumen stok (K01); pelanggan 403 |
| Perilaku AD-07 | Stok masuk & koreksi stok langsung mengubah `raw_materials.stock` | Dokumen + mutasi dalam transaksi yang sama; kontrak lama tetap + `request_id` opsional; UI koreksi stok memakai stock opname |

Use case (usulan resmi CR-04a): **UC-33** Mengelola Supplier (Staf, Owner; FR-41) · **UC-34** Mengelola Purchase Order
(FR-42) · **UC-35** Mencatat Mutasi Stok Bahan — penerimaan PO, stok masuk, stock opname, pembalik/koreksi (FR-43,
FR-44); FR-44 juga memperluas UC-24 (stok).

### API CR-04a (Staf & Owner)

| Endpoint | `request_id` |
|---|---|
| `GET /api/admin/suppliers`, `POST /api/admin/suppliers` | POST wajib |
| `PUT /api/admin/suppliers/:id`, `PATCH /api/admin/suppliers/:id/active` | Opsional |
| `GET /api/admin/purchase-orders`, `POST /api/admin/purchase-orders` | POST wajib |
| `GET /api/admin/purchase-orders/:id`, `PUT /api/admin/purchase-orders/:id` (hanya Draft) | PUT opsional |
| `PATCH /api/admin/purchase-orders/:id/status` | Wajib |
| `POST /api/admin/purchase-orders/:id/receipts` | Wajib |
| `POST /api/admin/goods-receipts/:id/reverse`, `POST /api/admin/goods-receipts/:id/correct` | Wajib |
| `GET /api/admin/raw-materials/:id/movements` | Ditolak (GET) |
| `POST /api/admin/raw-materials/:id/stock-counts` (stock opname baru) | Wajib |
| `POST /api/admin/stock-adjustments/:id/reverse`, `POST /api/admin/stock-adjustments/:id/correct` | Wajib |
| `POST /api/admin/raw-materials`, `PUT /api/admin/raw-materials/:id`, `POST /api/admin/raw-materials/:id/stock-in` (lama; kontrak tetap) | Opsional |

Endpoint lain (termasuk endpoint lama di luar daftar dan semua GET) menolak `request_id` dengan 400 lewat satu
middleware allowlist; selain itu perilakunya tidak berubah. Audit (`audit_logs`, tanpa layar): `create_supplier`,
`update_supplier`, `set_supplier_active`, `create_purchase_order`, `update_purchase_order`, `order_purchase_order`,
`cancel_purchase_order`, `receive_purchase_order`, `reverse_goods_receipt`, `correct_goods_receipt`, `count_stock`,
`reverse_stock_in`, `correct_stock_in`, `create_raw_material` (bahan baru + saldo awal, Errata E1 B.4; keputusan Pemilik
Project 13 Nov 2026); aksi AD-07 lama tetap.

### Acceptance criteria CR-04a

- AC-41.1 Supplier (field T-01; tanpa daftar bahan boleh); pelanggan 403; tanpa token 401.
- AC-41.2 PO ditolak untuk supplier tanpa bahan atau bahan di luar daftar.
- AC-42.1 PO Draft → ubah → Dipesan → Dibatalkan; nilai identik di API, mock, laporan.
- AC-42.2 `qty_cancelled` & nilai sisa dibatalkan historis.
- AC-43.1 Penerimaan sebagian berulang; kelebihan ditolak; status BR-19.
- AC-43.2 Replay penerimaan identik; payload/aktor beda 409; paralel → satu dokumen.
- AC-43.3 Pembalik murni ditolak bila saldo < 0; koreksi dengan dampak bersih sah diterima setelah bahan terpakai sebagian.
- AC-43.4 Koreksi: satu mutasi bersih per bahan merujuk P/R; dampak 0 tanpa mutasi; atomik; I-8.
- AC-43.5 Nilai penerimaan dari mutasi; pembalik tepat negatif.
- AC-44.1 Migrasi M-0 – M-9 dengan fencing akun aplikasi terpisah (P-OPS-1 – P-OPS-4); snapshot di M-4 setelah fencing
  dan sebelum backup; UNLOCK hanya setelah validasi lulus; saldo awal tepat satu per bahan = snapshot M-4; CHECK & FK
  `RESTRICT` aktif.
- AC-44.2 Stok masuk & ubah bahan lama: kontrak sama; dokumen + mutasi; `request_id` opsional dengan kontrak penuh.
- AC-44.3 Pembalik & koreksi stok masuk; saldo awal & opname tidak dapat dibalik.
- AC-44.4 Opname: fisik 0 sah; selisih 0 tercatat tanpa mutasi; mutasi = fisik − sistem; `expected_stock` 400/409; I-10.
- AC-44.5 Semua mutasi ≠ 0 dan menjaga [0, batas]; INSERT yang melanggar CHECK ditolak MySQL.
- AC-44.6 Allowlist `request_id`: wajib tanpa `request_id` → 400; replay identik; payload beda 409; tidak ada baris
  `response_status = 102` setelah transaksi; di luar allowlist → 400 tanpa efek lain.
- AC-44.7 IT-01 – IT-15, IT-30, IT-31, IT-33 lulus; `lock_deadlocks = 0`.
- AC-44.8 Upgrade, instalasi baru, seed berulang (termasuk dilanjutkan setelah gangguan), dan pembuatan bahan lewat API
  memenuhi I-1, I-2, I-3, I-7, I-8, I-10, I-11; preflight seed menghentikan inkonsistensi sebelum penulisan pertama;
  `db:check-ledger` mode produksi tanpa pengecualian; IT-34 – IT-38 lulus.
- AC-NF Mode mock = API; 390/768/1440 px tanpa overflow; skeleton, empty state, toast, label, area sentuh 44 px.

Skenario uji integrasi IT-01 – IT-15, IT-30, IT-31, IT-33 – IT-38 didefinisikan di dokumen CR-04 (Draft §18, Errata
E1.1 §6). Status (Step 6.8 CP7, harness MySQL terisolasi): IT-01 – IT-04, IT-34 (`tests-mysql/19`), IT-35, IT-36
(`20`), IT-06 – IT-08, IT-12, IT-13, IT-31, IT-37 (`21`), IT-15, IT-31 (`22`), IT-05 – IT-11, IT-14, IT-30 (`23`) lulus
otomatis; IT-38 lulus di uji client (mock = API). IT-33 (fencing M-0 – M-9) adalah prosedur operator tanpa otomasi di
repository: mekanismenya lulus pada gladi manual CP7 di database sekali pakai; verifikasi P-OPS-1 – P-OPS-4 di lingkungan
target tetap prasyarat deployment (AC-44.1). Bagian CR-04b dalam IT-30/IT-31 (pengeluaran, WO) belum berlaku.

### Ketertelusuran CR-04a

| FR | UC | BR | AC | Layar | IT | PRD / BRD |
|---|---|---|---|---|---|---|
| FR-41 | UC-33 | BR-17, BR-18, BR-31, BR-34 | AC-41.1, AC-41.2, AC-44.6 | AD-12 tab Supplier | IT-15, IT-31 | A-13 / BR-025 |
| FR-42 | UC-34 | BR-18, BR-19, BR-21, BR-22, BR-31, BR-34 | AC-41.2, AC-42.1, AC-42.2, AC-44.6 | AD-12 tab Purchase Order | IT-14, IT-15, IT-31 | A-13 / BR-025 |
| FR-43 | UC-35 | BR-20 – BR-24, BR-30, BR-31, BR-34 | AC-43.1 – AC-43.5, AC-44.5, AC-44.7 | AD-12 detail PO | IT-05 – IT-11, IT-14, IT-30 | A-13 / BR-025 |
| FR-44 | UC-35 (+ UC-24) | BR-23, BR-24, BR-30, BR-31, BR-32, BR-34, BR-35 | AC-44.1 – AC-44.8 | AD-07 | IT-01 – IT-04, IT-07, IT-08, IT-12, IT-13, IT-30, IT-31, IT-33 – IT-38 | A-07 diperluas & A-13 / BR-025 |

Sumber matriks: Errata E1 Lampiran A (A.2 – A.6); IT-24 pada E1 A.5 FR-43 adalah skenario CR-04b dan diuji di tahap itu.

### Kriteria implementasi tambahan (disetujui untuk CP2)

- **IMPL-CP2-1:** mode `--legacy-fixtures` pada `db:check-ledger` hanya diterima bila identitas database uji terverifikasi
  (nama `ovenco_c4_test`, host lokal & port harness `33306`, penanda dari `tests-mysql/run.sh`); database tidak dikenal
  ditolak, tidak cukup hanya `NODE_ENV`. Pengecualian hanya fixture lama suite 16 – 18 (pola `Bahan C5 %`, `Bahan R17 %`,
  `Bahan R18 %`) tanpa catatan stok; fixture CR-04 wajib memakai helper saldo awal.
- **IMPL-CP2-2:** snapshot migrasi M-4 deterministik — CSV UTF-8 tanpa BOM, header `material_id,stock`, urut
  `material_id` naik, stok sebagai string DECIMAL dari MySQL (2 desimal, tanpa konversi number), akhir baris LF,
  SHA-256 berkas final; pembuatan ulang dari data yang sama menghasilkan hash yang sama.

### Konsistensi dengan CR-03

Tidak berubah: FR-39, FR-40, BR-13 – BR-16, aturan & API estimasi kebutuhan bahan, `product_materials`, AD-06, struktur &
presisi `raw_materials`, peringatan ubah satuan K-06. Satu-satunya dampak pada CR-03 adalah kalimat penutup teks
keterangan wajib (E-6, bagian 10) yang berganti **pada CP6** (versi CR-04a kini aktif). Pernyataan bagian 12 bahwa supplier dan purchase order
di luar lingkup digantikan oleh catatan ini; produksi/work order dan laporan bahan/pembelian/produksi tetap di luar
lingkup sampai CR-04b/c disetujui.

Yang TIDAK berubah oleh CR-04a: checkout, pembatalan, status pesanan, `daily_stocks`, Kalender AD-05, Dashboard AD-02,
laporan penjualan AD-08, web pelanggan, dan dokumen PDF sumber. Deployment CR-04a mensyaratkan akun aplikasi & akun
migrasi database terpisah (P-OPS-1 – P-OPS-4) dan prosedur migrasi M-0 – M-9.
