// Balance, asserted against the bots in brain.js. Slow by the standards of the
// other suites (a minute or two): it plays around sixty whole runs.
//
// Every claim is about AGGREGATES over several seeds. Level 1 has only two
// lives, so any single run — even a good player's — can end in seconds, and a
// per-run assertion would be testing the dice.
//
//   CT_REPORT=1 node --test tests/bot.test.js   to print the table as well

const test = require("node:test");
const assert = require("node:assert");
const { playRun } = require("./brain.js");

const cache = {};
function runs(name, seeds, maxLevel) {
  const key = `${name}|${seeds}|${maxLevel}`;
  if (!cache[key]) {
    cache[key] = [];
    for (let seed = 1; seed <= seeds; seed++) cache[key].push(playRun(name, seed, maxLevel));
    if (process.env.CT_REPORT) {
      const rs = cache[key];
      console.log(`${name.padEnd(9)} levels ${rs.map((r) => r.level).join(",")}  mean score ${Math.round(mean(rs, (r) => r.score))}`);
    }
  }
  return cache[key];
}
const mean = (rs, f) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
const meanLevel = (rs) => mean(rs, (r) => r.level);

test("the perfect bot never breaks a line it chose, through level 8", () => {
  // Guardrail. A deterministic reader of trajectories must be able to clear
  // every level it meets; if it cannot, the level is not a challenge but a wall.
  for (const r of runs("perfect", 3, 8)) {
    assert.equal(r.levels.length, 8, `seed run ended on level ${r.level} (${r.reason})`);
    assert.ok(r.levels.every((l) => l.outcome === "clear"));
  }
});

test("tapping at random gets almost nowhere", () => {
  const rs = runs("random", 8, 14);
  assert.ok(meanLevel(rs) <= 1.5, `random reached mean level ${meanLevel(rs)}`);
  assert.ok(rs.every((r) => r.level <= 3));
});

test("an ordinary player gets a proper run, and usually past level 1", () => {
  const rs = runs("ordinary", 8, 14);
  const m = meanLevel(rs);
  assert.ok(m >= 6 && m <= 13, `ordinary mean level ${m.toFixed(1)} — outside the band the clock and speeds were tuned to`);
  assert.ok(rs.filter((r) => r.level > 1).length >= 6, "level 1 is killing ordinary players outright");
});

test("skill is what the score measures: sloppy < ordinary < sharp, on level AND score", () => {
  const sloppy = runs("sloppy", 8, 14), ordinary = runs("ordinary", 8, 14), sharp = runs("sharp", 8, 14);
  assert.ok(meanLevel(sloppy) < meanLevel(ordinary), "sloppy should not out-climb ordinary");
  assert.ok(meanLevel(ordinary) < meanLevel(sharp), "ordinary should not out-climb sharp");
  const score = (rs) => mean(rs, (r) => r.score);
  assert.ok(score(sloppy) < score(ordinary) && score(ordinary) < score(sharp),
    `scores ${Math.round(score(sloppy))} / ${Math.round(score(ordinary))} / ${Math.round(score(sharp))}`);
  // Sloppy still gets somewhere — the game is not a wall for a careless adult.
  assert.ok(meanLevel(sloppy) >= 2.5, `sloppy mean level ${meanLevel(sloppy)}`);
});

test("the clock is real pressure but not the whole game", () => {
  const all = [...runs("ordinary", 8, 14), ...runs("sharp", 8, 14)];
  const ended = all.filter((r) => r.reason === "lives" || r.reason === "time");
  const byTime = ended.filter((r) => r.reason === "time").length;
  assert.ok(byTime >= 1, "nobody ever runs out of time — the clock is decoration");
  assert.ok(byTime <= ended.length * 0.75, `${byTime}/${ended.length} runs ended on the clock`);
});
