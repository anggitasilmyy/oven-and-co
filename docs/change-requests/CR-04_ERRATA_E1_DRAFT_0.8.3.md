# CR-04 — Lampiran Errata E1 untuk Draft 0.8.3

| Butir | Isi |
|---|---|
| Berlaku untuk | `CR-04_DRAFT_0.8.3.md`, SHA-256 `daa97c404f6d7ade142e53a415a019f1b1d903c592bfd316914e52c0ec9e3816` (tidak diubah) |
| Menutup | MAJOR-1 (ketertelusuran) dan MAJOR-2 (saldo awal & seed) dari Final Verification |
| Sifat | Lampiran normatif. Isi utama Draft 0.8.3 tetap; lampiran ini **menambah** Lampiran A (ketertelusuran) dan Lampiran B (saldo awal). Bila suatu butir di bawah menyebut "melengkapi §x", butir itu berlaku bersama §x; bila ada perbedaan, butir lampiran ini yang berlaku untuk hal yang disebutnya saja |
| Status | **DRAFT — bagian dari paket persetujuan CR-04; belum disetujui; tidak memberi izin implementasi** |

---

## Lampiran A — Matriks ketertelusuran (MAJOR-1)

### A.1 Nomor terakhir yang sudah dipakai (diperiksa di `main` `f3eb8a8`)

| Kode | Terakhir dipakai | Sumber | Nomor CR-04 (usulan) |
|---|---|---|---|
| FR (SPEC §3) | FR-40 | CR-03 | **FR-41 – FR-47** |
| UC (Analisis + CR-03) | UC-32 | Analisis UC-01 – UC-30; CR-03 UC-31, UC-32 | **UC-33 – UC-38** |
| BR SPEC (2 digit) | BR-16 | CR-03 | **BR-17 – BR-36** (sudah di Draft 0.8.3 §13) |
| RB BRD (padanan BR SPEC) | RB-17 | BRD RB-01 – RB-13; CR-03 RB-14 – RB-17 | **RB-18 – RB-37** (padanan BR-17 – BR-36) |
| BR BRD (3 digit, business requirement) | BR-024 | BRD BR-001 – BR-023; CR-03 BR-024 | **BR-025 – BR-027** |
| PRD fitur | A-12 | PRD A-01 – A-12 | **A-13 – A-15** |
| Layar admin | AD-11 | SPEC §7 | **AD-12, AD-13**; AD-08 diperluas (tab Operasional) |
| AC | AC-40 | CR-03 AC-39, AC-40 | **AC-41 – AC-47** (sudah di Draft 0.8.3 §16) |
| IT CR-04 | IT-33 | Draft 0.8.3 §18 | **IT-34 – IT-38** (Lampiran B) |
| Invarian | I-10 | Draft 0.8.3 §2.6 | **I-11** (Lampiran B) |

Catatan namespace: BR SPEC dua digit (BR-17) ≠ business requirement BRD tiga digit (BR-025); keduanya tidak bertabrakan
(pola CR-03: BR-13 – BR-16 ↔ BR-024).

**Status semua kode baru: USULAN.** Kode menjadi resmi saat SPEC/ROADMAP diperbarui di CR-04a CP1 (FR-41 – FR-44, UC-33 – UC-35, A-13, BR-025, AD-12), CR-04b CP1 (FR-45 – FR-46, UC-36 – UC-37, A-14, BR-026, AD-13), dan CR-04c CP1 (FR-47, UC-38, A-15, BR-027, tab AD-08). Dokumen sumber (BRD/PRD/Analisis PDF) tidak memuat kode-kode ini dan tidak diubah.

### A.2 Functional requirements

