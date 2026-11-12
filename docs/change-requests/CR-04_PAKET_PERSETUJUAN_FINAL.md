# CR-04 — Paket Persetujuan Final untuk Pemilik Project

| Butir | Isi |
|---|---|
| Project | Oven & Co. |
| Isi paket | Pengantar ini + tiga dokumen yang **tidak diubah** (bagian A) |
| Sifat dokumen ini | Lembar ringkasan dan formulir persetujuan. **Bukan revisi** CR-04: tidak menambah atau mengubah ketentuan, kecuali dua kriteria implementasi CP2 di bagian G |
| Tanggal | 12 November 2026 |
| Status | **Menunggu keputusan Pemilik Project.** Belum ada yang disetujui final selain K01 – K04 dan klarifikasi T-01. Tidak ada izin implementasi |

---

## Ringkasan untuk Pemilik Project (baca ini dulu)

**Apa yang diminta:** CR-04 menambah tiga modul yang saat ini dilarang oleh AGENTS.md §1, BRD §10.2, dan PRD §13.1.
Ketiganya dikerjakan bertahap dan masing-masing perlu izin mulai sendiri:
CR-04a Pembelian & buku mutasi stok (Step 6.8), CR-04b Produksi (Step 6.9), dan CR-04c Laporan Operasional (Step 6.10).

| Kelompok | Isi | Status |
|---|---|---|
| **1. Sudah Anda putuskan** | K01 = A, K02 = C (+ klarifikasi T-01: catatan supplier opsional, status aktif dikelola sistem, default aktif), K03 = B, K04 = B | Ditetapkan — tidak dibuka lagi |
| **2. Usulan atas delegasi** | K05 – K25 (21 keputusan) dan solusi teknis T-33 – T-39, termasuk desain di Errata E1/E1.1 | **Usulan Claude Code.** Delegasi **bukan** persetujuan; semua butir ini perlu persetujuan eksplisit Anda (bagian B) |
| **3. Perlu persetujuan eksplisit** | Perubahan AGENTS.md §1, SPEC, teks wajib CR-03 (E-6, E-11), AD-07, menu AD-12/AD-13, tab AD-08, migrasi & downtime, asumsi prototype, risiko yang diterima, izin mulai tiap tahap | Bagian C — 15 butir, masing-masing "Setuju / Tidak / Ubah" |
| **4. Persetujuan akademik** | Dosen/pembimbing mata kuliah: CR-04 menambah lingkup di luar dokumen BRD/PRD/Analisis | **Belum tersedia — tidak diklaim.** Anda yang menentukan apakah ini syarat sebelum CR-04a dimulai (C-14) |

**Rekomendasi Claude Code:** paket **layak diajukan** untuk keputusan final (bagian F). Persetujuan Anda **belum** berarti
implementasi boleh dimulai: masih ada prasyarat CP0 (bagian E), termasuk keputusan soal persetujuan akademik dan
penyiapan akun database terpisah sebelum deployment.

---

## A. Dokumen dalam paket & verifikasi

| No | Dokumen | Baris | SHA-256 | Status |
|---|---|---|---|---|
| 1 | `CR-04_DRAFT_0.8.3.md` | 1273 | `daa97c404f6d7ade142e53a415a019f1b1d903c592bfd316914e52c0ec9e3816` | Tersedia; tidak diubah |
| 2 | `CR-04_ERRATA_E1_DRAFT_0.8.3.md` | 228 | `b29849d850c34529536fe489721e8de066c7f1e39c1b9d1c3283a397569c59d2` | Tersedia; tidak diubah |
| 3 | `CR-04_ERRATA_E1.1_DRAFT_0.8.3.md` | 182 | `0bfe45461d450416edaf408260f8b038930a99fcbf080f7ca0d94bf77b909da8` | Tersedia; tidak diubah |

**Urutan baca:** Draft 0.8.3 → Errata E1 → Errata E1.1. Bila ada perbedaan, dokumen yang dibaca belakangan berlaku
**hanya** untuk butir yang disebutnya.

| Pemeriksaan silang | Hasil |
|---|---|
| E1 merujuk Draft 0.8.3 dengan hash benar | Ya |
| E1.1 merujuk Draft 0.8.3 dan E1 dengan hash benar | Ya |
| Bagian E1 yang diganti E1.1 disebut eksplisit (B.2, B.3, B.5, baris I-11 B.6, baris `db:check-ledger` B.7, B.8, B.9) | Ya; Lampiran A, B.1, B.4 E1 tetap |
| Rujukan pasal Draft (§2.6, §5.1 "Buat bahan (lama)", §10, §11.3 – §11.5, §12.2, §13, §16, §17 R-02, §18) | Ada semua |
| Langkah M-0 – M-9 dan pemulihan §11.4 | Nomor tetap; snapshot di M-4 (E1.1 §1) sesuai baris pemulihan "Gagal di M-1 – M-4" |
| Kode FR/UC/BR/AC/IT/I | Tanpa duplikasi: FR-41 – 47, UC-33 – 38, BR-17 – 36, RB-18 – 37, BR-025 – 027, A-13 – 15, AD-12/13, AC-41 – 47 (+ AC-44.8), IT-01 – 38, I-1 – I-11 |
| K01 – K04, T-01, CR-03 | Tidak berubah di ketiga dokumen |
| `created_by` NULL saldo awal | Draft §12.2 (migrasi) diperluas E1 B.1 (migrasi & seed); CHECK `ck_sa_kind`/`ck_mm_actor` mengizinkan; konsisten |

