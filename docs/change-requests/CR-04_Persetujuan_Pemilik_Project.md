# CR-04 — Rekaman Keputusan Pemilik Project (CP0 CR-04a)

> **Sifat dokumen:** rekaman administratif atas keputusan Pemilik Project yang diberikan melalui percakapan dengan
> asisten implementasi. Dokumen ini **bukan** tanda tangan digital dan **tidak mengubah** isi Draft 0.8.3, Errata E1,
> Errata E1.1, maupun Paket Persetujuan Final. Dokumen ini juga **bukan** persetujuan akademik.

## 1. Identitas change request

| Butir | Isi |
|---|---|
| Kode | CR-04 |
| Judul | Supplier & Purchasing, Manufacturing, dan Advanced Reporting |
| Tahap | CR-04a = Step 6.8 Supplier & Purchasing · CR-04b = Step 6.9 Manufacturing · CR-04c = Step 6.10 Advanced Reporting |
| Basis repository | `main` @ `f3eb8a8` (squash-merge CR-03) |
| Tanggal keputusan | 12 November 2026 |
| Pihak yang memutuskan | Pemilik Project Oven & Co. |

## 2. Dokumen yang disetujui (disimpan identik di folder ini)

Urutan baca: **Draft 0.8.3 → Errata E1 → Errata E1.1**. Dokumen yang dibaca belakangan berlaku hanya untuk butir yang
disebutnya. Paket Persetujuan Final adalah ringkasan dan register keputusan yang dirujuk bagian 3; paket tidak menambah
ketentuan desain.

| Berkas | Baris | SHA-256 |
|---|---|---|
| `CR-04_DRAFT_0.8.3.md` | 1.273 | `daa97c404f6d7ade142e53a415a019f1b1d903c592bfd316914e52c0ec9e3816` |
| `CR-04_ERRATA_E1_DRAFT_0.8.3.md` | 228 | `b29849d850c34529536fe489721e8de066c7f1e39c1b9d1c3283a397569c59d2` |
| `CR-04_ERRATA_E1.1_DRAFT_0.8.3.md` | 182 | `0bfe45461d450416edaf408260f8b038930a99fcbf080f7ca0d94bf77b909da8` |
| `CR-04_PAKET_PERSETUJUAN_FINAL.md` | 391 | `80f50e49c6e0ddcec01e216f63fd010f7d96d1a03cefc124adf18ac95bc9dc3f` |

Hash dihitung atas berkas yang disimpan di repository dan cocok dengan berkas yang ditinjau Pemilik Project.

## 3. Keputusan resmi

| No | Butir | Keputusan | Status |
|---|---|---|---|
| 1 | K01 – K04 & klarifikasi T-01 | Tetap seperti ditetapkan sebelumnya (K01 A, K02 C + T-01, K03 B, K04 B) | S |
| 2 | K05 – K25 | Disetujui sesuai seluruh rekomendasi pada Paket Persetujuan Final bagian B. Status "usulan" pada dokumen untuk K05 – K25 diganti menjadi disetujui | S |
| 3 | K10 (penegasan) | Work Order dibuat manual dengan isian awal hanya-baca dari AD-07 dan AD-05, tanpa hubungan otomatis dengan pesanan | S |
| 4 | Solusi teknis T-33 – T-39, Errata E1 & E1.1 (C-13) | Disetujui | S |
| 5 | C-1 – C-12 | Disetujui sesuai isi paket dan mitigasinya | S |
| 6 | C-14 Persetujuan akademik | **Diubah oleh bagian 4** (ketentuan "wajib sebelum CR-04a" dicabut) | S (diubah) |
| 7 | C-15 Izin per tahap | Izin hanya untuk **CP0 CR-04a** | S |
| 8 | IMPL-CP2-1 & IMPL-CP2-2 (paket bagian G) | Disetujui sebagai kriteria implementasi CP2 | S |
| 9 | Izin Git | Terbatas untuk pekerjaan CP0 (branch, satu commit dokumentasi, push biasa, PR khusus CP0) | S |
| 10 | CR-04a CP1 – CP7 | **Belum diizinkan** | — |
| 11 | CR-04b & CR-04c | **Belum diizinkan**; memerlukan persetujuan terpisah setelah tahap sebelumnya selesai | — |

Kode FR-41 – FR-47, UC-33 – UC-38, BR-17 – BR-36, RB-18 – RB-37, BR-025 – BR-027, A-13 – A-15, AD-12, AD-13, dan
AC-41 – AC-47 (Errata E1 Lampiran A) tetap berstatus usulan **sampai dimasukkan ke SPEC/ROADMAP pada CP1** tiap tahap.

## 4. Perubahan C-14 — persetujuan akademik

**Konteks dari Pemilik Project.** Oven & Co. adalah project kelompok. Dosen memberi arahan umum agar ruang lingkup
pengembangan disesuaikan dengan kemampuan kelompok, dan tidak mewajibkan proses persetujuan formal seperti proyek
perusahaan.