| FR | Nama (usulan) | Prioritas (usulan) | Tahap | UC | Layar | PRD / BRD |
|---|---|---|---|---|---|---|
| FR-41 | Kelola supplier & daftar bahan supplier | Must | CR-04a | UC-33 | AD-12 tab Supplier | A-13 / BR-025 |
| FR-42 | Kelola Purchase Order (buat, ubah Draft, pesan, batal) | Must | CR-04a | UC-34 | AD-12 tab Purchase Order | A-13 / BR-025 |
| FR-43 | Terima bahan dari PO, pembalik & koreksi penerimaan | Must | CR-04a | UC-35 | AD-12 detail PO | A-13 / BR-025 |
| FR-44 | Buku mutasi stok bahan: saldo awal, Catat Stok Masuk + pembalik/koreksi, stock opname, riwayat mutasi | Must | CR-04a | UC-35; perluasan UC-24 (stok, yang sudah ada) | AD-07 tab Bahan Baku (riwayat mutasi, opname) | A-07 diperluas & A-13 / BR-025 |
| FR-45 | Kelola Work Order (buat, mulai + snapshot resep, batal) | Must | CR-04b | UC-36 | AD-13 | A-14 / BR-026 |
| FR-46 | Catat pengeluaran bahan & hasil produksi, pembalik & koreksi | Must | CR-04b | UC-37 | AD-13 detail WO | A-14 / BR-026 |
| FR-47 | Laporan operasional (pembelian, penerimaan, mutasi, pemakaian standar/aktual/selisih, produksi, analisis) | Should | CR-04c | UC-38 | **AD-08 tab Operasional** | A-15 / BR-027 |

### A.3 Use case (usulan)

| UC | Nama | Aktor | FR |
|---|---|---|---|
| UC-33 | Mengelola Supplier | Staf, Owner | FR-41 |
| UC-34 | Mengelola Purchase Order | Staf, Owner | FR-42 |
| UC-35 | Mencatat Mutasi Stok Bahan (penerimaan PO, stok masuk, stock opname, pembalik/koreksi) | Staf, Owner | FR-43, FR-44 |
| UC-36 | Mengelola Work Order | Staf, Owner | FR-45 |
| UC-37 | Mencatat Pemakaian Bahan & Hasil Produksi | Staf, Owner | FR-46 |
| UC-38 | Melihat Laporan Operasional | Owner | FR-47 |

### A.4 Layar & rute (usulan)

| Layar | Rute | Peran | FR |
|---|---|---|---|
| AD-12 Pembelian — tab Purchase Order (default), tab Supplier (`?tab=supplier`), detail PO | `/admin/pembelian` | Staf, Owner | FR-41 – FR-43 |
| AD-13 Produksi — daftar & detail WO | `/admin/produksi` | Staf, Owner | FR-45, FR-46 |
| AD-08 Laporan — tab Penjualan (tetap), **tab Operasional** (`?tab=operasional`) | `/admin/laporan` | Owner | FR-47 (tab Penjualan tetap FR-33) |
| AD-07 Stok — tab Bahan Baku diperluas (riwayat mutasi, opname, pembalik/koreksi stok masuk); tab Kebutuhan Bahan (teks E-6/E-11) | `/admin/stok` | Staf, Owner | FR-44; FR-40 (teks) |

### A.5 FR ↔ BR ↔ AC ↔ IT

| FR | Business rules | Acceptance criteria | Skenario uji |
|---|---|---|---|
| FR-41 | BR-17, BR-18, BR-31, BR-34 | AC-41.1, AC-41.2, AC-44.6 | IT-15, IT-31 |
| FR-42 | BR-18, BR-19, BR-21, BR-22, BR-31, BR-34 | AC-41.2, AC-42.1, AC-42.2, AC-44.6 | IT-14, IT-15, IT-31 |
| FR-43 | BR-20, BR-21, BR-22, BR-23, BR-24, BR-30, BR-31, BR-34 | AC-43.1 – AC-43.5, AC-44.5, AC-44.7 | IT-05 – IT-11, IT-14, IT-24, IT-30 |
| FR-44 | BR-23, BR-24, BR-30, BR-31, BR-32 (teks E-6 CR-04a), BR-34, BR-35 | AC-44.1 – AC-44.8 | IT-01 – IT-04, IT-07, IT-08, IT-12, IT-13, IT-30, IT-31, IT-33, IT-34 – IT-38 |
| FR-45 | BR-25, BR-27, BR-28, BR-31, BR-34 | AC-45.1 – AC-45.3, AC-46.8 | IT-16, IT-17, IT-19, IT-20, IT-31 |
| FR-46 | BR-23, BR-24, BR-26 – BR-30, BR-32 (teks E-11), BR-34, BR-36 | AC-46.1 – AC-46.8 | IT-16 – IT-26, IT-30, IT-32 |
| FR-47 | BR-22, BR-33 | AC-47.1 – AC-47.5 | IT-23, IT-27 – IT-29, IT-32 |
| Semua | — | AC-NF | e2e mode mock & API, 390/768/1440 px |

