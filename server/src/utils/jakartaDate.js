// utils/jakartaDate.js
// Helper tanggal operasional toko (Asia/Jakarta, UTC+7) — BR-01 · BR-02 · BR-06
// "Hari ini" selalu dihitung di WIB agar server ber-zona UTC tidak tertinggal satu hari
// antara 00.00–07.00 WIB. Kolom @db.Date disimpan Prisma sebagai tengah malam UTC,
// dan kolom @db.Time sebagai 1970-01-01THH:mm:ssZ, jadi keduanya dibaca dengan bagian UTC.

const JAKARTA_TIME_ZONE = 'Asia/Jakarta';
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: JAKARTA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: JAKARTA_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function partsOf(formatter, date) {
  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
}

/** "YYYY-MM-DD" hari ini (atau tanggal `date`) menurut WIB */
function getJakartaDateKey(date = new Date()) {
  const { year, month, day } = partsOf(dateFormatter, date);
  return `${year}-${month}-${day}`;
}

/** Menit sejak 00.00 WIB */
function getJakartaMinutes(date = new Date()) {
  const { hour, minute } = partsOf(timeFormatter, date);
  return Number(hour) * 60 + Number(minute);
}

/** true bila `value` berformat YYYY-MM-DD DAN merupakan tanggal kalender yang ada */
function isValidDateKey(value) {
  if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.toISOString().slice(0, 10) === value;
}

function addDaysToDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Kunci tanggal → nilai untuk kolom @db.Date */
function dateKeyToDbDate(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

/** Nilai kolom @db.Date → kunci tanggal */
function dbDateToKey(value) {
  if (value == null) return null;

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** Batas [awal, akhir) satu hari WIB dalam UTC — untuk kolom DATETIME (created_at) */
function getJakartaDayRange(startKey, endKeyInclusive = startKey) {
  return {
    gte: new Date(`${startKey}T00:00:00+07:00`),
    lt: new Date(`${addDaysToDateKey(endKeyInclusive, 1)}T00:00:00+07:00`),
  };
}

/** Nilai kolom @db.Time atau "HH:mm" → menit sejak 00.00; null bila kosong/tidak valid */
function timeToMinutes(value) {
  if (value == null) return null;

  if (typeof value === 'string') {
    const match = value.match(/^(\d{2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

/** Nilai kolom @db.Time → "HH:mm"; null bila kosong */
function formatTime(value) {
  const minutes = timeToMinutes(value);

  if (minutes == null) return null;

  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');

  return `${hh}:${mm}`;
}

module.exports = {
  JAKARTA_TIME_ZONE,
  getJakartaDateKey,
  getJakartaMinutes,
  isValidDateKey,
  addDaysToDateKey,
  dateKeyToDbDate,
  dbDateToKey,
  getJakartaDayRange,
  timeToMinutes,
  formatTime,
};