Ketidaksesuaian silang yang **tidak memblokir** (tidak diperbaiki; dicatat di bagian D):
1. Header Draft 0.8.3 menyebut hash pendahulu `4b5e72fa…` dan "§0.2". Hash itu milik 0.8.1; yang benar 0.8.2 =
   `996c05893811bf37a61f4e50dee608e0328bc21767772914a18df4bdd95ebc32`, §0.3. (MINOR-1)
2. E1 B.9 dan E1.1 §7 merujuk "rencana CP0 – CP7 CR-04a", tetapi rencana itu ada di laporan verifikasi, bukan di
   ketiga dokumen. Ringkasannya dimuat di bagian E agar paket lengkap.
3. E1.1 memakai label kelas bahan K-A – K-D dan validasi V-1 – V-5. Labelnya berhuruf, jadi tidak bertabrakan dengan
   kode keputusan CR-03 K-01 – K-15 maupun CR04-K01 – K25. (COSMETIC)

---

## B. Register keputusan K01 – K25

**Sumber pilihan:** tabel pertanyaan keputusan Draft 0.2, tempat Anda memilih K01 – K04. Draft 0.8.3 §1 hanya
mencantumkan keputusannya. Alasan, konsekuensi, risiko, dan dependensi diambil dari rincian Draft 0.3 §3, lalu
disesuaikan dengan isi final Draft 0.8.3 + E1 + E1.1. Tidak ada pilihan yang ditambahkan.

**Status:** **D** = ditetapkan Pemilik Project. **U** = usulan Claude Code atas delegasi, **belum disetujui final**.

### B.1 Pembelian (CR-04a)

**K01 — Hak akses supplier & PO** · Status **D**
- Pilihan: (a) Staf & Owner kelola semua; (b) Staf buat/terima, Owner kelola supplier & batalkan PO; (c) Owner saja.
- Keputusan: **A**.
- Bisnis: Staf mencatat pembelian harian tanpa menunggu Owner. Teknis: `requireRole` Staf & Owner (pola AD-06/AD-07).
- Risiko: penyalahgunaan oleh Staf → audit K20. Dependensi: K09, K18, K20.

**K02 — Data wajib supplier** · Status **D**
- Pilihan: (a) nama + telepon/WA; (b) (a) + alamat + catatan; (c) (b) + email + kontak person + status aktif.
- Keputusan: **C**, dengan klarifikasi T-01: nama, telepon/WA, alamat, email, dan kontak person wajib; catatan opsional;
  status aktif dikelola sistem, default aktif (supplier dinonaktifkan, tidak dihapus).
- Bisnis: data kontak lengkap. Teknis: tabel `suppliers` dan validasi §7. Risiko: data lama tidak lengkap → validasi
  saat simpan. Dependensi: K03.

**K03 — Hubungan supplier – bahan** · Status **D**
- Pilihan: (a) tanpa relasi; (b) daftar bahan per supplier, PO hanya bahan supplier itu; (c) (b) + bahan utama.
- Keputusan: **B** (daftar boleh kosong saat supplier dibuat).
- Bisnis: PO tidak bisa memuat bahan dari supplier yang salah. Teknis: tabel `supplier_materials`, validasi PO.
- Risiko: bahan dilepas dari supplier saat ada PO aktif → aturan §7. Dependensi: K02, K05.

**K04 — Status & alur PO** · Status **D**
- Pilihan: (a) Draft → Dipesan → Diterima / Dibatalkan; (b) (a) + Diterima Sebagian; (c) (b) + Disetujui Owner.
- Keputusan: **B**.
- Bisnis: penerimaan bertahap tercermin di status. Teknis: status turunan dari jumlah diterima (§4.4).
- Risiko: status tidak sinkron → dihitung dalam transaksi berkunci. Dependensi: K05.

**K05 — Penerimaan sebagian & berlebih** · Status **U**
- Pilihan: (a) sekali terima penuh; (b) sebagian boleh, berlebih ditolak; (c) sebagian & berlebih dengan catatan.
- Rekomendasi: **B** — penerimaan sebagian berulang; kelebihan ditolak; PO yang sudah diterima sebagian boleh dibatalkan
  (sisa batal, penerimaan tetap); PO terkunci setelah Dipesan.
