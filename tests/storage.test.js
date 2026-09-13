// The cross-device merge — the one function in the game that can permanently
// destroy a save — plus the run recorder that feeds the leaderboard.

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { loadScripts } = require("../lib/tools/test-harness.js");

const S = loadScripts({
  baseDir: path.join(__dirname, ".."),
  files: ["lib/gk-util.js", "lib/gk-storage.js", "js/storage.js"],
  exports: ["PROGRESS", "Storage"],
  // No firebase-config.js: with no window.FIREBASE_CONFIG the storage object
  // runs on localStorage alone, which is all this needs.
  browser: true,
});
const { PROGRESS, Storage } = S;
const blank = () => PROGRESS.blank();

test("a blank save merged with itself changes nothing", () => {
  assert.deepEqual(PROGRESS.merge(blank(), blank()), blank());
});

test("every record keeps the larger side, in either order", () => {
  const a = { ...blank(), best: 5000, bestLevel: 4, runs: 9, levelsCleared: 20, claimed: 9000 };
  const b = { ...blank(), best: 7200, bestLevel: 3, runs: 2, levelsCleared: 25, claimed: 100 };
  const want = { best: 7200, bestLevel: 4, runs: 9, levelsCleared: 25, claimed: 9000 };
  for (const m of [PROGRESS.merge(a, b), PROGRESS.merge(b, a)]) {
    for (const [k, v] of Object.entries(want)) assert.equal(m[k], v, k);
  }
});

test("a field a newer build added survives an older client's merge", () => {
  const a = { ...blank(), somethingNew: [1, 2] };
  assert.deepEqual(PROGRESS.merge(a, blank()).somethingNew, [1, 2]);
});

test("merging is idempotent", () => {
  const a = { ...blank(), best: 900, bestLevel: 2, runs: 3 };
  const once = PROGRESS.merge(a, blank());
  assert.deepEqual(PROGRESS.merge(once, blank()), once);
});

test("recording runs: best only moves up, totals accumulate", () => {
  const p = Storage.addProfile("Test", "⚛️", "");
  let r = Storage.recordRun(p.id, { score: 4000, level: 4, cleared: 3, claimed: 2100 });
  assert.equal(r.newBest, true);
  r = Storage.recordRun(p.id, { score: 2500, level: 6, cleared: 5, claimed: 3000 });
  assert.equal(r.newBest, false, "a lower score is not a best");
  assert.equal(r.deeper, true);
  const prog = Storage.getProgress(p.id);
  assert.equal(prog.best, 4000);
  assert.equal(prog.bestLevel, 6);
  assert.equal(prog.runs, 2);
  assert.equal(prog.levelsCleared, 8);
  assert.equal(prog.claimed, 5100);
});
