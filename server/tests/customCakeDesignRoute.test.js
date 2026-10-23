// Regresi tingkat HTTP: POST /api/custom-cake-designs — unggah foto (multer), validasi file, pembersihan file
// bila penyimpanan gagal, route statis, dan rate limit (review 49a1214: H1, M4).
// Prisma dipalsukan; file ditulis ke folder sementara OS (UPLOAD_DIR), bukan ke repo.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');

const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ovenco-upload-test-'));
process.env.UPLOAD_DIR = uploadRoot;
process.env.JWT_SECRET = 'test-jwt-secret-only';

const app = require('../src/app');
const { designRateLimit, DESIGN_RATE_LIMIT } = require('../src/routes/customer/customCakeDesign.routes');

const photoDir = path.join(uploadRoot, 'custom-cakes');
// Route memakai waktu nyata → tanggal siap valid = hari ini + 5 (di antara H+3 dan jendela 30 hari)
const readyDate = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(60, 1)]);

let failCreate = false;
const created = [];

const tx = {
  product: {
    findFirst: async () => ({ productId: 6n, price: 450000, availabilityType: 'custom', leadTimeDays: 3 }),
  },
  customOption: {
    findMany: async () => [
      { optionId: 1, optionGroup: 'ukuran', extraPrice: 0 },
      { optionId: 5, optionGroup: 'bentuk', extraPrice: 0 },
      { optionId: 9, optionGroup: 'rasa', extraPrice: 0 },
      { optionId: 13, optionGroup: 'krim_topping', extraPrice: 0 },
    ],
  },
  customCakeDesign: {
    create: async ({ data }) => {
      if (failCreate) throw new Error('DB down');
      created.push(data);
      return { designId: BigInt(1000000 + created.length), price: data.price };
    },
  },
  customCakeDesignOption: { createMany: async () => ({ count: 4 }) },
};

fakePrisma.$transaction = async (callback) => callback(tx);
fakePrisma.user = {
  findUnique: async ({ where }) =>
    ({ 1: { userId: 1n, role: 'customer', isActive: true }, 2: { userId: 2n, role: 'staf', isActive: true } })[
      String(where.userId)
    ] ?? null,
};

let server;
let base;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(uploadRoot, { recursive: true, force: true });
});

test.beforeEach(() => {
  designRateLimit.reset();
  failCreate = false;
});

const design = () => ({
  selections: { ukuran: 1, bentuk: 5, rasa: 9, krim_topping: 13 },
  writingText: 'Selamat',
  writingColor: 'Emas',
  readyDate,
});

function multipart(file, { type = 'image/jpeg', name = 'referensi.jpg', fields = design() } = {}) {
  const form = new FormData();
  form.append('design', JSON.stringify(fields));
  if (file) form.append('referencePhoto', new Blob([file], { type }), name);
  return form;
}

const post = (body, headers = {}) =>
  fetch(`${base}/api/custom-cake-designs`, {
    method: 'POST',
    headers: body instanceof FormData ? headers : { 'Content-Type': 'application/json', ...headers },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });

const filesInPhotoDir = () => (fs.existsSync(photoDir) ? fs.readdirSync(photoDir) : []);

test('foto JPG valid → 201, file tersimpan dengan nama acak, URL relatif disimpan, bisa diambil lewat route statis', async () => {
  const res = await post(multipart(JPEG, { name: 'foto kue (1).jpg' }));
  const json = await res.json();

  assert.equal(res.status, 201, JSON.stringify(json));
  const url = created.at(-1).referencePhotoUrl;
  assert.match(url, /^\/uploads\/custom-cakes\/[a-f0-9]{32}\.jpg$/);
  assert.ok(url.length <= 255);
  assert.ok(fs.existsSync(path.join(photoDir, path.basename(url))));
  assert.ok(json.data.design_token); // tamu

  const image = await fetch(`${base}${url}`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(image.headers.get('content-type'), 'image/jpeg');
});

test('PNG valid diterima; ekstensi file mengikuti isi file', async () => {
  const res = await post(multipart(PNG, { type: 'image/png', name: 'a.png' }));
  assert.equal(res.status, 201);
  assert.match(created.at(-1).referencePhotoUrl, /\.png$/);
});

test('file tidak valid ditolak 400 dan tidak ada file yang ditulis', async () => {
  const before = filesInPhotoDir().length;
  const cases = [
    { file: Buffer.from('<?php echo 1; ?>'.padEnd(64, ' ')), type: 'image/jpeg', name: 'x.jpg' }, // isi bukan foto
    { file: PNG, type: 'image/jpeg', name: 'x.jpg' }, // MIME klien ≠ isi file
    { file: JPEG, type: 'image/gif', name: 'x.gif' }, // tipe tidak didukung
    { file: JPEG, type: 'image/jpeg', name: 'x.exe' }, // nama file tidak valid
    { file: JPEG, type: 'image/jpeg', name: 'evil.jpg.html' },
    { file: Buffer.alloc(0), type: 'image/jpeg', name: 'kosong.jpg' },
  ];

  for (const { file, type, name } of cases) {
    const res = await post(multipart(file, { type, name }));
    assert.equal(res.status, 400, `${name} ${type}`);
  }

  assert.equal(filesInPhotoDir().length, before);
});

test('nama file berisi path tidak pernah dipakai: file tetap bernama acak di folder upload', async () => {
  const outside = path.join(uploadRoot, 'evil.jpg');
  const res = await post(multipart(JPEG, { name: '..\\..\\evil.jpg' }));

  // multer/busboy membuang bagian path dari nama file; server lalu memakai nama acak sendiri
  assert.equal(res.status, 201);
  assert.match(created.at(-1).referencePhotoUrl, /^\/uploads\/custom-cakes\/[a-f0-9]{32}\.jpg$/);
  assert.equal(fs.existsSync(outside), false);
  assert.equal(fs.readdirSync(uploadRoot).includes('evil.jpg'), false);
});

test('file > 5 MB ditolak 400 dengan pesan Indonesia', async () => {
  const big = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]);
  const res = await post(multipart(big));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).message, 'Ukuran foto referensi maksimal 5 MB.');
});

