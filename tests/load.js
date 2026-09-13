// Shared loader for the test suites.
//
// The game ships plain <script> files with top-level `const` and no bundler, so
// the suites run the real sources in a vm sandbox. Order must match index.html.
// render.js and main.js are deliberately absent: everything asserted on here is
// engine, and leaving the drawing out is what keeps sim.js and game.js honest
// about not touching the DOM.

const path = require("node:path");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ROOT = path.join(__dirname, "..");

const S = loadScripts({
  baseDir: ROOT,
  files: ["tests/seed.js", "js/rng.js", "js/sim.js", "js/game.js"],
  exports: [
    "__reseed", "__rand",
    "RNG", "FIELD", "TUNING", "BONUS", "EMPTY", "WALL", "CLAIMED",
    "levelSpec", "Sim", "Game",
  ],
  browser: true,
  globals: { performance: { now: () => 0 }, requestAnimationFrame() {} },
});

S.ROOT = ROOT;
module.exports = S;