- Bisnis: kelebihan kiriman dicatat lewat PO baru atau Catat Stok Masuk; mengubah pesanan ke supplier = PO baru.
- Teknis: sisa per item = dipesan − bersih diterima − `qty_cancelled` (I-4); dihitung setelah kunci baris PO.
- Risiko: dua penerimaan bersamaan melampaui PO → kunci PO `FOR UPDATE` (R-05). Dependensi: K04, K07, K08, K21, K22.

**K06 — Harga beli, pajak, diskon, total** · Status **U**
- Pilihan: (a) tanpa harga; (b) harga satuan + total (informasi, tanpa pajak/diskon); (c) harga + diskon + pajak.
- Rekomendasi: **B**, disesuaikan di Draft 0.8.3 §6: harga wajib; nilai PO, nilai penerimaan, dan nilai sisa yang
  dibatalkan (historis) dipisah; pembulatan per baris, setengah menjauhi nol.
- Bisnis: nilai pembelian tersedia untuk laporan, tetapi **bukan** pembukuan (tanpa hutang/pembayaran). Opsi (c)
  bertentangan dengan pengecualian akuntansi dan pajak.
- Teknis: harga disalin ke item PO; nilai dihitung dari dokumen. Risiko: dianggap fitur akuntansi → label "nilai
  pembelian (informasi)". Dependensi: K05, K16, K17.

**K07 — Penerimaan PO vs Catat Stok Masuk manual AD-07** · Status **U**
- Pilihan: (a) keduanya ada, stok masuk manual tanpa riwayat; (b) keduanya ada, stok masuk manual ikut tercatat;
  (c) stok masuk manual dihapus.
- Rekomendasi: **B**, disesuaikan di Draft 0.8.3: Catat Stok Masuk dan stock opname AD-07 berbasis dokumen + mutasi;
  stok masuk dapat dibalik/dikoreksi; opname memakai nilai absolut (menggantikan "koreksi stok" lama, T-25).
- Bisnis: pembelian tanpa PO tetap bisa dicatat; semua perubahan stok dapat ditelusuri.
- Teknis: **perilaku AD-07 berubah** (C-4): kontrak lama tetap, ditambah endpoint opname, pembalik/koreksi, dan riwayat.
- Risiko: regresi AD-07 & CR-03 (R-13). Dependensi: K11, K20 – K23.

**K08 — Kuantitas, satuan, tanggal** · Status **U**
- Pilihan: kuantitas (a) DECIMAL(10,2) / (b) DECIMAL(10,3); satuan (a) `raw_materials.unit` / (b) satuan PO + konversi;
  tanggal (a) hari ini WIB / (b) hari ini atau lampau dalam N hari.
- Rekomendasi: kuantitas **(a)** sebagai string desimal; satuan **(a)**; tanggal **(a)** = waktu server WIB saat dicatat.
- Bisnis: pencatatan terlambat tercatat pada tanggal pencatatan.
- Teknis: tanpa floating point; batas 99.999.999,99. Satuan (b) bertentangan dengan BR-13 CR-03.
- Risiko: angka besar untuk satuan gram → batas sama dengan stok. Dependensi: K05, K12, K16.

### B.2 Produksi (CR-04b)

**K09 — Hak akses produksi** · Status **U**
- Pilihan: (a) Staf & Owner; (b) Staf catat, Owner batalkan/koreksi; (c) Owner saja.
- Rekomendasi: **A**. Bisnis: Staf yang menjalankan produksi harian. Teknis: pola K01.
- Risiko: penyalahgunaan → audit K20. Dependensi: K01, K20.

**K10 — Sumber perencanaan WO** · Status **U**
- Pilihan: (a) manual; (b) dari rencana ready hari ini (AD-07); (c) dari pesanan per tanggal (AD-05); (d) kombinasi (a) – (c).
- Rekomendasi: WO dibuat **manual (a)**, dengan isian awal yang hanya dibaca dari AD-07 (hari ini) dan AD-05. Draft 0.3
  mencatatnya sebagai "A + isian awal B/C". Isian awal itu bukan tautan, jadi rekomendasi ini **tidak sama** dengan (d).
- Bisnis: tidak ada rencana atau kalender kedua (ROADMAP 6.9). Teknis: WO tidak menyimpan tautan ke pesanan.
- Risiko: WO ganda untuk produk/tanggal yang sama → diizinkan, form menampilkan WO aktif. Dependensi: K11, K13, K25.

**K11 — Reservasi & pengurangan stok; hubungan dengan BR-15** · Status **U**
- Pilihan: (a) tanpa reservasi, stok berkurang saat pemakaian dicatat, BR-15 tetap; (b) reservasi saat WO dibuat;
  (c) pengurangan otomatis sesuai resep saat WO selesai.
