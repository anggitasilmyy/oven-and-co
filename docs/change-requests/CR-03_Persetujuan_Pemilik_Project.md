# CR-03 — Rekaman Persetujuan Pemilik Project

> **Sifat dokumen:** rekaman administratif berdasarkan riwayat persetujuan melalui percakapan. Dokumen ini **bukan**
> tanda tangan digital dan **bukan** dokumen CR-03 Revisi 8 itu sendiri. Dokumen ini tidak menggantikan, merekonstruksi,
> atau mengubah isi CR-03 Revisi 8.

## 1. Identitas change request

| Butir | Isi |
|---|---|
| Kode | CR-03 |
| Judul | Komposisi Bahan (Resep Ringan) & Estimasi Kebutuhan Bahan |
| Cakupan | FR-39 (komposisi bahan per produk, AD-06) dan FR-40 (estimasi kebutuhan bahan, AD-07); BR-13 – BR-16; tabel `product_materials` |
| Ringkasan perubahan requirement | `docs/SPEC.md` bagian 12 |
| Rencana & status implementasi | `docs/ROADMAP.md` Step 6.7 (CP0 – CP8) |

## 2. Revisi yang disetujui

| Butir | Isi |
|---|---|
| Revisi | CR-03 Revisi 8 |
| Nama berkas saat ditinjau | `CR-03_Resep_Ringan_FINAL_FOR_REVIEW_REVISI_8.md` |
| SHA-256 | `1a4105625b50ff489378b0b2dbfbf613c8115d21256fd0239f9afce73162b0a8` |
| Jumlah baris | 1.210 |
| Lokasi | **Tidak tersimpan di repository ini.** Salinan dengan hash di atas berada di luar repository (penyimpanan pemilik project). Hash dapat dipakai untuk mencocokkan salinan mana pun dengan revisi yang disetujui. |

## 3. Persetujuan

| Butir | Isi |
|---|---|
| Tanggal | 11 November 2026 |
| Pihak yang menyetujui | Pemilik Project Oven & Co. |
| Status | **S (Disetujui)** — sebagai keputusan internal project |
| Dasar | Persetujuan melalui percakapan dengan asisten implementasi; jawaban pemilik project: "ya saya setuju" |

## 4. Keputusan K-01 – K-15 (sesuai catatan historis)

| Kode | Keputusan | Usulan yang disetujui | Status |
|---|---|---|---|
| K-01 | Status pesanan yang dihitung sebagai kebutuhan | Dikonfirmasi & Sedang Disiapkan; Sedang Disiapkan dihitung penuh | S |
| K-02 | Stok dialokasikan = kumulatif hari ini s.d. D + tertunggak | Ya | S |
| K-03 | Presisi takaran | Tidak diputuskan terpisah; mengikuti D-8 (`qty_per_unit DECIMAL(10,3)`; presisi stok `raw_materials` tetap DECIMAL(10,2)) | Mengikuti D-8 |
| K-04 | Jendela tanggal estimasi | 30 hari (T s.d. T + 29, WIB) | S |
| K-05 | Batas bahan per produk | 30 | S |
| K-06 | Peringatan saat satuan bahan diubah | Peringatan teks di form ubah bahan AD-07, tanpa memblokir | S |
| K-07 | Audit `update_product_recipe` | Ya, perbandingan pasangan `material_id` + `qty_per_unit` | S |
| K-08 | Penempatan UI | Modal di AD-06 + tab di AD-07, tanpa rute/menu baru | S |
| K-09 | Penomoran PRD | Perluas A-07 | S |
| K-10 | Isi daftar bahan pada estimasi | Semua bahan | S |
| K-11 | Rencana ready hari ini dihitung penuh | Ya | S |
| K-12 | Data contoh komposisi | Sebagian produk | S |
| K-13 | Pesanan tertunggak masuk kumulatif | Ya, ditampilkan terpisah bila > 0 | S |
| K-14 | Teks keterangan keterbatasan wajib di layar (E-1 – E-10) | Ya | S |
| K-15 | Menerima keterbatasan E-8 | Diterima — pilihan (a) | S |

Keputusan terkait yang dicatat bersama persetujuan: Step 6.8 dan 6.9 ditunda (di luar lingkup); Step 6.10 hanya
laporan lanjutan baru yang ditunda; laporan penjualan AD-08 dan KPI AD-02 tetap berlaku (lihat `docs/SPEC.md` bagian 12).

## 5. Status implementasi CP0 – CP8

| CP | Isi | Status | Commit |
|---|---|---|---|
| CP0 | Draft CR-03 + persetujuan pemilik project | Selesai | — (dokumen di luar repository) |
| CP1 | Perbarui SPEC.md, AGENTS.md, ROADMAP.md | Selesai | `4272010` |
| CP2 | Schema, migrasi, seed, `db:check-spec` 30 tabel | Selesai | `e40aa0a` |
| CP3 | Aturan murni server & client + unit test | Selesai | `9f2f0d6` |
| CP4 | API komposisi + audit + integrasi MySQL | Selesai | `2c1796d` |
| CP5 | API kebutuhan bahan + rekonsiliasi AD-05 | Selesai | `1b0442a` |
| CP6 | Modal Komposisi AD-06 + peringatan satuan K-06 | Selesai | `fc7e64f` |
| CP7 | Tab Kebutuhan Bahan AD-07 | Selesai | `49df77b` |
| CP8 | Regresi penuh, cek browser, catatan status | Selesai | `ebb4602` |

Commit terakhir implementasi & verifikasi CR-03: **`ebb4602`** (branch `claude/gallant-hypatia-jmd6qq`). Rincian hasil
pengujian per CP tercatat di `docs/ROADMAP.md` Step 6.7.

Pengecualian yang tercatat saat penutupan: uji MySQL lama 14 P1b gagal sejak sebelum CR-03 (bergantung jam uji, bukan
regresi CR-03); "hari ini" pada mode mock mengikuti tanggal perangkat, sedangkan mode API memakai WIB.

## 6. Persetujuan akademik

Persetujuan akademik formal (kelompok/dosen) atas CR-03 **belum dikonfirmasi**. Dokumen PDF BRD, PRD, dan Analisis &
Perancangan Sistem tidak diubah. Status ini harus diperbarui hanya bila persetujuan akademik benar-benar diperoleh.
