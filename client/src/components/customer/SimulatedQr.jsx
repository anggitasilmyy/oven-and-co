// components/customer/SimulatedQr.jsx
// Step 5.3 · FR-14 · C-15 — kode QR SIMULASI (bukan QRIS asli) dari payment_code; payment gateway disimulasikan (SPEC §10).
// Pola dibuat deterministik dari teks agar sama setiap kali dibuka; tidak bisa dipindai untuk membayar.

const SIZE = 25;

/** Hash sederhana → bit pola */
function patternOf(text) {
  let h = 2166136261;
  const bits = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    h ^= text.charCodeAt(i % text.length) + i;
    h = Math.imul(h, 16777619) >>> 0;
    bits.push((h >> 7) & 1);
  }
  return bits;
}

/** Penanda posisi 7×7 di tiga sudut */
const isFinder = (x, y) => [[0, 0], [SIZE - 7, 0], [0, SIZE - 7]].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
const finderOn = (x, y) => {
  const [fx, fy] = x < 7 ? [0, y < 7 ? 0 : SIZE - 7] : [SIZE - 7, 0];
  const dx = x - fx;
  const dy = y - fy;
  return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
};

export default function SimulatedQr({ value, id }) {
  const bits = patternOf(value);
  const cells = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const on = isFinder(x, y) ? finderOn(x, y) : bits[y * SIZE + x];
      if (on) cells.push(<rect key={`${x}-${y}`} x={x + 2} y={y + 2} width="1" height="1" />);
    }
  }
  return (
    <svg id={id} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${SIZE + 4} ${SIZE + 4}`} role="img"
      aria-label="Kode QR simulasi pembayaran" className="w-full h-auto" shapeRendering="crispEdges">
      <rect width={SIZE + 4} height={SIZE + 4} fill="#FFFFFF" />
      <g fill="#2B1D16">{cells}</g>
    </svg>
  );
}
