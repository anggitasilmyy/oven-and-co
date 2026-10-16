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
| Staf (role `staf`) | Login admin, pesanan & status, verifikasi kode pickup, kalender produksi, produk & opsi custom cake, stok, pelanggan & ulasan. Landing: Pesanan |
| Owner (role `owner`) | Hak Staf + dashboard, laporan & ekspor, promo & loyalty, pengaturan toko & akun staf. Landing: Dashboard |
| Payment Gateway | Eksternal; disimulasikan pada prototype |
| Sistem | Notifikasi, riwayat status, audit log, pembatalan otomatis |

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

Stok ready berkurang saat pesanan DIBUAT dan kembali saat dibatalkan (TF-12).
Harga custom cake = harga dasar + Σ extra_price opsi terpilih.

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
| AD-06 | Produk & Opsi Custom Cake | /admin/produk | Staf, Owner |
| AD-07 | Stok | /admin/stok | Staf, Owner |
| AD-08 | Laporan Penjualan | /admin/laporan | Owner |
| AD-09 | Promo & Loyalty | /admin/promo | Owner |
| AD-10 | Pelanggan & Ulasan | /admin/pelanggan | Staf, Owner |
| AD-11 | Pengaturan | /admin/pengaturan | Owner |

## 8. Data Dictionary (29 tabel)

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
```

Prinsip: saldo poin, level, sisa stok, dan subtotal item TIDAK disimpan sebagai kolom (dihitung).
Data transaksi disimpan sebagai salinan (unit_price, delivery_address_snapshot).

## 9. Data Contoh (seed)

Produk: Classic Butter Croissant (Rp 28.000, ready, badge "Ready · Bisa diambil hari ini"),
Signature Cinnamon Roll, Chocolate Lava Cake, Assorted Cookies Box, Premium Birthday Cake
(badge "Pre-order H-1"), Custom Celebration Cake (custom, H-3).
Kategori: Roti, Cake, Pastry, Cookies, Custom Cake.
Pelanggan demo: saldo 1.250 poin · Gold Member. Contoh nomor pesanan: OVC-261012-018.
Voucher contoh: WEEKEND15.
Harga selain croissant, opsi custom cake, dan nama pelanggan: isi data dummy yang wajar dan beri
komentar `// data contoh` di file seed.

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
