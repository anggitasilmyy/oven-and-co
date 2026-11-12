# CR-04 — Errata E1.1 (revisi terbatas atas Errata E1) untuk Draft 0.8.3

| Butir | Isi |
|---|---|
| Berlaku untuk | `CR-04_DRAFT_0.8.3.md` SHA-256 `daa97c404f6d7ade142e53a415a019f1b1d903c592bfd316914e52c0ec9e3816` dan `CR-04_ERRATA_E1_DRAFT_0.8.3.md` SHA-256 `b29849d850c34529536fe489721e8de066c7f1e39c1b9d1c3283a397569c59d2` — keduanya **tidak diubah** |
| Cakupan | Lima koreksi final review: (1) urutan snapshot migrasi, (2) validasi seed & I-11, (3) preflight seed, (4) redaksi I-1, (5) cakupan pemeriksaan |
| Hubungan | E1.1 **mengganti** E1 butir B.2, B.3, B.5, B.6 (baris I-11), B.7 (baris `db:check-ledger`), B.8, dan B.9, serta membaca ulang Draft 0.8.3 §11.3 (M-4, M-6, M-8), AC-44.1, dan IT-02 seperti di bawah. E1 Lampiran A (traceability), B.1, B.4, Lampiran C, K01 – K04, desain database, dan aturan bisnis **tetap**. Urutan baca: Draft 0.8.3 → E1 → E1.1 |
| Status | **DRAFT — bagian dari paket persetujuan CR-04; belum disetujui; tidak memberi izin implementasi** |

---

## 1. Urutan snapshot migrasi (mengganti E1 B.2; membaca ulang §11.3)

**Konflik yang diperbaiki:** E1 B.2 menempatkan snapshot "di M-0 setelah fencing M-3", padahal M-0 berjalan sebelum
M-1 – M-3 (server masih hidup). Snapshot dipindah ke **M-4**. Nomor M-0 – M-9 **tidak berubah**, sehingga §11.4
(pemulihan), §11.5 (CR-04b), AC-44.1, IT-33 (rentang M-3 – M-8) tetap sah.

| Langkah | Isi (perubahan **tebal**) |
|---|---|
| M-0 Persiapan (server berjalan) | Tetap: pemeriksaan prasyarat hanya baca. **Bukan snapshot** (data masih dapat berubah) |
| M-1 – M-3 | Tetap: hentikan API (job & webhook ikut berhenti), hentikan penulis lain, fencing `ACCOUNT LOCK` + `KILL` |
| M-4 Pastikan tidak ada transaksi **& snapshot** | Tetap: `innodb_trx` kosong, `SHOW PROCESSLIST` hanya sesi administratif/migrasi. **Lalu, dengan akun administratif dalam satu transaksi baca konsisten: simpan berkas snapshot `(material_id, stock)` seluruh bahan + jumlah bahan + Σ stok, catat SHA-256 berkas; ulangi pemeriksaan M-0 (stok ∈ [0, 99.999.999,99], tanpa NULL) terhadap snapshot.** Gagal → berhenti, pemulihan baris "Gagal di M-1 – M-4". Snapshot disimpan di catatan maintenance (berkas), **bukan tabel baru** |
| M-5 Backup | Tetap; diambil **setelah** snapshot M-4 |
| M-6 Verifikasi backup | Tetap, **ditambah**: stok per bahan, jumlah bahan, dan Σ stok hasil restore = snapshot M-4 |
| M-7 Migrasi | Tetap (SQL saldo awal set-based di E1 B.2, tidak berubah) |
| M-8 Validasi | "Σ stok = M-0" **dibaca** "= snapshot M-4", **ditambah** per bahan: `saldo_awal.qty` = stok snapshot M-4 = `raw_materials.stock` pasca-migrasi; dokumen saldo awal = jumlah bahan; mutasi saldo awal = jumlah bahan stok > 0; `db:check-ledger` mode produksi lulus |
| M-9 | Tetap |

