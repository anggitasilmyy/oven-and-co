# Uji Step 5.7 (AD-06 Produk & Opsi Custom Cake · AD-07 Stok) — skrip Playwright

Sama seperti `tests/step-5.1` – `5.6`: tanpa dependensi baru, memakai dev server mode mock. Jam peramban dikunci ke
**Jumat, 16 Okt 2026 pukul 10.00 WIB**. Jangan isi `VITE_MOCK_TODAY` saat menjalankan uji ini.

```bash
cd client && cp .env.example .env && npx vite --port 5173   # terminal 1 (VITE_USE_MOCK=true)
cd client/tests/step-5.7                                     # terminal 2
CHROMIUM_PATH=/path/ke/chromium node func.e2e.mjs            # aturan murni + alur AD-06/AD-07 + hak akses + persistensi
CHROMIUM_PATH=... node visual.e2e.mjs ./hasil                # overflow, sidebar/drawer, drawer form & modal, area sentuh 360–1920 px
```

Skrip memakai paket `playwright` (tidak ditambahkan ke `package.json`). Bila terpasang global, buat tautan agar import
ESM menemukannya: `mkdir -p client/tests/node_modules && ln -s "$(npm root -g)/playwright" client/tests/node_modules/`.

## Aturan yang diterapkan

| Hal | Aturan | Sumber |
|---|---|---|
| Hak akses | AD-06 & AD-07 untuk Staf dan Owner; service menolak tamu & pelanggan | SPEC §2, §7 |
| Produk wajib | Nama (maks. 100), kategori, harga > 0, tipe, lead time; maks. 5 foto; validasi inline | Validation rule Produk, FR-30 |
| Lead time | Ready 0 · Pre-order ≥ 1 (H-1) · Custom ≥ 3 (H-3); maks. 12 hari (asumsi: tetap di jendela tanggal 14 hari Detail/Checkout) | SPEC §8, BR-02 |
| Nonaktif | Produk nonaktif hilang dari katalog, pencarian, detail; tidak dihapus karena dirujuk pesanan/keranjang | FR-30, A-05 |
| Varian | Nama wajib & unik per produk, harga tambahan ≥ 0; varian tersimpan hanya dinonaktifkan | FR-30, SPEC §8 |
| Konsistensi katalog | Kategori Custom Cake ↔ tipe custom; hanya satu produk custom aktif (dasar Custom Cake Builder); custom tanpa varian aktif | C-06, C-11 |
| Foto | Foto contoh tetap WebP lokal (Step 5.1); foto baru diperkecil (≤ 1024 px) → data URL di mode mock; foto pertama = foto utama | FR-30, Step 5.1 |
| Opsi custom cake | Nama wajib & unik per kelompok, harga tambahan ≥ 0; hanya opsi aktif di builder; tiap kelompok ≥ 1 opsi aktif | FR-31, validation rule Custom cake |
| Stok harian | Rencana (qty_planned) bilangan bulat ≥ terjual (sisa tidak negatif); semua baris sah atau tidak ada yang disimpan; hanya produk ready aktif | FR-32, validation rule Stok, BR-01 |
| Terjual | Tidak diubah admin — bertambah saat pesanan dibuat, kembali saat batal | TF-12 |
| Bahan baku | Nama unik, satuan wajib, stok & minimum ≥ 0 (maks. 2 desimal); status Habis (≤ 0) / Menipis (≤ minimum) / Aman | FR-32, UI/UX Spec Batch 7 |
| Persistensi | Katalog admin (`products`, `product_images`, `product_variants`, `custom_options`, `raw_materials`) & rencana stok admin tidak ditimpa saat data contoh dibuat ulang | `services/mock/db.js` |

## Skenario uji manual

Akun: Staf `staf@demo.com`, Owner `owner@demo.com`, Pelanggan `pelanggan@demo.com` (sandi `demo1234`).

| Requirement | Langkah | Hasil yang diharapkan |
|---|---|---|
| FR-26 | Login Pelanggan, buka `/admin/produk` dan `/admin/stok` | Dialihkan ke Beranda |
| FR-30 | Login Staf → Produk & Custom Cake | Tabel: foto, nama, kategori, tipe (Ready / Pre-order H-1 / Custom H-3), harga, stok hari ini, rating, toggle aktif, Ubah |
| FR-30 | Tambah Produk → Simpan tanpa isi | Error "Isi nama produk", "Pilih kategori", "Harga harus lebih dari Rp 0" |
| BR-02 | Tipe Pre-order, lead time 0 | "Pre-order minimal 1 hari (H-1)" |
| FR-30 | Isi lengkap, unggah 2 foto, jadikan foto 2 utama, tambah varian, Simpan | Toast "Produk ditambahkan"; muncul di tabel & katalog pelanggan dengan foto utama yang dipilih |
| FR-30 | Unggah 6 foto | Hanya 5 diterima + "Maksimal 5 foto. 1 foto tidak ditambahkan." |
| FR-30 | Nonaktifkan produk lewat toggle | Hilang dari katalog/pencarian; detail produk "tidak ditemukan"; aktifkan lagi → tampil kembali |
| FR-31 | Tab Opsi Custom Cake → Tambah opsi Rasa "Vanilla" | "Nama sudah dipakai di kelompok Rasa" |
| FR-31 | Tambah "Pandan" +Rp 30.000, nonaktifkan "Red Velvet" | Builder C-11 menampilkan Pandan, tanpa Red Velvet; harga berjalan memakai harga baru |
| FR-31 | Nonaktifkan semua opsi Ukuran | Opsi terakhir ditolak: "Kelompok Ukuran harus punya minimal satu opsi aktif" |
| FR-32 | Stok → isi rencana Croissant di bawah jumlah terjual | "Minimal N (sudah terjual N)", Simpan Stok nonaktif |
| FR-32 | Isi rencana Pain au Chocolat 12 → Simpan Stok | Status Tersedia; produk kembali di Fresh from Oven Today |
| TF-12 | Pelanggan pesan 2 Croissant lalu batalkan | Terjual +2 lalu kembali |
| FR-32 | Tab Bahan Baku → Catat Stok Masuk Butter 2,1 | Stok 8,6 kg → Aman; ringkasan Menipis berkurang |
| FR-32 | Ubah Telur ayam stok 60 & minimum 80 | Peringatan "ditandai Menipis" di form |
| FR-32 | Tambah Bahan stok 0 | Status Habis; muncul di peringatan Stok Menipis Dashboard Owner |
| — | Muat ulang halaman / keesokan harinya | Produk, opsi, bahan, dan rencana stok yang diisi admin tetap ada |
