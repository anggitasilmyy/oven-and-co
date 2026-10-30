// Regresi: tanggal operasional selalu WIB, termasuk saat server ber-zona UTC (audit Step 6.3 · C-5)

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getJakartaDateKey,
  getJakartaMinutes,
  isValidDateKey,
  addDaysToDateKey,
  getJakartaDayRange,
  timeToMinutes,
  formatTime,
} = require('../src/utils/jakartaDate');

test('hari ini dihitung di WIB walaupun UTC masih tanggal sebelumnya', () => {
  // 21 Okt 18.30 UTC = 22 Okt 01.30 WIB
  const now = new Date('2026-10-21T18:30:00.000Z');
  assert.equal(getJakartaDateKey(now), '2026-10-22');
  assert.equal(getJakartaMinutes(now), 90);
});

test('isValidDateKey menolak format salah dan tanggal yang tidak ada', () => {
  assert.equal(isValidDateKey('2026-10-22'), true);
  assert.equal(isValidDateKey('2028-02-29'), true);
  for (const value of ['2026-99-99', '2026-02-30', '2026-10-22T00:00:00Z', '22-10-2026', '', null, 20261022]) {
    assert.equal(isValidDateKey(value), false, String(value));
  }
});

test('addDaysToDateKey melewati batas bulan & tahun', () => {
  assert.equal(addDaysToDateKey('2026-12-30', 3), '2027-01-02');
  assert.equal(addDaysToDateKey('2026-10-01', -1), '2026-09-30');
});

test('rentang hari WIB untuk kolom DATETIME', () => {
  const range = getJakartaDayRange('2026-10-16', '2026-10-22');
  assert.equal(range.gte.toISOString(), '2026-10-15T17:00:00.000Z');
  assert.equal(range.lt.toISOString(), '2026-10-22T17:00:00.000Z');
});

test('kolom TIME Prisma (1970-01-01THH:mm:ssZ) dibaca sebagai jam dinding', () => {
  const cutoff = new Date('1970-01-01T17:00:00.000Z');
  assert.equal(timeToMinutes(cutoff), 17 * 60);
  assert.equal(formatTime(cutoff), '17:00');
  assert.equal(timeToMinutes('07:30'), 450);
  assert.equal(formatTime(null), null);
});
