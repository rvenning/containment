// Balance diagnostic — not a test. Plays each bot over a handful of seeds and
// prints where each run ended and why.
//
//   node tests/diag.js                  every bot, 6 seeds
//   CT_BOTS=ordinary CT_SEEDS=12 node tests/diag.js
//   CT_LEVELS=1 node tests/diag.js      also print the per-level table

const { BRAINS, playRun } = require("./brain.js");

const bots = (process.env.CT_BOTS || Object.keys(BRAINS).join(",")).split(",");
const seeds = Number(process.env.CT_SEEDS || 6);
const maxLevel = Number(process.env.CT_MAX || 30);

for (const name of bots) {
  const t0 = Date.now();
  const rows = [];
  for (let seed = 1; seed <= seeds; seed++) rows.push(playRun(name, seed, maxLevel));
  const mean = (f) => rows.reduce((a, r) => a + f(r), 0) / rows.length;
  const reasons = {};
  for (const r of rows) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
  console.log(
    `${name.padEnd(9)} reached ${rows.map((r) => r.level).join(",").padEnd(24)} ` +
    `mean L${mean((r) => r.level).toFixed(1)}  score ${Math.round(mean((r) => r.score))}  ` +
    `ends ${JSON.stringify(reasons)}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`
  );
  if (process.env.CT_LEVELS) {
    for (const r of rows.slice(0, 3)) {
      console.log("   " + r.levels.map((l) =>
        `L${l.level}:${l.outcome === "clear" ? "ok" : l.outcome} ${Math.round(l.used)}/${l.given}s -${l.livesLost}/${l.livesStart} ${l.pct}%`).join(" | "));
    }
  }
}