### A.6 Kelengkapan per kode

| Kode | Dipetakan ke |
|---|---|
| BR-17 FR-41 · BR-18 FR-41/42 · BR-19 FR-42 · BR-20 FR-43 · BR-21 FR-42/43 · BR-22 FR-42/43/47 · BR-23 FR-43/44/46 · BR-24 FR-43/44/46 · BR-25 FR-45 · BR-26 FR-46 · BR-27 FR-45/46 · BR-28 FR-45/46 · BR-29 FR-46 · BR-30 FR-43/44/46 · BR-31 FR-41 – 46 · BR-32 FR-44/46 (FR-40 tidak berubah) · BR-33 FR-47 · BR-34 FR-41 – 46 · BR-35 FR-44 · BR-36 FR-46 | 20/20 BR terpetakan |
| AC-41 FR-41/42 · AC-42 FR-42 · AC-43 FR-43 · AC-44 FR-44 (+ migrasi) · AC-45 FR-45 · AC-46 FR-46 · AC-47 FR-47 | 7/7 kelompok AC |
| IT-01 – IT-38 | semua muncul di A.5 |
| RB-18 – RB-37 | padanan BRD 1 : 1 untuk BR-17 – BR-36 (usulan) |

### A.7 Ketertelusuran Reporting (tersendiri)

| Elemen | Isi |
|---|---|
| Kebutuhan | BR-027 (BRD, usulan): Owner memantau pembelian, persediaan, dan produksi secara terintegrasi |
| Fitur PRD | A-15 Laporan Operasional (usulan) |
| FR / UC | FR-47 / UC-38 |
| Layar | AD-08 tab Operasional (`/admin/laporan?tab=operasional`), Owner |
| Aturan | BR-33 (periode AD-08, dasar tanggal §9, satu snapshot, omzet hanya dari aturan AD-08); BR-22 (nilai pembelian); §3 aturan 6 (`REPORT_AGGREGATE_LIMIT`, `MILLI_PRECISION_LOST`) |
| Sumber data | `purchase_orders`/items, `goods_receipts`, `material_movements`, `production_outputs`, `material_issues`, `work_order_recipes`; FR-40 (estimasi) apa adanya; omzet dari fungsi AD-08 |
| AC / IT | AC-47.1 – AC-47.5 / IT-23, IT-27 – IT-29, IT-32 |
| Tidak berubah | AD-08 tab Penjualan, FR-33, `/api/admin/reports/sales`, KPI AD-02 (FR-27) |

---

## Lampiran B — Saldo awal, seed, dan bahan baru (MAJOR-2)

Melengkapi §2.6, §11, §12.2, §13 (BR-23), §16 (AC-44), §18 Draft 0.8.3 dan rencana CP2 CR-04a.

### B.1 Aturan tunggal saldo awal
Satu fungsi layanan buku mutasi `createOpeningBalance(tx, materialId, stock, actorId | null, requestId | null)` — dan
padanan set-based di SQL migrasi — adalah **satu-satunya** cara membuat saldo awal:
1. INSERT `stock_adjustments` (`kind = 'saldo_awal'`, `qty = stock`, `opening_material_id = material_id`,
   `created_by = actorId` atau NULL untuk migrasi/seed, `operation_request_id = requestId` atau NULL).
2. Bila `stock > 0`: INSERT `material_movements` (`type = 'saldo_awal'`, `stock_before = 0`, `qty_change = stock`,
   `stock_after = stock`, `adjustment_id` = dokumen di atas). Bila `stock = 0`: **tidak ada** mutasi.
