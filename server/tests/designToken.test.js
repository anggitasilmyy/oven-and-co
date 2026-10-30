// Regresi: token akses desain custom cake tamu (HMAC-SHA256, perbandingan waktu-konstan)

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'test-jwt-secret-only';
delete process.env.DESIGN_TOKEN_SECRET;

const { signDesignToken, verifyDesignToken, assertDesignTokenConfigured } = require('../src/utils/designToken');

test('token valid hanya untuk design_id yang ditandatangani', () => {
  const token = signDesignToken(12n);

  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(verifyDesignToken(12n, token), true);
  assert.equal(verifyDesignToken('12', token), true);
  assert.equal(verifyDesignToken(13n, token), false);
});

test('token tidak valid / kosong / format salah ditolak tanpa error', () => {
  const token = signDesignToken(12n);
  const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;

  for (const value of [tampered, '', null, undefined, 123, 'x'.repeat(43), `${token}=`, token.slice(1)]) {
    assert.equal(verifyDesignToken(12n, value), false, String(value));
  }
});

test('kunci turunan JWT_SECRET berbeda dari DESIGN_TOKEN_SECRET; ganti kunci → token lama tidak berlaku', () => {
  const derivedToken = signDesignToken(12n);

  process.env.DESIGN_TOKEN_SECRET = 'dedicated-secret';
  assert.notEqual(signDesignToken(12n), derivedToken);
  assert.equal(verifyDesignToken(12n, derivedToken), false);

  delete process.env.DESIGN_TOKEN_SECRET;
  assert.equal(verifyDesignToken(12n, derivedToken), true);
});

test('tanpa kunci sama sekali → error 500 dengan pesan tanpa rahasia', () => {
  const saved = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;

  assert.throws(assertDesignTokenConfigured, { statusCode: 500 });
  process.env.JWT_SECRET = saved;
});
