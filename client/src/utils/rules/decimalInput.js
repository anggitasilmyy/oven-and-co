// utils/rules/decimalInput.js
// CR-04a CP3 · BR-24 · SPEC §5 "Presisi" (Draft 0.8.3 §3 aturan 1 – 3) — input kuantitas & harga sebagai TEKS desimal
// maks. 2 angka desimal, dibaca ke BigInt "sen" (1/100 satuan atau 1/100 Rupiah). JSON number, > 2 desimal, notasi
// eksponen, dan nilai di luar batas ditolak — tidak pernah dibulatkan. Tanpa Number()/parseFloat.
// Client setara: utils/rules/decimalInput.js (uji silang di client tests/vitest).
// Port dari server services/decimalInputRules.service.js — perilaku & pesan identik (uji silang client tests/vitest/purchasingRules.test.mjs).

const DECIMAL_INPUT_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;
const STORED_DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

const DECIMAL_INPUT_MESSAGE = Object.freeze({
  REQUIRED: 'Wajib diisi.',
  FORMAT: 'Harus berupa angka desimal (teks) dengan maks. 2 angka di belakang koma.',
  POSITIVE: 'Harus lebih dari 0.',
  MAX: 'Melebihi batas maksimum.',
});

/** Teks desimal (≤ 2 desimal, boleh bertanda — mis. DECIMAL dari MySQL) → BigInt sen. Melempar Error bila tidak sah. */
function decimalToCents(value) {
  const match = String(value ?? '').trim().match(STORED_DECIMAL_PATTERN);
  if (!match) throw new Error(`Nilai desimal tidak valid: ${value}`);
  const [, sign, whole, fraction = ''] = match;
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return sign === '-' ? -cents : cents;
}

/** BigInt sen → teks 2 desimal tetap, mis. 650n → "6.50", -200n → "-2.00" */
function centsToDecimalString(cents) {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  return `${negative ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

/**
 * Validasi & baca input desimal dari request.
 * @param {unknown} value
 * @param {{max: string, allowZero?: boolean}} options — max sebagai teks desimal
 * @returns {{cents: bigint, error: null} | {cents: null, error: string}}
 */
function parseDecimalInput(value, { max, allowZero = false }) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return { cents: null, error: DECIMAL_INPUT_MESSAGE.REQUIRED };
  }
  if (typeof value !== 'string') return { cents: null, error: DECIMAL_INPUT_MESSAGE.FORMAT };
  const match = value.trim().match(DECIMAL_INPUT_PATTERN);
  if (!match) return { cents: null, error: DECIMAL_INPUT_MESSAGE.FORMAT };
  const cents = decimalToCents(value);
  if (cents === 0n && !allowZero) return { cents: null, error: DECIMAL_INPUT_MESSAGE.POSITIVE };
  if (cents > decimalToCents(max)) return { cents: null, error: DECIMAL_INPUT_MESSAGE.MAX };
  return { cents, error: null };
}

export { DECIMAL_INPUT_MESSAGE, decimalToCents, centsToDecimalString, parseDecimalInput };