**Keputusan:**
1. Ketentuan sebelumnya yang mewajibkan bukti tertulis persetujuan akademik sebelum CR-04a dimulai **dicabut**.
2. Persetujuan akademik formal **bukan prasyarat** CP0 maupun implementasi CR-04.
3. Arahan umum dosen dicatat hanya sebagai **konteks**: ruang lingkup project disesuaikan dengan kemampuan kelompok.
4. **Tidak ada klaim** bahwa dosen telah menyetujui rincian CR-04. Tidak ada surat atau bukti persetujuan akademik yang
   dibuat atau dilampirkan.
5. Keputusan teknis dan bisnis CR-04 tetap berada pada Pemilik Project.

**Dampak pada dokumen yang disimpan.** Isi dokumen tidak diubah; bagian berikut dibaca sesuai keputusan ini:

| Lokasi | Teks asli (ringkas) | Dibaca sebagai |
|---|---|---|
| Draft 0.8.3 §21 butir 8 | "Status persetujuan akademik (T-07)" sebagai persetujuan formal yang diperlukan | Status dicatat di bagian 4 ini; bukan prasyarat |
| Draft 0.8.3 §22 T-07 | "Terbuka — keputusan Pemilik Project" | **Ditutup** oleh keputusan bagian 4 |
| Draft 0.8.3 §17 R-21 | Konflik dokumen sumber & persetujuan akademik — Tinggi (administratif) | Risiko administratif diterima Pemilik Project; mitigasi: CR tercatat, PDF BRD/PRD/Analisis tidak diubah, lingkup dibatasi (bagian 5) |
| Paket — Ringkasan kelompok 4, C-14, D-1, E-3, F, formulir C-14 | Persetujuan akademik sebagai butir terbuka/opsi prasyarat | Diganti bagian 4 ini. **E-3 terpenuhi** oleh keputusan Pemilik Project, tanpa bukti akademik |
| Errata E1 & E1.1 | Tidak menyebut persetujuan akademik | Tidak terdampak |

Rekaman CR-03 (`CR-03_Persetujuan_Pemilik_Project.md`) tidak diubah oleh rekaman ini.

## 5. Ruang lingkup dan batasan pengembangan

- Perencanaan CR-04a, CR-04b, CR-04c tetap terintegrasi; implementasi **bertahap**. Prioritas pertama CR-04a. CR-04b dan
  CR-04c hanya dimulai setelah tahap sebelumnya selesai dan disetujui Pemilik Project.
- Pengembangan disesuaikan dengan kemampuan project kelompok. Prioritas: fungsi utama yang diperlukan, desain database
  yang konsisten, integrasi dengan fitur yang ada, keamanan dan hak akses, validasi input, audit trail, serta pengujian
  unit, API, integrasi, dan regresi.
- Tidak menambah kompleksitas yang tidak diperlukan; project **tidak** diperluas menjadi ERP atau sistem akuntansi
  lengkap (sejalan dengan K06: nilai pembelian hanya informasi, tanpa hutang/pembayaran/pajak).
- Butir ini adalah prinsip pelaksanaan; **desain yang disetujui tidak diubah**. Penyederhanaan desain hanya boleh lewat
  keputusan Pemilik Project yang dicatat.

## 6. Pemeriksaan konsistensi

| Pemeriksaan | Hasil |
|---|---|
| Perubahan C-14 vs K01 – K25 | Tidak ada K yang bergantung pada persetujuan akademik |
| vs C-1 – C-13, C-15 | Tidak terdampak; C-12 (risiko diterima) mencakup R-21 sesuai bagian 4 |
| vs Draft 0.8.3, E1, E1.1 | Tidak ada ketentuan desain yang berubah; satu-satunya rujukan akademik (§17 R-21, §21.8, §22 T-07) dibaca sesuai bagian 4 |
| Traceability (E1 Lampiran A) | Tidak berubah |
| Hash dokumen | Cocok (bagian 2) |

## 7. Status prasyarat CP0 (paket bagian E)

| No | Status |
|---|---|
| E-1 K05 – K25 disetujui | Terpenuhi |
| E-2 C-1 – C-13, C-15 disetujui | Terpenuhi |
| E-3 Keputusan C-14 | Terpenuhi (bagian 4) |
| E-4 Izin mulai CR-04a | Terpenuhi — hanya CP0 |
| E-5 Izin Git | Terpenuhi — hanya CP0 |
| E-6 Hash dokumen | Terpenuhi |
| E-7 Dokumen & rekaman disimpan | Terpenuhi oleh commit CP0 yang memuat berkas ini |
| E-8 `origin/main` = `f3eb8a8` | Terpenuhi (tanpa commit baru sejak basis) |

## 8. Status & langkah berikutnya

- **CP0 CR-04a:** selesai setelah commit dokumentasi ini di-merge.
- **Prasyarat CP1:** PR CP0 di-merge; izin eksplisit Pemilik Project untuk CP1. CP1 memuat perubahan AGENTS.md §1,
  SPEC, ROADMAP, dan teks E-6 versi CR-04a (paket C-1 – C-3).
- Belum diizinkan: CP1 – CP7, CR-04b, CR-04c, perubahan kode/schema/migrasi/database, dan deployment. Deployment CR-04a
  tetap mensyaratkan P-OPS-1 – P-OPS-4 (akun aplikasi & migrasi terpisah).
