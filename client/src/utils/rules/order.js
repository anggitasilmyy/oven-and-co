// utils/rules/order.js
// Step 5.3 · FR-14 · FR-16 · BR-06 — nomor pesanan & batas waktu pembayaran (fungsi murni)

/** Nomor pesanan OVC-YYMMDD-NNN (AGENTS.md §5) */
export function formatOrderNumber(dateKey, seq) {
  const [y, m, d] = dateKey.split('-');
  return `OVC-${y.slice(2)}${m}${d}-${String(seq).padStart(3, '0')}`;
}

/** Nomor urut berikutnya untuk tanggal tertentu dari nomor pesanan yang sudah ada */
export function nextOrderNumber(existingNumbers, dateKey) {
  const prefix = formatOrderNumber(dateKey, 0).slice(0, -3);
  const maxSeq = existingNumbers
    .filter((n) => n.startsWith(prefix))
    .reduce((max, n) => Math.max(max, Number(n.slice(prefix.length)) || 0), 0);
  return formatOrderNumber(dateKey, maxSeq + 1);
}

/** Sisa detik pembayaran (BR-06); 0 bila sudah lewat */
export function getPaymentSecondsLeft(expiredAtIso, now) {
  return Math.max(0, Math.floor((new Date(expiredAtIso).getTime() - now.getTime()) / 1000));
}
