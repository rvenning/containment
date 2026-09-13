// The field's rules, one at a time, on hand-built situations — plus the
// invariants that must hold over a long run with nobody playing carefully.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const S = require("./load.js");
const { Sim, Game, TUNING, FIELD, WALL, CLAIMED, levelSpec } = S;

// A field with the particles placed by hand.
function field(balls, overrides) {
  const s = Sim.create(1, 1, { balls: 0, ...(overrides || {}) });
  const d = TUNING.ballSpeed / Math.SQRT2;
  for (const [x, y, sx, sy] of balls) s.balls.push({ x, y, vx: sx * d, vy: sy * d });
  return s;
}
// How many open cells the particle's region has.
function pocket(s, b) {
  const seen = new Set([Math.floor(b.y) * s.cols + Math.floor(b.x)]);
  const stack = [...seen];
  while (stack.length) {
    const i = stack.pop(), c = i % s.cols, r = (i - c) / s.cols;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (Sim.solid(s, c + dc, r + dr)) continue;
      const j = (r + dr) * s.cols + c + dc;
      if (!seen.has(j)) { seen.add(j); stack.push(j); }
    }
  }
  return seen.size;
}
const run = (s, secs) => { for (let k = 0; k < Math.round(secs * 60); k++) Sim.step(s, 1 / 60); };

test("level n brings n+1 particles and n+1 lives, and a longer clock", () => {
  for (const n of [1, 2, 5, 12]) {
    const s = Sim.create(n, 99);
    assert.equal(s.balls.length, n + 1);
    assert.equal(s.lives, n + 1);
    assert.equal(s.time, levelSpec(n).time);
  }
  assert.ok(levelSpec(8).time > levelSpec(3).time);
});

test("particles are dealt inside the field, apart, and moving diagonally", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = Sim.create(10, seed);
    for (const b of s.balls) {
      assert.ok(!Sim.boxSolid(s, b.x, b.y), "not inside the rim");
      assert.ok(Math.abs(Math.abs(b.vx) - Math.abs(b.vy)) < 1e-9, "on a diagonal");
    }
    for (let i = 0; i < s.balls.length; i++)
      for (let j = i + 1; j < s.balls.length; j++)
        assert.ok(Math.hypot(s.balls[i].x - s.balls[j].x, s.balls[i].y - s.balls[j].y) > 2 * s.r);
  }
});

test("the same seed deals and plays the same field", () => {
  const a = Sim.create(6, 1234), b = Sim.create(6, 1234);
  Sim.build(a, 5, 9, "h"); Sim.build(b, 5, 9, "h");
  run(a, 7); run(b, 7);
  assert.deepStrictEqual([...a.grid], [...b.grid]);
  assert.deepStrictEqual(a.balls.map((x) => ({ ...x })), b.balls.map((x) => ({ ...x })));
  assert.equal(a.lives, b.lives);
});

test("a bad dt never moves the clock or the particles", () => {
  const s = Sim.create(4, 7);
  const before = JSON.stringify(s.balls), t0 = s.time;
  for (const bad of [-1, -0.016, 0, NaN, undefined]) Sim.step(s, bad);
  assert.equal(s.time, t0);
  assert.equal(JSON.stringify(s.balls), before);
});

test("a line with nothing in its way seals, and the empty side is claimed", () => {
  // One particle in the top-left corner; a horizontal line across row 10.
  const s = field([[3.5, 3.5, 1, 1]]);
  s.balls[0].vx = 0; s.balls[0].vy = 0;          // parked, so the line cannot be hit
  assert.ok(Sim.build(s, 12, 10, "h"));
  run(s, 3);
  assert.equal(s.wall, null, "both halves finished");
  for (let c = 0; c < s.cols; c++) assert.equal(s.grid[10 * s.cols + c], WALL);
  // Everything below the line had no particle, so it is claimed.
  const below = (s.rows - 11) * s.cols;
  let claimed = 0;
  for (let i = 11 * s.cols; i < s.n; i++) if (s.grid[i] === CLAIMED) claimed++;
  assert.equal(claimed, below);
  assert.equal(s.filled, s.cols + below);
  assert.equal(s.score, (s.cols + below) * s.level);
  // ...and nothing above it was.
  for (let i = 0; i < 10 * s.cols; i++) assert.equal(s.grid[i], 0);
});