- Rekomendasi: **A**. Di Draft 0.8.3, stok berkurang **hanya** oleh dokumen pengeluaran bahan.
- Bisnis: stok AD-07 mencerminkan fisik setelah pengeluaran dicatat. Teknis: tanpa alokasi tersimpan; BR-15 tidak
  berubah. Opsi (b) dan (c) dikecualikan oleh CR-03.
- Risiko: stok tidak cukup → pengeluaran ditolak per bahan. Dependensi: K12, K14, K21, K25.

**K12 — Selisih resep vs pemakaian aktual** · Status **U**
- Pilihan: (a) aktual bebas, selisih dilaporkan; (b) aktual dibatasi toleransi %; (c) aktual = resep.
- Rekomendasi: **A**. Di Draft 0.8.3: standar = snapshot resep × hasil bersih; aktual = Σ pengeluaran bersih; selisih
  dilaporkan.
- Bisnis: Owner melihat efisiensi bahan. Opsi (b) memerlukan angka toleransi yang tidak ada di dokumen.
- Teknis: aritmetika milli BigInt; batas standar 99.999.999.990,000 (T-37).
- Risiko: presisi → `MILLI_PRECISION_LOST`, `REPORT_AGGREGATE_LIMIT`. Dependensi: K11, K14, K19.

**K13 — Hasil produksi vs `daily_stocks` & pesanan** · Status **U**
- Pilihan: (a) hanya dicatat; (b) hasil menambah `daily_stocks`; (c) (b) + memengaruhi status pesanan.
- Rekomendasi: **A**.
- Bisnis: rencana stok ready tetap diisi di AD-07, sehingga ada input ganda (diterima sebagai keterbatasan).
- Teknis: modul produksi tidak menulis `daily_stocks`, `orders`, atau `products`. Opsi (b)/(c) menyentuh checkout.
- Risiko: hasil dikira menambah stok jual (R-15) → keterangan di AD-13. Dependensi: K10, K14.

**K14 — Status WO & hasil** · Status **U**
- Pilihan: (a) Draft → Diproses → Selesai / Dibatalkan; (b) (a) + Selesai Sebagian.
- Rekomendasi: **A**, disesuaikan di Draft 0.8.3: snapshot resep saat WO mulai; koreksi hasil dengan tiga kasus (§8.2)
  dan kondisi terminal hasil 0.
- Bisnis: produksi sebagian = Selesai dengan hasil lebih kecil dari rencana.
- Teknis: transisi bersyarat status + kunci baris WO; UNIQUE `normal_wo_id`.
- Risiko: hasil ganda/kontradiktif (R-26). Dependensi: K11, K12, K21, K22.

**K25 — Dampak ke estimasi FR-40** · Status **U**
- Pilihan: (a) FR-40 tidak berubah, teks keterangan ditambah; (b) pesanan/rencana dengan WO selesai tidak dihitung lagi.
- Rekomendasi: **A** — teks E-6 diubah per tahap dan E-11 ditambah di CR-04b (Draft 0.8.3 §19).
- Bisnis: estimasi bisa berlebih (arah aman). Teknis: hanya konstanta teks dan SPEC §5; opsi (b) mengubah BR-14 & AC-40.
- Risiko: angka dianggap pasti → teks wajib selalu tampil. Dependensi: K11, K13; CR-03 K-14.

### B.3 Laporan (CR-04c)

**K15 — Penempatan laporan** · Status **U**
- Pilihan: (a) tab baru di AD-08; (b) layar baru.
- Rekomendasi: **A** — AD-08 menjadi "Laporan" dengan tab Penjualan (tetap) dan tab Operasional.
- Bisnis: satu tempat laporan Owner. Teknis: API terpisah; `/reports/sales` tidak disentuh.
- Risiko: regresi tab Penjualan → uji regresi AD-08. Dependensi: K16 – K18.

**K16 — Periode & filter** · Status **U**
- Pilihan: (a) sama dengan AD-08; (b) (a) + filter supplier/bahan/produk.
- Rekomendasi: **A** (dasar tanggal per laporan sesuai §9).
- Bisnis: rincian disajikan sebagai tabel, bukan filter. Teknis: fungsi periode AD-08.
- Risiko: kebutuhan filter muncul kemudian → CR terpisah. Dependensi: K15.

**K17 — Format ekspor** · Status **U**
- Pilihan: (a) tanpa ekspor; (b) Excel/PDF seperti AD-08.
- Rekomendasi: **B** dengan library yang sudah ada, tanpa library baru.
- Bisnis: konsisten dengan FR-33. Teknis: pola ekspor AD-08. Risiko: beban UI → CP terakhir CR-04c. Dependensi: K15.

**K18 — Hak akses laporan** · Status **U**
- Pilihan: (a) Owner saja; (b) Staf & Owner.
- Rekomendasi: **A**. Bisnis: Staf tetap melihat riwayat di AD-12/AD-13. Teknis: sama dengan `report.routes.js`.
- Risiko: tidak ada yang berarti. Dependensi: K01, K09, K15.

