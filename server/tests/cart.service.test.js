// Regresi: keamanan desain custom cake & tanggal di keranjang (audit Step 6.3 · C-3, C-6)
// Prisma dipalsukan — tidak ada query ke MySQL.

const test = require('node:test');
const assert = require('node:assert/strict');
const fakePrisma = require('./helpers/fakePrisma');

process.env.JWT_SECRET = 'test-jwt-secret-only';

const { getCartView, UNAVAILABLE_REASON } = require('../src/services/cart.service');
const { selectClaimableGuestDesignIds } = require('../src/services/designAccess.service');
const { signDesignToken } = require('../src/utils/designToken');

// 22 Okt 2026 10.00 WIB → custom paling cepat 25 Okt, pre-order paling lambat 4 Nov
const NOW = new Date('2026-10-22T03:00:00.000Z');

const products = [
  { productId: 1n, name: 'Croissant', price: 28000, availabilityType: 'ready', leadTimeDays: 0, isActive: true,
    images: [{ imageUrl: '/c.webp' }], variants: [], dailyStocks: [{ qtyPlanned: 10, qtySold: 7 }] },
  { productId: 3n, name: 'Sourdough', price: 55000, availabilityType: 'preorder', leadTimeDays: 1, isActive: true,
    images: [], variants: [], dailyStocks: [] },
  { productId: 6n, name: 'Custom Cake', price: 450000, availabilityType: 'custom', leadTimeDays: 3, isActive: true,
    images: [], variants: [], dailyStocks: [] },
];

const design = (overrides) => ({
  productId: 6n,
  userId: null,
  writingText: 'Happy Birthday Rina',
  writingColor: 'Cokelat',
  referencePhotoUrl: null,
  readyDate: new Date('2026-10-26T00:00:00.000Z'),
  price: 625000,
  options: [{ option: { name: 'Diameter 20 cm' } }],
  orderItems: [],
  ...overrides,
});

const designs = [
  design({ designId: 10n, userId: 1n }), // milik pelanggan 1
  design({ designId: 11n, userId: 2n }), // milik pelanggan lain
  design({ designId: 12n, userId: null }), // desain tamu
  design({ designId: 13n, userId: 1n, orderItems: [{ orderItemId: 99n }] }), // sudah dipesan
  design({ designId: 14n, userId: 1n, readyDate: new Date('2026-10-18T00:00:00.000Z') }), // kedaluwarsa
  design({ designId: 15n, userId: 1n, readyDate: new Date('2026-10-24T00:00:00.000Z') }), // < H+3 hari ini
  design({ designId: 16n, userId: null, orderItems: [{ orderItemId: 98n }] }), // tamu, sudah dipesan
];

fakePrisma.storeSetting = {
  findFirst: async () => ({ preorderCutoffTime: new Date('1970-01-01T17:00:00.000Z') }),
};
fakePrisma.product = {
  findMany: async ({ where }) => products.filter((p) => where.productId.in.includes(p.productId)),
};
fakePrisma.customCakeDesign = {
  findMany: async ({ where }) => designs.filter((d) => where.designId.in.includes(d.designId)),
};

const line = (overrides) => ({
  cart_item_id: 'x', product_id: '6', variant_id: null, design_id: null, quantity: 1,
  preferred_date: null, note: null, name: null, image_url: null, price: 1, ...overrides,
});

async function viewOne(item, userId) {
  const view = await getCartView([line(item)], { userId, now: NOW });
  return { view, line: view.lines[0] };
}

test('pelanggan dapat memakai desain miliknya sendiri', async () => {
  const { view, line: result } = await viewOne({ design_id: '10' }, '1');
  assert.equal(result.available, true);
  assert.equal(result.unit_price, 625000);
  assert.equal(result.ready_date, '2026-10-26');
  assert.equal(result.design.writing, '"Happy Birthday Rina" · Cokelat');
  assert.equal(view.subtotal, 625000);
});

test('desain milik pelanggan lain ditolak dan isinya tidak dikirim', async () => {
  for (const userId of ['1', null]) {
    const { view, line: result } = await viewOne({ design_id: '11' }, userId);
    assert.equal(result.available, false);
    assert.equal(result.unavailable_reason, UNAVAILABLE_REASON.DESIGN_NOT_FOUND);
    assert.equal(result.design, null);
    assert.equal(result.unit_price, 1); // harga cadangan dari item, bukan harga desain orang lain
    assert.equal(view.subtotal, 0);
  }
});

test('desain tamu + token valid boleh dipakai tamu maupun pelanggan setelah login', async () => {
  for (const userId of [null, '1']) {
    const { line: result } = await viewOne({ design_id: '12', design_token: signDesignToken(12n) }, userId);
    assert.equal(result.available, true);
    assert.equal(result.design.writing, '"Happy Birthday Rina" · Cokelat');
  }
});