test('desain tidak valid (tanggal < H+3) → 400 dan foto tidak tertinggal', async () => {
  const before = filesInPhotoDir().length;
  const res = await post(multipart(JPEG, { fields: { ...design(), readyDate: new Date().toISOString().slice(0, 10) } }));
  assert.equal(res.status, 400);
  assert.equal(filesInPhotoDir().length, before);
});

test('penyimpanan database gagal → 500 dan file yang sudah ditulis dihapus', async () => {
  const before = filesInPhotoDir().length;
  failCreate = true;
  const res = await post(multipart(JPEG));
  assert.equal(res.status, 500);
  assert.equal(filesInPhotoDir().length, before);
});

test('JSON dengan data URL tetap ditolak; JSON tanpa foto diterima', async () => {
  const dataUrl = await post({ ...design(), referencePhoto: 'data:image/jpeg;base64,AAAA' });
  assert.equal(dataUrl.status, 400);

  const plain = await post(design());
  assert.equal(plain.status, 201);
  assert.equal(created.at(-1).referencePhotoUrl, null);
});

test('field file selain referencePhoto / lebih dari satu file → 400', async () => {
  const form = multipart(null);
  form.append('foto', new Blob([JPEG], { type: 'image/jpeg' }), 'a.jpg');
  assert.equal((await post(form)).status, 400);

  const two = multipart(JPEG);
  two.append('referencePhoto', new Blob([JPEG], { type: 'image/jpeg' }), 'b.jpg');
  assert.equal((await post(two)).status, 400);
});

test('route statis tidak membuka path lain / listing folder', async () => {
  fs.mkdirSync(photoDir, { recursive: true });
  fs.writeFileSync(path.join(uploadRoot, 'rahasia.txt'), 'x');

  for (const target of ['/uploads/custom-cakes/', '/uploads/custom-cakes/..%2Frahasia.txt', '/uploads/rahasia.txt']) {
    const res = await fetch(`${base}${target}`);
    assert.notEqual(res.status, 200, target);
  }
});

test('staf ditolak 403 sebelum file dibaca', async () => {
  const staffToken = jwt.sign({ sub: '2' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
  const res = await post(multipart(JPEG), { Authorization: `Bearer ${staffToken}` });
  assert.equal(res.status, 403);
});

test(`rate limit: permintaan ke-${DESIGN_RATE_LIMIT.max + 1} dari IP yang sama → 429 + Retry-After`, async () => {
  for (let i = 0; i < DESIGN_RATE_LIMIT.max; i++) {
    assert.equal((await post({})).status, 400); // body tidak valid tetap dihitung
  }

  const limited = await post(design());
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.match((await limited.json()).message, /Terlalu banyak desain/);
});

test('re-review A1: referencePhoto JSON berupa URL http(s) / path upload / data URL → 400, tidak ada desain dibuat', async () => {
  const before = created.length;

  for (const referencePhoto of [
    'https://evil.example/pixel.gif',
    '/uploads/custom-cakes/0123456789abcdef0123456789abcdef.jpg', // file milik desain lain
    '/images/products/croissant.webp',
  ]) {
    const res = await post({ ...design(), referencePhoto });
    assert.equal(res.status, 400, referencePhoto);
    assert.match((await res.json()).message, /diunggah sebagai file/);
  }

  // Juga lewat field `design` multipart (file tetap satu-satunya sumber foto)
  const res = await post(multipart(JPEG, { fields: { ...design(), referencePhoto: 'https://evil.example/a.jpg' } }));
  assert.equal(res.status, 400);
  assert.equal(created.length, before);
});

test('regresi zod: tanpa tulisan & tanpa writingColor → 201 (bukan 400 "expected nonoptional")', async () => {
  const { writingText, writingColor, ...rest } = design();
  const res = await post(rest);
  assert.equal(res.status, 201, JSON.stringify(await res.clone().json()));
  assert.equal(created.at(-1).writingColor, null);
});

test('re-review: rate limit tidak menghitung request 401/403 (mis. 401 sesi kedaluwarsa sebelum retry tamu)', async () => {
  const staffToken = jwt.sign({ sub: '2' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
  const expired = jwt.sign({ sub: '1', exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET, { algorithm: 'HS256' });

  for (let i = 0; i < DESIGN_RATE_LIMIT.max + 5; i++) {
    assert.equal((await post(design(), { Authorization: `Bearer ${staffToken}` })).status, 403);
    assert.equal((await post(design(), { Authorization: `Bearer ${expired}` })).status, 401);
  }

  // Kuota tamu dari IP yang sama masih utuh
  assert.equal((await post(design())).status, 201);
});