3. Tidak pernah mengubah `raw_materials.stock`.
UNIQUE `opening_material_id` menjamin paling banyak satu saldo awal per bahan (percobaan kedua gagal dan seluruh
transaksi rollback). `created_by` NULL untuk saldo awal dari migrasi **atau seed** (diizinkan `ck_sa_kind` dan
`ck_mm_actor`; melengkapi catatan §12.2 yang semula hanya menyebut migrasi).

### B.2 A — Upgrade database (melengkapi §11.3 M-0, M-7, M-8)
- M-0 menyimpan **snapshot pra-migrasi**: `(material_id, stock)` semua bahan + jumlah bahan + Σ stok + SHA-256 daftar,
  setelah fencing M-3 (tidak ada penulis).
- M-7 (SQL migrasi, satu kali; tercatat di `_prisma_migrations`):
  ```sql
  INSERT INTO stock_adjustments (material_id, kind, qty, opening_material_id, created_by, created_at)
    SELECT material_id, 'saldo_awal', stock, material_id, NULL, CURRENT_TIMESTAMP(3) FROM raw_materials;
  INSERT INTO material_movements (material_id, type, qty_change, stock_before, stock_after, adjustment_id, created_by, created_at)
    SELECT sa.material_id, 'saldo_awal', sa.qty, 0, sa.qty, sa.adjustment_id, NULL, sa.created_at
    FROM stock_adjustments sa WHERE sa.kind = 'saldo_awal' AND sa.qty > 0;
  ```
  `raw_materials` tidak diubah. Dijalankan saat fencing aktif (tanpa penulis lain). Kegagalan → pemulihan §11.4
  (restore); tidak ada eksekusi ulang parsial. Eksekusi kedua tidak mungkin (Prisma mencatat migrasi) dan, bila dipaksa,
  ditolak UNIQUE `opening_material_id` / `uq_mm_adjustment`.
- M-8 menambah pemeriksaan per bahan terhadap snapshot M-0: `saldo_awal.qty = stock pra-migrasi = raw_materials.stock
  pasca-migrasi`; jumlah dokumen saldo awal = jumlah bahan; jumlah mutasi saldo awal = jumlah bahan dengan stok > 0;
  tidak ada bahan dengan > 1 saldo awal; Σ stok sama.

### B.3 B — Instalasi baru & seed
- Urutan instalasi baru tetap: `prisma migrate deploy` (pada database kosong: tanpa dokumen saldo awal) → `prisma db seed`.
- `seed.js` mengganti `ensureAll('rawMaterial', …)` dengan prosedur per bahan seed, masing-masing **dalam satu transaksi**:

| Kondisi bahan (menurut `material_id` seed) | Tindakan |
|---|---|
| Belum ada | INSERT `raw_materials` (stok seed) + `createOpeningBalance(stock seed)` |
| Ada, punya dokumen saldo awal | Tidak melakukan apa pun (stok tidak disentuh — sama dengan `upsert … update: {}` saat ini) |
| Ada, tanpa saldo awal **dan tanpa mutasi apa pun** (mis. dibuat SQL langsung) | `createOpeningBalance(stock saat ini)` — perbaikan aman karena I-1 terpenuhi |
| Ada, tanpa saldo awal **tetapi punya mutasi** | **Hentikan seed** dengan error dan exit non-nol; transaksi bahan itu rollback; tidak ada perbaikan otomatis (inkonsistensi data yang harus diperiksa manusia) |

- Seed tidak pernah UPDATE `raw_materials.stock` dan tidak membuat mutasi selain saldo awal bahan yang baru dibuat/
  diperbaiki → **idempoten**: menjalankan seed berulang (termasuk setelah transaksi operasional) tidak mengubah stok dan
  tidak menambah dokumen.
- Seed tidak boleh berjalan bersamaan dengan server (prosedur manual yang sama dengan M-2); UNIQUE `opening_material_id`
  tetap mencegah duplikasi bila terjadi.
- Bahan seed dengan stok 0 mendapat dokumen saldo awal tanpa mutasi.