test('desain tamu TANPA token ditolak dan isinya tidak dikirim (design_id tidak bisa ditebak)', async () => {
  for (const userId of [null, '1']) {
    const { view, line: result } = await viewOne({ design_id: '12' }, userId);
    assert.equal(result.available, false);
    assert.equal(result.unavailable_reason, UNAVAILABLE_REASON.DESIGN_NOT_FOUND);
    assert.equal(result.design, null);
    assert.equal(view.subtotal, 0);
  }
});

test('desain tamu dengan token tidak valid / token milik desain lain ditolak', async () => {
  for (const design_token of ['x'.repeat(43), 'salah', signDesignToken(10n)]) {
    const { line: result } = await viewOne({ design_id: '12', design_token }, null);
    assert.equal(result.unavailable_reason, UNAVAILABLE_REASON.DESIGN_NOT_FOUND);
    assert.equal(result.design, null);
  }
});

test('token tidak membuka desain milik pelanggan lain', async () => {
  const { line: result } = await viewOne({ design_id: '11', design_token: signDesignToken(11n) }, null);
  assert.equal(result.unavailable_reason, UNAVAILABLE_REASON.DESIGN_NOT_FOUND);
  assert.equal(result.design, null);
});

test('desain tamu yang sudah dipesan tetap sekali pakai walau token valid', async () => {
  const { line: result } = await viewOne({ design_id: '16', design_token: signDesignToken(16n) }, null);
  assert.equal(result.unavailable_reason, UNAVAILABLE_REASON.DESIGN_ALREADY_ORDERED);
});

test('persiapan Phase 2: hanya desain tamu bertoken valid & belum dipesan yang bisa diklaim', () => {
  const byId = new Map(designs.map((d) => [String(d.designId), d]));
  const claimable = selectClaimableGuestDesignIds(
    [
      { design_id: '12', design_token: signDesignToken(12n) }, // ✓
      { design_id: '12', design_token: signDesignToken(12n) }, // duplikat → sekali
      { design_id: '16', design_token: signDesignToken(16n) }, // sudah dipesan
      { design_id: '11', design_token: signDesignToken(11n) }, // sudah punya pemilik
      { design_id: '12', design_token: 'salah' },
      { design_id: null },
    ],
    byId
  );
  assert.deepEqual(claimable, ['12']);
});

test('desain yang sudah dipakai pesanan ditolak', async () => {
  const { line: result } = await viewOne({ design_id: '13' }, '1');
  assert.equal(result.available, false);
  assert.equal(result.unavailable_reason, UNAVAILABLE_REASON.DESIGN_ALREADY_ORDERED);
});

test('desain dengan tanggal siap < H+3 (kedaluwarsa) ditolak', async () => {
  for (const designId of ['14', '15']) {
    const { view, line: result } = await viewOne({ design_id: designId }, '1');
    assert.equal(result.available, false);
    assert.equal(result.unavailable_reason, UNAVAILABLE_REASON.DESIGN_EXPIRED);
    assert.equal(view.ready_date, null);
  }
});

test('custom cake tanpa desain atau desain tidak ada ditolak', async () => {
  assert.equal((await viewOne({}, '1')).line.unavailable_reason, UNAVAILABLE_REASON.DESIGN_REQUIRED);
  assert.equal((await viewOne({ design_id: '999' }, '1')).line.unavailable_reason, UNAVAILABLE_REASON.DESIGN_NOT_FOUND);
});

test('design_id pada produk non-custom ditolak', async () => {
  const { line: result } = await viewOne({ product_id: '1', design_id: '10' }, '1');
  assert.equal(result.unavailable_reason, UNAVAILABLE_REASON.DESIGN_MISMATCH);
  assert.equal(result.design, null);
});

test('pre-order: tanggal di luar jendela ditolak, tanggal terlewat digeser ke tanggal tercepat', async () => {
  const late = await viewOne({ product_id: '3', preferred_date: '2026-11-05' }, '1');
  assert.equal(late.line.unavailable_reason, UNAVAILABLE_REASON.DATE_OUT_OF_RANGE);

  const past = await viewOne({ product_id: '3', preferred_date: '2026-10-20' }, '1');
  assert.equal(past.line.available, true);
  assert.equal(past.line.ready_date, '2026-10-23');

  const chosen = await viewOne({ product_id: '3', preferred_date: '2026-11-04' }, '1');
  assert.equal(chosen.line.ready_date, '2026-11-04');
});

test('BR-03 & stok: tanggal siap gabungan = terlama, stok ready dijumlah per produk', async () => {
  const view = await getCartView(
    [line({ product_id: '1', quantity: 2 }), line({ product_id: '1', quantity: 2 }), line({ design_id: '10' })],
    { userId: '1', now: NOW }
  );
  assert.equal(view.ready_date, '2026-10-26');
  assert.deepEqual(view.stock_issues, [{ product_id: '1', remaining: 3 }]);
  assert.equal(view.subtotal, 28000 * 4 + 625000);
});