**K19 — Metode analisis kebutuhan produksi** · Status **U**
- Pilihan: (a) estimasi FR-40 apa adanya; (b) dibandingkan dengan pemakaian aktual periode lalu; (c) metode lain.
- Rekomendasi: **A** + data selisih K12; tanpa rumus baru.
- Bisnis: tanpa peramalan. Teknis: API FR-40 dipakai apa adanya.
- Risiko: pengguna mengharapkan peramalan → di luar lingkup. Dependensi: K12, K25.

### B.4 Lintas modul

**K20 — Audit trail** · Status **U**
- Pilihan: (a) audit setiap perubahan; (b) hanya pembatalan & koreksi.
- Rekomendasi: **A**, tanpa layar audit (dilarang AGENTS.md).
- Bisnis: setiap aksi dapat ditelusuri. Teknis: `audit_logs` dalam transaksi yang sama.
- Risiko: volume log bertambah → diterima. Dependensi: K21.

**K21 — Transaksi bersamaan** · Status **U**
- Pilihan: dokumen sumber hanya mencantumkan satu pilihan, (a) pola CR-03/AD-07 dengan kunci dan uji MySQL.
- Rekomendasi: **A**, diperluas di Draft 0.8.3 §10: urutan kunci global, bahan urut ID, FK `RESTRICT/RESTRICT`.
- Bisnis: tidak terlihat oleh pengguna. Teknis: beban uji konkurensi IT-07 dan seterusnya.
- Risiko: deadlock (R-07); MINOR-2 (lihat D). Dependensi: K05, K07, K11, K14.

**K22 — Koreksi & pembatalan** · Status **U**
- Pilihan: (a) transaksi final tidak dapat diubah, koreksi lewat transaksi pembalik; (b) dapat diubah dengan audit.
- Rekomendasi: **A**, rinci di Draft 0.8.3 §4: append-only; pembalik penuh sekali; koreksi = satu mutasi bersih per bahan.
- Bisnis: laporan periode lalu tidak berubah. Teknis: dokumen pembalik/pengganti; UNIQUE `reverses_id`/`replaces_id`.
- Risiko: salah input berulang → koreksi sekali per dokumen berlaku (asumsi C-10). Dependensi: K05, K14, K23.

**K23 — Rekonsiliasi** · Status **U**
- Pilihan: dokumen sumber hanya mencantumkan satu pilihan, (a) uji rekonsiliasi stok akhir per bahan & periode.
- Rekomendasi: **A** sebagai buku mutasi dengan invarian I-1 – I-10 (Draft 0.8.3), I-7 dipertegas dan I-11 ditambah
  (E1/E1.1), serta saldo awal untuk upgrade, instalasi baru, seed, dan API.
- Bisnis: bisa dibuktikan tidak ada stok hilang atau ganda.
- Teknis: `db:check-ledger`, preflight seed, snapshot migrasi.
- Risiko: jalur tulis di luar buku mutasi (R-01, MINOR-3). Dependensi: K07, K11, K22.

**K24 — Penempatan layar 6.8 & 6.9** · Status **U**
- Pilihan: (a) tab baru di AD-07; (b) layar baru dengan kode AD & rute baru; (c) campuran.
- Rekomendasi: **B** — AD-12 Pembelian `/admin/pembelian`, AD-13 Produksi `/admin/produksi`; Staf & Owner.
- Bisnis: menu admin bertambah dua. Teknis: SPEC §7, sidebar, rute.
- Risiko: AD-07 tetap padat karena opname/riwayat → diterima. Dependensi: K01, K09.

---

## C. Matriks persetujuan lintas dokumen

Setiap baris perlu jawaban eksplisit: **Setuju / Tidak / Ubah**. Kolom "Tahap" menunjukkan kapan perubahan dilakukan;
tidak ada yang dilakukan sebelum izin mulai tahap tersebut.

