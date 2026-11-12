# CHANGE REQUEST CR-04 — Supplier & Purchasing, Manufacturing, dan Advanced Reporting

| Butir | Isi |
|---|---|
| Project | Oven & Co. |
| Versi | **Draft 0.8.3** — koreksi terbatas Draft 0.8.2 (SHA-256 `4b5e72fa9e1846f11820303762a5bb52018e19c53f4d69397bc317d0db2df7cc`) untuk T-37 & T-39 (§0.2); Draft 0.8.1 merevisi Draft 0.8 (SHA-256 `4829fe061b67b4a1a6fbe8698a5b4c6ea18b4f3e3f13092e95df4d30ec1c1339`); Draft 0.8 merevisi Draft 0.7 (SHA-256 `8d939bdabbbf7de18066260b09c9fa722cf3066e0471a236b392b8b967aa0826`); dokumen lengkap |
| Status dokumen | **DRAFT — dokumen final untuk persetujuan; belum disetujui; tidak memberi izin implementasi** |
| Cakupan | Step 6.8 (CR-04a), Step 6.9 (CR-04b), Step 6.10 (CR-04c) |
| Basis spesifikasi | `main` @ `f3eb8a8` — squash-merge PR #25 (CR-03); `origin/main` masih `f3eb8a8` saat revisi ini |
| HEAD repository saat revisi | Branch kerja `claude/gallant-hypatia-jmd6qq` @ `8784ccd` (head PR #25 sebelum squash); isi tree identik dengan `f3eb8a8` (`git diff f3eb8a8 8784ccd` kosong) — implementasi CR-04a nanti dimulai dari `main` terbaru, bukan dari `8784ccd` |

### Metadata keputusan

| Kelompok | Status |
|---|---|
| CR04-K01 – K04 | Ditetapkan Pemilik Project (K01 A, K02 C, K03 B, K04 B) — tidak diubah |
| CR04-K02 klarifikasi (T-01) | Ditetapkan Pemilik Project: nama, telepon/WA, alamat, email, kontak person wajib; catatan opsional; status aktif dikelola sistem, default aktif — tidak diubah |
| CR04-K05 – K25 | **Usulan analis atas delegasi — belum disetujui final** |
| Solusi teknis T-33 – T-39 | Ditetapkan analis atas delegasi Pemilik Project (tinjauan Draft 0.7); bagian dari usulan yang disetujui bersama draft final |

CR-04a, CR-04b, CR-04c masing-masing memerlukan persetujuan eksplisit terpisah sebelum implementasi.

---

## 0. Perubahan Draft 0.7 → Draft 0.8

| Temuan | Penyelesaian | Bagian terdampak |
|---|---|---|
| **T-33** Kontradiksi koreksi hasil produksi | Tiga kasus koreksi hasil ditetapkan: 0 → positif = **pengganti langsung** (tanpa pembalik); positif → positif = pembalik + pengganti atomik; positif → 0 = **pembalik saja**. Definisi "dokumen berlaku" diperluas (tidak dibalik **dan** tidak diganti). Rumus hasil bersih tetap valid untuk ketiga kasus | §2.5, §2.6, §4, §8.2, §8.3, §12 (`production_outputs`), BR-30, BR-36, VR, AC-46.4, IT-22 |
| **T-34** CHECK & NULL | Seluruh CHECK ditulis ulang sebagai SQL eksplisit per tabel; setiap blok `kind`/`status` lengkap & saling eksklusif dengan pemeriksaan `IS NULL`/`IS NOT NULL` lebih dulu sehingga tidak ada hasil UNKNOWN yang meloloskan baris. Saldo awal 0 = dokumen sah tanpa mutasi; mutasi 0 dilarang (termasuk saldo awal). **Ditemukan saat audit:** MySQL melarang CHECK pada kolom yang dipakai aksi FK `CASCADE`; seluruh FK CR-04 ditetapkan `ON DELETE RESTRICT ON UPDATE RESTRICT` | §2.4, §2.6 (I-2, I-7), §11, §12, IT-04, IT-17 |
| **T-35** Relasi mutasi ↔ dokumen koreksi | Aturan tunggal: mutasi bersih merujuk **P** bila bahan ada di P, **R** bila bahan hanya di R; dampak 0 tanpa mutasi; R & P berbagi `operation_request_id`; I-8 dihitung per operasi & kumulatif. Berlaku untuk penerimaan, pengeluaran, stok masuk. Tanpa tabel baru | §2.4, §2.6 (I-8), §4, §12 (`material_movements`), IT-10, IT-30 |
| **T-36** Idempotensi PUT & endpoint opsional | Semua endpoint yang menerima `request_id` opsional **wajib** menerapkan kontrak penuh bila `request_id` dikirim (simpan, bandingkan aktor/operasi/target/hash, replay, 409). Endpoint yang tidak tercantum menolak `request_id` (400) | §5, BR-31, VR, AC-44.6, IT-31 |
| **T-37** Presisi kuantitas | Pemisahan presisi: stok & mutasi 2 desimal; resep & snapshot 3 desimal; standar 3 desimal (eksak); selisih aktual − standar dalam milli-satuan; tanpa pembulatan prematur; aritmetika desimal aman (BigInt milli / DECIMAL MySQL), tanpa floating point; laporan memisahkan standar, aktual, selisih | §3, §8.4, §9, VR, AC-46.5, IT-23, IT-32 |
| **T-38** Validasi `expected_stock` | String desimal wajib, ≤ 2 desimal, ≥ 0, ≤ 99.999.999,99, dinormalisasi ke milli sebelum dibandingkan dengan stok terkunci; format salah 400; tidak sama 409 `STOCK_CHANGED` | §2.7, §14, §15, IT-13 |
| **T-39** Pengamanan migrasi | Inventaris penulis (API, job auto-cancel, webhook simulasi — satu proses; skrip seed/Prisma Studio manual); pemblokiran tulis berlapis; akun aplikasi dikunci & akun migrasi terpisah sebagai **prasyarat operasional** (arsitektur saat ini memakai satu `DATABASE_URL`); prosedur backup, restore uji, validasi, fix-forward dipertahankan | §11, R-23, AC-44.1, IT-33 |

Penyesuaian teknis atas usulan keputusan: K14 & K22 (koreksi hasil tiga kasus), K21 (FK `RESTRICT`), K23 (I-2, I-7,
I-8 disesuaikan). Tidak ada perubahan pada K01 – K04, T-01, atau keputusan CR-03.

### 0.1 Revisi terbatas Draft 0.8 → Draft 0.8.1 (review final)

| Perbaikan | Isi | Bagian terdampak |
|---|---|---|
| A — T-35 tanda mutasi pengeluaran | I-8 dibedakan: penerimaan & stok masuk → mutasi = jumlah dokumen bertanda; pengeluaran → mutasi = **negatif** jumlah dokumen bertanda. Rumus §2.4 & §4.3 tidak berubah. Aktual pemakaian dilaporkan positif | §2.2, §2.6, §4.3, §8.4, §9, BR-23, BR-27, IT-21, IT-30, §20 |
| B — T-37 batas standar | Batas standar dikoreksi: maks. per bahan per WO = 9.999.999,999 × 10.000 = **99.999.999.990,000** (Draft 0.8 salah tulis "99.999.999,990"). Batas takaran CR-03 & hasil tetap. Standar tidak disimpan; perilaku bila agregat tidak dapat diserialisasi eksak ditetapkan | §3, §8.4, §9, §14, IT-32, §20 |
| C — T-36 nilai sementara `operation_requests` | INSERT awal memakai `response_status = 102` dan `response_body = {"status":"in_progress"}`; diganti respons final sebelum COMMIT; nilai sementara tidak pernah ter-commit. `request_id` di luar allowlist ditolak 400 di **semua** endpoint (termasuk lama) lewat middleware global | §5.1, §5.2, §12.2, BR-31, AC-44.6, IT-31, §20 |
| D — T-39 dua mode migrasi | Mode A (akun terpisah: LOCK/KILL, akun migrasi, UNLOCK setelah validasi) dan Mode B (hanya dengan persetujuan tertulis; pemblokiran proses; M-3 & UNLOCK dilewati; batal bila tidak dapat diverifikasi) | §11, P-OPS, AC-44.1, IT-33, R-23, R-29, §20 — **Mode B dihapus di Draft 0.8.2 (§0.2)** |
| E — T-33 kondisi terminal | Koreksi p → 0 (R saja) = kondisi **terminal**: tidak ada dokumen berlaku, koreksi berikutnya ditolak; produksi baru memakai WO baru. Tiga kasus tidak berubah | §8.2, BR-36, VR, AC-46.4, IT-22, §20 |

Tidak ada perubahan pada CHECK yang sudah benar, FK `RESTRICT/RESTRICT`, K01 – K04, T-01, atau keputusan CR-03.
K05 – K25 tetap usulan.

### 0.2 Koreksi terbatas Draft 0.8.1 → Draft 0.8.2

| Koreksi | Isi | Bagian terdampak |
|---|---|---|
| T-39 — Mode B dihapus | Evaluasi fencing (§11.2): tanpa akun aplikasi terpisah, tidak ada mekanisme database yang dapat **mencegah** koneksi penulis baru sekaligus tetap mengizinkan migrasi. Mode B (pemblokiran proses + pemeriksaan berulang) **tidak lagi diizinkan**; persetujuan tertulis tidak menggantikan pengamanan teknis. Satu-satunya jalur: Mode A (akun aplikasi dikunci). P-OPS-5 dihapus | §11.2 – §11.5, P-OPS, AC-44.1, IT-33, R-23, R-29, §20, §21.5, §22 |
| T-37 — batas serialisasi | Batas agregat 999.999.999.999,999 (kuantitas) dan 9.999.999.999.999,99 (rupiah) ditetapkan sebagai **kebijakan** maksimum agregat laporan, bukan batas inheren JavaScript; pelanggaran → **422 `REPORT_AGGREGATE_LIMIT`**; `MILLI_PRECISION_LOST` (500) hanya untuk kehilangan presisi yang benar-benar terdeteksi; pemeriksaan eksak di konversi milli, API JSON, dan mock | §3, §8.4, §9, §14, §15, IT-32, §20 |

Tidak ada perubahan lain. CHECK, FK, K01 – K04, T-01, keputusan CR-03, dan pemisahan CR-04a/b/c tetap.

### 0.3 Koreksi terbatas Draft 0.8.2 → Draft 0.8.3

| Koreksi | Isi | Bagian terdampak |
|---|---|---|
| T-37 — batas agregat bertanda | Batas agregat laporan diterapkan pada magnitudo (`ABS`) setiap agregat kuantitas/rupiah; nilai negatif dengan magnitudo di atas batas juga ditolak 422 `REPORT_AGGREGATE_LIMIT`. Pengujian mencakup kedua tanda | §3, §8.4, §9, §14, IT-32, §20 |
| T-37 — aktual per WO | Dihapus pernyataan bahwa aktual per WO otomatis berada di bawah batas hanya karena standar dibatasi. Aktual tetap dihitung dari seluruh dokumen pengeluaran bertanda; serialisasi aktual dan selisih wajib melalui pemeriksaan eksak yang sama. Batas kebijakan agregat berlaku bila nilai tersebut menjadi agregat laporan | §3, §8.4, §9, §20 |
| T-37 — aturan konversi | Diperjelas bahwa `Number()`/`parseFloat` dilarang untuk parsing dan aritmetika kuantitas/uang; konversi akhir ke JSON number hanya melalui `milliToNumber` dan uji bolak-balik eksak | §3, §14, IT-32 |
| T-39 — privilege pemeriksaan | P-OPS-2 mewajibkan `PROCESS` untuk inventarisasi seluruh thread/akses `INFORMATION_SCHEMA`; kemampuan `KILL` sesi akun lain harus didukung `CONNECTION_ADMIN` atau `SUPER` | §11.2, §11.3, IT-33 |
| T-39 — cakupan fencing | Prasyarat dan verifikasi mencakup proxy user, stored program/view ber-`DEFINER` akun aplikasi, serta seluruh akun/jalur penulis lain. `ACCOUNT LOCK` tidak dinyatakan sebagai jaminan universal di luar cakupan akun yang dikunci dan jalur yang telah diverifikasi | §11.2 – §11.4, AC-44.1, IT-33, R-29, §20 |

Tidak ada perubahan pada struktur database, CHECK, FK, K01 – K04, T-01, keputusan CR-03, atau pemisahan CR-04a/b/c.

---

## 1. Rekapitulasi keputusan

| Kode | Keputusan | Status |
|---|---|---|
| K01 | A — Staf & Owner hak sama (Purchasing) | Ditetapkan |
| K02 | C + klarifikasi T-01 (§7) | Ditetapkan |
| K03 | B — daftar bahan per supplier (boleh kosong saat dibuat); PO hanya bahan terdaftar | Ditetapkan |
| K04 | B — Draft → Dipesan → Diterima Sebagian → Diterima / Dibatalkan | Ditetapkan |
| K05 | Penerimaan sebagian boleh, berlebih ditolak; batal setelah sebagian (sisa batal, penerimaan tetap); PO terkunci setelah Dipesan | Usulan |
| K06 | Harga wajib; nilai PO, penerimaan, sisa dibatalkan (historis) terpisah; pembulatan per baris (§6) | Usulan |
| K07 | Catat Stok Masuk & opname AD-07 berbasis dokumen + mutasi; stok masuk dapat dibalik/dikoreksi; opname nilai absolut | Usulan |
| K08 | Kuantitas DECIMAL(10,2) string; satuan `raw_materials.unit`; tanggal = waktu server WIB | Usulan |
| K09 | Staf & Owner (Manufacturing) | Usulan |
| K10 | WO manual + isian awal AD-07 (hari ini) & AD-05, hanya dibaca | Usulan |
| K11 | Tanpa reservasi; stok berkurang hanya oleh pengeluaran; BR-15 tetap | Usulan |
| K12 | Aktual bebas; standar = snapshot × hasil bersih; selisih dilaporkan | Usulan |
| K13 | Hasil hanya dicatat; tidak mengubah stok jual, pesanan, checkout | Usulan |
| K14 | Draft → Diproses → Selesai / Dibatalkan; snapshot saat mulai; koreksi hasil tiga kasus (§8.2) | Usulan |
| K15 | Tab "Operasional" di AD-08 | Usulan |
| K16 | Periode AD-08; dasar tanggal per laporan (§9) | Usulan |
| K17 | Ekspor Excel/PDF dengan library AD-08 | Usulan |
| K18 | Laporan operasional Owner saja | Usulan |
| K19 | Estimasi FR-40 + selisih; tanpa rumus baru | Usulan |
| K20 | Audit setiap operasi tulis | Usulan |
| K21 | Urutan kunci global (§10); FK CR-04 `RESTRICT/RESTRICT` | Usulan |
| K22 | Append-only; pembalik penuh; koreksi = satu mutasi bersih per bahan (§4) | Usulan |
| K23 | Buku mutasi + invarian I-1 – I-10 | Usulan |
| K24 | AD-12 Pembelian, AD-13 Produksi | Usulan |
| K25 | FR-40 tidak berubah; teks keterangan per tahap (§19) | Usulan |

---

## 2. Dokumen sumber, baris dokumen, buku mutasi

### 2.1 Identitas
`movement_id`, ID dokumen, ID baris dokumen: BIGINT `AUTO_INCREMENT`. `request_id`: UUID v4, CHAR(36), kanonik huruf
kecil — PK `operation_requests` dan FK `*_request_id` di tabel lain. `material_movements` tidak memuat `request_id`.

### 2.2 Dua lapisan
- **Baris dokumen**: isi dokumen apa adanya; kuantitas selalu > 0. **Jumlah dokumen bertanda** = +qty untuk dokumen `normal`/`pengganti` (dan `stok_masuk`/`pengganti_stok_masuk`), −qty untuk dokumen pembalik. Efek stok tergantung jenis transaksi: penerimaan & stok masuk **menambah** stok sebesar jumlah bertanda; pengeluaran **mengurangi** stok sebesar jumlah bertanda (lihat I-8).
- **Buku mutasi**: efek stok; **satu baris bersih (≠ 0) per bahan per operasi**.
Penghubung: I-8 (dokumen relatif) dan I-10 (opname).

### 2.3 Dokumen
| Dokumen | Tabel | Jenis | Tahap |
|---|---|---|---|
| Penyesuaian AD-07 | `stock_adjustments` (satu bahan) | `saldo_awal`, `stok_masuk`, `pembalik_stok_masuk`, `pengganti_stok_masuk`, `stock_opname` | CR-04a |
| Penerimaan | `goods_receipts` + `goods_receipt_lines` | `normal`, `pembalik`, `pengganti` | CR-04a |
| Pengeluaran bahan | `material_issues` + `material_issue_lines` | `normal`, `pembalik`, `pengganti` | CR-04b |
| Hasil produksi | `production_outputs` | `normal`, `pembalik`, `pengganti` | CR-04b |

### 2.4 Jenis mutasi, rumus, dan dokumen rujukan (T-34, T-35)

| Mutasi (`type`) | Operasi | Dokumen yang dirujuk | `qty_change` |
|---|---|---|---|
| `saldo_awal` | migrasi / buat bahan | dokumen `saldo_awal` | stok awal; **hanya ditulis bila > 0** |
| `stok_masuk` | Catat Stok Masuk | dokumen `stok_masuk` | +qty (> 0) |
| `pembalik_stok_masuk` | pembalik murni | dokumen pembalik R | −qty asal (< 0) |
| `koreksi_stok_masuk` | koreksi | dokumen pengganti P (bahan selalu ada di P) | qty(P) − qty(O) (≠ 0) |
| `stock_opname` | opname | dokumen opname | `counted_stock − system_stock` (≠ 0) |
| `penerimaan` | penerimaan | dokumen normal | +qty per item (> 0) |
| `pembalik_penerimaan` | pembalik murni | R | −qty per item asal (< 0) |
| `koreksi_penerimaan` | koreksi | **P bila item ada di P; R bila item hanya di R** | qty(P,item) − qty(O,item) (≠ 0) |
| `pengeluaran_produksi` (CR-04b) | pengeluaran | dokumen normal | −qty per bahan (< 0) |
| `pembalik_pengeluaran` (CR-04b) | pembalik murni | R | +qty per bahan asal (> 0) |
| `koreksi_pengeluaran` (CR-04b) | koreksi | **P bila bahan ada di P; R bila bahan hanya di R** | qty(O,m) − qty(P,m) (≠ 0) |

Aturan umum: `qty_change ≠ 0` untuk **semua** jenis (mutasi 0 tidak pernah disimpan); `stock_after = stock_before +
qty_change`; `0 ≤ stock_before, stock_after ≤ 99.999.999,99`; satu operasi menulis paling banyak satu mutasi per bahan
(per item PO untuk penerimaan).

### 2.5 Pembalik & koreksi — ringkasan
| Dokumen asal (berlaku) | Pembalik murni | Koreksi | Catatan |
|---|---|---|---|
| Penerimaan | Ya | R + P atomik | Status PO dihitung ulang; `qty_cancelled` tetap |
| Pengeluaran | Ya | R + P atomik | WO bukan Draft |
| Stok masuk | Ya | R + P atomik | — |
| Hasil produksi qty 0 | **Tidak** | **P langsung** (tanpa R), qty 1 – 10.000 | T-33 kasus 1 |
| Hasil produksi qty > 0 | Ya (= koreksi ke 0) | R + P atomik, P qty 1 – 10.000 | T-33 kasus 2 & 3 |
| Saldo awal | Tidak | Tidak | Perbaiki dengan opname |
| Stock opname | Tidak | Tidak | Perbaiki dengan opname baru |

**Dokumen berlaku** = `kind ∈ {normal, pengganti}` (untuk `stock_adjustments`: `saldo_awal`, `stok_masuk`,
`pengganti_stok_masuk`, `stock_opname`) yang **tidak dirujuk** oleh `reverses_id` mana pun **dan tidak dirujuk** oleh
`replaces_id` mana pun. Hanya dokumen berlaku yang dapat dibalik/dikoreksi; R dan P tidak dapat dibalik/dikoreksi
langsung (yang dikoreksi berikutnya adalah P).

### 2.6 Invarian
| ID | Invarian |
|---|---|
| I-1 | Per bahan: Σ `qty_change` = `raw_materials.stock` |
| I-2 | Per bahan urut `movement_id`: baris pertama `stock_before = 0`; setiap baris berikutnya `stock_before` = `stock_after` baris sebelumnya; baris terakhir `stock_after` = `raw_materials.stock`; bahan tanpa mutasi → `raw_materials.stock = 0` |
| I-3 | 0 ≤ `stock_before`, `stock_after` ≤ 99.999.999,99 |
| I-4 | Per item PO: bersih diterima (Σ baris dokumen bertanda) ≥ 0 dan bersih diterima + `qty_cancelled` ≤ `qty_ordered` |
| I-5 | Per WO & bahan: pemakaian bersih (Σ baris dokumen bertanda) ≥ 0 |
| I-6 | Setiap dokumen dirujuk paling banyak sekali sebagai `reverses_id` dan paling banyak sekali sebagai `replaces_id` |
| I-7 | Tepat satu **dokumen** `saldo_awal` per bahan; mutasi `saldo_awal` ada tepat bila qty > 0 |
| I-8 | Dokumen relatif, dengan "jumlah bertanda" = +qty (normal/pengganti, stok masuk/pengganti stok masuk) dan −qty (pembalik). (a) **Per operasi** (`operation_request_id`, atau dokumen tunggal tanpa `request_id`) dan per item/bahan, O tidak termasuk: **penerimaan & stok masuk** — Σ mutasi = Σ jumlah bertanda dokumen operasi; **pengeluaran** — Σ mutasi = **−**Σ jumlah bertanda dokumen operasi. Contoh pengeluaran: normal 10 → mutasi −10; pembalik 10 → +10; koreksi (R 10 + P 8) → jumlah bertanda −10 + 8 = −2 → mutasi **+2**. (b) **Kumulatif** per item PO / per bahan stok masuk: Σ mutasi = Σ jumlah bertanda semua dokumen; per WO & bahan: Σ mutasi = −Σ jumlah bertanda semua dokumen = −aktual pemakaian. Opname & saldo awal dikecualikan (I-7, I-10) |
| I-9 | Keterkaitan `operation_requests` sesuai matriks §5.1: dokumen dari operasi wajib → `*_request_id` NOT NULL; dari operasi opsional → NULL bila `request_id` tidak dikirim, NOT NULL bila dikirim; saldo awal migrasi NULL |
| I-10 | Opname: `counted_stock ≠ system_stock` → tepat satu mutasi `stock_opname` (`qty_change = counted − system`, `stock_before = system_stock`, `stock_after = counted_stock`); sama → tidak ada mutasi |

### 2.7 Stock opname (T-38)
- Dokumen menyimpan `counted_stock` (fisik, boleh 0) dan `system_stock` (stok baris `raw_materials` yang dikunci).
- Mutasi = `counted_stock − system_stock` dalam milli-satuan; selisih 0 → dokumen tanpa mutasi.
- **Endpoint baru** `POST /api/admin/raw-materials/:id/stock-counts` body `{counted_stock, expected_stock, reason?, request_id}`:
  1. Validasi format (sebelum transaksi): `counted_stock` dan `expected_stock` **wajib**, string desimal (`^\d+(\.\d{1,2})?$`
     setelah trim), ≥ 0, ≤ 99.999.999,99; JSON number ditolak; `request_id` UUID v4 → gagal = **400**.
  2. Normalisasi: kedua nilai diubah ke milli-satuan BigInt (tanpa floating point).
  3. Transaksi & kunci (§10). Stok baris terkunci (DECIMAL dari MySQL, dibaca sebagai string) diubah ke milli.
  4. `expected` ≠ stok terkunci → **409 `STOCK_CHANGED`**, tanpa dokumen/mutasi (rollback, termasuk `operation_requests`).
  5. Sama → dokumen opname (`system_stock` = stok terkunci) + mutasi bila selisih ≠ 0 + audit + respons.
- **Jalur lama** `PUT /api/admin/raw-materials/:id`: perilaku & validasi `expected_stock` AD-07 yang ada dipertahankan;
  bila stok berubah → dokumen `stock_opname` + mutasi; `request_id` opsional (§5.1).
- UI AD-07 versi CR-04a memakai endpoint baru untuk koreksi stok (T-25).

---

## 3. Presisi, batas, dan aritmetika (T-37)

| Besaran | Presisi | Batas | Penyimpanan |
|---|---|---|---|
| Stok, minimum, `counted_stock`, `system_stock`, `expected_stock`, kuantitas PO/penerimaan/pengeluaran/stok masuk, `qty_change`, `stock_before/after`, pemakaian aktual | **2 desimal** | 0 – 99.999.999,99 (kuantitas dokumen > 0) | DECIMAL(10,2) |
| Takaran CR-03 & snapshot resep WO | **3 desimal** | > 0 – 9.999.999,999 | DECIMAL(10,3) |
| Standar pemakaian (per bahan per WO) | **3 desimal**, eksak (= takaran × hasil bulat) | 0 – **99.999.999.990,000** (= 9.999.999,999 × 10.000) | Dihitung (tidak disimpan; tidak ada kolom yang membatasi) |
| Selisih aktual − standar | **3 desimal** (milli), bertanda | — | Dihitung |
| Harga satuan PO | 2 desimal | > 0 – 9.999.999.999,99 | DECIMAL(12,2) |
| Nilai rupiah | 2 desimal (pembulatan per baris §6) | ≤ 9.999.999.999,99 per baris & per PO | Dihitung |
| Hasil produksi, rencana | Bilangan bulat | 0 – 10.000 (rencana 1 – 10.000) | INT |

Aturan:
1. Input kuantitas, harga, `counted_stock`, `expected_stock` = **string desimal**; > 2 desimal → 400; JSON number → 400
   (endpoint CR-04). Endpoint lama AD-07 mempertahankan aturan input yang ada.
2. Aritmetika server & client: **BigInt** milli-satuan (kuantitas; 2 desimal × 10) dan BigInt per 1/10.000 Rupiah
   (uang); parsing teks/DECIMAL ↔ milli memakai fungsi aturan murni CR-03 (`decimalToMilli`,
   `milliToDecimalString`). `Number()`/`parseFloat` dilarang untuk parsing maupun aritmetika kuantitas/uang.
   Konversi ke JSON number hanya boleh pada tahap akhir melalui `milliToNumber` sebagaimana aturan 6.
3. MySQL: penjumlahan stok `stock + CAST(? AS DECIMAL(10,2))`; agregasi laporan memakai `SUM` DECIMAL atau BigInt di
   aplikasi; tanpa kolom FLOAT/DOUBLE.
4. **Tidak ada pembulatan prematur**: standar, selisih, dan agregatnya dihitung penuh dalam milli; hanya nilai rupiah
   yang dibulatkan, per baris, sesuai §6. Standar 3 desimal tidak pernah menulis stok.
5. Isian awal pemakaian aktual = standar **hanya bila** standar tepat 2 desimal; bila tidak, standar ditampilkan sebagai
   acuan dan pengguna mengisi aktual (tanpa pembulatan otomatis).
6. **Batas agregat laporan & serialisasi eksak** (kebijakan, berlaku untuk API & mock):
   - **Kebijakan `REPORT_AGGREGATE_LIMIT`**: magnitudo (`ABS`) setiap nilai agregat dalam respons laporan operasional
     (total, subtotal, per periode, per supplier/bahan/produk) dibatasi **999.999.999.999,999** untuk kuantitas
     (milli ≤ 999 999 999 999 999) dan **9.999.999.999.999,99** untuk rupiah
     (sen ≤ 999 999 999 999 999). Batas berlaku sama untuk agregat positif maupun negatif. Ini **batas kebijakan
     sistem** yang dipilih dengan margin aman bagi representasi eksak JSON number; ini bukan `Number.MAX_SAFE_INTEGER`
     dan bukan batas inheren bahasa pemrograman. Batas standar per WO dan nilai per baris tidak mengimplikasikan
     bahwa aktual atau selisih per WO otomatis berada di bawah batas.
   - **Pemeriksaan kebijakan**: semua agregat dihitung lebih dulu dalam BigInt (milli/sen) dari data snapshot; bila
     magnitudo **satu saja** melebihi batas → seluruh respons ditolak **422 `REPORT_AGGREGATE_LIMIT`** dengan pesan
     "Total laporan melebihi batas sistem. Persempit periode laporan." — tanpa data sebagian, tanpa pembulatan. Laporan
     tidak di-cache; permintaan dengan periode lebih sempit dihitung ulang.
   - **Konversi eksak**: teks/DECIMAL → milli/sen hanya lewat parser string desimal BigInt (`decimalToMilli`; nilai
     DECIMAL dari MySQL dibaca sebagai string, mis. `Prisma.Decimal.toString()`); tidak pernah lewat `Number()` atau
     `parseFloat`. Input yang tidak sah → 400 (validasi), bukan pembulatan.
   - **Serialisasi eksak (API & mock)**: setiap nilai dikonversi milli/sen → JSON number dengan fungsi fail-safe CR-03
     (`milliToNumber`: hasil `JSON.stringify` diurai kembali ke milli/sen dan harus identik). Bila tidak identik →
     **500 `MILLI_PRECISION_LOST`** untuk seluruh respons (kehilangan presisi yang benar-benar terdeteksi; secara teori
     tidak terjadi di bawah batas kebijakan, dipertahankan sebagai pengaman).
   - Urutan: validasi periode (400) → snapshot → agregasi BigInt → pemeriksaan kebijakan (422) → serialisasi eksak
     (500 bila gagal) → respons lengkap. Mode mock memakai fungsi aturan murni & urutan yang sama dan melempar error
     dengan status & kode yang sama.
   - Tidak ada input yang ditolak karena standar: takaran (CR-03) dan hasil (≤ 10.000) sudah dibatasi.
7. Setiap mutasi memeriksa saldo akhir ∈ [0, 99.999.999,99] sebelum ditulis.

---

## 4. Algoritma pembalik & koreksi (T-33, T-35)

### 4.1 Langkah umum
1. Validasi format & `request_id` (400).
2. Transaksi; kunci sesuai §10 (pelaku → `operation_requests` → dokumen induk PO/WO bila ada → dokumen asal O → bahan
   terkait urut `material_id`).
3. Validasi O berlaku (§2.5) dan jenis operasi diizinkan; alasan wajib (1 – 255).
4. Buat dokumen sesuai kasus (§4.2). Semua dokumen operasi memakai `operation_request_id` yang sama.
5. Hitung dampak bersih per bahan/item, tulis mutasi menurut §4.3.
6. Validasi saldo akhir setiap bahan ∈ [0, batas]; bila satu saja melanggar → 409 `STOCK_OUT_OF_RANGE` dan seluruh
   operasi rollback.
7. Hitung ulang status PO (penerimaan); tulis audit; simpan respons idempotensi; commit.

### 4.2 Kasus dokumen
| Kasus | Dokumen dibuat | Syarat |
|---|---|---|
| Pembalik murni (penerimaan, pengeluaran, stok masuk, hasil > 0) | R (`reverses_id = O`, baris = salinan O) | O berlaku; untuk hasil: qty O > 0 |
| Koreksi (penerimaan, pengeluaran, stok masuk, hasil > 0 → > 0) | R + P (`replaces_id = O`) | P ≥ 1 baris qty > 0; aturan dokumen sejenis |
| Koreksi hasil 0 → > 0 | **P saja** (`replaces_id = O`, tanpa R) | qty O = 0; P qty 1 – 10.000 |
| Koreksi hasil > 0 → 0 | **R saja** (= pembalik murni) | qty O > 0 |
| Koreksi yang menjadikan semua baris 0 (penerimaan/pengeluaran/stok masuk) | Ditolak 400 — gunakan pembalik | — |
| Pengganti langsung untuk dokumen dengan qty > 0 | Ditolak 400 — gunakan koreksi R + P | — |
| Koreksi hasil 0 → 0 | Ditolak 400 (tidak ada perubahan) | — |

Aturan dokumen sejenis untuk P: penerimaan — item dari PO yang sama, jumlah bersih item (tanpa O) + P ≤ dipesan −
dibatalkan, PO Dibatalkan hanya boleh mengurangi per item dibanding O; pengeluaran — WO yang sama, bahan dari master,
tanpa duplikat; stok masuk — bahan yang sama dengan O.

### 4.3 Penentuan mutasi & rujukan (T-35)
Untuk setiap bahan `m` (penerimaan: setiap item PO) yang muncul di O atau P:
1. `Δ` = rumus §2.4 (pembalik murni: −isi O untuk penerimaan/stok masuk, +isi O untuk pengeluaran).
2. `Δ = 0` → **tidak ada** mutasi.
3. `Δ ≠ 0` → satu mutasi:
   - bahan ada di P → rujuk **P**;
   - bahan tidak ada di P (hanya di R, termasuk pembalik murni) → rujuk **R**.
4. Mutasi tidak pernah merujuk O (O sudah memiliki mutasinya sendiri saat dicatat).
5. Rekonsiliasi I-8(a): Σ mutasi operasi untuk `m` = Σ baris(P,m) − Σ baris(R,m) (penerimaan/stok masuk; = jumlah
   bertanda) atau Σ baris(R,m) − Σ baris(P,m) (pengeluaran; = −jumlah bertanda). Contoh pengeluaran: O 10, koreksi ke 8
   → R 10, P 8 → mutasi +2 (stok kembali 2), merujuk P.

Contoh multi-bahan (penerimaan PO dengan item tepung & gula; O: tepung 10, gula 5; P: tepung 9, gula —):
mutasi tepung −1 rujuk P; mutasi gula −5 rujuk R; I-8(a): tepung 9 − 10 = −1 ✓, gula 0 − 5 = −5 ✓.

### 4.4 Status PO
PO bukan Dibatalkan: status dari jumlah bersih diterima (0 → Dipesan; sebagian → Diterima Sebagian; semua penuh →
Diterima). PO Dibatalkan tetap Dibatalkan; `qty_cancelled` tidak berubah.

---

## 5. Idempotensi (T-36)

### 5.1 Matriks final
| Operasi | Endpoint | `request_id` | Keterkaitan |
|---|---|---|---|
| Buat supplier | `POST /api/admin/suppliers` | **Wajib** | `suppliers.created_request_id` NOT NULL |
| Ubah supplier | `PUT /api/admin/suppliers/:id` | Opsional | `operation_requests` (target supplier) bila dikirim |
| Aktif/nonaktif supplier | `PATCH /api/admin/suppliers/:id/active` | Opsional | sama |
| Buat PO | `POST /api/admin/purchase-orders` | **Wajib** | `purchase_orders.created_request_id` NOT NULL |
| Ubah PO Draft | `PUT /api/admin/purchase-orders/:id` | Opsional | `operation_requests` (target PO) bila dikirim |
| Transisi status PO | `PATCH /api/admin/purchase-orders/:id/status` | **Wajib** | `operation_requests` (target PO) |
| Penerimaan | `POST /api/admin/purchase-orders/:id/receipts` | **Wajib** | `goods_receipts.operation_request_id` NOT NULL |
| Pembalik / koreksi penerimaan | `POST /api/admin/goods-receipts/:id/reverse` · `/correct` | **Wajib** | NOT NULL (R & P sama) |
| Buat bahan (lama) | `POST /api/admin/raw-materials` | Opsional | `stock_adjustments(saldo_awal).operation_request_id` bila dikirim |
| Ubah bahan / koreksi stok (lama) | `PUT /api/admin/raw-materials/:id` | Opsional | `stock_adjustments(stock_opname)` bila ada perubahan stok; `operation_requests` (target bahan) bila dikirim |
| Catat Stok Masuk (lama) | `POST /api/admin/raw-materials/:id/stock-in` | Opsional | `stock_adjustments(stok_masuk).operation_request_id` bila dikirim |
| Stock opname (baru) | `POST /api/admin/raw-materials/:id/stock-counts` | **Wajib** | NOT NULL |
| Pembalik / koreksi stok masuk | `POST /api/admin/stock-adjustments/:id/reverse` · `/correct` | **Wajib** | NOT NULL |
| Buat WO | `POST /api/admin/work-orders` | **Wajib** | `work_orders.created_request_id` NOT NULL |
| Ubah WO Draft | `PUT /api/admin/work-orders/:id` | Opsional | `operation_requests` (target WO) bila dikirim |
| Transisi status WO (mulai/batal) | `PATCH /api/admin/work-orders/:id/status` | **Wajib** | `operation_requests` (target WO) |
| Pengeluaran | `POST /api/admin/work-orders/:id/issues` | **Wajib** | `material_issues.operation_request_id` NOT NULL |
| Pembalik / koreksi pengeluaran | `POST /api/admin/material-issues/:id/reverse` · `/correct` | **Wajib** | NOT NULL |
| Selesaikan WO | `POST /api/admin/work-orders/:id/complete` | **Wajib** | `production_outputs` (+ pengeluaran terakhir) NOT NULL |
| Pembalik / koreksi hasil | `POST /api/admin/production-outputs/:id/reverse` · `/correct` | **Wajib** | NOT NULL |

**Allowlist**: hanya endpoint pada tabel di atas yang menerima `request_id`. Semua endpoint lain — termasuk endpoint
lama di luar CR-04, GET, dan laporan — **menolak** `request_id` (field body maupun query) dengan **400** lewat satu
middleware global yang memeriksa allowlist; selain penolakan ini, perilaku endpoint tersebut tidak berubah. Endpoint
CR-04 juga memakai skema validasi ketat yang menolak field tak dikenal.

### 5.2 Kontrak (sama untuk wajib & opsional-yang-dikirim)
1. **Payload kanonik**: field operasi tanpa `request_id`; kunci diurutkan; string di-trim; desimal dinormalisasi lewat
   milli ke bentuk tetap (2 desimal untuk kuantitas/uang, 3 desimal untuk takaran); ID sebagai string desimal; array
   baris diurutkan menurut ID item/bahan. Hash = SHA-256 heksadesimal huruf kecil (UTF-8). Fungsi kanonik = aturan
   murni bersama client/server.
2. Validasi format → 400 (tidak disimpan).
3. Transaksi: kunci pelaku → `INSERT operation_requests` (aktor, operasi, target, hash, **nilai sementara**
   `response_status = 102`, `response_body = {"status":"in_progress"}` — memenuhi `NOT NULL` & `ck_opreq_fmt`) →
   proses → `UPDATE operation_requests` menjadi **respons final** (status 2xx & body yang dikirim ke client) → COMMIT.
   Nilai sementara **tidak pernah ter-commit**: hanya terlihat di dalam transaksi itu sendiri; transaksi lain yang
   menunggu kunci unik baru membaca baris setelah COMMIT (berisi respons final) atau tidak menemukan baris (rollback).
   Respons final yang tersimpan selalu 2xx karena penolakan & error tidak di-commit (langkah 5). Uji implementasi
   memastikan tidak ada baris `response_status = 102` setelah transaksi selesai.
4. Duplikat `request_id`:
   - aktor, operasi, target, hash sama → **replay**: status & body identik respons asli + header `Idempotent-Replay: true`; tanpa tulisan.
   - salah satu berbeda → **409 `REQUEST_ID_REUSED`**.
   - asli masih berjalan (menunggu kunci unik > 2 s) → **409 `REQUEST_IN_PROGRESS`** (boleh dicoba ulang dengan `request_id` sama).
5. Penolakan bisnis (400/409) atau error 5xx dalam transaksi → rollback; `operation_requests` tidak tersimpan; kirim
   ulang dievaluasi ulang.
6. Endpoint opsional **tanpa** `request_id` → perilaku lama/biasa, tanpa penyimpanan `operation_requests`.
7. Retensi tanpa batas waktu (prototype); mode mock menerapkan aturan yang sama di localStorage.

### 5.3 Kompatibilitas client lama AD-07
Client lama tanpa `request_id` tetap dilayani (dokumen + mutasi tetap ditulis, `*_request_id` NULL, tanpa
perlindungan duplikasi). UI AD-07 versi CR-04a selalu mengirim `request_id` dan memakai endpoint opname baru.
Duplikasi stok masuk dari client lama diperbaiki dengan pembalik stok masuk; kesalahan opname dengan opname baru.

---

## 6. Nilai pembelian

| Nilai | Definisi | Dasar tanggal |
|---|---|---|
| Nilai baris PO | `round(qty_ordered × unit_price)` | — |
| Nilai PO | Σ nilai baris PO | `ordered_at` |
| Nilai penerimaan | Σ per **baris mutasi** penerimaan/pembalik/koreksi: `round(qty_change × unit_price item)` (bertanda) | `created_at` mutasi |
| Nilai sisa dibatalkan | Σ per item `round(qty_cancelled × unit_price)`; `qty_cancelled` = dipesan − bersih diterima saat pembatalan, disimpan | `cancelled_at` |

`round` = setengah menjauhi nol ke 2 desimal, **per baris** (= `ROUND()` MySQL pada DECIMAL), dihitung eksak dalam
BigInt 1/10.000 Rupiah. Nilai tidak disimpan (kecuali kuantitas historis `qty_cancelled`); satu fungsi aturan murni
dipakai API, mode mock, dan laporan. Pembalik murni menghasilkan nilai tepat negatif nilai asal. Nilai pembelian bukan
omzet dan tidak dikurangkan dari omzet.

## 7. Supplier (K02 + T-01, K03, T-15)

| Field | Status | Validasi |
|---|---|---|
| Nama | Wajib | 1 – 100 (setelah trim); unik (kolasi tidak membedakan huruf besar/kecil) |
| Telepon/WhatsApp | Wajib | format telepon yang dipakai project, ≤ 20 |
| Alamat | Wajib | 1 – 255 |
| Email | Wajib | format email, ≤ 100 |
| Kontak person | Wajib | 1 – 100 |
| Catatan | Opsional | ≤ 255 |
| Status aktif | Dikelola sistem; default aktif | aksi aktif/nonaktif |
| Daftar bahan | Opsional saat dibuat | bahan dari master AD-07, tanpa duplikat |

PO hanya untuk supplier aktif dengan ≥ 1 bahan terdaftar dan hanya bahan terdaftar. Supplier tidak dihapus.
Perubahan daftar bahan/status supplier tidak memengaruhi PO yang sudah Dipesan.

---

## 8. Work Order & hasil produksi (T-33, T-37)

### 8.1 Siklus WO
| Status | Aksi | Efek |
|---|---|---|
| Draft | ubah, mulai, batal | — |
| Diproses | pengeluaran 0..n, pembalik/koreksi pengeluaran, selesai, batal | stok bahan berkurang per pengeluaran |
| Selesai | pembalik/koreksi pengeluaran & hasil | dokumen pembalik/koreksi saja |
| Dibatalkan | pembalik/koreksi pengeluaran | dokumen pembalik/koreksi saja; tidak ada dokumen hasil |

Draft → Diproses menyalin `product_materials` ke `work_order_recipes` dan mengisi `recipe_snapshot_at` (juga bila
kosong). Transisi memakai `{from, to}` + kunci baris WO + `request_id`.

### 8.2 Dokumen hasil
| Aturan | Isi |
|---|---|
| Pembuatan | Dokumen `normal` hanya oleh **Selesaikan WO**; tepat satu `normal` per WO (UNIQUE `normal_wo_id`) |
| Hasil 0 | Sah pada `normal`; WO Selesai |
| Kasus 1: 0 → q (q = 1 – 10.000) | **Pengganti langsung** P (`replaces_id = O`, tanpa R); syarat qty O = 0 |
| Kasus 2: p → q (p, q > 0, p ≠ q) | R (qty p) + P (qty q) atomik |
| Kasus 3: p → 0 (p > 0) | **R saja** (pembalik murni) |
| Ditolak | pembalik dokumen qty 0; pengganti langsung atas dokumen qty > 0; koreksi 0 → 0; koreksi ke nilai yang sama |
| Kondisi terminal | Setelah kasus 3 (p → 0 dengan R), rantai dokumen hasil WO **tidak memiliki dokumen berlaku** (O dibalik; R bukan dokumen berlaku). Pembalik, koreksi, dan pengganti berikutnya ditolak **409 `DOCUMENT_ALREADY_SUPERSEDED`**; penyelesaian ulang tidak mungkin (WO Selesai). Hasil bersih WO tetap 0. Produksi yang kemudian terjadi dicatat dengan **WO baru**. (Berbeda dengan dokumen `normal` qty 0 yang belum dibalik: dokumen itu masih berlaku dan dapat diganti langsung — kasus 1.) |
| Status WO | Tidak berubah oleh pembalik/koreksi hasil (tetap Selesai) |
| WO Dibatalkan | Tidak memiliki dokumen hasil |

### 8.3 Hasil bersih WO
`hasil_bersih(WO) = Σ qty(normal) + Σ qty(pengganti) − Σ qty(pembalik)` atas semua dokumen hasil WO.
Kebenaran untuk ketiga kasus: kasus 1 → 0 + q − 0 = q; kasus 2 → p + q − p = q; kasus 3 → p − p = 0. Karena pengganti
langsung hanya untuk dokumen qty 0 dan setiap dokumen dibalik/diganti paling banyak sekali, hasil bersih selalu sama
dengan qty dokumen berlaku terakhir (0 bila tidak ada dokumen berlaku) dan ∈ [0, 10.000].

### 8.4 Standar, aktual, selisih (T-37)
- `standar(WO, m) = snapshot.qty_per_unit(m) × hasil_bersih(WO)` — milli-satuan BigInt, eksak 3 desimal, ∈ [0, 99.999.999.990,000].
- `aktual(WO, m) = Σ jumlah bertanda dokumen pengeluaran` (normal/pengganti +, pembalik −) — **positif** (I-5), 2 desimal (milli kelipatan 10); sama dengan **−Σ mutasi pengeluaran** WO itu untuk bahan `m` (I-8(b)). Mutasi pengeluaran adalah pengurang stok (negatif); pemakaian aktual dilaporkan sebagai bilangan positif.
- `selisih(WO, m) = aktual − standar` — milli, 3 desimal, bertanda (+ = lebih banyak dari standar).
- Aktual dapat melampaui standar karena merupakan akumulasi seluruh dokumen pengeluaran bertanda; tidak ada batas kumulatif per WO tersendiri dalam aturan ini. Nilai aktual dan selisih dihitung dengan BigInt milli dan wajib diserialisasi melalui pemeriksaan bolak-balik eksak `milliToNumber`. `REPORT_AGGREGATE_LIMIT` berlaku pada nilai yang termasuk agregat laporan menurut §3 aturan 6.
- Bahan di aktual tetapi tidak di snapshot → standar 0; bahan di snapshot tetapi tidak dikeluarkan → aktual 0.
- Snapshot kosong → standar 0, ditandai "tanpa komposisi".
- Kontribusi per periode: standar dari setiap dokumen hasil = `snapshot(m) × qty bertanda dokumen` pada
  `recorded_at`; aktual dari mutasi/baris pengeluaran pada tanggal pencatatannya. Σ seluruh periode = nilai WO.

### 8.5 K13
Dokumen hasil tidak menulis `daily_stocks`, `products`, `orders`, `order_items`, dan tidak memengaruhi checkout,
pembatalan, auto-cancel, TF-12, `PRODUCTION_STATUSES`, AD-05, atau katalog. Stok produk siap jual tetap direncanakan
di AD-07.

---

## 9. Reporting (CR-04c)

| Laporan | Dasar tanggal (WIB) | Isi |
|---|---|---|
| Pembelian dipesan | `ordered_at` | jumlah & nilai PO per supplier/bahan |
| Sisa dibatalkan | `cancelled_at` | `qty_cancelled` & nilai historis |
| Penerimaan | `created_at` mutasi penerimaan/pembalik/koreksi | kuantitas & nilai bersih |
| Mutasi stok | `created_at` mutasi | per jenis (stok masuk, opname, penerimaan, pengeluaran, pembalik, koreksi) |
| Pemakaian | aktual: `created_at` mutasi pengeluaran/pembalik/koreksi, dilaporkan sebagai **−qty_change** (positif = bahan terpakai; pembalik/koreksi yang mengembalikan stok tampil negatif pada periodenya); standar: `recorded_at` dokumen hasil | **tiga kolom terpisah**: standar (3 desimal), aktual (2 desimal, positif), selisih = aktual − standar (3 desimal, bertanda); agregasi BigInt milli |
| Hasil produksi | `recorded_at` dokumen hasil | hasil bersih; label "dikoreksi" bila ada pembalik/pengganti |
| Rencana vs hasil | rencana `production_date`; hasil tanggal pencatatan | berdampingan |
| Analisis | estimasi FR-40 apa adanya + selisih standar vs aktual | tanpa rumus baru |
| Omzet pembanding | aturan AD-08 apa adanya (`orders.created_at`, lunas & tidak dibatalkan) | tidak diubah |

Pembalik/koreksi masuk periode tanggal pencatatannya; periode lampau tidak berubah. Opname tanpa selisih tampil di
riwayat bahan, bukan di agregat mutasi. Seluruh agregat satu respons dibaca dalam satu `runInReadSnapshot`
(termasuk `getSalesOrders(tx, …)` AD-08); agregasi kuantitas dalam BigInt milli (T-37); ekspor = respons yang sama;
tab Penjualan & `/reports/sales` tidak berubah; tidak ada sumber omzet baru. Batas agregat & serialisasi mengikuti §3
aturan 6: magnitudo agregat (termasuk nilai negatif) di atas batas kebijakan → 422 `REPORT_AGGREGATE_LIMIT`;
kehilangan presisi terdeteksi → 500
`MILLI_PRECISION_LOST`; keduanya tanpa respons sebagian. Omzet pembanding dari AD-08 dibandingkan dengan batas rupiah
yang sama.

---

## 10. Pengendalian internal

### 10.1 Urutan kunci global
| No | Objek | Mode |
|---|---|---|
| 1 | `users` pelaku | FOR SHARE |
| 2 | `operation_requests` | INSERT (kunci unik) |
| 3 | `store_settings` | FOR UPDATE — ubah master (supplier, bahan, koreksi stok jalur lama, opname) |
| 4 | `suppliers` (baris) | FOR UPDATE (ubah) / FOR SHARE (buat/ubah/pesan PO) |
| 5 | `supplier_materials` (supplier itu) | FOR UPDATE / FOR SHARE |
| 6 | Dokumen induk `purchase_orders` **atau** `work_orders` (satu per transaksi) | FOR UPDATE |
| 7 | Dokumen asal O (`goods_receipts` / `material_issues` / `production_outputs` / `stock_adjustments`) | FOR UPDATE |
| 8 | `raw_materials` | FOR UPDATE, urut `material_id` naik |
| 9 | INSERT dokumen & baris → INSERT mutasi → UPDATE stok → UPDATE status → INSERT audit → simpan respons |

Jalur: stok masuk lama 1 → (2) → 8; opname & koreksi stok lama 1 → (2) → 3 → 8; pembalik/koreksi stok masuk 1 → 2 → 7
→ 8; penerimaan 1 → 2 → 6 (→ 7) → 8; pengeluaran/hasil 1 → 2 → 6 (→ 7) → 8; mulai WO (snapshot, baca konsisten
`product_materials`) 1 → 2 → 6; komposisi CR-03 1 → 3; checkout tidak mengunci 4 – 8. Tidak ada jalur yang mengunci objek
bernomor lebih kecil setelah objek bernomor lebih besar. Lock wait 2 s; 1205/1213 → rollback penuh.

### 10.2 Transaksi, rollback, audit
Satu operasi = satu transaksi interaktif; validasi diulang setelah kunci; kegagalan → rollback penuh (dokumen, mutasi,
stok, status, audit, `operation_requests`). Satu `audit_logs` per operasi: `create_supplier`, `update_supplier`,
`set_supplier_active`, `create_purchase_order`, `update_purchase_order`, `order_purchase_order`,
`cancel_purchase_order`, `receive_purchase_order`, `reverse_goods_receipt`, `correct_goods_receipt`, `count_stock`,
`reverse_stock_in`, `correct_stock_in`, `create_work_order`, `update_work_order`, `start_work_order`,
`cancel_work_order`, `issue_material`, `reverse_material_issue`, `correct_material_issue`, `complete_work_order`,
`reverse_production_output`, `correct_production_output`; aksi AD-07 lama tetap. Tanpa layar audit.

---

## 11. Migrasi (T-39)

### 11.1 Arsitektur koneksi saat ini (diperiksa di repository)
- Server memakai **satu** `DATABASE_URL` (Prisma) — contoh `.env.example` memakai akun `root`; migrasi produksi (`prisma
  migrate deploy`) dijalankan dengan URL yang sama.
- Penulis basis data: (1) proses API Express, yang **di dalamnya** juga menjalankan job `node-cron` pembatalan otomatis
  dan menerima webhook pembayaran simulasi (`payment.routes.js`); (2) proses manual: `prisma db seed`, Prisma Studio,
  harness uji. Tidak ada worker terpisah.
- Harness uji (`tests-mysql/run.sh`) sudah memodelkan pemisahan akun: `root` untuk migrasi, `c4app` untuk aplikasi.

### 11.2 Prasyarat operasional & evaluasi fencing
| ID | Prasyarat |
|---|---|
| P-OPS-1 | **Akun aplikasi** (hak DML pada database aplikasi saja, tanpa `SUPER`/`CONNECTION_ADMIN`) terpisah dari **akun migrasi** (DDL: CREATE, ALTER, INDEX, REFERENCES, DROP + DML). `DATABASE_URL` server memakai akun aplikasi; migrasi memakai `DATABASE_URL` akun migrasi hanya untuk perintah migrasi (pola harness `c4app`/`root`) |
| P-OPS-2 | Akun administratif (dapat sama dengan akun migrasi) yang dapat `ALTER USER … ACCOUNT LOCK/UNLOCK`, membaca seluruh thread melalui privilege `PROCESS`, membaca `information_schema` yang diperlukan, menjalankan `mysqldump`, serta menghentikan sesi akun lain dengan `KILL` (memiliki `CONNECTION_ADMIN` atau `SUPER` sesuai versi/konfigurasi MySQL); kredensialnya hanya dipegang operator deployment |
| P-OPS-3 | MySQL ≥ 8.0.16 (CHECK ditegakkan) |
| P-OPS-4 | Ruang disk untuk backup + database restore uji |

**Evaluasi fencing tanpa akun terpisah (alasan Mode B dihapus).** Arsitektur saat ini memakai satu `DATABASE_URL` (contoh:
`root`). Mekanisme yang dievaluasi:
| Mekanisme | Hasil evaluasi |
|---|---|
| Hentikan proses + `SHOW PROCESSLIST`/`innodb_trx` berulang | Hanya **mendeteksi**, tidak mencegah koneksi baru setelah pemeriksaan → tidak memadai |
| `SET GLOBAL offline_mode = ON` | Tidak memutus/menolak akun dengan `SUPER`/`CONNECTION_ADMIN` (mis. `root` yang dipakai aplikasi) → tidak menjamin |
| `SET GLOBAL super_read_only = ON` | Menghalangi juga migrasi; mematikannya untuk migrasi membuka kembali penulisan aplikasi → tidak menjamin |
| Mengunci/mengganti kredensial akun bersama | Juga mengunci operator yang memakai akun yang sama; secara praktis sama dengan menyiapkan akun terpisah (P-OPS-1) dan berisiko mengunci akses → tidak dipakai sebagai jalur terpisah |
| `ACCOUNT LOCK` pada akun aplikasi terpisah + `KILL` | Menolak login baru langsung sebagai akun aplikasi dan memutus sesi langsung yang ada; akun migrasi tetap bekerja. Efektivitas untuk seluruh jalur tulis bergantung pada inventaris dan penutupan proxy user, stored program/view ber-`DEFINER` akun aplikasi, serta akun/jalur penulis lain → **fencing hanya dinyatakan lulus setelah cakupan tersebut diverifikasi** |

Kesimpulan: **hanya satu jalur deployment yang diizinkan** — akun aplikasi terpisah dikunci selama backup & migrasi
(sebelumnya "Mode A"). Pemblokiran tingkat proses ("Mode B" pada Draft 0.8.1) **dihapus** dan tidak dapat diaktifkan
dengan persetujuan tertulis. `ACCOUNT LOCK` bukan pengganti inventaris jalur akses: sebelum deployment, operator wajib
memastikan tidak ada proxy user yang dapat bertindak sebagai akun aplikasi, tidak ada stored program/view yang dapat
menulis menggunakan hak `DEFINER` akun aplikasi melalui pemanggil lain, dan seluruh akun/jalur penulis lain telah
diinventarisasi serta dihentikan atau difencing. Bila kondisi itu tidak dapat dibuktikan, deployment **tidak dilakukan**.
Bila lingkungan target belum memenuhi P-OPS-1 – P-OPS-4, operator lebih dulu menyiapkan prasyarat (perubahan konfigurasi
deployment, di luar implementasi CR-04).

### 11.3 Urutan CR-04a
| Langkah | Isi | Bukti |
|---|---|---|
| M-0 Persiapan (server berjalan) | Kueri hanya baca: stok ∈ [0, batas], tanpa NULL; versi MySQL; migrasi CR-03 diterapkan; P-OPS-1 – P-OPS-4 terverifikasi (server memakai akun aplikasi; akun aplikasi tanpa `SUPER`/`CONNECTION_ADMIN`; akun migrasi & administratif tersedia; akun administratif memiliki `PROCESS` dan hak `KILL` yang diperlukan); inventaris seluruh akun/jalur penulis, proxy user, serta stored program/view ber-`DEFINER` akun aplikasi selesai dan tidak menyediakan jalur tulis di luar fencing; ruang disk. Bila tidak terpenuhi → **berhenti** | Catatan |
| M-1 Maintenance & hentikan API | Umumkan maintenance; hentikan proses API (otomatis menghentikan job `node-cron` dan penerima webhook) | Proses tidak berjalan |
| M-2 Hentikan penulis lain | Hentikan/periksa Prisma Studio, seed, harness, skrip lain | Daftar proses |
| M-3 Fencing | `ALTER USER '<akun_aplikasi>'@'<host>' ACCOUNT LOCK` untuk setiap entri host akun aplikasi; `KILL` semua koneksi akun aplikasi; verifikasi login akun aplikasi ditolak | Hasil perintah |
| M-4 Pastikan tidak ada transaksi | `information_schema.innodb_trx` kosong; `SHOW PROCESSLIST` (dengan `PROCESS`) hanya sesi administratif/migrasi; tidak ada sesi atau jalur penulis lain yang belum difencing | Hasil kueri |
| M-5 Backup | `mysqldump --single-transaction --routines --triggers` (termasuk `_prisma_migrations`) dengan akun administratif; SHA-256 berkas | Berkas + hash |
| M-6 Verifikasi backup | Restore ke database sementara; bandingkan jumlah baris semua tabel, Σ `raw_materials.stock`, `CHECKSUM TABLE` tabel inti; hapus database sementara | Laporan |
| M-7 Migrasi | `DATABASE_URL=<akun_migrasi> npx prisma migrate deploy` (DDL 9 tabel, CHECK §12, FK `RESTRICT/RESTRICT`, `INSERT … SELECT` saldo awal — dokumen untuk semua bahan, mutasi hanya bila stok > 0) | Log |
| M-8 Validasi | Skrip hanya baca: I-1 – I-3, I-7, I-8, I-10; dokumen saldo awal = jumlah bahan; mutasi saldo awal = jumlah bahan dengan stok > 0; Σ stok = M-0; uji CHECK (INSERT melanggar dalam transaksi yang di-rollback); `db:check-spec` | Laporan |
| M-9 Buka & server baru | `ACCOUNT UNLOCK` akun aplikasi **hanya setelah M-8 lulus**; jalankan server CR-04a; uji asap (GET bahan, opname selisih 0, stok masuk dengan `request_id`, riwayat mutasi); akhiri maintenance | Catatan |

Fencing M-3 berlaku sejak sebelum backup sampai M-9, sehingga tidak ada koneksi penulis aplikasi (lama maupun baru) dan
tidak ada transaksi di antara backup dan migrasi.

### 11.4 Pemulihan
| Kondisi | Tindakan |
|---|---|
| Berhenti di M-0 | Tidak ada perubahan; server tetap berjalan; siapkan prasyarat lalu jadwalkan ulang |
| Gagal di M-1 – M-4 | Belum ada perubahan; `ACCOUNT UNLOCK` bila sudah dikunci; jalankan server versi lama; akhiri maintenance |
| Gagal di M-5 / M-6 | Belum ada perubahan skema; perbaiki penyebab; `ACCOUNT UNLOCK`; server versi lama |
| Gagal di M-7 / M-8 (sebelum M-9) | Akun aplikasi tetap terkunci → hapus & buat ulang database → restore backup M-5 → verifikasi seperti M-6 terhadap hasil restore (`_prisma_migrations` tanpa CR-04a; tidak perlu `migrate resolve`) → `ACCOUNT UNLOCK` → server versi lama → analisis |
| Masalah setelah M-9 (data baru tertulis) | **Fix-forward**; restore hanya atas keputusan eksplisit Pemilik Project yang menerima kehilangan data sejak M-9 |

### 11.5 CR-04b & CR-04c
CR-04b: urutan M-0 – M-9 (fencing akun aplikasi, §11.2 – §11.3) & pemulihan yang sama; M-7: 5 tabel CR-04b + perubahan `material_movements` (§12.3);
M-8: invarian CR-04a tetap lulus + CHECK CR-04b. CR-04c: tanpa migrasi.

---

## 12. Struktur database (T-34, T-35)

### 12.1 Ketentuan umum
- InnoDB; `utf8mb4` / `utf8mb4_unicode_ci`; waktu `DATETIME(3)`; PK BIGINT `AUTO_INCREMENT` kecuali disebut.
- **Semua FK CR-04: `ON DELETE RESTRICT ON UPDATE RESTRICT`.** Alasan: MySQL 8 menolak CHECK constraint pada kolom yang
  dipakai aksi FK `CASCADE`/`SET NULL` (error 3823), sedangkan beberapa kolom FK dipakai di CHECK; PK tidak pernah
  diubah sehingga `RESTRICT` tidak mengubah perilaku. Prisma: `onDelete: Restrict, onUpdate: Restrict`. FK tabel lama
  (sebelum CR-04) tidak diubah.
- CHECK tidak merujuk kolom `AUTO_INCREMENT` (larangan MySQL); aturan yang memerlukannya (mis. dokumen tidak membalik
  dirinya sendiri, PO/WO/bahan sama antara O dan R/P) ditegakkan aplikasi (T-28).
- **Pola anti-UNKNOWN**: setiap CHECK disusun sebagai disjungsi blok per `kind`/`status` (kolom ENUM NOT NULL), dan
  setiap blok memeriksa `IS NULL`/`IS NOT NULL` kolom terkait **sebelum** perbandingan nilai dalam konjungsi yang sama;
  sehingga setiap blok bernilai TRUE atau FALSE (konjungsi dengan FALSE = FALSE walau ada operand UNKNOWN), dan baris
  yang tidak cocok dengan blok mana pun ditolak. Kolom NOT NULL dapat dibandingkan langsung.
- Batas: `STOCK_MAX = 99999999.99`, `PRICE_MAX = 9999999999.99`, `QPU_MAX = 9999999.999`.
- `updated_at` diperbarui aplikasi (`@updatedAt`).

### 12.2 CR-04a (9 tabel; total 30 → 39)

**1. `operation_requests`**
| Kolom | Tipe | Null | Default |
|---|---|---|---|
| request_id | CHAR(36) | NO | — (PK) |
| operation | VARCHAR(40) | NO | — |
| actor_id | BIGINT | NO | — |
| target_type | VARCHAR(30) | YES | NULL |
| target_id | BIGINT | YES | NULL |
| payload_hash | CHAR(64) | NO | — |
| response_status | SMALLINT | NO | — (INSERT awal 102, diganti respons final sebelum COMMIT) |
| response_body | JSON | NO | — (INSERT awal `{"status":"in_progress"}`, diganti sebelum COMMIT) |
| created_at | DATETIME(3) | NO | CURRENT_TIMESTAMP(3) |
```sql
FOREIGN KEY (actor_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
CONSTRAINT ck_opreq_fmt CHECK (CHAR_LENGTH(request_id) = 36 AND CHAR_LENGTH(payload_hash) = 64
  AND CHAR_LENGTH(operation) > 0 AND response_status BETWEEN 100 AND 599),
CONSTRAINT ck_opreq_target CHECK ((target_type IS NULL AND target_id IS NULL)
  OR (target_type IS NOT NULL AND target_id IS NOT NULL)),
INDEX ix_opreq_actor (actor_id), INDEX ix_opreq_target (target_type, target_id)
```

**2. `suppliers`**
| Kolom | Tipe | Null | Default |
|---|---|---|---|
| supplier_id | BIGINT AI | NO | PK |
| name | VARCHAR(100) | NO | — |
| phone | VARCHAR(20) | NO | — |
| email | VARCHAR(100) | NO | — |
| address | VARCHAR(255) | NO | — |
| contact_person | VARCHAR(100) | NO | — |
| note | VARCHAR(255) | YES | NULL |
| is_active | BOOLEAN | NO | TRUE |
| created_by | BIGINT | NO | — |
| created_request_id | CHAR(36) | NO | — |
| created_at | DATETIME(3) | NO | CURRENT_TIMESTAMP(3) |
| updated_at | DATETIME(3) | NO | — |
```sql
UNIQUE KEY uq_supplier_name (name), UNIQUE KEY uq_supplier_req (created_request_id),
FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (created_request_id) REFERENCES operation_requests(request_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
CONSTRAINT ck_supplier_text CHECK (CHAR_LENGTH(TRIM(name)) > 0 AND CHAR_LENGTH(TRIM(phone)) > 0
  AND CHAR_LENGTH(TRIM(email)) > 0 AND CHAR_LENGTH(TRIM(address)) > 0 AND CHAR_LENGTH(TRIM(contact_person)) > 0),
INDEX ix_supplier_active (is_active)
```

**3. `supplier_materials`**
| Kolom | Tipe | Null |
|---|---|---|
| supplier_id | BIGINT | NO |
| material_id | BIGINT | NO |
```sql
PRIMARY KEY (supplier_id, material_id),
FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (material_id) REFERENCES raw_materials(material_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
INDEX ix_supmat_material (material_id)
```
Baris dapat dihapus saat daftar bahan supplier diubah (relasi, bukan riwayat).

**4. `purchase_orders`**
| Kolom | Tipe | Null | Default |
|---|---|---|---|
| po_id | BIGINT AI | NO | PK |
| po_number | VARCHAR(20) | NO | — |
| supplier_id | BIGINT | NO | — |
| status | ENUM('draft','dipesan','diterima_sebagian','diterima','dibatalkan') | NO | 'draft' |
| note | VARCHAR(255) | YES | NULL |
| ordered_at | DATETIME(3) | YES | NULL |
| cancelled_at | DATETIME(3) | YES | NULL |
| cancel_reason | VARCHAR(255) | YES | NULL |
| created_by | BIGINT | NO | — |
| created_request_id | CHAR(36) | NO | — |
| created_at | DATETIME(3) | NO | CURRENT_TIMESTAMP(3) |
| updated_at | DATETIME(3) | NO | — |
```sql
UNIQUE KEY uq_po_number (po_number), UNIQUE KEY uq_po_req (created_request_id),
FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (created_request_id) REFERENCES operation_requests(request_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
CONSTRAINT ck_po_status CHECK (
     (status = 'draft' AND ordered_at IS NULL AND cancelled_at IS NULL AND cancel_reason IS NULL)
  OR (status IN ('dipesan','diterima_sebagian','diterima') AND ordered_at IS NOT NULL
      AND cancelled_at IS NULL AND cancel_reason IS NULL)
  OR (status = 'dibatalkan' AND cancelled_at IS NOT NULL)),
INDEX ix_po_supplier (supplier_id), INDEX ix_po_status (status), INDEX ix_po_ordered (ordered_at),
INDEX ix_po_cancelled (cancelled_at)
```
(PO dibatalkan dari Draft: `ordered_at` NULL; dari Dipesan/Diterima Sebagian: `ordered_at` terisi — keduanya sah.)

**5. `purchase_order_items`**
| Kolom | Tipe | Null | Default |
|---|---|---|---|
| po_item_id | BIGINT AI | NO | PK |
| po_id | BIGINT | NO | — |
| material_id | BIGINT | NO | — |
| qty_ordered | DECIMAL(10,2) | NO | — |
| unit_price | DECIMAL(12,2) | NO | — |
| qty_cancelled | DECIMAL(10,2) | NO | 0.00 |
```sql
UNIQUE KEY uq_poi (po_id, material_id),
FOREIGN KEY (po_id) REFERENCES purchase_orders(po_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (material_id) REFERENCES raw_materials(material_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
CONSTRAINT ck_poi_values CHECK (qty_ordered > 0 AND qty_ordered <= 99999999.99
  AND unit_price > 0 AND unit_price <= 9999999999.99
  AND qty_cancelled >= 0 AND qty_cancelled <= qty_ordered),
INDEX ix_poi_material (material_id)
```
Baris diganti/dihapus hanya saat PO Draft (aplikasi).

**6. `goods_receipts`**
| Kolom | Tipe | Null | Default |
|---|---|---|---|
| receipt_id | BIGINT AI | NO | PK |
| po_id | BIGINT | NO | — |
| kind | ENUM('normal','pembalik','pengganti') | NO | — |
| reverses_id | BIGINT | YES | NULL |
| replaces_id | BIGINT | YES | NULL |
| reason | VARCHAR(255) | YES | NULL |
| note | VARCHAR(255) | YES | NULL |
| operation_request_id | CHAR(36) | NO | — |
| created_by | BIGINT | NO | — |
| created_at | DATETIME(3) | NO | CURRENT_TIMESTAMP(3) |
```sql
UNIQUE KEY uq_gr_reverses (reverses_id), UNIQUE KEY uq_gr_replaces (replaces_id),
FOREIGN KEY (po_id) REFERENCES purchase_orders(po_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (reverses_id) REFERENCES goods_receipts(receipt_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (replaces_id) REFERENCES goods_receipts(receipt_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (operation_request_id) REFERENCES operation_requests(request_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
CONSTRAINT ck_gr_kind CHECK (
     (kind = 'normal' AND reverses_id IS NULL AND replaces_id IS NULL AND reason IS NULL)
  OR (kind = 'pembalik' AND reverses_id IS NOT NULL AND replaces_id IS NULL
      AND reason IS NOT NULL AND CHAR_LENGTH(TRIM(reason)) > 0)
  OR (kind = 'pengganti' AND replaces_id IS NOT NULL AND reverses_id IS NULL
      AND reason IS NOT NULL AND CHAR_LENGTH(TRIM(reason)) > 0)),
INDEX ix_gr_po (po_id), INDEX ix_gr_opreq (operation_request_id), INDEX ix_gr_created (created_at)
```

**7. `goods_receipt_lines`**
| Kolom | Tipe | Null |
|---|---|---|
| line_id | BIGINT AI | NO (PK) |
| receipt_id | BIGINT | NO |
| po_item_id | BIGINT | NO |
| qty | DECIMAL(10,2) | NO |
```sql
UNIQUE KEY uq_grl (receipt_id, po_item_id),
FOREIGN KEY (receipt_id) REFERENCES goods_receipts(receipt_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (po_item_id) REFERENCES purchase_order_items(po_item_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
CONSTRAINT ck_grl_qty CHECK (qty > 0 AND qty <= 99999999.99),
INDEX ix_grl_item (po_item_id)
```

**8. `stock_adjustments`**
| Kolom | Tipe | Null | Default |
|---|---|---|---|
| adjustment_id | BIGINT AI | NO | PK |
| material_id | BIGINT | NO | — |
| kind | ENUM('saldo_awal','stok_masuk','pembalik_stok_masuk','pengganti_stok_masuk','stock_opname') | NO | — |
| qty | DECIMAL(10,2) | YES | NULL |
| counted_stock | DECIMAL(10,2) | YES | NULL |
| system_stock | DECIMAL(10,2) | YES | NULL |
| reverses_id | BIGINT | YES | NULL |
| replaces_id | BIGINT | YES | NULL |
| reason | VARCHAR(255) | YES | NULL |
| opening_material_id | BIGINT | YES | NULL |
| operation_request_id | CHAR(36) | YES | NULL |
| created_by | BIGINT | YES | NULL |
| created_at | DATETIME(3) | NO | CURRENT_TIMESTAMP(3) |
```sql
UNIQUE KEY uq_sa_reverses (reverses_id), UNIQUE KEY uq_sa_replaces (replaces_id),
UNIQUE KEY uq_sa_opening (opening_material_id),
FOREIGN KEY (material_id) REFERENCES raw_materials(material_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (reverses_id) REFERENCES stock_adjustments(adjustment_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (replaces_id) REFERENCES stock_adjustments(adjustment_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (operation_request_id) REFERENCES operation_requests(request_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
CONSTRAINT ck_sa_kind CHECK (
     (kind = 'saldo_awal' AND qty IS NOT NULL AND qty >= 0 AND qty <= 99999999.99
      AND counted_stock IS NULL AND system_stock IS NULL AND reverses_id IS NULL AND replaces_id IS NULL
      AND reason IS NULL AND opening_material_id IS NOT NULL AND opening_material_id = material_id)
  OR (kind = 'stok_masuk' AND qty IS NOT NULL AND qty > 0 AND qty <= 99999999.99
      AND counted_stock IS NULL AND system_stock IS NULL AND reverses_id IS NULL AND replaces_id IS NULL
      AND opening_material_id IS NULL AND created_by IS NOT NULL)
  OR (kind = 'pembalik_stok_masuk' AND qty IS NOT NULL AND qty > 0 AND qty <= 99999999.99
      AND counted_stock IS NULL AND system_stock IS NULL AND reverses_id IS NOT NULL AND replaces_id IS NULL
      AND reason IS NOT NULL AND CHAR_LENGTH(TRIM(reason)) > 0 AND opening_material_id IS NULL
      AND operation_request_id IS NOT NULL AND created_by IS NOT NULL)
  OR (kind = 'pengganti_stok_masuk' AND qty IS NOT NULL AND qty > 0 AND qty <= 99999999.99
      AND counted_stock IS NULL AND system_stock IS NULL AND replaces_id IS NOT NULL AND reverses_id IS NULL
      AND reason IS NOT NULL AND CHAR_LENGTH(TRIM(reason)) > 0 AND opening_material_id IS NULL
      AND operation_request_id IS NOT NULL AND created_by IS NOT NULL)
  OR (kind = 'stock_opname' AND qty IS NULL
      AND counted_stock IS NOT NULL AND counted_stock >= 0 AND counted_stock <= 99999999.99
      AND system_stock IS NOT NULL AND system_stock >= 0 AND system_stock <= 99999999.99
      AND reverses_id IS NULL AND replaces_id IS NULL AND opening_material_id IS NULL AND created_by IS NOT NULL)),
INDEX ix_sa_material (material_id, created_at), INDEX ix_sa_kind (kind)
```
Saldo awal dengan `qty = 0` sah sebagai dokumen; `created_by` NULL hanya mungkin untuk saldo awal migrasi;
`reason` stok masuk & opname bebas (opsional).

**9. `material_movements` (versi CR-04a)**
| Kolom | Tipe | Null | Default |
|---|---|---|---|
| movement_id | BIGINT AI | NO | PK |
| material_id | BIGINT | NO | — |
| type | ENUM('saldo_awal','stok_masuk','pembalik_stok_masuk','koreksi_stok_masuk','stock_opname','penerimaan','pembalik_penerimaan','koreksi_penerimaan') | NO | — |
| qty_change | DECIMAL(10,2) | NO | — |
| stock_before | DECIMAL(10,2) | NO | — |
| stock_after | DECIMAL(10,2) | NO | — |
| adjustment_id | BIGINT | YES | NULL |
| receipt_id | BIGINT | YES | NULL |
| po_item_id | BIGINT | YES | NULL |
| created_by | BIGINT | YES | NULL |
| created_at | DATETIME(3) | NO | CURRENT_TIMESTAMP(3) |
```sql
UNIQUE KEY uq_mm_adjustment (adjustment_id), UNIQUE KEY uq_mm_receipt_item (receipt_id, po_item_id),
FOREIGN KEY (material_id) REFERENCES raw_materials(material_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (adjustment_id) REFERENCES stock_adjustments(adjustment_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (receipt_id) REFERENCES goods_receipts(receipt_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (po_item_id) REFERENCES purchase_order_items(po_item_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
CONSTRAINT ck_mm_source CHECK (
     (type IN ('saldo_awal','stok_masuk','pembalik_stok_masuk','koreksi_stok_masuk','stock_opname')
      AND adjustment_id IS NOT NULL AND receipt_id IS NULL AND po_item_id IS NULL)
  OR (type IN ('penerimaan','pembalik_penerimaan','koreksi_penerimaan')
      AND receipt_id IS NOT NULL AND po_item_id IS NOT NULL AND adjustment_id IS NULL)),
CONSTRAINT ck_mm_sign CHECK (
     (type IN ('saldo_awal','stok_masuk','penerimaan') AND qty_change > 0)
  OR (type IN ('pembalik_stok_masuk','pembalik_penerimaan') AND qty_change < 0)
  OR (type IN ('koreksi_stok_masuk','stock_opname','koreksi_penerimaan') AND qty_change <> 0)),
CONSTRAINT ck_mm_balance CHECK (stock_after = stock_before + qty_change
  AND stock_before >= 0 AND stock_before <= 99999999.99
  AND stock_after >= 0 AND stock_after <= 99999999.99),
CONSTRAINT ck_mm_actor CHECK (type = 'saldo_awal' OR created_by IS NOT NULL),
INDEX ix_mm_material (material_id, movement_id), INDEX ix_mm_created (created_at),
INDEX ix_mm_type (type, created_at), INDEX ix_mm_item (po_item_id)
```
Kesesuaian `material_id` mutasi dengan `material_id` dokumen/item dirujuk ditegakkan aplikasi + uji (T-28).

### 12.3 CR-04b (5 tabel; total 39 → 44) + perubahan `material_movements`

**10. `work_orders`**
| Kolom | Tipe | Null | Default |
|---|---|---|---|
| wo_id | BIGINT AI | NO | PK |
| wo_number | VARCHAR(20) | NO | — |
| product_id | BIGINT | NO | — |
| production_date | DATE | NO | — |
| qty_planned | INT | NO | — |
| status | ENUM('draft','diproses','selesai','dibatalkan') | NO | 'draft' |
| note | VARCHAR(255) | YES | NULL |
| recipe_snapshot_at | DATETIME(3) | YES | NULL |
| started_at | DATETIME(3) | YES | NULL |
| completed_at | DATETIME(3) | YES | NULL |
| cancelled_at | DATETIME(3) | YES | NULL |
| created_by | BIGINT | NO | — |
| created_request_id | CHAR(36) | NO | — |
| created_at | DATETIME(3) | NO | CURRENT_TIMESTAMP(3) |
| updated_at | DATETIME(3) | NO | — |
```sql
UNIQUE KEY uq_wo_number (wo_number), UNIQUE KEY uq_wo_req (created_request_id),
FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (created_request_id) REFERENCES operation_requests(request_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
CONSTRAINT ck_wo_qty CHECK (qty_planned BETWEEN 1 AND 10000),
CONSTRAINT ck_wo_status CHECK (
     (status = 'draft' AND started_at IS NULL AND recipe_snapshot_at IS NULL
      AND completed_at IS NULL AND cancelled_at IS NULL)
  OR (status = 'diproses' AND started_at IS NOT NULL AND recipe_snapshot_at IS NOT NULL
      AND completed_at IS NULL AND cancelled_at IS NULL)
  OR (status = 'selesai' AND started_at IS NOT NULL AND recipe_snapshot_at IS NOT NULL
      AND completed_at IS NOT NULL AND cancelled_at IS NULL)
  OR (status = 'dibatalkan' AND completed_at IS NULL AND cancelled_at IS NOT NULL
      AND ((started_at IS NULL AND recipe_snapshot_at IS NULL)
        OR (started_at IS NOT NULL AND recipe_snapshot_at IS NOT NULL)))),
INDEX ix_wo_product (product_id), INDEX ix_wo_status (status), INDEX ix_wo_date (production_date)
```

**11. `work_order_recipes`**
| Kolom | Tipe | Null |
|---|---|---|
| wo_id | BIGINT | NO |
| material_id | BIGINT | NO |
| qty_per_unit | DECIMAL(10,3) | NO |
```sql
PRIMARY KEY (wo_id, material_id),
FOREIGN KEY (wo_id) REFERENCES work_orders(wo_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (material_id) REFERENCES raw_materials(material_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
CONSTRAINT ck_wor_qty CHECK (qty_per_unit > 0 AND qty_per_unit <= 9999999.999),
INDEX ix_wor_material (material_id)
```
Ditulis sekali saat mulai; tidak diubah.

**12. `material_issues`** — kolom & CHECK sama dengan `goods_receipts`, dengan `wo_id` menggantikan `po_id`:
```sql
UNIQUE KEY uq_mi_reverses (reverses_id), UNIQUE KEY uq_mi_replaces (replaces_id),
FOREIGN KEY (wo_id) REFERENCES work_orders(wo_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (reverses_id) REFERENCES material_issues(issue_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (replaces_id) REFERENCES material_issues(issue_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (operation_request_id) REFERENCES operation_requests(request_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
CONSTRAINT ck_mi_kind CHECK (
     (kind = 'normal' AND reverses_id IS NULL AND replaces_id IS NULL AND reason IS NULL)
  OR (kind = 'pembalik' AND reverses_id IS NOT NULL AND replaces_id IS NULL
      AND reason IS NOT NULL AND CHAR_LENGTH(TRIM(reason)) > 0)
  OR (kind = 'pengganti' AND replaces_id IS NOT NULL AND reverses_id IS NULL
      AND reason IS NOT NULL AND CHAR_LENGTH(TRIM(reason)) > 0)),
INDEX ix_mi_wo (wo_id), INDEX ix_mi_opreq (operation_request_id), INDEX ix_mi_created (created_at)
```
Kolom: issue_id BIGINT AI PK; wo_id BIGINT NO; kind ENUM NO; reverses_id/replaces_id BIGINT NULL; reason VARCHAR(255)
NULL; operation_request_id CHAR(36) NO; created_by BIGINT NO; created_at DATETIME(3) NO default CURRENT_TIMESTAMP(3).

**13. `material_issue_lines`**
| Kolom | Tipe | Null |
|---|---|---|
| line_id | BIGINT AI | NO (PK) |
| issue_id | BIGINT | NO |
| material_id | BIGINT | NO |
| qty | DECIMAL(10,2) | NO |
```sql
UNIQUE KEY uq_mil (issue_id, material_id),
FOREIGN KEY (issue_id) REFERENCES material_issues(issue_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (material_id) REFERENCES raw_materials(material_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
CONSTRAINT ck_mil_qty CHECK (qty > 0 AND qty <= 99999999.99),
INDEX ix_mil_material (material_id)
```

**14. `production_outputs`** (T-33)
| Kolom | Tipe | Null | Default |
|---|---|---|---|
| output_id | BIGINT AI | NO | PK |
| wo_id | BIGINT | NO | — |
| kind | ENUM('normal','pembalik','pengganti') | NO | — |
| qty_output | INT | NO | — |
| normal_wo_id | BIGINT | YES | NULL |
| reverses_id | BIGINT | YES | NULL |
| replaces_id | BIGINT | YES | NULL |
| reason | VARCHAR(255) | YES | NULL |
| operation_request_id | CHAR(36) | NO | — |
| created_by | BIGINT | NO | — |
| recorded_at | DATETIME(3) | NO | CURRENT_TIMESTAMP(3) |
```sql
UNIQUE KEY uq_po_normal (normal_wo_id), UNIQUE KEY uq_po_reverses (reverses_id), UNIQUE KEY uq_po_replaces (replaces_id),
FOREIGN KEY (wo_id) REFERENCES work_orders(wo_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (reverses_id) REFERENCES production_outputs(output_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (replaces_id) REFERENCES production_outputs(output_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (operation_request_id) REFERENCES operation_requests(request_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
CONSTRAINT ck_out_kind CHECK (
     (kind = 'normal' AND qty_output BETWEEN 0 AND 10000
      AND normal_wo_id IS NOT NULL AND normal_wo_id = wo_id
      AND reverses_id IS NULL AND replaces_id IS NULL AND reason IS NULL)
  OR (kind = 'pembalik' AND qty_output BETWEEN 1 AND 10000 AND normal_wo_id IS NULL
      AND reverses_id IS NOT NULL AND replaces_id IS NULL
      AND reason IS NOT NULL AND CHAR_LENGTH(TRIM(reason)) > 0)
  OR (kind = 'pengganti' AND qty_output BETWEEN 1 AND 10000 AND normal_wo_id IS NULL
      AND replaces_id IS NOT NULL AND reverses_id IS NULL
      AND reason IS NOT NULL AND CHAR_LENGTH(TRIM(reason)) > 0)),
INDEX ix_out_wo (wo_id), INDEX ix_out_recorded (recorded_at), INDEX ix_out_opreq (operation_request_id)
```
Aturan lintas baris (aplikasi + uji): pembalik hanya atas dokumen berlaku qty > 0 dan qty pembalik = qty asal;
pengganti langsung (tanpa R dalam operasi yang sama) hanya atas dokumen qty 0; R & P satu operasi atas O qty > 0.

**Perubahan `material_movements` (CR-04b, aditif)**
```sql
ALTER TABLE material_movements
  ADD COLUMN issue_id BIGINT NULL AFTER po_item_id,
  ADD CONSTRAINT fk_mm_issue FOREIGN KEY (issue_id) REFERENCES material_issues(issue_id)
      ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD UNIQUE KEY uq_mm_issue_material (issue_id, material_id),
  MODIFY type ENUM('saldo_awal','stok_masuk','pembalik_stok_masuk','koreksi_stok_masuk','stock_opname',
      'penerimaan','pembalik_penerimaan','koreksi_penerimaan',
      'pengeluaran_produksi','pembalik_pengeluaran','koreksi_pengeluaran') NOT NULL,
  DROP CHECK ck_mm_source, DROP CHECK ck_mm_sign;
ALTER TABLE material_movements
  ADD CONSTRAINT ck_mm_source CHECK (
       (type IN ('saldo_awal','stok_masuk','pembalik_stok_masuk','koreksi_stok_masuk','stock_opname')
        AND adjustment_id IS NOT NULL AND receipt_id IS NULL AND po_item_id IS NULL AND issue_id IS NULL)
    OR (type IN ('penerimaan','pembalik_penerimaan','koreksi_penerimaan')
        AND receipt_id IS NOT NULL AND po_item_id IS NOT NULL AND adjustment_id IS NULL AND issue_id IS NULL)
    OR (type IN ('pengeluaran_produksi','pembalik_pengeluaran','koreksi_pengeluaran')
        AND issue_id IS NOT NULL AND adjustment_id IS NULL AND receipt_id IS NULL AND po_item_id IS NULL)),
  ADD CONSTRAINT ck_mm_sign CHECK (
       (type IN ('saldo_awal','stok_masuk','penerimaan','pembalik_pengeluaran') AND qty_change > 0)
    OR (type IN ('pembalik_stok_masuk','pembalik_penerimaan','pengeluaran_produksi') AND qty_change < 0)
    OR (type IN ('koreksi_stok_masuk','stock_opname','koreksi_penerimaan','koreksi_pengeluaran')
        AND qty_change <> 0));
```
`ck_mm_balance` dan `ck_mm_actor` tetap. Data CR-04a memenuhi CHECK baru (`issue_id` NULL).

### 12.4 Ringkasan jumlah tabel
| Tahap | Tabel baru | Total |
|---|---|---|
| CR-04a | 9 (`operation_requests`, `suppliers`, `supplier_materials`, `purchase_orders`, `purchase_order_items`, `goods_receipts`, `goods_receipt_lines`, `stock_adjustments`, `material_movements`) | 39 |
| CR-04b | 5 (`work_orders`, `work_order_recipes`, `material_issues`, `material_issue_lines`, `production_outputs`) | 44 |
| CR-04c | 0 | 44 |

---

## 13. Business rules (usulan)

| Kode | Aturan |
|---|---|
| BR-17 | Supplier tidak dihapus; dinonaktifkan; data wajib K02 + T-01; daftar bahan opsional saat dibuat |
| BR-18 | PO hanya untuk supplier aktif dengan ≥ 1 bahan terdaftar; hanya bahan terdaftar; satu bahan sekali; 1 – 30 item |
| BR-19 | Status PO per K04; ubah hanya Draft; status (kecuali Dibatalkan) dari jumlah bersih diterima |
| BR-20 | Bersih diterima per item ∈ [0, dipesan − dibatalkan] |
| BR-21 | Pembatalan menyimpan `qty_cancelled` historis; penerimaan tetap; pengganti pada PO Dibatalkan hanya mengurangi |
| BR-22 | Nilai PO, penerimaan (dari mutasi), sisa dibatalkan (historis); pembulatan setengah menjauhi nol per baris; satu fungsi |
| BR-23 | Setiap perubahan stok = dokumen sumber + satu mutasi bersih (≠ 0) per bahan per operasi dalam transaksi yang sama; mutasi merujuk dokumen menurut §4.3; tanda mutasi: penerimaan & stok masuk = +jumlah bertanda, pengeluaran = −jumlah bertanda; append-only; invarian I-1 – I-10 |
| BR-24 | Setiap mutasi menjaga 0 ≤ stok ≤ 99.999.999,99; operasi yang melanggar ditolak seluruhnya |
| BR-25 | Status WO: Draft → Diproses → Selesai; Draft/Diproses → Dibatalkan; final tidak diproses ulang |
| BR-26 | Stok bahan berkurang hanya oleh pengeluaran; tanpa reservasi; FR-40 tidak menulis stok (BR-15) |
| BR-27 | Snapshot resep disalin saat mulai; standar = snapshot × hasil bersih (≤ 99.999.999.990,000 per bahan per WO); aktual = jumlah bertanda dokumen pengeluaran (positif) = −Σ mutasi pengeluaran; selisih = aktual − standar (milli) |
| BR-28 | WO batal: pengeluaran tetap; tidak ada dokumen hasil; hasil bersih 0 |
| BR-29 | Hasil produksi tidak mengubah stok jual, `daily_stocks`, pesanan, checkout, pembatalan, `PRODUCTION_STATUSES`, AD-05 |
| BR-30 | Dokumen berlaku penerimaan/pengeluaran/stok masuk: pembalik penuh sekali atau koreksi (R + P) sekali; hasil produksi: tiga kasus §8.2; saldo awal & opname tidak dapat dibalik/dikoreksi |
| BR-31 | `request_id` wajib/opsional per allowlist §5.1; bila dikirim — wajib maupun opsional — kontrak §5.2 berlaku penuh (nilai sementara 102 tidak pernah ter-commit); di luar allowlist, termasuk endpoint lama, `request_id` ditolak 400 |
| BR-32 | FR-40 tidak berubah (BR-14 – BR-16); teks keterangan per tahap §19 |
| BR-33 | Laporan operasional: periode AD-08, dasar tanggal §9, satu snapshot, standar/aktual/selisih terpisah; omzet hanya aturan AD-08 |
| BR-34 | Semua operasi tulis Purchasing, Manufacturing, dan dokumen AD-07 tercatat di `audit_logs` dalam transaksi yang sama |
| BR-35 | Opname mencatat stok fisik absolut (boleh 0) & stok sistem; mutasi = selisih; dokumen tetap dicatat bila selisih 0; dikendalikan `expected_stock` (§2.7) |
| BR-36 | Hasil produksi: satu `normal` per WO lewat penyelesaian; hasil 0 sah; koreksi 0 → q dengan pengganti langsung, p → q dengan R + P, p → 0 dengan R; p → 0 adalah kondisi terminal (koreksi berikutnya ditolak; produksi baru memakai WO baru) |

## 14. Validation rules

| Fitur | Aturan | Perilaku |
|---|---|---|
| Supplier | §7 | 400 per field |
| PO | supplier aktif & ≥ 1 bahan; 1 – 30 item; bahan terdaftar; qty string > 0, ≤ 2 desimal, ≤ 99.999.999,99; harga string > 0, ≤ 2 desimal, ≤ 9.999.999.999,99; nilai baris & PO ≤ 9.999.999.999,99 | 400 `items.<i>.*` |
| Transisi PO | `{from, to}` sesuai BR-19 | 409 |
| Penerimaan | PO Dipesan/Diterima Sebagian; ≥ 1 baris qty > 0, ≤ 2 desimal; ≤ sisa; saldo akhir ≤ batas | 400 / 409 |
| Pembalik | O berlaku & jenis dapat dibalik (§2.5, hasil qty > 0); alasan 1 – 255; saldo akhir ∈ [0, batas] | 400 / 409 |
| Koreksi | O berlaku (bila tidak ada dokumen berlaku — mis. kondisi terminal hasil — 409 `DOCUMENT_ALREADY_SUPERSEDED`); alasan; kasus §4.2 (P ≥ 1 baris qty > 0; hasil: P 1 – 10.000; pengganti langsung hanya atas hasil 0); aturan dokumen sejenis; saldo akhir ∈ [0, batas] | 400 / 409 |
| Stock opname (baru) | `counted_stock` & `expected_stock` wajib, string desimal ≥ 0, ≤ 2 desimal, ≤ 99.999.999,99, dinormalisasi ke milli; `expected_stock` ≠ stok terkunci → 409 `STOCK_CHANGED` | 400 / 409 |
| Stok masuk & PUT bahan (lama) | aturan AD-07 yang ada | lama |
| WO | produk aktif; rencana bilangan bulat 1 – 10.000; tanggal T … T+29 WIB | 400 |
| Mulai / batal WO | `{from, to}` | 409 |
| Pengeluaran | WO Diproses; 1 – 30 bahan tanpa duplikat; qty string > 0, ≤ 2 desimal; saldo akhir ≥ 0 | 400 / 409 |
| Selesai WO | WO Diproses; hasil bilangan bulat 0 – 10.000 (menjamin standar ≤ 99.999.999.990,000 per bahan); pengeluaran terakhir opsional | 400 / 409 |
| `request_id` | UUID v4 kanonik; wajib/opsional per §5.1; tidak dikenal pada endpoint di luar daftar | 400; 409 `REQUEST_ID_REUSED` / `REQUEST_IN_PROGRESS` |
| Laporan | periode AD-08 (400); magnitudo agregat kuantitas > 999.999.999.999,999 atau magnitudo rupiah > 9.999.999.999.999,99 (termasuk nilai negatif) → 422 `REPORT_AGGREGATE_LIMIT`; kehilangan presisi terdeteksi saat serialisasi → 500 `MILLI_PRECISION_LOST` (§3 aturan 6) | 400 / 422 / 500 |

## 15. API (usulan; Staf & Owner kecuali disebut)

| Tahap | Endpoint |
|---|---|
| CR-04a | `GET/POST /api/admin/suppliers`; `PUT /api/admin/suppliers/:id`; `PATCH /api/admin/suppliers/:id/active` |
| CR-04a | `GET/POST /api/admin/purchase-orders`; `GET/PUT /api/admin/purchase-orders/:id` (PUT Draft); `PATCH /api/admin/purchase-orders/:id/status` |
| CR-04a | `POST /api/admin/purchase-orders/:id/receipts`; `POST /api/admin/goods-receipts/:id/reverse`; `POST /api/admin/goods-receipts/:id/correct` |
| CR-04a | `GET /api/admin/raw-materials/:id/movements`; `POST /api/admin/raw-materials/:id/stock-counts`; `POST /api/admin/stock-adjustments/:id/reverse`; `POST /api/admin/stock-adjustments/:id/correct`; endpoint `raw-materials` lama: kontrak tetap + `request_id` opsional (§5.1) |
| CR-04b | `GET/POST /api/admin/work-orders`; `GET/PUT /api/admin/work-orders/:id`; `PATCH /api/admin/work-orders/:id/status`; `POST /api/admin/work-orders/:id/issues`; `POST /api/admin/work-orders/:id/complete`; `POST /api/admin/material-issues/:id/reverse` · `/correct`; `POST /api/admin/production-outputs/:id/reverse` · `/correct`; `GET /api/admin/work-orders/plan-source?date=` |
| CR-04c | `GET /api/admin/reports/operations?period=…` (Owner) |

Kode error: `REQUEST_ID_REUSED`, `REQUEST_IN_PROGRESS`, `DOCUMENT_ALREADY_SUPERSEDED` (O tidak berlaku lagi),
`STOCK_OUT_OF_RANGE` (409, daftar bahan), `STOCK_CHANGED` (409 opname), `REPORT_AGGREGATE_LIMIT` (422, laporan
operasional — batas kebijakan agregat), `MILLI_PRECISION_LOST` (500, kehilangan presisi terdeteksi), `SESSION_INVALID`,
`INVALID_ID`.

## 16. Acceptance criteria (usulan)

### CR-04a
- AC-41.1 Supplier (field T-01; tanpa daftar bahan boleh); pelanggan 403; tanpa token 401.
- AC-41.2 PO ditolak untuk supplier tanpa bahan atau bahan di luar daftar.
- AC-42.1 PO Draft → ubah → Dipesan → Dibatalkan; nilai identik di API, mock, laporan.
- AC-42.2 `qty_cancelled` & nilai sisa dibatalkan historis.
- AC-43.1 Penerimaan sebagian berulang; kelebihan ditolak; status BR-19.
- AC-43.2 Replay penerimaan identik; payload/aktor beda 409; paralel → satu dokumen.
- AC-43.3 Pembalik murni ditolak bila saldo < 0; koreksi dengan dampak bersih sah diterima setelah bahan terpakai sebagian.
- AC-43.4 Koreksi: satu mutasi bersih per bahan merujuk P/R menurut §4.3; dampak 0 tanpa mutasi; atomik; I-8(a)(b).
- AC-43.5 Nilai penerimaan dari mutasi; pembalik tepat negatif.
- AC-44.1 Migrasi M-0 – M-9 hanya dengan fencing akun aplikasi terpisah: M-0 berhenti bila P-OPS-1 – P-OPS-4 atau inventaris jalur penulis/proxy/DEFINER tidak terpenuhi; privilege `PROCESS` & hak `KILL` terverifikasi; penulis dihentikan; `ACCOUNT LOCK` + `KILL` sebelum backup; login akun aplikasi ditolak selama M-3 – M-8; migrasi dengan akun migrasi; UNLOCK hanya setelah validasi lulus; backup terverifikasi; dokumen saldo awal tepat satu per bahan; mutasi saldo awal hanya stok > 0; I-1 – I-3, I-7, I-8; Σ stok sama; CHECK & FK `RESTRICT` aktif. Tidak ada jalur pemblokiran tingkat proses.
- AC-44.2 Stok masuk & PUT bahan lama: kontrak sama; dokumen + mutasi; `request_id` opsional dengan kontrak penuh bila dikirim.
- AC-44.3 Pembalik & koreksi stok masuk; saldo awal & opname tidak dapat dibalik.
- AC-44.4 Opname: fisik 0 sah; selisih 0 tercatat tanpa mutasi; mutasi = fisik − sistem; validasi `expected_stock` 400/409 (§2.7); I-10.
- AC-44.5 Semua mutasi ≠ 0 dan menjaga [0, batas]; INSERT melanggar CHECK (termasuk NULL pada kolom wajib per jenis) ditolak MySQL.
- AC-44.6 Matriks §5.1: operasi wajib tanpa `request_id` → 400; PUT/endpoint opsional dengan `request_id` → simpan, replay identik, 409 payload beda; nilai sementara 102 tidak pernah tersisa setelah transaksi; `request_id` pada endpoint di luar allowlist (CR-04 maupun lama) → 400 tanpa efek lain.
- AC-44.7 IT-01 – IT-15, IT-30, IT-31, IT-33 lulus; `lock_deadlocks = 0`.
- AC-NF Mode mock = API; 390/768/1440 px tanpa overflow; skeleton, empty state, toast, label, area sentuh 44 px.

### CR-04b
- AC-45.1 Isian awal AD-07 & AD-05 hanya baca; keduanya tidak berubah.
- AC-45.2 Transisi `{from, to}`; final tidak diproses ulang.
- AC-45.3 Snapshot resep saat mulai (termasuk `recipe_snapshot_at` untuk snapshot kosong); perubahan resep kemudian tidak mengubah standar.
- AC-46.1 Pengeluaran mengurangi stok tepat sekali per operasi; saldo ≥ 0.
- AC-46.2 Selesai: satu dokumen `normal` (hasil 0 sah) + status; penyelesaian kedua ditolak.
- AC-46.3 WO batal setelah pengeluaran: pengeluaran tetap, tanpa dokumen hasil.
- AC-46.4 Koreksi hasil: 0 → q (P langsung), p → q (R + P), p → 0 (R); kasus terlarang ditolak; setelah p → 0 tidak ada koreksi berikutnya (409) dan hasil bersih tetap 0; hasil bersih = §8.3; status WO tetap Selesai.
- AC-46.5 Laporan & detail WO menampilkan standar (3 desimal), aktual (2 desimal), selisih (3 desimal) eksak, tanpa pembulatan prematur; serialisasi aktual/selisih melalui `milliToNumber` dengan pemeriksaan bolak-balik; batas magnitudo agregat laporan mengikuti §3 aturan 6.
- AC-46.6 Stok jual, `daily_stocks`, pesanan, checkout, pembatalan, auto-cancel, AD-05 tidak berubah.
- AC-46.7 FR-40 identik; teks keterangan versi CR-04b tampil kata per kata.
- AC-46.8 Migrasi CR-04b (CHECK pengganti aktif); IT-16 – IT-26, IT-32 lulus.

### CR-04c
- AC-47.1 Tab Operasional AD-08 (Owner); Staf 403.
- AC-47.2 Agregat = sumber dalam satu snapshot; pembalik/koreksi pada tanggal pencatatan; periode lampau tidak berubah.
- AC-47.3 Omzet pembanding identik AD-08; tab Penjualan & `/reports/sales` tidak berubah.
- AC-47.4 Ekspor = isi layar.
- AC-47.5 IT-27 – IT-29 lulus.

## 17. Matriks risiko & mitigasi

| ID | Risiko | Dampak | Mitigasi |
|---|---|---|---|
| R-01 | Jalur tulis stok tanpa dokumen/mutasi | Tinggi | Satu modul layanan mutasi; I-1/I-2/I-8 di setiap uji; regresi AD-07 |
| R-02 | Saldo awal tidak sinkron | Tinggi | §11; dokumen untuk semua bahan, mutasi bila > 0; validasi M-8 |
| R-03 | Operasi ganda | Tinggi | Kontrak §5; UNIQUE `reverses_id`/`replaces_id`/`normal_wo_id` |
| R-04 | `request_id` dipakai ulang | Sedang | Perbandingan aktor/operasi/target/hash → 409 |
| R-05 | Kelebihan penerimaan bersamaan | Sedang | Kunci PO; sisa setelah kunci |
| R-06 | Stok negatif/melebihi batas | Tinggi | Satu mutasi bersih; validasi saldo akhir; CHECK |
| R-07 | Deadlock | Sedang | Urutan kunci global; bahan urut ID |
| R-08 | Nilai berbeda antar API/mock/laporan | Sedang | Nilai dari mutasi; satu fungsi; uji silang |
| R-09 | Pembulatan diam-diam | Sedang | String desimal; BigInt; tanpa floating point; T-37 |
| R-10 | Laporan lampau berubah | Sedang | Append-only; tanggal pencatatan; `qty_cancelled` historis |
| R-11 | Agregat laporan tidak konsisten | Sedang | Satu snapshot |
| R-12 | Sumber omzet kedua | Sedang | Fungsi AD-08 dengan `tx` yang sama |
| R-13 | Regresi AD-07 & CR-03 | Sedang | Kontrak tetap; suite lama + MySQL 17/18 |
| R-14 | Estimasi FR-40 berlebih | Rendah | E-11 wajib tampil |
| R-15 | Hasil dikira menambah stok jual | Sedang | K13; keterangan AD-13 |
| R-16 | CHECK lolos karena UNKNOWN / tidak terwakili Prisma | Tinggi | Pola anti-UNKNOWN §12.1; SQL migrasi; uji INSERT melanggar per jenis |
| R-17 | Baris dokumen ≠ mutasi | Tinggi | §4.3 + I-8(a)(b) diuji |
| R-18 | Respons replay berubah | Rendah | Respons asli disimpan |
| R-19 | Standar WO berubah karena resep diubah | Sedang | Snapshot |
| R-20 | Mode mock berbeda | Sedang | Aturan murni bersama |
| R-21 | Konflik dokumen sumber & persetujuan akademik | Tinggi (administratif) | §21 |
| R-22 | Opname memakai stok basi | Sedang | `expected_stock` + kunci; 409 `STOCK_CHANGED` |
| R-23 | Penulisan selama backup/migrasi | Tinggi | Fencing teknis: akun aplikasi terpisah dikunci (`ACCOUNT LOCK` + `KILL`) sejak sebelum backup sampai validasi lulus; penulis dihentikan; `innodb_trx` kosong; tanpa jalur pemblokiran tingkat proses |
| R-24 | Backup tidak dapat dipulihkan | Tinggi | Restore uji M-6 |
| R-25 | Restore setelah go-live menghapus data | Tinggi | Fix-forward; restore hanya atas keputusan eksplisit |
| R-26 | Hasil produksi ganda/kontradiktif | Sedang | UNIQUE `normal_wo_id`; tiga kasus §8.2; CHECK `ck_out_kind` |
| R-27 | Teks keterangan tidak sinkron | Rendah | Uji konstanta = SPEC |
| R-28 | Migrasi gagal karena CHECK pada kolom FK `CASCADE` | Tinggi | FK CR-04 `RESTRICT/RESTRICT`; IT-01 di MySQL 8 |
| R-29 | Lingkungan target belum punya akun aplikasi/migrasi terpisah | Sedang | Deployment tidak dilakukan sampai P-OPS-1 – P-OPS-4 dan inventaris/fencing seluruh jalur penulis, proxy user, serta stored program/view ber-`DEFINER` diverifikasi (konfigurasi deployment, di luar implementasi); tidak ada jalur alternatif, termasuk dengan persetujuan tertulis |

## 18. Skenario uji integrasi (MySQL 8) — **didefinisikan, belum dijalankan**

| ID | Skenario | Hasil yang diharapkan |
|---|---|---|
| IT-01 | Migrasi CR-04a (database berisi stok > 0 & = 0; database kosong) | Dokumen saldo awal tepat satu per bahan; mutasi saldo awal hanya stok > 0; I-1 – I-3, I-7, I-8; CHECK & FK `RESTRICT` terpasang |
| IT-02 | Backup + restore uji (M-5/M-6) | Jumlah baris, Σ stok, CHECKSUM sama |
| IT-03 | Kegagalan M-7 disuntik → pemulihan §11.4 | Database identik backup; `_prisma_migrations` tanpa CR-04a |
| IT-04 | INSERT melanggar setiap CHECK CR-04a, termasuk NULL pada kolom wajib per `kind`/`status` (mis. `stok_masuk` qty NULL, `stock_opname` counted NULL, pembalik reason NULL, `material_movements` qty 0, sumber ganda/kosong) | Semua ditolak; baris sah (saldo awal qty 0, opname tanpa reason) diterima |
| IT-05 | Penerimaan bersamaan > sisa | Satu sukses, satu 409 |
| IT-06 | Replay penerimaan; payload/aktor beda; asli masih berjalan | Satu dokumen; replay identik; 409 REUSED; 409 IN_PROGRESS |
| IT-07 | Penerimaan × stok masuk (± `request_id`) × opname, banyak putaran | I-1 – I-3, I-8, I-10; 0 deadlock |
| IT-08 | Mutasi melewati batas atas | 409 |
| IT-09 | Pembalik penerimaan setelah bahan terpakai sebagian | 409 |
| IT-10 | Koreksi penerimaan multi-item: item berubah (rujuk P), item dihapus dari P (rujuk R), item sama (tanpa mutasi) | Rujukan sesuai §4.3; I-8(a)(b) |
| IT-11 | Koreksi gagal di tengah; dikirim ulang | Rollback penuh; replay tidak menggandakan |
| IT-12 | Pembalik & koreksi stok masuk; pembalik opname/saldo awal | Benar; opname/saldo awal ditolak |
| IT-13 | Opname: fisik 0; selisih 0; `expected_stock` basi (409 `STOCK_CHANGED`); `expected_stock` format salah (number, 3 desimal, negatif, > batas, kosong → 400); `"5"` vs stok 5.00 (dinormalisasi → sama); opname bersamaan stok masuk | Sesuai §2.7; I-10 |
| IT-14 | Batal PO setelah sebagian diterima, lalu pembalik | `qty_cancelled` & nilai sisa tetap |
| IT-15 | Ubah daftar bahan supplier × buat/pesan PO; supplier tanpa bahan | Konsisten; PO ditolak; 0 deadlock |
| IT-16 | Migrasi CR-04b di atas data CR-04a | ALTER, CHECK pengganti, FK `RESTRICT`; invarian lulus |
| IT-17 | INSERT melanggar CHECK CR-04b (`work_orders` status/kolom waktu, `production_outputs` per `kind` termasuk NULL, `normal_wo_id` ≠ wo_id, `material_movements` sumber/tanda pengeluaran) | Ditolak |
| IT-18 | Dua pengeluaran bersamaan menghabiskan stok | Satu sukses, satu 409 |
| IT-19 | Penyelesaian ganda (`request_id` beda) | Satu dokumen hasil; 409 |
| IT-20 | Resep diubah setelah WO mulai | Standar memakai snapshot |
| IT-21 | WO batal setelah pengeluaran; koreksi pengeluaran multi-bahan: bahan berubah 10 → 8 (mutasi +2 rujuk P), bahan dihapus dari P 5 → 0 (mutasi +5 rujuk R), bahan sama (tanpa mutasi) | Pengeluaran tetap; tanpa dokumen hasil; aktual positif; I-5, I-8(a)(b) dengan tanda pengeluaran |
| IT-22 | Hasil (WO-1): selesai 0 → pembalik 0 ditolak (400) → koreksi 0 → 5 (P langsung) → koreksi 5 → 8 (R + P) → pengganti langsung atas dokumen 8 ditolak (400) → koreksi 8 → 8 ditolak (400) → koreksi 8 → 0 (R) → **terminal**: koreksi 0 → 3, pengganti langsung, dan pembalik ulang atas dokumen mana pun di rantai WO-1 ditolak 409 `DOCUMENT_ALREADY_SUPERSEDED`; penyelesaian ulang WO-1 ditolak 409; hasil bersih WO-1 tetap 0. WO-2 (baru) diselesaikan dengan hasil 3. WO-3: selesai 0 → koreksi 0 → 0 ditolak (400) | Hasil bersih WO-1: 0 → 5 → 8 → 0 (tetap); WO-2: 3; status Selesai; I-6 |
| IT-23 | Standar & selisih per periode dengan koreksi hasil & pengeluaran di periode berbeda; takaran 0,015 × hasil 7 = 0,105; aktual 0,10 → selisih −0,005 | Σ kontribusi = WO; nilai eksak 3 desimal |
| IT-24 | Pengeluaran multi-bahan × penerimaan multi-bahan urutan berbeda | 0 deadlock |
| IT-25 | Pengeluaran × checkout × pembatalan × auto-cancel | Perilaku identik dengan sebelum CR-04; `daily_stocks` tidak tersentuh |
| IT-26 | FR-40 sebelum & sesudah pemakaian; teks keterangan CR-04b | Kebutuhan identik; teks kata per kata |
| IT-27 | Laporan × penulisan bersamaan | Satu snapshot konsisten |
| IT-28 | Koreksi periode Y atas dokumen periode X (penerimaan, pengeluaran, hasil, stok masuk) | X tidak berubah; Y memuat koreksi |
| IT-29 | Omzet pembanding vs AD-08 | Identik |
| IT-30 | Koreksi stok masuk (O 10 → P 8: mutasi −2) & pengeluaran (O 10 → P 8: mutasi +2): R & P berbagi `operation_request_id`; mutasi merujuk P/R; I-8(a) dengan tanda per jenis; koreksi kedua atas O → 409 `DOCUMENT_ALREADY_SUPERSEDED` | Sesuai §4.3, I-6, I-8 |
| IT-31 | PUT supplier / PUT PO Draft / PUT WO Draft (bagian CR-04b) / PATCH supplier aktif / stok masuk lama / PUT bahan lama / POST bahan lama: tanpa `request_id` (perilaku biasa), dengan `request_id` (replay identik), `request_id` sama payload beda (409); setelah commit & setelah rollback tidak ada baris `response_status = 102`; `request_id` pada endpoint di luar allowlist — endpoint CR-04, GET, endpoint lama (mis. checkout, AD-04) — → 400 dan tanpa tulisan | Sesuai §5 |
| IT-32 | Batas & serialisasi: standar = 9.999.999,999 × 10.000 = 99.999.999.990,000 eksak di API & mock; takaran 0,015 × 7 = 0,105; agregat kuantitas +999.999.999.999,999 dan −999.999.999.999,999 → 200 eksak; +1.000.000.000.000,000 dan −1.000.000.000.000,000 → 422 `REPORT_AGGREGATE_LIMIT` tanpa data sebagian (API & mock); agregat rupiah positif/negatif tepat pada batas → 200 dan magnitudo di atas batas → 422; nilai DECIMAL dibaca sebagai string (tanpa `Number()`); aktual dan selisih WO dihitung/di-serialize eksak, termasuk nilai bertanda; fungsi serialisasi dengan nilai yang sengaja tidak eksak (uji unit fail-safe) → `MILLI_PRECISION_LOST` | Sesuai §3 aturan 6 |
| IT-33 | Fencing: (a) M-0 di lingkungan tanpa akun terpisah (server memakai akun dengan `SUPER`) → prosedur berhenti; (b) verifikasi privilege `PROCESS` dan `CONNECTION_ADMIN`/`SUPER` untuk `KILL` sesi akun lain; (c) inventaris menolak deployment bila ada proxy user, stored program/view ber-`DEFINER` akun aplikasi yang membuka jalur tulis dari pemanggil lain, atau akun/jalur penulis lain yang belum difencing; (d) `ACCOUNT LOCK` + `KILL`: sesi akun aplikasi terputus, login langsung baru ditolak selama M-3 – M-8, upaya tulis dengan kredensial aplikasi gagal, akun migrasi tetap dapat migrasi; (e) validasi gagal → akun tetap terkunci; (f) UNLOCK hanya setelah validasi lulus | Tidak ada penulisan aplikasi atau jalur penulis lain selama M-3 – M-8 |

Ditambah unit test aturan murni (dampak bersih & rujukan, opname, hasil bersih, standar/selisih, nilai, status PO,
payload kanonik; client = server), route test (matriks §5.1, error code), mode mock = API, regresi penuh (server,
client, MySQL 01 – 18 + baru, e2e per-step) tanpa mengubah 14 P1b.

---

## 19. Teks keterbatasan & teks keterangan wajib

### 19.1 Tabel keterbatasan SPEC §5
| No | Saat ini (CR-03) | Setelah CR-04a | Setelah CR-04b |
|---|---|---|---|
| E-6 | "Stok bahan tidak dikurangi otomatis; akurasi bergantung pada koreksi stok AD-07" | "Estimasi tidak mengurangi stok bahan; stok hanya berubah lewat transaksi yang dicatat — Catat Stok Masuk, penerimaan pembelian, stock opname, serta pembalik atau koreksi transaksi tersebut; akurasi bergantung pada pencatatan transaksi dan stock opname AD-07" | "Estimasi tidak mengurangi stok bahan; stok hanya berubah lewat transaksi yang dicatat — Catat Stok Masuk, penerimaan pembelian, pemakaian bahan produksi, stock opname, serta pembalik atau koreksi transaksi tersebut; akurasi bergantung pada pencatatan transaksi dan stock opname AD-07" |
| E-11 | — | — | "Pemakaian bahan produksi yang sudah dicatat mengurangi stok, sedangkan pesanan pre-order/custom dan rencana produk ready yang sama tetap dihitung sebagai kebutuhan, sehingga estimasi dapat berlebih" |

Sumber di SPEC: E-6 "CR-03, diubah CR-04a/CR-04b"; E-11 "CR-04b". "Pembalik atau koreksi transaksi tersebut" mencakup
pembalik/koreksi stok masuk, penerimaan, dan (CR-04b) pengeluaran; opname tidak dibalik (diperbaiki dengan opname baru),
sehingga E-6 tidak menyebut pembalik opname. E-3 dan E-5 tidak berubah.

### 19.2 Teks keterangan wajib tab Kebutuhan Bahan
Bagian awal (sama di semua versi, identik dengan SPEC §5 saat ini):
> "Angka ini estimasi, bukan catatan pemakaian bahan. Dihitung dari pesanan pre-order & custom yang sudah dikonfirmasi
> atau sedang disiapkan — pesanan yang sedang disiapkan dihitung penuh — ditambah seluruh rencana produk ready hari
> ini, termasuk yang mungkin sudah dibuat. Produk ready untuk tanggal mendatang belum termasuk. Produk ready dalam
> pesanan campuran dihitung pada tanggal pesanan dibuat, bukan tanggal siap. Custom cake dihitung dengan ukuran
> standar, dan varian produk tidak dihitung terpisah. Produk tanpa komposisi tidak dihitung dan ditampilkan terpisah.
> Jenis produk dibaca dari data produk saat ini; bila diubah setelah pesanan dibuat, estimasi dapat kurang atau
> berlebih."

| Versi | Kalimat penutup |
|---|---|
| Saat ini (CR-03) | "Stok bahan tidak dikurangi otomatis; perbarui lewat Catat Stok Masuk atau koreksi stok." |
| Setelah CR-04a (E-6) | "Estimasi ini tidak mengurangi stok bahan; stok hanya berubah lewat Catat Stok Masuk, penerimaan pembelian, stock opname, serta pembalik atau koreksi transaksi tersebut." |
| Setelah CR-04b (E-6 + E-11) | "Estimasi ini tidak mengurangi stok bahan; stok hanya berubah lewat Catat Stok Masuk, penerimaan pembelian, pemakaian bahan produksi, stock opname, serta pembalik atau koreksi transaksi tersebut. Pemakaian bahan produksi yang sudah dicatat mengurangi stok, sedangkan pesanan dan rencana yang sama tetap dihitung, sehingga estimasi dapat berlebih." |

Teks lengkap = bagian awal + satu spasi + kalimat penutup versi yang berlaku.

### 19.3 Sinkronisasi (CP dokumen tiap tahap, satu commit)
| Artefak | Perubahan |
|---|---|
| `docs/SPEC.md` §5 | Tabel keterbatasan (E-6, E-11) + teks wajib versi tahap |
| `client/src/constants/recipe.js` `MATERIAL_REQUIREMENT_NOTE` | Teks wajib versi tahap |
| `client/tests/unit/materialRequirementMock.test.mjs` (uji K-14: konstanta = kutipan SPEC) | Tetap; otomatis memeriksa versi baru |
| Uji browser/e2e yang memeriksa awal/akhir teks | Kalimat penutup diperbarui |
| Label AD-07 "Untuk koreksi hasil hitung stok." | Diselaraskan dengan istilah "stock opname" |
| CR-03 Revisi 8 & rekaman persetujuannya | Tidak diubah (perubahan tercatat di SPEC §13 CR-04) |

---

## 20. Pemeriksaan konsistensi silang (Draft 0.8.3)

| Pemeriksaan | Hasil |
|---|---|
| T-33: §2.5 ↔ §4.2 ↔ §8.2 ↔ §8.3 ↔ `ck_out_kind` ↔ BR-30/36 ↔ VR Koreksi ↔ AC-46.4 ↔ IT-22 | Tiga kasus identik di semua bagian; kondisi terminal p → 0 (0.8.1) dinyatakan di §8.2, BR-36, VR, AC-46.4, IT-22; CHECK mengizinkan pengganti tanpa pembalik; aturan lintas baris (qty O = 0, dokumen berlaku) di aplikasi + IT-22 |
| T-34: setiap CHECK §12 | Disjungsi per `kind`/`status` lengkap (ENUM NOT NULL) & saling eksklusif; kolom wajib per jenis `IS NOT NULL`; perbandingan nilai didahului `IS NOT NULL`; kolom opsional (reason opname/stok masuk, note, cancel_reason dibatalkan) tetap NULL-able; saldo awal qty 0 sah; `qty_change ≠ 0` untuk semua jenis; IT-04, IT-17 |
| T-34: FK ↔ CHECK | Semua FK CR-04 `RESTRICT/RESTRICT`; tidak ada CHECK pada kolom FK beraksi `CASCADE`; tidak ada CHECK merujuk kolom `AUTO_INCREMENT` |
| T-35: §2.2 ↔ §2.4 ↔ §4.3 ↔ I-8 ↔ §8.4 ↔ §9 ↔ BR-23/27 ↔ `material_movements` ↔ IT-10/21/30 | Satu aturan rujukan (P, lalu R); tanda (0.8.1): penerimaan & stok masuk mutasi = +jumlah bertanda, pengeluaran mutasi = −jumlah bertanda; aktual positif = −Σ mutasi pengeluaran; rumus §2.4 & §4.3 tidak berubah; UNIQUE konsisten; tanpa tabel baru |
| T-36: §5.1 ↔ §5.2 ↔ §12.2 (`operation_requests`) ↔ BR-31 ↔ VR ↔ I-9 ↔ AC-44.6 ↔ IT-31 | Nilai sementara 102/`in_progress` memenuhi NOT NULL & `ck_opreq_fmt`, diganti sebelum COMMIT, tidak pernah ter-commit; allowlist ditegakkan middleware global untuk semua endpoint termasuk lama |
| T-37: §3 ↔ §8.4 ↔ §9 ↔ §14 ↔ §15 ↔ BR-27 ↔ AC-46.5 ↔ IT-23/32 | Batas standar 99.999.999.990,000 (= batas takaran × batas hasil); magnitudo agregat bertanda dibatasi kebijakan (bukan batas JavaScript) → 422 `REPORT_AGGREGATE_LIMIT`; aktual per WO tidak diasumsikan di bawah batas; `MILLI_PRECISION_LOST` hanya untuk kehilangan presisi terdeteksi; konversi & serialisasi eksak sama di API & mock; tanpa respons sebagian |
| T-38: §2.7 ↔ §14 ↔ §15 ↔ AC-44.4 ↔ IT-13 | Validasi & kode error identik |
| T-39: §11.2 – §11.5 ↔ P-OPS-1 – 4 ↔ R-23/28/29 ↔ AC-44.1 ↔ IT-33 ↔ §21.5 | Satu jalur deployment (fencing akun aplikasi); Mode B & P-OPS-5 dihapus; `PROCESS`/hak `KILL` terverifikasi; proxy user, stored program/view ber-`DEFINER`, dan seluruh jalur penulis lain tercakup; langkah, pemulihan, dan syarat berhenti konsisten |
| I-2 ↔ I-7 ↔ saldo awal 0 | Baris mutasi pertama `stock_before = 0`; bahan tanpa mutasi stok 0 |
| Jumlah tabel | 9 + 5 = 14; total 44 (§12.4) |
| CR-03 | BR-13 – BR-16, API & aturan FR-40, AD-06 tidak berubah; hanya teks §19 |
| K13 | Tidak ada tabel/endpoint CR-04 yang menulis `daily_stocks`/`orders`/`products` |
| K01 – K04, T-01 | Tidak berubah |
| E-6/E-11 | Satu redaksi (§19) dipakai tabel, teks wajib, konstanta, uji |
| Metadata basis | Basis spesifikasi `f3eb8a8` (`origin/main`) dibedakan dari HEAD branch kerja `8784ccd` (tree identik) |
| FK & CHECK (0.8.1) | Tidak ada perubahan CHECK atau FK; semua FK CR-04 tetap `RESTRICT/RESTRICT` |

## 21. Persetujuan formal yang diperlukan
1. Persetujuan final K05 – K25 (termasuk penyesuaian K06, K07, K12, K14, K21, K22, K23, K25) dan solusi T-33 – T-39.
2. Perubahan AGENTS.md §1 (lingkup CR-04).
3. Perubahan teks keterangan wajib CR-03 per tahap (§19).
4. Perubahan perilaku AD-07: dokumen + mutasi; `request_id` opsional dengan kontrak penuh; saldo awal bahan baru;
   batas atas; endpoint opname, pembalik/koreksi stok masuk, riwayat mutasi; UI AD-07 memakai endpoint opname (T-25).
5. Prosedur migrasi §11 termasuk downtime penuh (T-29), prasyarat P-OPS-1 – P-OPS-4 (akun aplikasi & migrasi terpisah
   wajib; tanpa jalur alternatif), dan aturan fix-forward setelah go-live.
6. Menu AD-12 & AD-13; AD-08 menjadi "Laporan" (tab Penjualan/Operasional).
7. Asumsi prototype: 30 baris per PO & per pengeluaran; hasil ≤ 10.000; nomor `PO-YYMMDD-NNN` & `WO-YYMMDD-NNN`;
   pembalik penuh sekali; koreksi sekali per dokumen berlaku; tanpa batas waktu koreksi; pembulatan nilai setengah
   menjauhi nol per baris; retensi `operation_requests` tanpa batas; opname & saldo awal tidak dapat dibalik; hasil 0 sah.
8. Status persetujuan akademik (T-07).
9. Persetujuan eksplisit terpisah sebelum CR-04a, CR-04b, CR-04c.

## 22. Status temuan

| ID | Temuan | Status |
|---|---|---|
| T-01 | Catatan supplier | Selesai (keputusan Pemilik Project) |
| T-02 | Client lama stok masuk tanpa `request_id` | Diterima; kompatibilitas §5.3 |
| T-03, T-12 | CHECK per tahap & Prisma | Selesai (§12, SQL eksplisit) |
| T-04, T-29 | Downtime penuh saat migrasi | Diterima; persetujuan §21.5 |
| T-05, T-09, T-11 | Algoritma koreksi & nol | Selesai (§4) |
| T-06 | Pembulatan floating point AD-08 | Terbuka — di luar lingkup CR-04 |
| T-07 | Persetujuan akademik | Terbuka — keputusan Pemilik Project |
| T-08, T-24 | Dokumen final & CR-03 Revisi 8 di repository | Terbuka — prosedural setelah persetujuan |
| T-10, T-13 – T-17 | Draft 0.6 | Selesai |
| T-18 – T-23 | Draft 0.6 | Tetap seperti Draft 0.6 (T-22 ditetapkan dalam BR-30) |
| T-25 | UI AD-07 pindah ke endpoint opname | Persetujuan §21.4 |
| T-26 | `stock_adjustments.operation_request_id` tidak dapat dibedakan jalur baru/lama di CHECK untuk opname & stok masuk | Diterima; aplikasi + route test (IT-31) |
| T-27 | CHECK hanya panjang UUID | Diterima |
| T-28 | Aturan lintas baris (PO/WO/bahan sama, tanpa referensi diri, qty pembalik = qty asal, pengganti langsung hanya atas hasil 0) tidak dapat ditegakkan CHECK/FK | Diterima; aplikasi + IT-10, IT-21, IT-22, IT-30 |
| T-30 | Istilah "stock opname" | Diselaraskan pada CP dokumen CR-04a |
| T-31 | WO Selesai dengan hasil dikoreksi | Label "dikoreksi" |
| T-32 | Respons idempotensi disimpan sebelum commit | Diterima |
| **T-33** | Koreksi hasil produksi | **Selesai** (§8.2, §8.3, `ck_out_kind`, IT-22; kondisi terminal ditegaskan di 0.8.1) |
| **T-34** | CHECK & NULL | **Selesai** (§12; termasuk FK `RESTRICT` karena larangan MySQL CHECK + FK `CASCADE`) |
| **T-35** | Rujukan & tanda mutasi koreksi | **Selesai** (§4.3; I-8 tanda pengeluaran ditegaskan di 0.8.1) |
| **T-36** | Idempotensi PUT/opsional | **Selesai** (§5; nilai sementara & allowlist global di 0.8.1) |
| **T-37** | Presisi | **Selesai** (§3, §8.4, §9; batas standar dikoreksi di 0.8.1; batas agregat sebagai kebijakan + `REPORT_AGGREGATE_LIMIT` di 0.8.2) |
| **T-38** | `expected_stock` | **Selesai** (§2.7) |
| **T-39** | Pengamanan migrasi | **Selesai** (§11; Mode B dihapus, hanya fencing akun aplikasi di 0.8.2) |

Catatan residual (tidak menghalangi implementasi, tidak membuka revisi baru): nama ENUM berbahasa campuran
(`stock_opname` vs `stok_masuk`) mengikuti istilah UI; retensi `operation_requests` dapat ditinjau setelah prototype;
pesan UI untuk `REQUEST_IN_PROGRESS` ditetapkan saat CP UI.

## 23. Status dokumen

CR-04 Draft 0.8.3: **DRAFT — dokumen final untuk persetujuan; belum disetujui.** Skenario uji pada §18 **didefinisikan** dan
**belum dijalankan**; tidak ada pengujian yang dijalankan untuk dokumen ini. Tidak ada perubahan kode, database, schema,
migrasi, seed, AGENTS.md, SPEC, ROADMAP, dokumen CR-03, Git, commit, push, merge, atau pull request yang diizinkan
oleh dokumen ini.