test('produk tidak ada → tidak tersedia & tidak masuk subtotal', async () => {
  const { view, line: result } = await viewOne({ product_id: '404', name: 'Lama', price: 5000 }, null);
  assert.equal(result.available, false);
  assert.equal(result.unavailable_reason, UNAVAILABLE_REASON.PRODUCT_UNAVAILABLE);
  assert.equal(result.name, 'Lama');
  assert.equal(view.subtotal, 0);
});

test('regresi gabung keranjang: baris > 99 ditandai, baris lain tetap tampil, request tidak gagal', async () => {
  // Keranjang tamu 60 + keranjang akun 50 pre-order yang sama → 110 setelah digabung frontend
  const view = await getCartView(
    [
      line({ cart_item_id: 'a', product_id: '3', quantity: 110 }),
      line({ cart_item_id: 'b', product_id: '1', quantity: 2 }),
    ],
    { userId: '1', now: NOW }
  );

  const [over, normal] = view.lines;
  assert.equal(over.available, false);
  assert.equal(over.unavailable_reason, UNAVAILABLE_REASON.QUANTITY_EXCEEDS_LIMIT);
  assert.equal(over.quantity, 110); // tidak dipotong diam-diam
  assert.equal(normal.available, true);
  assert.equal(view.subtotal, 56000);

  // Setelah pelanggan menyesuaikan ke 99, baris kembali tersedia
  const fixed = await getCartView([line({ product_id: '3', quantity: 99 })], { userId: '1', now: NOW });
  assert.equal(fixed.lines[0].available, true);
});

test('keranjang > 50 baris tetap tampil dengan exceeds_line_limit', async () => {
  const items = Array.from({ length: 51 }, (_, i) => line({ cart_item_id: String(i), product_id: '3', note: `n${i}` }));
  const view = await getCartView(items, { userId: '1', now: NOW });
  assert.equal(view.lines.length, 51);
  assert.equal(view.line_limit, 50);
  assert.equal(view.exceeds_line_limit, true);
  assert.equal((await getCartView(items.slice(0, 50), { userId: '1', now: NOW })).exceeds_line_limit, false);
});

test('tanggal operasional: sekitar tengah malam WIB saat jam UTC masih hari sebelumnya', async () => {
  // 25 Okt 16.59 UTC = 25 Okt 23.59 WIB → H+3 = 28 Okt; desain 26 Okt sudah kedaluwarsa
  const beforeMidnight = new Date('2026-10-25T16:59:00.000Z');
  // 25 Okt 17.00 UTC = 26 Okt 00.00 WIB → hari ini 26 Okt
  const afterMidnight = new Date('2026-10-25T17:00:00.000Z');

  const late = await getCartView([line({ design_id: '10' })], { userId: '1', now: beforeMidnight });
  assert.equal(late.today_key, '2026-10-25');
  assert.equal(late.lines[0].unavailable_reason, UNAVAILABLE_REASON.DESIGN_EXPIRED);

  const next = await getCartView([line({ product_id: '1' })], { userId: '1', now: afterMidnight });
  assert.equal(next.today_key, '2026-10-26');
  assert.equal(next.lines[0].ready_date, '2026-10-26');

  // Pre-order dipesan 23.59 WIB (lewat batas 17.00) → H-1 + 1 hari
  const preorder = await getCartView([line({ product_id: '3' })], { userId: '1', now: beforeMidnight });
  assert.equal(preorder.lines[0].ready_date, '2026-10-27');
});

test('aturan B: satu desain boleh jumlah > 1 pada SATU baris (kue identik), subtotal = harga × jumlah', async () => {
  const view = await getCartView([line({ design_id: '10', quantity: 3 })], { userId: '1', now: NOW });
  assert.equal(view.lines[0].available, true);
  assert.equal(view.lines[0].line_total, 625000 * 3);
  assert.equal(view.subtotal, 625000 * 3);
});

test('aturan B: desain yang sama di baris kedua (catatan berbeda) ditolak & tidak masuk subtotal', async () => {
  const view = await getCartView(
    [
      line({ cart_item_id: 'a', design_id: '10', quantity: 2, note: 'Lilin angka 7' }),
      line({ cart_item_id: 'b', design_id: '10', quantity: 5, note: 'Tanpa lilin' }),
      line({ cart_item_id: 'c', product_id: '1', quantity: 1 }),
    ],
    { userId: '1', now: NOW }
  );

  const [first, duplicate, croissant] = view.lines;
  assert.equal(first.available, true);
  assert.equal(duplicate.available, false);
  assert.equal(duplicate.unavailable_reason, UNAVAILABLE_REASON.DESIGN_DUPLICATE_LINE);
  assert.equal(croissant.available, true);
  // Hanya baris pertama yang dihitung: 2 × desain + 1 croissant (bukan 7 × desain)
  assert.equal(view.subtotal, 625000 * 2 + 28000);
});