Rangkaian yang dijamin: **penulis berhenti (M-1, M-2) → fencing berhasil (M-3) → tanpa transaksi (M-4) → snapshot (M-4)
→ backup (M-5) → verifikasi (M-6) → migrasi (M-7)**. Snapshot, backup, dan migrasi melihat data yang sama karena fencing
aktif sejak M-3 sampai M-9.

Rujukan yang disinkronkan: AC-44.1 "Σ stok sama" = terhadap snapshot M-4, ditambah "snapshot diambil di M-4 setelah
fencing dan sebelum backup"; IT-02 membandingkan hasil restore dengan snapshot M-4; IT-34 (bagian 6); R-02 mitigasi
"validasi M-8 terhadap snapshot M-4". CR-04b memakai urutan yang sama.

---

## 2. Klasifikasi bahan, validasi seed, dan I-11 (mengganti E1 B.3)

**Catatan stok** suatu bahan = salah satu dari: dokumen `stock_adjustments` (jenis apa pun), mutasi `material_movements`,
baris penerimaan (`goods_receipt_lines` melalui item PO bahan itu), dan — setelah CR-04b — baris pengeluaran
(`material_issue_lines`). **Dokumen transaksi stok** = catatan stok selain dokumen saldo awal dan mutasinya
(termasuk opname dengan selisih 0 dan dokumen yang tidak menghasilkan mutasi).

| Kelas | Kondisi bahan | Tindakan seed |
|---|---|---|
| **K-A** Belum ada | Bahan seed belum ada di `raw_materials` | INSERT bahan (stok seed) + `createOpeningBalance` dalam satu transaksi |
| **K-B** Saldo awal sah | Punya dokumen saldo awal **dan** lulus validasi V-1 – V-5 | Tidak ada perubahan: stok, dokumen, dan mutasi tidak disentuh |
| **K-C** Kosong tanpa saldo awal | Tidak punya saldo awal, **tidak punya mutasi, dan tidak punya dokumen transaksi stok** | `createOpeningBalance(stok saat ini)` — satu-satunya perbaikan otomatis |
| **K-D** Tidak konsisten | (a) tanpa saldo awal tetapi punya mutasi **atau** dokumen transaksi stok; (b) punya saldo awal tetapi gagal V-1 – V-5; (c) stok di luar [0, 99.999.999,99] atau NULL | **Seed berhenti sebelum penulisan pertama** (§3), exit non-zero, daftar bahan & alasan; pemeriksaan manual. Tidak ada perbaikan otomatis |

Validasi saldo awal yang sudah ada (K-B), dijalankan oleh modul yang sama dengan `db:check-ledger`:
- **V-1** Tepat satu dokumen `kind = 'saldo_awal'`, `opening_material_id = material_id`, `qty` ∈ [0, 99.999.999,99].
- **V-2** `qty > 0` → tepat satu mutasi `saldo_awal` yang merujuk dokumen itu dengan `stock_before = 0`,
  `qty_change = stock_after = qty`; `qty = 0` → tidak ada mutasi `saldo_awal` (I-7).
- **V-3** I-11 terpenuhi.
- **V-4** I-1 dan I-2 terpenuhi untuk bahan itu.
- **V-5** I-3, I-8, I-10 terpenuhi untuk dokumen bahan itu.

Akibatnya seed **tidak pernah membuat saldo awal setelah dokumen transaksi lain**: saldo awal hanya dibuat untuk K-A
(bahan baru) dan K-C (tanpa catatan stok apa pun).

**Redaksi I-1 untuk K-C (koreksi 4; mengganti kalimat E1 "perbaikan aman karena I-1 terpenuhi"):** sebelum perbaikan,
bahan K-C dengan stok > 0 **melanggar** I-1 (Σ `qty_change` = 0 ≠ stok) dan I-2 (bahan tanpa mutasi wajib berstok 0),
serta I-7 (tanpa saldo awal). Transaksi perbaikan membuat dokumen saldo awal dan mutasi pembuka
(`stock_before = 0`, `qty_change = stock_after = stok`), sehingga **setelah COMMIT**
`SUM(material_movements.qty_change) = raw_materials.stock` dan I-1, I-2, I-7, I-11 **dipulihkan**. Untuk stok 0,
I-1 sudah terpenuhi (0 = 0) dan transaksi hanya menambah dokumen untuk I-7. Rumus I-1 berlaku setelah **setiap**
transaksi yang selesai (migrasi, seed, API, operasi stok); keadaan antara di dalam transaksi tidak terlihat oleh
pembaca lain.

