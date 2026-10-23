// Uji resolveUploadUrl — re-review d11ebcb (A2): foto referensi disimpan relatif ("/uploads/..."), disajikan
// server API di /uploads (bukan /api/uploads). Tanpa hardcode localhost: origin diambil dari VITE_API_URL.

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveUploadUrl } from '../../src/utils/uploadUrl.js';

const PHOTO = '/uploads/custom-cakes/0123456789abcdef0123456789abcdef.jpg';

test('API lokal (origin lain): origin API + path, TANPA /api', () => {
  assert.equal(
    resolveUploadUrl(PHOTO, 'http://localhost:4000/api'),
    'http://localhost:4000/uploads/custom-cakes/0123456789abcdef0123456789abcdef.jpg'
  );
  assert.equal(resolveUploadUrl(PHOTO, 'http://localhost:4000/api/'), `http://localhost:4000${PHOTO}`);
});

test('API produksi di domain lain (https) tetap memakai origin dari konfigurasi', () => {
  assert.equal(resolveUploadUrl(PHOTO, 'https://api.ovenco.example/api'), `https://api.ovenco.example${PHOTO}`);
  assert.equal(resolveUploadUrl(PHOTO, 'https://api.ovenco.example:8443/v1/api'), `https://api.ovenco.example:8443${PHOTO}`);
});

test('API relatif (proxy di origin yang sama, mis. "/api") → path relatif apa adanya', () => {
  assert.equal(resolveUploadUrl(PHOTO, '/api'), PHOTO);
  assert.equal(resolveUploadUrl(PHOTO, undefined), PHOTO);
});

test('nilai selain path unggahan tidak diubah (data URL mock, URL absolut, aset frontend, kosong)', () => {
  assert.equal(resolveUploadUrl('data:image/jpeg;base64,AAAA', 'http://localhost:4000/api'), 'data:image/jpeg;base64,AAAA');
  assert.equal(resolveUploadUrl('https://cdn.example/a.jpg', 'http://localhost:4000/api'), 'https://cdn.example/a.jpg');
  assert.equal(resolveUploadUrl('/images/products/croissant.webp', 'http://localhost:4000/api'), '/images/products/croissant.webp');
  assert.equal(resolveUploadUrl(null, 'http://localhost:4000/api'), null);
  assert.equal(resolveUploadUrl('', 'http://localhost:4000/api'), null);
});

test('konfigurasi API rusak tidak membuat error: path relatif dikembalikan', () => {
  assert.equal(resolveUploadUrl(PHOTO, 'http://'), PHOTO);
});