| No | Butir | Dokumen/artefak terdampak | Ringkasan perubahan | Sumber | Tahap | Status |
|---|---|---|---|---|---|---|
| C-1 | Lingkup AGENTS.md §1 | `AGENTS.md` | Larangan "pembelian bahan/supplier", "produksi/work order" dicabut **sebatas** CR-04a/b; "modul keuangan" tetap dilarang; Reporting operasional ditambah (CR-04c) | Draft §21.2 | CP1 tiap tahap | Perlu persetujuan |
| C-2 | SPEC | `docs/SPEC.md` §2/3/5/6/7/8/9/10/13 | FR-41 – 47, UC-33 – 38, BR-17 – 36, AD-12/13, AC-41 – 47 sebagai kode resmi per tahap; catatan CR-04 di §13 | E1 Lampiran A | CP1 tiap tahap | Perlu persetujuan |
| C-3 | Teks wajib CR-03 E-6 & E-11 | SPEC §5, `MATERIAL_REQUIREMENT_NOTE`, uji K-14, e2e | Kalimat penutup per tahap (Draft §19.1 – §19.2); FR-40 dan bagian awal teks tidak berubah; dokumen CR-03 tidak diubah | Draft §19, §21.3 | CP1 CR-04a & CR-04b | Perlu persetujuan |
| C-4 | Endpoint & perilaku AD-07 | API & UI AD-07 | Dokumen + mutasi; `request_id` opsional; saldo awal bahan baru (transaksi sama, E1 B.4); batas atas; endpoint opname, pembalik/koreksi stok masuk, riwayat mutasi; UI koreksi stok → opname | Draft §21.4, K07 | CR-04a CP4/CP6 | Perlu persetujuan |
| C-5 | Menu AD-12 & AD-13 | SPEC §7, sidebar, rute | `/admin/pembelian` (CR-04a), `/admin/produksi` (CR-04b); Staf & Owner | K24, Draft §21.6 | CR-04a / CR-04b | Perlu persetujuan |
| C-6 | Tab Operasional AD-08 | AD-08 | AD-08 menjadi "Laporan" (tab Penjualan tetap + Operasional, Owner); `/reports/sales` tidak berubah | K15, K18 | CR-04c | Perlu persetujuan |
| C-7 | Prosedur migrasi | Operasi deployment | M-0 – M-9 (Draft §11.3 + E1 B.2/E1.1 §1: snapshot M-4), pemulihan §11.4, fix-forward setelah go-live | Draft §21.5 | Saat deployment CR-04a/b | Perlu persetujuan |
| C-8 | Downtime & fencing database | Lingkungan produksi | Downtime penuh (T-29); akun aplikasi & migrasi terpisah wajib (P-OPS-1 – 4); `ACCOUNT LOCK` + `KILL`; tanpa jalur alternatif. **Lingkungan saat ini memakai satu `DATABASE_URL`** → perlu disiapkan dulu | Draft §11.2, §21.5 | Sebelum deployment | Perlu persetujuan |
| C-9 | Seed & saldo awal | `seed.js`, pemeriksa | Preflight + kelas K-A – K-D; seed berhenti bila tidak konsisten; `db:check-ledger` mode produksi tanpa pengecualian | E1/E1.1 | CR-04a CP2 | Perlu persetujuan |
| C-10 | Batasan operasional & asumsi prototype | SPEC "Asumsi Prototype" | 30 baris per PO/pengeluaran; hasil ≤ 10.000; nomor `PO-YYMMDD-NNN`/`WO-YYMMDD-NNN`; pembalik penuh sekali; koreksi sekali per dokumen berlaku; tanpa batas waktu koreksi; pembulatan setengah menjauhi nol per baris; retensi `operation_requests` tanpa batas; opname & saldo awal tidak dapat dibalik; hasil 0 sah; tanggal = waktu server WIB | Draft §21.7, K08 | CP1 tiap tahap | Perlu persetujuan |
| C-11 | Keterbatasan yang diterima | SPEC §5 | Estimasi FR-40 dapat berlebih (E-11); hasil produksi tidak menambah stok jual (input ganda AD-07); nilai pembelian bukan akuntansi; tanpa reservasi | K11, K13, K25, K06 | CP1 | Perlu persetujuan |
| C-12 | Risiko yang diterima | — | Risiko residual bagian D (terutama D-1 – D-6) | Draft §17 | Sebelum CR-04a | Perlu persetujuan |
| C-13 | Solusi teknis T-33 – T-39 & Errata E1/E1.1 | Desain | Diterima bersama paket | Metadata Draft | Sebelum CR-04a | Perlu persetujuan |
| C-14 | Persetujuan akademik (T-07) | Rekaman CP0 | CR-04 di luar lingkup dokumen yang dinilai. **Belum dikonfirmasi; tidak diklaim.** Pemilik Project memutuskan: (a) wajib ada sebelum CR-04a, atau (b) dicatat sebagai risiko administratif yang diterima (R-21) | Draft §21.8 | CP0 | **Belum tersedia** |
| C-15 | Izin mulai per tahap | — | CR-04a, CR-04b, CR-04c masing-masing memerlukan izin eksplisit terpisah; persetujuan paket ≠ izin mulai | Draft §21.9 | — | Perlu persetujuan |

Dokumen yang **tidak** diubah oleh CR-04: BRD, PRD, Analisis PDF, dokumen CR-03 (Revisi 8 & rekaman persetujuannya),
ROADMAP selain status Step 6.8 – 6.10.

---

## D. Risiko residual

