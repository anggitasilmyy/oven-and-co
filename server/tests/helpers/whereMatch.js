// tests/helpers/whereMatch.js
// Penilai klausa `where` Prisma sederhana untuk fake Prisma: agar tes memverifikasi HASIL filter
// (produk aktif, status bayar, status pesanan, rentang tanggal), bukan hanya bentuk query.
// Mendukung: nilai langsung, { in }, { not }, { gt, gte, lt }, { contains, startsWith }, { is } (relasi), AND/OR. Klausa lain → error
// supaya tes tidak diam-diam lolos untuk filter yang tidak dipahami.

function compare(value, condition) {
  if (condition === null || typeof condition !== 'object' || condition instanceof Date) {
    return value instanceof Date && condition instanceof Date
      ? value.getTime() === condition.getTime()
      : value === condition;
  }

  return Object.entries(condition).every(([operator, expected]) => {
    switch (operator) {
      case 'in':
        return expected.includes(value);
      case 'not':
        return !compare(value, expected);
      case 'gt':
        return value > expected;
      case 'gte':
        return value >= expected;
      case 'lt':
        return value < expected;
      case 'startsWith':
        return String(value).startsWith(String(expected));
      case 'contains':
        return String(value).toLowerCase().includes(String(expected).toLowerCase());
      case 'is':
        return value != null && matchesWhere(value, expected);
      default:
        throw new Error(`whereMatch: operator ${operator} belum didukung`);
    }
  });
}

function matchesWhere(row, where = {}) {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return condition.every((clause) => matchesWhere(row, clause));
    if (key === 'OR') return condition.some((clause) => matchesWhere(row, clause));
    return compare(row[key], condition);
  });
}

module.exports = { matchesWhere };