test("only one line at a time, and never on solid ground", () => {
  const s = field([[3.5, 3.5, 1, 1]]);
  s.balls[0].vx = 0; s.balls[0].vy = 0;
  assert.ok(Sim.build(s, 12, 20, "v"));
  assert.equal(Sim.build(s, 5, 5, "h"), false, "a second line while one grows");
  run(s, 6);
  assert.equal(s.wall, null);
  assert.equal(Sim.build(s, 12, 20, "h"), false, "on the wall just built");
  assert.equal(Sim.build(s, -1, 3, "h"), false, "outside the field");
  assert.equal(Sim.build(s, 2.5, 3, "h"), false, "not a cell");
});

test("a particle touching a growing half breaks that half, costs one life, and spares the other", () => {
  // A particle falling straight down column 8, timed to cross row 20 just
  // after the LEFT half of a line started at column 22 has grown past it. The
  // right half has one cell to go and finishes almost at once.
  const s = field([[8.5, 4.5, 0, 1]]);
  s.balls[0].vx = 0; s.balls[0].vy = TUNING.ballSpeed;
  const lives = s.lives;
  assert.ok(Sim.build(s, 22, 20, "h"));
  run(s, 3);
  assert.equal(s.lives, lives - 1);
  assert.equal(s.breaches, 1);
  const breach = s.events.filter((e) => e.type === "breach");
  assert.equal(breach.length, 1);
  assert.equal(breach[0].dir, -1, "the left half");
  // The right half finished to the rim; the left half left no wall behind.
  for (let c = 22; c < s.cols; c++) assert.equal(s.grid[20 * s.cols + c], WALL);
  for (let c = 0; c < 22; c++) assert.notEqual(s.grid[20 * s.cols + c], WALL);
});

test("clipping both halves at the origin is still one life", () => {
  const s = field([[10.5, 20.5, 0, 0]], { lives: 3 });
  s.balls[0].vx = 0; s.balls[0].vy = 0;
  assert.ok(Sim.build(s, 10, 20, "h"));      // built right on top of the particle
  Sim.step(s, 1 / 60);
  assert.equal(s.lives, 2);
  assert.equal(s.wall, null, "both halves gone");
});

test("losing the last life ends the level; so does the clock", () => {
  const a = field([[10.5, 20.5, 0, 0]], { lives: 1 });
  a.balls[0].vx = 0; a.balls[0].vy = 0;
  Sim.build(a, 10, 20, "v");
  Sim.step(a, 1 / 60);
  assert.equal(a.state, "over");
  assert.equal(a.reason, "lives");

  const b = Sim.create(1, 3, { time: 2 });
  run(b, 2.5);
  assert.equal(b.state, "over");
  assert.equal(b.reason, "time");
  assert.equal(b.time, 0);
});

test("claiming 75% clears the level, with the bonus rules as written", () => {
  // Park the particle in a corner and wall off everything but a small pocket.
  const s = field([[1.5, 1.5, 0, 0]], { lives: 4, time: 100 });
  s.balls[0].vx = 0; s.balls[0].vy = 0;
  Sim.build(s, 12, 6, "h"); run(s, 4);        // row 6 across: claims everything below
  assert.equal(s.state, "clear");
  const b = Sim.bonus(s);
  const pct = Math.floor((100 * s.filled) / s.n);
  assert.equal(b.pct, pct);
  assert.equal(b.over, pct - 75);
  assert.equal(b.lives, 4 * 100 * 1);
  assert.equal(b.overfill, (pct - 75) * 60);
  assert.equal(b.total, b.lives + b.time + b.overfill);
});

