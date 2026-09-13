// Seeded randomness. The engine never touches Math.random: every level is dealt
// from a seed, so the balance bots can replay a run exactly and a changed
// result always means a changed rule, never a different roll.

const RNG = {
  // mulberry32 — small, fast, and good enough to scatter a dozen particles.
  make(seed) {
    let a = seed >>> 0 || 1;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  // FNV-1a over the parts. Keyed on WHAT the numbers are for (the run, the
  // level), so level 6 of a run is the same field however you got there.
  hash(...parts) {
    let h = 2166136261 >>> 0;
    for (const p of parts) {
      const s = String(p);
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      h ^= 0x7c;
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  },
};
