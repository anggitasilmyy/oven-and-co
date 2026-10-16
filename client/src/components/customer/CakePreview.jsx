// components/customer/CakePreview.jsx
// FR-10 · C-11 — preview kue sederhana (SVG) yang berubah mengikuti ukuran, bentuk, rasa, krim, dan tulisan.
// Ini ilustrasi desain pelanggan (bukan foto produk); foto produk tetap memakai ProductImage.

const W = 260;
const H = 190;
const CX = W / 2;
const CY = 78;
const TILT = 0.58; // pipih vertikal agar terlihat miring
const DEPTH = 26; // tinggi sisi kue
const POINTS = 96;

/** Titik keliling satuan (x, y ∈ [-1, 1]) untuk tiap bentuk */
function unitPoints(shape) {
  return Array.from({ length: POINTS }, (_, i) => {
    const t = (i / POINTS) * Math.PI * 2;
    if (shape === 'heart') {
      const x = 16 * Math.sin(t) ** 3;
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      return { x: x / 17, y: (y - 2.5) / 14.5 };
    }
    if (shape === 'square') {
      // superellipse: persegi dengan sudut membulat
      const c = Math.cos(t);
      const s = Math.sin(t);
      return { x: Math.sign(c) * Math.abs(c) ** 0.4 * 0.92, y: Math.sign(s) * Math.abs(s) ** 0.4 * 0.92 };
    }
    return { x: Math.cos(t), y: Math.sin(t) };
  });
}

const toScreen = (p, r, dy = 0, inset = 1) => ({ x: CX + p.x * r * inset, y: CY + p.y * r * TILT * inset + dy });
const pathOf = (pts) => `M${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L')}Z`;

export default function CakePreview({ visual, label }) {
  const r = 92 * visual.scale;
  const unit = unitPoints(visual.shape);
  const top = pathOf(unit.map((p) => toScreen(p, r)));
  const board = pathOf(unit.map((p) => toScreen(p, r * 1.1, DEPTH + 4)));
  const decor = unit.filter((_, i) => i % 8 === 0).map((p) => toScreen(p, r, 0, visual.shape === 'heart' ? 0.76 : 0.86));
  const front = unit.filter((p, i) => i % 6 === 0 && p.y > 0.15).map((p) => toScreen(p, r));
  const fontSize = Math.max(11, 22 - visual.writing.length * 0.45);
  const maxTextWidth = r * 1.35;
  const textTooWide = visual.writing.length * fontSize * 0.52 > maxTextWidth;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full h-auto max-h-[150px] md:max-h-52">
      <ellipse cx={CX} cy={CY + DEPTH + 30} rx={r * 1.15} ry={10} fill="#5C3D2E" opacity="0.08" />
      <path d={board} fill="#FFFDF9" stroke="#EADFCF" strokeWidth="1.5" />
      {/* Sisi kue: bentuk ditumpuk ke bawah dengan warna rasa (sponge) */}
      {Array.from({ length: DEPTH }, (_, i) => (
        <path key={i} d={pathOf(unit.map((p) => toScreen(p, r, DEPTH - i)))} fill={visual.sponge} />
      ))}
      <path d={pathOf(unit.map((p) => toScreen(p, r, DEPTH)))} fill="#000" opacity="0.08" />
      {visual.cream.decor === 'drip' &&
        front.map((p, i) => (
          <rect key={i} x={p.x - 3.5} y={p.y - 2} width="7" height={8 + ((i * 7) % 11)} rx="3.5" fill={visual.cream.top} />
        ))}
      <path d={top} fill={visual.cream.top} stroke="#5C3D2E" strokeOpacity="0.12" strokeWidth="1" />

      {decor.map((p, i) =>
        visual.cream.decor === 'fruit' ? (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="5" fill={i % 2 ? visual.cream.accent : '#5B4BA0'} />
            <ellipse cx={p.x + 3} cy={p.y - 4} rx="2.6" ry="1.4" fill="#6E9B5A" />
          </g>
        ) : (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4.5" fill={visual.cream.accent} />
            <circle cx={p.x - 1.3} cy={p.y - 1.3} r="1.4" fill="#FFFFFF" opacity="0.6" />
          </g>
        )
      )}

      {visual.writing && (
        <text
          x={CX}
          y={CY + fontSize * 0.35}
          textAnchor="middle"
          fontFamily="'Playfair Display', serif"
          fontStyle="italic"
          fontWeight="700"
          fontSize={fontSize}
          fill={visual.writingHex}
          stroke="#5C3D2E"
          strokeOpacity="0.35"
          strokeWidth="0.6"
          paintOrder="stroke"
          textLength={textTooWide ? maxTextWidth : undefined}
          lengthAdjust={textTooWide ? 'spacingAndGlyphs' : undefined}
        >
          {visual.writing}
        </text>
      )}
    </svg>
  );
}
