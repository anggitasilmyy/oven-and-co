// services/mock/seed/random.js
// Step 4 · PRNG ber-seed (mulberry32) — data contoh selalu sama setiap kali dibuat ulang,
// tidak berubah saat halaman di-refresh.

export function createRandom(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Bilangan bulat min..max (inklusif) */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    /** Pilih dari [{value, weight}] */
    weighted: (entries) => {
      const total = entries.reduce((s, e) => s + e.weight, 0);
      let roll = next() * total;
      for (const e of entries) {
        roll -= e.weight;
        if (roll < 0) return e.value;
      }
      return entries[entries.length - 1].value;
    },
  };
}
