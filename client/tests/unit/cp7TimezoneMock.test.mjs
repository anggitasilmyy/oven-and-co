// Uji Step 6.6 (CP7 · G12) mode mock — kontrak data mock: timestamp disimpan sebagai jam dinding PERANGKAT (mockClock),
// jadi tampilan & kunci tanggal tetap zona perangkat (tidak diubah ke WIB). Diaktifkan mock-env-loader.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./mock-env-loader.mjs', import.meta.url);

const { formatTime, formatDateShort } = await import('../../src/utils/format.js');
const { parseDateKey, dateKeyOf } = await import('../../src/utils/date.js');
const { IS_MOCK_MODE } = await import('../../src/constants/dataMode.js');

const originalTz = process.env.TZ;
test.after(() => { process.env.TZ = originalTz; });

test('mode mock aktif', () => assert.equal(IS_MOCK_MODE, true));

test('timestamp mock pukul 14.00 jam perangkat tampil 14.00 & tanggalnya sama di zona perangkat mana pun', () => {
  for (const zone of ['UTC', 'Asia/Jakarta', 'Asia/Tokyo', 'America/New_York']) {
    process.env.TZ = zone;
    const iso = new Date(2026, 10, 7, 14, 0).toISOString(); // seperti atTime(todayKey, '14:00').toISOString()
    assert.equal(formatTime(iso), '14.00', zone);
    assert.equal(formatDateShort(iso), 'Sab, 7 Nov', zone);
    assert.equal(dateKeyOf(iso), '2026-11-07', zone);
    assert.equal(formatDateShort(parseDateKey('2026-11-07')), 'Sab, 7 Nov', zone);
  }
});