test("a long careless run: no particle ever ends up inside a wall or stuck", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const s = Sim.create(9, seed, { lives: 999, time: 999 });
    let r = seed * 31;
    const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
    let last = s.balls.map((b) => [b.x, b.y]);
    let travel = s.balls.map(() => 0);
    for (let f = 0; f < 60 * 90 && s.state === "play"; f++) {
      if (!s.wall && f % 20 === 0) Sim.build(s, Math.floor(rand() * s.cols), Math.floor(rand() * s.rows), rand() < 0.5 ? "h" : "v");
      Sim.step(s, 1 / 60);
      s.balls.forEach((b, i) => {
        assert.ok(!Sim.boxSolid(s, b.x, b.y), `seed ${seed}: particle inside a wall at frame ${f}`);
        travel[i] += Math.hypot(b.x - last[i][0], b.y - last[i][1]);
        last[i] = [b.x, b.y];
      });
      if (f % 60 === 59) {
        // Distance TRAVELLED, not displacement — a particle that bounces back
        // to where it started has still moved. One that is reverting every
        // step on both axes covers nothing, unless it has been walled into a
        // pocket too small to travel in, where rattling on the spot is right.
        travel.forEach((d, i) => {
          if (d > 2 || s.state !== "play") return;
          assert.ok(pocket(s, s.balls[i]) <= 4, `seed ${seed}: particle ${i} stuck in open space at frame ${f} (moved ${d.toFixed(2)})`);
        });
        travel = travel.map(() => 0);
      }
      for (const b of s.balls) assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - TUNING.ballSpeed) < 1e-6, "speed is constant");
    }
    // The claim count agrees with the grid.
    let solid = 0;
    for (let i = 0; i < s.n; i++) if (s.grid[i]) solid++;
    assert.equal(solid, s.filled);
  }
});

test("the run: levels chain, score banks, and the result is honest", () => {
  Game.newRun(42);
  assert.equal(Game.phase, "play");
  assert.equal(Game.sim.balls.length, 2);
  // Force a clear on level 1.
  const s = Game.sim;
  s.balls.forEach((b) => { b.x = 1.5; b.y = 1.5; b.vx = 0; b.vy = 0; });
  s.balls[1].x = 2.5;
  Game.build(12, 6, "h");
  for (let k = 0; k < 400 && Game.phase === "play"; k++) Game.update(1 / 60);
  assert.equal(Game.phase, "clear");
  const banked = Game.run.banked;
  assert.ok(banked > s.score, "the clear bonus was added");
  assert.equal(Game.build(3, 3, "h"), false, "no building between levels");
  assert.ok(Game.nextLevel());
  assert.equal(Game.sim.level, 2);
  assert.equal(Game.sim.balls.length, 3);
  assert.equal(Game.score(), banked);
  const res = Game.quit();
  assert.equal(Game.phase, "over");
  assert.equal(res.level, 2);
  assert.equal(res.cleared, 1);
  assert.equal(res.score, banked);
  assert.equal(Game.quit(), null, "quitting twice does nothing");
});

test("pausing stops the run", () => {
  Game.newRun(5);
  const t = Game.sim.time;
  Game.paused = true;
  Game.update(1);
  assert.equal(Game.sim.time, t);
  assert.equal(Game.build(3, 3, "h"), false);
  Game.paused = false;
});

test("the engine files never touch the DOM or Math.random", () => {
  for (const f of ["js/sim.js", "js/game.js", "js/rng.js"]) {
    const src = fs.readFileSync(path.join(S.ROOT, f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.ok(!/Math\.random\s*\(/.test(src), `${f} calls Math.random`);
    assert.ok(!/\b(document|window|canvas|localStorage)\b/.test(src), `${f} touches the browser`);
  }
});

test("the field is portrait", () => {
  assert.ok(FIELD.rows > FIELD.cols);
});
