// The engine is seeded by construction and never calls Math.random. The bots
// are not: they draw their perception noise from here, so it has to be seeded
// too, or a balance test passes and fails at random while looking
// deterministic. The generator only exists INSIDE the sandbox, so bots route
// every draw through __rand().
(function () {
  let a = 0x9e3779b9;
  function mulberry32() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  Math.random = mulberry32;
  globalThis.__reseed = function (n) { a = (n >>> 0) || 1; };
  globalThis.__rand = function () { return Math.random(); };
})();