---

## 3. Preflight seed (baru; bagian dari §2)

Urutan `prisma db seed` (instalasi baru maupun ulang):
1. **Preflight hanya baca**, sebelum penulisan apa pun ke tabel mana pun (termasuk pengguna, produk, pengaturan).
   Bahan yang diproses = bahan seed ∪ **semua** baris `raw_materials` yang ada. Setiap bahan diklasifikasi K-A – K-D
   dengan memeriksa dokumen saldo awal, mutasi, dokumen transaksi stok, dan kecocokan dokumen ↔ mutasi (V-1 – V-5).
   Ada satu saja K-D → seed berhenti **sebelum transaksi penulisan pertama**; database tidak berubah.
2. Bila preflight lulus: langkah seed yang ada tetap berjalan dengan urutannya; langkah bahan baku memproses K-A dan K-C
   **satu transaksi per bahan**. Di awal transaksi, baris bahan dikunci (`SELECT … FOR UPDATE`, atau INSERT untuk K-A)
   dan klasifikasinya diperiksa ulang; bila berbeda dari preflight → transaksi bahan itu rollback, seed berhenti
   exit non-zero dengan pesan "data berubah sejak preflight; jalankan seed ulang".
3. **Pasca-pemeriksaan:** `db:check-ledger` mode produksi atas seluruh bahan; gagal → exit non-zero.

**Kelanjutan setelah gangguan:** bila seed terhenti di tengah (koneksi putus, proses dihentikan, error pada bahan ke-n),
setiap bahan yang sudah COMMIT telah lengkap (bahan + saldo awal + mutasi bila stok > 0) dan berkelas K-B; bahan yang
transaksinya gagal tidak meninggalkan sisa. Menjalankan seed ulang mengulang preflight, melewati K-B, dan melanjutkan
K-A/K-C yang tersisa — **idempoten**: tidak ada duplikasi dokumen, tidak ada perubahan stok bahan yang sudah ada, dan
langkah seed lain tetap create-only (`upsert … update: {}`). Seed tidak boleh berjalan bersamaan dengan server
(prosedur M-2); UNIQUE `opening_material_id` tetap menjadi pengaman terakhir.

---

## 4. Mock & data uji (mengganti E1 B.5)

- **Mock:** saat `ensureSeed` memuat `raw_materials` (termasuk data localStorage lama), klasifikasi K-A – K-D yang sama
  dijalankan lebih dulu tanpa menulis. K-C → saldo awal dari stok saat ini; K-D → error konsol dan data mock dibuat ulang
  dari seed (pola `ADMIN_SCHEMA_VERSION`). Pembuatan bahan di mock mengikuti E1 B.4.
- **Fixture CR-04:** semua bahan pada suite uji CR-04 (IT-01 – IT-38) **wajib** dibuat lewat API atau helper uji yang
  memanggil `createOpeningBalance`.
- **Fixture lama yang diidentifikasi eksplisit** (membuat bahan dengan `INSERT INTO raw_materials` langsung, tanpa saldo awal):

| Suite | Pola nama bahan |
|---|---|
| `server/tests-mysql/16-audit-log.it.test.js` | `Bahan C5 %` |
| `server/tests-mysql/17-product-recipe.it.test.js` | `Bahan R17 %` |
| `server/tests-mysql/18-material-requirements.it.test.js` | `Bahan R18 %` |

  (E1 B.5 hanya menyebut suite 17 dan 18; suite 16 ditambahkan.)

---

## 5. Invarian & cakupan pemeriksaan (mengganti E1 B.6 baris I-11 dan B.7 baris `db:check-ledger`)