### B.4 C — Bahan baru lewat API (melengkapi §5.1 "Buat bahan (lama)" & §10)
`POST /api/admin/raw-materials` — satu transaksi: kunci pelaku (S) → `operation_requests` bila `request_id` dikirim →
`store_settings` X (pola master data yang ada) → validasi (stok string/angka sesuai aturan AD-07 yang ada, 0 – 99.999.999,99,
≤ 2 desimal) → INSERT `raw_materials` → `createOpeningBalance(stok, pelaku, request_id)` → audit → respons → COMMIT.
Kegagalan di langkah mana pun (termasuk INSERT dokumen, mutasi, audit, atau pelanggaran CHECK/UNIQUE) → rollback penuh:
**tidak ada bahan tanpa saldo awal**. Kontrak respons tidak berubah. Tidak ada jalur lain yang membuat bahan.

### B.5 D — Mode mock & data uji
- Mock: tabel `stock_adjustments`/`material_movements` mock diisi oleh fungsi aturan murni yang sama. Saat `ensureSeed`
  memuat `raw_materials` (termasuk tabel admin lama di localStorage perangkat yang dibuat sebelum CR-04a), setiap bahan
  tanpa saldo awal **dan tanpa mutasi** mendapat saldo awal dari stok saat ini; bila ada mutasi tanpa saldo awal → error
  konsol + data mock dibuat ulang dari seed (pola `ADMIN_SCHEMA_VERSION`). Pembuatan bahan di mock = aturan B.4.
- Data uji MySQL baru wajib membuat bahan lewat API atau helper uji yang memanggil `createOpeningBalance`; suite lama
  (17, 18) yang menyisipkan `raw_materials` lewat SQL langsung tetap boleh, tetapi pemeriksaan invarian hanya diterapkan
  pada bahan yang memiliki saldo awal atau dibuat oleh suite CR-04.

### B.6 Invarian (melengkapi §2.6)
| ID | Invarian |
|---|---|
| I-1 | Tetap: Σ `qty_change` = `raw_materials.stock` per bahan (saldo awal berkontribusi `qty`; saldo awal 0 berkontribusi 0) |
| I-2 | Tetap: mutasi pertama per bahan memiliki `stock_before = 0` |
| I-7 (dipertegas) | **Setiap** baris `raw_materials` memiliki **tepat satu** dokumen `saldo_awal`, dibuat di transaksi yang sama dengan bahan (API/seed) atau oleh migrasi; mutasi `saldo_awal` ada tepat bila `qty > 0`, dengan `qty_change = qty` |
| **I-11 (baru)** | Saldo awal adalah dokumen stok **pertama** per bahan: `adjustment_id` saldo awal lebih kecil daripada dokumen `stock_adjustments` lain bahan itu, dan bila ada mutasi `saldo_awal`, `movement_id`-nya adalah mutasi terkecil bahan itu |

Hubungan tiga lapisan: `raw_materials.stock` (saldo berjalan) = Σ `material_movements.qty_change` (I-1) =
`saldo_awal.qty` + Σ efek dokumen sumber berikutnya (I-8, I-10).

### B.7 Pemeriksa
| Pemeriksa | Isi |
|---|---|
| `checkSchemaAgainstSpec.js` (diperluas, statis) | Migrasi CR-04a memuat tabel 9, `uq_sa_opening`, `ck_sa_kind`, `ck_mm_source/sign/balance/actor`, FK RESTRICT/RESTRICT, dan pernyataan pengisian saldo awal |
| **`npm run db:check-ledger`** (baru, hanya baca, data) | I-1, I-2, I-3, I-7, I-8, I-10, I-11 per bahan; exit non-nol bila gagal. Dipakai di M-8, setelah seed instalasi baru, dan di uji MySQL |

