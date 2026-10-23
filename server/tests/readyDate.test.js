// Regresi: BR-01/BR-02 tanggal siap tercepat & jendela tanggal (audit Step 6.3 · C-5, C-6)

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getEarliestReadyDate,
  getLatestSelectableDate,
  isPastPreorderCutoff,
  isWithinDateRange,
} = require('../src/services/readyDate.service');

const settings = { preorderCutoffTime: new Date('1970-01-01T17:00:00.000Z') };

test('custom cake minimal H+3 dihitung dari tanggal WIB', () => {
  // 21 Okt 20.00 UTC = 22 Okt 03.00 WIB → H+3 = 25 Okt
  const now = new Date('2026-10-21T20:00:00.000Z');
  assert.equal(getEarliestReadyDate({ availabilityType: 'custom', leadTimeDays: 0 }, now), '2026-10-25');
  // lead time produk lebih lama dari 3 hari dipakai
  assert.equal(getEarliestReadyDate({ availabilityType: 'custom', leadTimeDays: 5 }, now), '2026-10-27');
});

test('pre-order H-1; lewat batas jam 17.00 WIB mundur satu hari, tepat 17.00 masih boleh', () => {
  const product = { availabilityType: 'preorder', leadTimeDays: 1 };
  const at1700 = new Date('2026-10-22T10:00:00.000Z'); // 17.00 WIB
  const at1701 = new Date('2026-10-22T10:01:00.000Z'); // 17.01 WIB

  assert.equal(isPastPreorderCutoff(at1700, settings.preorderCutoffTime), false);
  assert.equal(isPastPreorderCutoff(at1701, settings.preorderCutoffTime), true);
  assert.equal(getEarliestReadyDate(product, at1700, settings), '2026-10-23');
  assert.equal(getEarliestReadyDate(product, at1701, settings), '2026-10-24');
});

test('produk ready siap hari ini; tidak punya batas atas tanggal', () => {
  const now = new Date('2026-10-22T03:00:00.000Z');
  assert.equal(getEarliestReadyDate({ availabilityType: 'ready', leadTimeDays: 0 }, now), '2026-10-22');
  assert.equal(getLatestSelectableDate('ready', now), null);
});

test('jendela date picker: pre-order 14 hari, custom 30 hari', () => {
  const now = new Date('2026-10-22T03:00:00.000Z');
  assert.equal(getLatestSelectableDate('preorder', now), '2026-11-04');
  assert.equal(getLatestSelectableDate('custom', now), '2026-11-20');
  assert.equal(isWithinDateRange('2026-11-20', '2026-10-25', '2026-11-20'), true);
  assert.equal(isWithinDateRange('2026-11-21', '2026-10-25', '2026-11-20'), false);
  assert.equal(isWithinDateRange('2026-10-24', '2026-10-25', null), false);
});
