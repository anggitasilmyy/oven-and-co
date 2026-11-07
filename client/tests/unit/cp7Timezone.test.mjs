// Uji Step 6.6 (CP7 · G12) mode API — timestamp server (ISO UTC) ditampilkan & dikelompokkan dalam WIB apa pun zona
// perangkat; kolom DATE (ready_date dll., lewat parseDateKey atau string "YYYY-MM-DD") tidak bergeser.
// Zona proses Node diganti saat runtime (process.env.TZ) untuk meniru perangkat.

import test from 'node:test';
import assert from 'node:assert/strict';

const { formatDate, formatDateFull, formatDateShort, formatTime } = await import('../../src/utils/format.js');
const { parseDateKey, dateKeyOf } = await import('../../src/utils/date.js');
const { groupNotificationsByDay } = await import('../../src/utils/rules/notification.js');
const { IS_MOCK_MODE } = await import('../../src/constants/dataMode.js');

const DEVICE_ZONES = ['UTC', 'Asia/Jakarta', 'Asia/Tokyo', 'America/New_York', 'Asia/Makassar'];
const originalTz = process.env.TZ;
test.after(() => { process.env.TZ = originalTz; });
const eachZone = (fn) => { for (const zone of DEVICE_ZONES) { process.env.TZ = zone; fn(zone); } };

test('mode API aktif', () => assert.equal(IS_MOCK_MODE, false));

test('formatTime: 03.43Z = 10.43 WIB di semua zona perangkat (dulu perangkat UTC menampilkan 03.43)', () => {
  eachZone((zone) => assert.equal(formatTime('2026-11-07T03:43:00.000Z'), '10.43', zone));
  process.env.TZ = 'UTC';
  assert.equal(new Date('2026-11-07T03:43:00.000Z').toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }), '03.43', 'bukti perilaku lama');
});

test('timestamp lewat tengah malam WIB (17.30Z = 00.30 WIB besok) → tanggal WIB untuk semua formatter tanggal', () => {
  const iso = '2026-11-07T17:30:00.000Z';
  eachZone((zone) => {
    assert.equal(formatDateShort(iso), 'Min, 8 Nov', zone);
    assert.equal(formatDate(iso), 'Minggu, 8 Nov', zone);
    assert.equal(formatDateFull(iso), 'Minggu, 8 November 2026', zone);
    assert.equal(formatTime(iso), '00.30', zone);
  });
});

test('kolom DATE lewat parseDateKey (ready_date, valid_to) tidak bergeser di zona mana pun', () => {
  eachZone((zone) => {
    assert.equal(formatDate(parseDateKey('2026-11-07')), 'Sabtu, 7 Nov', zone);
    assert.equal(formatDateShort(parseDateKey('2026-11-07')), 'Sab, 7 Nov', zone);
    assert.equal(formatDateFull(parseDateKey('2026-12-31')), 'Kamis, 31 Desember 2026', zone);
  });
});

test('string tanggal saja "YYYY-MM-DD" juga tidak bergeser (dulu perangkat barat UTC menampilkan hari sebelumnya)', () => {
  eachZone((zone) => assert.equal(formatDate('2026-11-07'), 'Sabtu, 7 Nov', zone));
});

test('dateKeyOf mode API = tanggal WIB; grup "Hari ini" notifikasi cocok dengan today_key server', () => {
  const notifications = [
    { notification_id: 1, created_at: '2026-11-07T17:30:00.000Z' }, // 00.30 WIB 8 Nov
    { notification_id: 2, created_at: '2026-11-07T16:30:00.000Z' }, // 23.30 WIB 7 Nov
  ];
  eachZone((zone) => {
    assert.equal(dateKeyOf('2026-11-07T17:30:00.000Z'), '2026-11-08', zone);
    const [today, earlier] = groupNotificationsByDay(notifications, '2026-11-08');
    assert.deepEqual([today.items.map((n) => n.notification_id), earlier.items.map((n) => n.notification_id)], [[1], [2]], zone);
  });
});

test('nilai kosong/tidak valid tetap "-"', () => {
  for (const fn of [formatDate, formatDateFull, formatDateShort, formatTime]) {
    assert.equal(fn(null), '-');
    assert.equal(fn('bukan tanggal'), '-');
  }
});