test('aturan B: duplikasi baris tidak bisa dipakai melewati aturan sekali pakai / token', async () => {
  // Desain yang sudah dipesan tetap ditolak di setiap baris (alasan sekali pakai lebih dulu)
  const ordered = await getCartView(
    [line({ design_id: '13' }), line({ design_id: '13', note: 'x' })],
    { userId: '1', now: NOW }
  );
  assert.deepEqual(ordered.lines.map((l) => l.unavailable_reason), ['design_already_ordered', 'design_already_ordered']);
  assert.equal(ordered.subtotal, 0);

  // Desain tamu: baris pertama tanpa token, baris kedua dengan token → hanya baris bertoken bisa dibaca,
  // dan baris itu tetap duplikat (design_id sudah muncul) sehingga tidak ada yang lolos ganda
  const token = signDesignToken(12n);
  const guest = await getCartView(
    [line({ design_id: '12', design_token: token, quantity: 1 }), line({ design_id: '12', design_token: token, quantity: 4 })],
    { userId: null, now: NOW }
  );
  assert.deepEqual(guest.lines.map((l) => l.available), [true, false]);
  assert.equal(guest.subtotal, 625000);
});

test('findDuplicateDesignLines: kemunculan pertama dipertahankan, baris tanpa desain diabaikan', () => {
  const { findDuplicateDesignLines } = require('../src/services/designAccess.service');
  const duplicates = findDuplicateDesignLines([
    { design_id: '1' }, { design_id: null }, { design_id: '2' }, { design_id: '1' }, { design_id: '1' },
  ]);
  assert.deepEqual([...duplicates], [3, 4]);
});

test('re-review B: baris pertama token TIDAK valid tidak membuat baris berikutnya yang valid dianggap duplikat', async () => {
  const valid = signDesignToken(12n);
  const view = await getCartView(
    [
      line({ cart_item_id: 'a', design_id: '12', design_token: 'x'.repeat(43), quantity: 4 }), // token rusak
      line({ cart_item_id: 'b', design_id: '12', design_token: valid, quantity: 2 }), // sah → pemilik
      line({ cart_item_id: 'c', design_id: '12', design_token: valid, quantity: 3 }), // sah tetapi duplikat
    ],
    { userId: null, now: NOW }
  );

  assert.deepEqual(
    view.lines.map((l) => [l.cart_item_id, l.available, l.unavailable_reason]),
    [
      ['a', false, 'design_not_found'],
      ['b', true, null],
      ['c', false, 'design_duplicate_line'],
    ]
  );
  // Subtotal hanya baris sah pertama: 2 × harga desain (bukan 4, 5, atau 9 ×)
  assert.equal(view.subtotal, 625000 * 2);
  assert.equal(view.lines[0].design, null); // isi desain tidak bocor ke baris bertoken rusak
});

test('re-review B: desain kedaluwarsa / sudah dipesan di baris pertama tidak "memiliki" desain lain', async () => {
  const view = await getCartView(
    [line({ design_id: '14' }), line({ design_id: '10', quantity: 2 }), line({ design_id: '10', note: 'lain' })],
    { userId: '1', now: NOW }
  );
  assert.deepEqual(view.lines.map((l) => l.unavailable_reason), ['design_expired', null, 'design_duplicate_line']);
  assert.equal(view.subtotal, 625000 * 2);
});

test('re-review #3: validitas desain ≠ validitas jumlah — baris pertama > 99 tetap pemilik desain', async () => {
  // Baris pertama desain sah tetapi jumlahnya di atas batas; baris kedua dengan desain yang sama tetap duplikat
  const view = await getCartView(
    [line({ cart_item_id: 'a', design_id: '10', quantity: 150 }), line({ cart_item_id: 'b', design_id: '10', quantity: 2 })],
    { userId: '1', now: NOW }
  );
  assert.deepEqual(view.lines.map((l) => l.unavailable_reason), ['quantity_exceeds_limit', 'design_duplicate_line']);
  assert.equal(view.subtotal, 0);

  // Setelah jumlah baris pertama disesuaikan (≤ 99), baris itu tersedia dan baris kedua tetap duplikat
  const fixed = await getCartView(
    [line({ cart_item_id: 'a', design_id: '10', quantity: 99 }), line({ cart_item_id: 'b', design_id: '10', quantity: 2 })],
    { userId: '1', now: NOW }
  );
  assert.deepEqual(fixed.lines.map((l) => l.unavailable_reason), [null, 'design_duplicate_line']);
  assert.equal(fixed.subtotal, 625000 * 99);
});