| ID | Invarian |
|---|---|
| I-1 | Setelah setiap transaksi selesai, per bahan: `SUM(material_movements.qty_change) = raw_materials.stock` |
| I-2, I-3, I-8, I-10 | Tetap seperti Draft 0.8.3 §2.6 |
| I-7 | Tetap seperti E1 B.6; berlaku untuk **seluruh** bahan di database produksi |
| **I-11 (mengganti E1)** | Per bahan, saldo awal mendahului semua catatan stok lain: (a) `adjustment_id` saldo awal lebih kecil dari dokumen `stock_adjustments` lain bahan itu; (b) bila ada mutasi `saldo_awal`, `movement_id`-nya terkecil untuk bahan itu; (c) `created_at` saldo awal ≤ `created_at` setiap dokumen penerimaan dan (CR-04b) pengeluaran yang memuat bahan itu; (d) bahan yang memiliki catatan stok apa pun memiliki saldo awal |

I-11 terjaga di setiap jalur: migrasi (tabel dokumen baru masih kosong saat M-7), API (bahan & saldo awal dalam satu
transaksi), seed (hanya K-A/K-C), mock (aturan sama).

| `npm run db:check-ledger` (hanya baca) | Isi |
|---|---|
| **Mode produksi (default)** | I-1, I-2, I-3, I-7, I-8, I-10, I-11 untuk **seluruh** bahan; **tidak ada pengecualian**; bahan tanpa saldo awal selalu dilaporkan gagal. Dipakai di M-8, preflight & pasca-seed, dan uji CR-04 |
| Mode fixture lama (`--legacy-fixtures`) | Hanya dari harness `server/tests-mysql/run.sh`; ditolak bila `NODE_ENV=production`. Mengecualikan **hanya** bahan yang namanya cocok tabel §4 **dan** tidak memiliki catatan stok apa pun; jumlah bahan yang dikecualikan dilaporkan. Bahan fixture lama yang mendapat catatan stok CR-04 tetap diperiksa penuh |

---

## 6. Skenario uji (mengganti E1 B.8; didefinisikan, belum dijalankan)

| ID | Skenario | Hasil yang diharapkan |
|---|---|---|
| IT-01 (diperluas) | Tetap + migrasi lalu seed pada database kosong | Seperti IT-35 |
| IT-02 (diperluas) | Tetap + bandingkan hasil restore dengan snapshot M-4 | Stok per bahan, jumlah, Σ sama |
| IT-34 | Upgrade: bahan stok 0, 0,01, 1.234,56, 99.999.999,99. Snapshot di M-4 (tercatat setelah login akun aplikasi ditolak dan `innodb_trx` kosong, sebelum berkas backup M-5) | Saldo awal per bahan = snapshot M-4; stok tidak berubah; dokumen = jumlah bahan; mutasi = jumlah bahan stok > 0; tanpa duplikat; eksekusi ulang data step ditolak UNIQUE; `db:check-ledger` produksi lulus; snapshot yang diambil sebelum fencing ditolak prosedur |
| IT-35 | Instalasi baru: `migrate deploy` + `db seed` | Preflight lulus (semua K-A); satu saldo awal per bahan seed; mutasi hanya stok > 0; I-11; `db:check-ledger` produksi lulus; pada database berisi fixture lama mode produksi melaporkan gagal, `--legacy-fixtures` hanya mengecualikan pola §4 tanpa catatan stok dan ditolak bila `NODE_ENV=production` |
| IT-36 | Seed: (a) ulang ×3, juga setelah stok masuk, opname, penerimaan; (b) bahan SQL langsung tanpa catatan stok (K-C, stok 0 dan > 0); (c) K-D: mutasi tanpa saldo awal; opname selisih 0 (dokumen tanpa mutasi) tanpa saldo awal; baris penerimaan tanpa saldo awal; (d) K-D: saldo awal `qty` ≠ `qty_change`, `qty > 0` tanpa mutasi, `qty = 0` dengan mutasi, mutasi saldo awal bukan yang terkecil, Σ ≠ stok; (e) seed dihentikan paksa setelah bahan ke-k lalu dijalankan ulang; (f) data diubah antara preflight dan transaksi bahan | (a) stok & jumlah dokumen tetap; (b) diperbaiki satu kali, I-1 dipulihkan setelah COMMIT; (c)(d) berhenti **sebelum penulisan pertama** — jumlah baris semua tabel seed tidak berubah, exit non-zero; (e) seed ulang selesai tanpa duplikat, hasil = seed tanpa gangguan; (f) bahan itu rollback, exit non-zero, seed ulang berhasil |
| IT-37 | Tetap seperti E1 + I-11 diperiksa | Seperti E1 |
| IT-38 | Mode mock: localStorage lama K-C, K-D; buat bahan di mock | K-C diperbaiki; K-D → data mock dibuat ulang dari seed; hasil mock = API |