| ID | Risiko | Dampak | Status / penanganan |
|---|---|---|---|
| D-1 | Persetujuan akademik belum ada; CR-04 menyimpang dari BRD §10.2/PRD §13.1 (R-21) | Tinggi (administratif) | C-14 — keputusan Pemilik Project |
| D-2 | Lingkungan target belum memenuhi P-OPS-1 – 4 (satu `DATABASE_URL`) (R-29) | Sedang | Deployment tidak dilakukan sampai siap; tanpa jalur alternatif |
| D-3 | Seluruh skenario IT-01 – IT-38 baru didefinisikan, **belum dijalankan**; desain belum terbukti di MySQL | Tinggi | Dibuktikan bertahap di CP2 – CP7; kegagalan → perbaikan desain lewat CR, bukan diam-diam |
| D-4 | Ukuran lingkup: 14 tabel baru (30 → 44), 2 layar, 1 tab, perubahan AD-07 | Tinggi | Tiga tahap terpisah dengan izin masing-masing |
| D-5 | Restore setelah go-live menghapus data (R-25) | Tinggi | Fix-forward; restore hanya atas keputusan eksplisit |
| D-6 | Regresi AD-07 & CR-03 (R-13) | Sedang | Kontrak lama tetap; suite lama + MySQL 16 – 18 |
| D-7 | MINOR-1: metadata hash pendahulu di header Draft 0.8.3 | Rendah | Dicatat di sini; tidak memengaruhi isi |
| D-8 | MINOR-2: duplikat bersamaan `request_id` dapat memicu deadlock 1213; replay perlu dibaca di transaksi baru/locking read | Sedang | Diuji di CR-04a CP4 (IT-31) |
| D-9 | MINOR-3: suite lama 16 – 18 dan mock lama menulis stok di luar buku mutasi | Sedang | E1.1 §4 – §5 (pengecualian eksplisit); jalur `adminRawMaterial.service.js` dan `stockAdmin.js` dialihkan di CP4/CP6 |
| D-10 | MINOR-4: `ALTER … MODIFY ENUM` CR-04b bersama `ck_mm_actor` | Sedang | Dibuktikan di IT-16 sebelum CR-04b |
| D-11 | Uji lama 14 P1b sudah gagal sebelum CR-04 | Rendah | Tidak diperbaiki; dikecualikan dari kriteria regresi |
| D-12 | Estimasi FR-40 berlebih setelah CR-04b (R-14) | Rendah | Teks E-11 wajib |
| D-13 | COSMETIC: §22 T-37/T-39 menyebut 0.8.2; ENUM campuran bahasa; label K-A – K-D | Rendah | Tidak direvisi |

---

## E. Prasyarat CP0 CR-04a

CP0 hanya boleh dimulai bila **semua** butir berikut terpenuhi:

| No | Prasyarat | Pemenuhan |
|---|---|---|
| E-1 | Persetujuan eksplisit Pemilik Project atas K05 – K25 (bagian B) | Jawaban tertulis per K atau "setuju seluruhnya" |
| E-2 | Persetujuan C-1 – C-13 dan C-15 | Jawaban per butir |
| E-3 | Keputusan C-14 (persetujuan akademik): sudah ada, **atau** diterima sebagai risiko | Dicatat apa adanya; tidak dikarang |
| E-4 | Izin eksplisit memulai CR-04a (bukan CR-04b/c) | Pernyataan terpisah |
| E-5 | Izin Git: branch kerja dari `main` terbaru (bukan `8784ccd`), commit, push, dan PR terpisah per tahap | Pernyataan eksplisit |
| E-6 | Hash ketiga dokumen pada saat persetujuan = bagian A | Diperiksa ulang saat CP0 |
| E-7 | Isi CP0: menyimpan Draft 0.8.3, E1, E1.1, dan rekaman persetujuan (dengan SHA-256) di `docs/change-requests/` | Satu commit dokumen |
| E-8 | `origin/main` masih setara `f3eb8a8` atau perubahan sesudahnya diperiksa dampaknya | Pemeriksaan hanya baca di CP0 |

Prasyarat **deployment**, bukan CP0: P-OPS-1 – 4 dan inventaris jalur penulis (D-2). Implementasi CR-04a boleh berjalan
sebelum lingkungan siap; deployment tidak boleh.

Rencana CP CR-04a (dari laporan verifikasi; dirujuk E1 B.9 dan E1.1 §7):
- **CP0** — dokumen & persetujuan.
- **CP1** — AGENTS §1, SPEC, ROADMAP, teks E-6.
- **CP2** — schema/migrasi 9 tabel, saldo awal, seed + preflight, `db:check-ledger`, pemeriksa skema.
  Uji: IT-01, IT-02, IT-34 – IT-36.
- **CP3** — aturan murni server = client.
- **CP4** — middleware `request_id`, layanan buku mutasi, endpoint AD-07. Uji: IT-37.
- **CP5** — API supplier/PO/penerimaan.
- **CP6** — frontend AD-12/AD-07 + mock. Uji: IT-38.
- **CP7** — regresi penuh, gladi migrasi (IT-02, IT-03, IT-33), PR CR-04a terpisah.

---

## F. Rekomendasi