### B.8 Skenario uji tambahan (didefinisikan, belum dijalankan)
| ID | Skenario | Hasil yang diharapkan |
|---|---|---|
| IT-01 (diperluas) | Ditambah: migrasi lalu seed pada database kosong | Seperti IT-35 |
| IT-34 | Upgrade: bahan dengan stok 0, 0,01, 1.234,56, 99.999.999,99; snapshot M-0 vs pasca-migrasi | Saldo awal per bahan = stok pra-migrasi persis; stok tidak berubah; dokumen = jumlah bahan; mutasi = jumlah bahan stok > 0; tanpa duplikat; eksekusi ulang data step ditolak UNIQUE; `db:check-ledger` lulus |
| IT-35 | Instalasi baru: `migrate deploy` + `db seed` | Semua bahan seed punya satu saldo awal; mutasi hanya stok > 0; `db:check-ledger` lulus |
| IT-36 | Seed berulang ×3, termasuk setelah stok masuk, opname, dan penerimaan; bahan SQL langsung tanpa mutasi; bahan dengan mutasi tanpa saldo awal | Stok & jumlah dokumen tidak berubah; bahan SQL langsung diperbaiki satu kali; kasus terakhir → seed berhenti exit non-nol tanpa perubahan |
| IT-37 | `POST /raw-materials` stok 0 dan > 0, dengan & tanpa `request_id`; kegagalan disuntik pada INSERT dokumen, mutasi, audit | Dokumen (+ mutasi bila > 0) dalam transaksi yang sama; replay tidak menggandakan; kegagalan → tidak ada bahan maupun dokumen |
| IT-38 | Mode mock: perangkat dengan `raw_materials` lama tanpa saldo awal; buat bahan di mock; mock = API | Saldo awal dibuat sesuai B.5; hasil mock identik dengan API |

### B.9 Tambahan kriteria
- **BR-23 (dipertegas):** setiap bahan memiliki tepat satu saldo awal yang dibuat oleh migrasi, seed, atau API dalam
  transaksi yang sama dengan bahan; tidak ada jalur lain yang membuat bahan atau saldo awal.
- **AC-44.8 (baru):** upgrade, instalasi baru, seed berulang, dan pembuatan bahan lewat API memenuhi I-1, I-2, I-7, I-11;
  IT-34 – IT-38 lulus.
- **AC-44.1** dibaca bersama B.2 (snapshot & pemeriksaan per bahan).
- **Rencana CP2 CR-04a**: kriteria selesai mencakup `seed.js` (B.3), `createOpeningBalance` (B.1), `db:check-ledger`
  (B.7), IT-01, IT-34 – IT-36; IT-37 di CP4 (endpoint AD-07); IT-38 di CP6 (mock).

---

## Lampiran C — Pemeriksaan penutupan

| Kriteria | Hasil |
|---|---|
| Matriks lengkap: FR-41 – 47, UC-33 – 38, BR-17 – 36, AC-41 – 47, A-13 – 15, BR-025 – 027, AD-12, AD-13, AD-08 tab Operasional | Ya (A.2 – A.7); setiap FR punya UC, BR, AC, layar, IT |
| Tanpa nomor duplikat / bekas pakai | Ya (A.1 diperiksa terhadap SPEC, BRD, PRD, Analisis di `main`) |
| Kode tanpa dasar di dokumen sumber ditandai usulan | Ya (A.1 status) |
| Reporting tertelusur tersendiri | Ya (A.7) |
| Upgrade, instalasi baru, bahan baru tercakup | Ya (B.2 – B.4), plus mock & data uji (B.5) |
| Seed idempoten | Ya (B.3: tanpa UPDATE stok, tanpa duplikasi, kasus inkonsisten dihentikan) |
| Invarian sejak instalasi baru sampai operasional | Ya (I-1, I-2, I-7, I-11; `db:check-ledger`) |
| Tanpa kontradiksi dengan CR-03 | Ya — `raw_materials` (struktur, presisi), FR-40, BR-13 – BR-16, AD-06 tidak berubah; seed komposisi CR-03 (`product_materials`) tidak disentuh |
| Isi utama Draft 0.8.3 tidak diubah | Ya — lampiran terpisah |

**MAJOR-1 dan MAJOR-2: tertutup oleh lampiran ini.**

---

*Lampiran ini tidak mengubah kode, database, schema, migrasi, API, frontend, AGENTS.md, SPEC, ROADMAP, atau Git, dan
tidak menjalankan pengujian. Skenario IT-34 – IT-38 didefinisikan dan belum dijalankan.*
