// Uji Step 6.6 (CP4 · G15) — toZonedWallClock: jam/tanggal WIB untuk slot checkout mode API, apa pun zona perangkat.
// Zona proses Node diganti saat runtime (process.env.TZ) untuk meniru perangkat UTC, WIB, +09:00, dan zona barat.

import test from 'node:test';
import assert from 'node:assert/strict';

const { toZonedWallClock, toDateKey } = await import('../../src/utils/date.js');
const { getTimeSlotOptions } = await import('../../src/utils/rules/checkout.js');
const { TIME_SLOTS } = await import('../../src/constants/checkout.js');
const { STORE_TIME_ZONE } = await import('../../src/constants/storeConfig.js');

const DEVICE_ZONES = ['UTC', 'Asia/Jakarta', 'Asia/Tokyo', 'America/New_York', 'Asia/Makassar'];
const HOURS = { is_open: true, open_time: '07:00', close_time: '20:00' };
const originalTz = process.env.TZ;
test.after(() => { process.env.TZ = originalTz; });

const enabledSlots = (nowIso, dateKey) =>
  getTimeSlotOptions(TIME_SLOTS, dateKey, toZonedWallClock(nowIso), HOURS).filter((s) => !s.disabled).map((s) => s.label);

test('zona toko = Asia/Jakarta', () => assert.equal(STORE_TIME_ZONE, 'Asia/Jakarta'));

test('10.05 WIB (03.05Z) → jam 10.05 & tanggal 2026-11-07 di semua zona perangkat', () => {
  for (const zone of DEVICE_ZONES) {
    process.env.TZ = zone;
    const wall = toZonedWallClock('2026-11-07T03:05:30.000Z');
    assert.deepEqual([wall.getHours(), wall.getMinutes(), wall.getSeconds(), toDateKey(wall)], [10, 5, 30, '2026-11-07'], zone);
  }
});

test('lewat tengah malam WIB (17.30Z = 00.30 WIB besok) → tanggal WIB, bukan tanggal perangkat', () => {
  for (const zone of DEVICE_ZONES) {
    process.env.TZ = zone;
    const wall = toZonedWallClock('2026-11-07T17:30:00.000Z');
    assert.deepEqual([toDateKey(wall), wall.getHours(), wall.getMinutes()], ['2026-11-08', 0, 30], zone);
  }
});

test('G15: slot hari ini yang sudah dimulai tidak ditawarkan, slot mendatang tetap tersedia — sama di semua zona', () => {
  for (const zone of DEVICE_ZONES) {
    process.env.TZ = zone;
    assert.deepEqual(enabledSlots('2026-11-07T03:05:00.000Z', '2026-11-07'),
      ['11.00–13.00', '13.00–15.00', '15.00–17.00', '17.00–19.00'], `${zone} pukul 10.05 WIB`);
    // 18.01 WIB: slot terakhir (17.00–19.00) sudah dimulai → tidak ada slot hari ini
    assert.deepEqual(enabledSlots('2026-11-07T11:01:00.000Z', '2026-11-07'), [], `${zone} 18.01 WIB`);
    // Tanggal mendatang: semua slot tersedia
    assert.equal(enabledSlots('2026-11-07T03:05:00.000Z', '2026-11-08').length, TIME_SLOTS.filter((s) => s.end <= '20:00').length, zone);
  }
});

test('regresi bukti bug: tanpa konversi, perangkat UTC menawarkan slot yang sudah lewat (perilaku lama)', () => {
  process.env.TZ = 'UTC';
  const old = getTimeSlotOptions(TIME_SLOTS, '2026-11-07', new Date('2026-11-07T03:05:00.000Z'), HOURS).filter((s) => !s.disabled);
  assert.ok(old.some((s) => s.label === '07.00–09.00'));
  process.env.TZ = 'Asia/Tokyo';
  const tokyo = getTimeSlotOptions(TIME_SLOTS, '2026-11-07', new Date('2026-11-07T03:05:00.000Z'), HOURS).filter((s) => !s.disabled);
  assert.ok(!tokyo.some((s) => s.label === '11.00–13.00'), 'perangkat +09:00 dulu menonaktifkan slot 11.00–13.00 yang masih sah');
});
