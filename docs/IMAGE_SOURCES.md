# IMAGE_SOURCES — Sumber Fotografi Produk Oven & Co.

Semua foto produk di `client/public/images/products/` adalah **fotografi stok** dari
[Unsplash](https://unsplash.com). Foto-foto ini hanya **foto ilustrasi** jenis produk, bukan foto
produk Oven & Co. yang sebenarnya. Karena itu galeri Detail Produk menampilkan penanda
"Foto ilustrasi" (`constants/media.js`). Tidak ada foto hasil AI image generator,
generative fill, atau ilustrasi sintetis.

## Lisensi

- **Unsplash License** — https://unsplash.com/license
  - Boleh diunduh, disalin, dimodifikasi (crop/resize), dan dipakai gratis, termasuk untuk keperluan komersial.
  - Atribusi tidak diwajibkan, tetapi tetap dicantumkan di dokumen ini.
  - Larangan lisensi yang relevan: menjual foto tanpa perubahan berarti, dan menyusun foto
    untuk membuat layanan sejenis Unsplash. Penggunaan sebagai aset website ini tidak termasuk larangan tersebut.
- Setiap foto diperiksa satu per satu di halaman fotonya (16 Okt 2026). Halaman tersebut mencantumkan
  "Free to use under the Unsplash License" dan `license: https://unsplash.com/license` di metadata.
  Tidak ada foto Unsplash+ (berbayar) yang dipakai.

## Verifikasi keaslian foto

- 13 dari 15 foto punya data kamera (EXIF) yang tampil di halaman fotonya.
  Dua foto tanpa EXIF (`cinnamon-roll-1`, `cinnamon-roll-2`, satu sesi pemotretan) terbit pada Juli 2020,
  yaitu sebelum generator gambar fotorealistis tersebar luas.
- Kandidat ditolak bila tanpa EXIF dan terbit setelah 2022, bila diunggah akun merek/bakery lain,
  atau bila judul fotonya menunjukkan produk berbeda. Contohnya foto "Oozing caramel cake"
  ditolak untuk Chocolate Lava Cake.
- Gambar tidak dimanipulasi selain crop 4:3, resize, dan kompresi WebP.

## Daftar foto

Format file: `<slug>.webp` 1280×960 (galeri, banner) dan `<slug>-sm.webp` 640×480 (kartu, thumbnail; via `srcset`).
URL sumber unduhan: CDN resmi `images.unsplash.com` dari halaman foto masing-masing.

| File lokal | Produk (ID · nama) | Foto Unsplash (ID → halaman) | Fotografer | Terbit | Kamera (EXIF) | Deskripsi Unsplash | Ukuran |
|---|---|---|---|---|---|---|---|
| `butter-croissant-1.webp`, `butter-croissant-1-sm.webp` | 1 · Classic Butter Croissant | [a4xoMVKzbak](https://unsplash.com/photos/a-croissant-sitting-on-top-of-a-cork-coaster-a4xoMVKzbak) | Vicky Nguyen ([@isszvicky25](https://unsplash.com/@isszvicky25)) | April 11, 2023 | Canon, EOS 700D | a croissant sitting on top of a cork coaster | 122 KB |
| `butter-croissant-2.webp`, `butter-croissant-2-sm.webp` | 1 · Classic Butter Croissant | [AaRR995SYcE](https://unsplash.com/photos/a-piece-of-bread-sitting-on-top-of-a-cork-coaster-AaRR995SYcE) | Vicky Nguyen ([@isszvicky25](https://unsplash.com/@isszvicky25)) | April 11, 2023 | Canon, EOS 700D | a piece of bread sitting on top of a cork coaster | 100 KB |
| `cinnamon-roll-1.webp`, `cinnamon-roll-1-sm.webp` | 2 · Signature Cinnamon Roll | [DE-ZospqOqU](https://unsplash.com/photos/brown-wooden-spoon-with-white-and-brown-pastry-DE-ZospqOqU) | Yosep Sugiarto ([@otjep](https://unsplash.com/@otjep)) | July 4, 2020 | — | brown wooden spoon with white and brown pastry | 108 KB |
| `cinnamon-roll-2.webp`, `cinnamon-roll-2-sm.webp` | 2 · Signature Cinnamon Roll | [1PEqqv4i2iM](https://unsplash.com/photos/brown-bread-on-brown-wooden-chopping-board-1PEqqv4i2iM) | Yosep Sugiarto ([@otjep](https://unsplash.com/@otjep)) | July 4, 2020 | — | brown bread on brown wooden chopping board | 64 KB |
| `lava-cake-1.webp`, `lava-cake-1-sm.webp` | 3 · Chocolate Lava Cake | [Pzjez86SsvQ](https://unsplash.com/photos/chocolate-cake-on-white-ceramic-plate-Pzjez86SsvQ) | Max Griss ([@grissphoto](https://unsplash.com/@grissphoto)) | April 1, 2021 | Panasonic, DMC-G7 | chocolate cake on white ceramic plate | 170 KB |
| `cookies-box-1.webp`, `cookies-box-1-sm.webp` | 4 · Assorted Cookies Box | [H1uISjlRXJE](https://unsplash.com/photos/brown-and-purple-bread-in-brown-cardboard-box-H1uISjlRXJE) | Conor Brown ([@commonboxturtle](https://unsplash.com/@commonboxturtle)) | May 31, 2021 | Canon, EOS Rebel T7 | brown and purple bread in brown cardboard box | 106 KB |
| `birthday-cake-1.webp`, `birthday-cake-1-sm.webp` | 5 · Premium Birthday Cake | [n670rQW6n2o](https://unsplash.com/photos/pink-and-white-cake-with-candles-n670rQW6n2o) | Maria ([@maria15](https://unsplash.com/@maria15)) | May 22, 2020 | Canon, EOS REBEL T3i | pink and white cake with candles | 98 KB |
| `custom-cake-1.webp`, `custom-cake-1-sm.webp` | 6 · Custom Celebration Cake | [8LtrMQfeDkQ](https://unsplash.com/photos/baked-strawberry-cake-8LtrMQfeDkQ) | Jasmine Bartel ([@jasminesky](https://unsplash.com/@jasminesky)) | September 18, 2019 | Canon, EOS 6D | baked strawberry cake | 146 KB |
| `almond-croissant-1.webp`, `almond-croissant-1-sm.webp` | 7 · Almond Croissant | [wRU27yGfSLQ](https://unsplash.com/photos/brown-bread-on-white-ceramic-plate-beside-white-ceramic-mug-on-brown-wooden-table-wRU27yGfSLQ) | Maddi Bazzocco ([@maddibazzocco](https://unsplash.com/@maddibazzocco)) | April 11, 2021 | Canon, EOS 5D Mark III | brown bread on white ceramic plate beside white ceramic mug on brown wooden table | 264 KB |
| `almond-croissant-2.webp`, `almond-croissant-2-sm.webp` | 7 · Almond Croissant | [ZHBK_o_KkMk](https://unsplash.com/photos/brown-bread-on-white-and-blue-ceramic-plate-ZHBK_o_KkMk) | Maddi Bazzocco ([@maddibazzocco](https://unsplash.com/@maddibazzocco)) | April 11, 2021 | Canon, EOS 5D Mark III | brown bread on white and blue ceramic plate | 91 KB |
| `pain-au-chocolat-1.webp`, `pain-au-chocolat-1-sm.webp` | 8 · Pain au Chocolat | [uhcWEn7TUyg](https://unsplash.com/photos/a-croissant-on-a-black-plate-on-a-wooden-table-uhcWEn7TUyg) | Natalie Sum ([@nutellasum](https://unsplash.com/@nutellasum)) | April 28, 2023 | SONY, ILCE-7C | a croissant on a black plate on a wooden table | 71 KB |
| `sourdough-1.webp`, `sourdough-1-sm.webp` | 9 · Sourdough Country Loaf | [NPYmhef4kX4](https://unsplash.com/photos/a-loaf-of-bread-sitting-on-top-of-a-counter-NPYmhef4kX4) | Ben Stein ([@benostein](https://unsplash.com/@benostein)) | June 7, 2023 | FUJIFILM, X-T30 | a loaf of bread sitting on top of a counter | 150 KB |
| `milk-bun-1.webp`, `milk-bun-1-sm.webp` | 10 · Soft Milk Bun (isi 6) | [aEe6iWN5WPw](https://unsplash.com/photos/a-close-up-of-a-bunch-of-bread-rolls-aEe6iWN5WPw) | Teresa Kornelsen ([@teresaber](https://unsplash.com/@teresaber)) | December 14, 2022 | Canon, EOS R7 | a close up of a bunch of bread rolls | 57 KB |
| `red-velvet-1.webp`, `red-velvet-1-sm.webp` | 11 · Red Velvet Slice | [NvFHFXrn6jc](https://unsplash.com/photos/delicious-red-velvet-cake-with-strawberries-and-white-cream-NvFHFXrn6jc) | An Shved ([@anshved](https://unsplash.com/@anshved)) | May 27, 2026 | Canon, EOS R6m2 | Delicious red velvet cake with strawberries and white cream | 132 KB |
| `cookies-jar-1.webp`, `cookies-jar-1-sm.webp` | 12 · Choco Chip Cookies Jar | [j82_DYGcdCY](https://unsplash.com/photos/a-bowl-of-cookies-j82_DYGcdCY) | James Trenda ([@trendagraphy](https://unsplash.com/@trendagraphy)) | July 8, 2022 | Canon, EOS R5 | a bowl of cookies | 124 KB |

Total: 30 file, 1,85 MB (versi 1280 px 1,43 MB, versi 640 px 0,42 MB). Sebelumnya ada 25 ilustrasi SVG (19 KB).

## Penggunaan di website

| Lokasi | Sumber gambar |
|---|---|
| ProductCard: Beranda (Fresh from Oven Today, Best Sellers), Katalog, Pencarian, Wishlist | foto utama produk (`sort_order` 1) |
| Galeri Detail Produk (C-09) | semua foto produk, dengan penanda "Foto ilustrasi" |
| Banner promo Beranda | foto utama produk yang dirujuk voucher |
| Banner Custom Cake Beranda | foto utama produk 6 (`custom-cake-1`) |
| Panel Produk Terlaris di Dashboard admin | foto utama produk |

Galeri hanya berisi foto dari **sesi pemotretan yang sama** (fotografer dan tanggal terbit sama)
agar tidak menampilkan produk berbeda seolah-olah satu produk. Produk yang hanya punya satu foto
yang benar-benar sesuai ditampilkan dengan satu foto.

## Foto ulasan pelanggan (`review_photos`)

Data mock ulasan **tidak memakai foto**. Foto katalog atau foto stok tidak boleh tampil seolah-olah
dikirim pelanggan. Foto ulasan hanya berasal dari unggahan pelanggan (FR-09, setelah backend/Step 5.4).

## Tidak diganti

- `client/public/favicon.svg`, ikon lucide-react, logo, dan ilustrasi UI fungsional tetap SVG.
- Onboarding (C-01) tidak memakai foto atau ilustrasi makanan.
- `custom_options.image_url` tetap `null` (opsi Custom Cake dikelola di Step 5.2 / 5.7).
