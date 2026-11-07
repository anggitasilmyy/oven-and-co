// Uji Step 6.6 (CP5 · G6): SEMUA kandidat URL foto produk (src & srcSet) harus menunjuk origin yang benar. srcSet hanya
// dibuat untuk foto lokal /images/products/*.webp; path unggahan server (/uploads/...) — termasuk .webp — tanpa srcSet,
// sehingga browser tidak pernah memilih kandidat relatif "/uploads/..." yang akan diminta ke origin frontend (Vite).

import test from 'node:test';
import assert from 'node:assert/strict';
import { productImageSrcSet } from '../../src/utils/image.js';
import { resolveUploadUrl } from '../../src/utils/uploadUrl.js';

const API = 'http://localhost:4000/api';
/** Kandidat URL yang dilihat browser untuk <ProductImage src> (src hasil toUploadUrl + srcSet) */
const candidates = (src) => [
  resolveUploadUrl(src, API),
  ...(productImageSrcSet(src)?.split(',').map((part) => part.trim().split(/\s+/)[0]) ?? []),
];

test('foto unggahan server (.jpg/.png/.webp): tanpa srcSet, satu-satunya kandidat = origin API', () => {
  for (const ext of ['jpg', 'png', 'webp']) {
    const src = `/uploads/products/0123456789abcdef0123456789abcdef.${ext}`;
    assert.equal(productImageSrcSet(src), undefined, ext);
    assert.deepEqual(candidates(src), [`http://localhost:4000${src}`], ext);
  }
});

test('foto lokal /images/products/*.webp: srcSet tetap (versi -sm + besar), semuanya relatif ke origin frontend', () => {
  const src = '/images/products/almond-croissant-1.webp';
  assert.equal(productImageSrcSet(src), '/images/products/almond-croissant-1-sm.webp 640w, /images/products/almond-croissant-1.webp 1280w');
  assert.ok(candidates(src).every((url) => url.startsWith('/images/products/')));
});

test('data URL (mock) & URL absolut: tanpa srcSet, src apa adanya', () => {
  for (const src of ['data:image/jpeg;base64,AAAA', 'https://cdn.example.com/a.webp', 'http://localhost:4000/uploads/products/a.webp']) {
    assert.equal(productImageSrcSet(src), undefined, src);
    assert.deepEqual(candidates(src), [src]);
  }
});