**Paket layak diajukan untuk persetujuan final.** Alasannya:
1. Tidak ada temuan BLOCKER atau MAJOR yang terbuka. MAJOR-1 ditutup E1 Lampiran A; MAJOR-2 ditutup E1 Lampiran B dan
   E1.1.
2. Ketiga dokumen tersedia, hash cocok, urutan baca jelas, dan rujukan silang konsisten. Ketidaksesuaian yang tersisa
   (bagian A) bersifat metadata/kosmetik dan tidak mengubah ketentuan.
3. Setiap keputusan memiliki pilihan bersumber dokumen, rekomendasi, konsekuensi, risiko, dependensi, dan status.

Catatan sebelum Anda memutuskan:
- Persetujuan paket **tidak sama** dengan izin mulai CR-04a (E-4).
- Keputusan C-14 (akademik) sebaiknya diambil **sebelum** CP0. Bila dosen kemudian menolak, pekerjaan CR-04 yang sudah
  di-merge harus dibatalkan.
- Pertimbangkan D-2: tanpa akun database terpisah, CR-04a dapat diimplementasikan dan diuji di harness, tetapi
  **tidak dapat dideploy**.

---

## G. Kriteria implementasi tambahan CP2

Dua kriteria ini adalah **kriteria implementasi**, bukan revisi dokumen. Keduanya memperketat E1.1 tanpa mengubah
ketentuannya.

**IMPL-CP2-1 — Keamanan `--legacy-fixtures` (melengkapi E1.1 §5)**
- Mode `--legacy-fixtures` hanya diterima bila identitas database terverifikasi sebagai database uji harness.
  `NODE_ENV` saja **tidak cukup**.
- Syarat identitas, semuanya wajib:
  - `SELECT DATABASE()` sama persis dengan daftar izin konstanta `['ovenco_c4_test']` (nama yang dibuat
    `server/tests-mysql/run.sh`);
  - host koneksi `127.0.0.1`/`localhost` dan port harness `33306`;
  - variabel penanda dari `run.sh` ada dan cocok dengan nama database.
- Database yang tidak dikenal, syarat yang tidak lengkap, atau `NODE_ENV=production` → **ditolak** dengan exit non-zero,
  sebelum pemeriksaan dimulai.
- Uji: IT-35/IT-36 menjalankan flag terhadap database bernama lain dan port lain, dan keduanya harus ditolak.

**IMPL-CP2-2 — Snapshot migrasi deterministik (melengkapi E1.1 §1, langkah M-4)**
- Berkas: CSV UTF-8 tanpa BOM; baris pertama header `material_id,stock`; satu baris per bahan, **urut `material_id`
  naik** (numerik); akhir baris LF (`\n`), termasuk baris terakhir; tanpa spasi tambahan.
- Nilai: `material_id` bilangan bulat desimal; `stock` sebagai **string DECIMAL dari MySQL** (`CAST(stock AS CHAR)`),
  tepat 2 desimal, titik desimal, tanpa pemisah ribuan, tanpa konversi ke number/float.
- Metadata (berkas terpisah): jumlah bahan, Σ stok dari `SUM(stock)` MySQL sebagai string, waktu, dan
  **SHA-256 berkas final** (setelah berkas ditutup).
- Dibuat oleh skrip, bukan spreadsheet. Pembuatan ulang dari data yang sama harus menghasilkan hash yang sama.
- M-6 dan M-8 membuat ulang snapshot dari database hasil restore/migrasi dan membandingkan SHA-256 (sama, karena
  `raw_materials` tidak berubah), selain perbandingan per bahan.
- Uji: IT-34 memeriksa determinisme (dua kali pembuatan → hash sama) dan bahwa perubahan satu nilai mengubah hash.

---

## Formulir keputusan Pemilik Project

| Butir | Keputusan |
|---|---|
| K05 – K25 (bagian B) | ☐ Setuju seluruhnya ☐ Setuju dengan perubahan: ____ ☐ Tidak |
| Solusi T-33 – T-39 + Errata E1/E1.1 (C-13) | ☐ Setuju ☐ Tidak |
| C-1 – C-12 | ☐ Setuju seluruhnya ☐ Per butir: ____ |
| C-14 Persetujuan akademik | ☐ Sudah ada (lampirkan) ☐ Wajib sebelum CR-04a ☐ Diterima sebagai risiko |
| Kriteria IMPL-CP2-1/2 | ☐ Setuju ☐ Tidak |
| Izin mulai CR-04a (C-15, E-4) | ☐ Ya, mulai CP0 ☐ Belum |
| Izin Git untuk CP0 (E-5) | ☐ Ya ☐ Belum |

*Paket ini tidak mengubah ketiga dokumen, repository, kode, database, schema, migrasi, AGENTS.md, SPEC, ROADMAP, atau Git,
dan tidak menjalankan pengujian maupun implementasi.*