Nomor IT tetap IT-01 – IT-38; tidak ada nomor baru.

---

## 7. Sinkronisasi kriteria (mengganti E1 B.9)

- **BR-23 (dipertegas):** setiap bahan memiliki tepat satu saldo awal yang dibuat oleh migrasi (M-7, terhadap snapshot
  M-4), oleh API dalam transaksi yang sama dengan bahan, atau oleh seed **hanya** untuk bahan tanpa catatan stok apa pun;
  saldo awal tidak pernah dibuat setelah dokumen transaksi lain (I-11).
- **AC-44.1 (dibaca):** sesuai §1.
- **AC-44.8 (mengganti E1):** upgrade (snapshot M-4 setelah fencing, sebelum backup), instalasi baru, seed berulang
  dan dilanjutkan setelah gangguan, serta pembuatan bahan lewat API memenuhi I-1, I-2, I-3, I-7, I-8, I-10, I-11;
  preflight seed menghentikan K-D sebelum penulisan pertama; `db:check-ledger` mode produksi tanpa pengecualian;
  IT-34 – IT-38 lulus.
- **Rencana CP CR-04a:** CP2 mencakup §2 – §3 (seed, preflight), `createOpeningBalance`, `db:check-ledger` kedua mode,
  IT-01, IT-02, IT-34 – IT-36; IT-37 di CP4; IT-38 di CP6. Tidak ada perubahan lain pada rencana CP0 – CP7.

---

## 8. Pemeriksaan penutupan

| Kriteria | Hasil |
|---|---|
| Tidak ada konflik urutan snapshot dan fencing | Ya — snapshot di M-4 setelah M-1 – M-3 dan pemeriksaan tanpa transaksi, sebelum M-5; nomor M-0 – M-9 tetap, rujukan M-6/M-8/AC-44.1/IT-02/IT-34/R-02 disinkronkan |
| Seed tidak membuat saldo awal setelah dokumen transaksi lain | Ya — hanya K-A/K-C; K-D berhenti |
| Saldo awal yang ada divalidasi, tidak diubah | Ya — K-B dengan V-1 – V-5; gagal → berhenti |
| Preflight mencegah penulisan parsial akibat inkonsistensi terdeteksi | Ya — §3 langkah 1 sebelum penulisan pertama ke tabel mana pun; transaksi per bahan setelahnya |
| Seed idempoten & dapat dilanjutkan | Ya — §3 kelanjutan; IT-36(a)(e)(f) |
| I-1, I-2, I-7, I-8, I-10, I-11 konsisten | Ya — redaksi I-1 diperbaiki (dipulihkan setelah COMMIT); I-11 terjaga di semua jalur; satu pemeriksa |
| Cakupan pemeriksaan | Ya — I-7 untuk seluruh bahan produksi; pengecualian hanya 3 suite lama yang disebut eksplisit; fixture CR-04 wajib helper |
| IT-34 – IT-38 diperbarui | Ya — §6; tanpa nomor baru |
| Sinkron dengan BR-23 & AC-44.8 | Ya — §7 |
| Tanpa kontradiksi dengan Draft 0.8.3, E1 Lampiran A, CR-03, K01 – K04 | Ya — tidak ada tabel, kolom, CHECK, kode FR/UC/BR/AC baru; snapshot berupa berkas maintenance |

*E1.1 tidak mengubah repository, kode, database, schema, migrasi, SPEC, AGENTS.md, ROADMAP, atau Git, dan tidak
menjalankan implementasi, migrasi, maupun pengujian.*
