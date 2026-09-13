// The bots. Shared by tests/bot.test.js and tests/diag.js so the suite and the
// diagnostic can never be measuring two different players.
//
// The faculty this game tests is READING TRAJECTORIES: will any particle cross
// this line in the second or two it takes to finish? A bot that clones the
// field and runs it forward exactly is perfect at that, and a perfect bot
// measures nothing but whether the game is possible. So the cast is built on
// one imperfection with a number on it — how far off the bot's idea of where
// each particle is (sigma, in cells) — plus the half-second a person takes to
// go from deciding to tapping, during which the particles keep moving.
//
//   perfect   sigma 0, no latency.       Guardrail: nothing may beat it.
//   sharp     a good adult.
//   ordinary  the tuning target.
//   sloppy    a tired or careless player.
//   random    taps anywhere, either way. The control: must get almost nowhere.

const S = require("./load.js");
const { Sim, Game } = S;

const BRAINS = {
  perfect:  { sigma: 0,    latency: 0,    think: 0.2, perBall: 0,    samples: 70, margin: 0.03, minGain: 12, patience: 10, lifeCost: 140 },
  sharp:    { sigma: 0.5,  latency: 0.25, think: 0.4, perBall: 0.05, samples: 16, margin: 0.2,  minGain: 12, patience: 10, lifeCost: 140 },
  ordinary: { sigma: 0.9,  latency: 0.35, think: 0.6, perBall: 0.08, samples: 10, margin: 0.3,  minGain: 12, patience: 10, lifeCost: 140 },
  sloppy:   { sigma: 1.5,  latency: 0.45, think: 0.8, perBall: 0.1,  samples: 6,  margin: 0.2,  minGain: 10, patience: 8,  lifeCost: 90 },
  random:   { random: true, think: 0.8, perBall: 0 },
};
// `think` + `perBall` x particles is how long a decision takes: a crowded field
// takes longer to read. `samples` is how many placements it weighs up — a
// person considers a handful, not a hundred.

function gauss(rand) {
  const u = Math.max(1e-9, rand()), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function stepFor(t) {
  for (let k = 0; k < Math.round(t * 30) && Game.phase === "play"; k++) Game.update(1 / 30);
}

// How the bot SEES the field: every particle nudged by its perception error,
// then run forward by its reaction latency — it plans for where it thinks
// things will be when its finger lands.
function perceive(s, brain, rand) {
  const view = Sim.clone(s);
  if (brain.sigma > 0) {
    for (const b of view.balls) {
      for (let tries = 0; tries < 6; tries++) {
        const x = b.x + gauss(rand) * brain.sigma, y = b.y + gauss(rand) * brain.sigma;
        // Only accept a guess with open space between it and the real particle —
        // nobody misplaces a particle onto the other side of a wall.
        let clear = !Sim.boxSolid(view, x, y);
        for (let q = 1; clear && q < 8; q++) {
          const px = b.x + ((x - b.x) * q) / 8, py = b.y + ((y - b.y) * q) / 8;
          if (Sim.solid(view, Math.floor(px), Math.floor(py))) clear = false;
        }
        if (clear) { b.x = x; b.y = y; break; }
      }
    }
  }
  for (let k = 0; k < Math.round(brain.latency * 30); k++) Sim.step(view, 1 / 30);
  view.hitR = view.r + brain.margin;
  return view;
}

function evaluate(view, c, r, o) {
  const t = Sim.clone(view);
  if (!Sim.build(t, c, r, o)) return null;
  const lives0 = t.lives, filled0 = t.filled;
  for (let k = 0; k < 400 && t.wall && t.state === "play"; k++) Sim.step(t, 0.05);
  return { lost: lives0 - t.lives, gained: t.filled - filled0, clear: t.state === "clear", dead: t.state === "over" };
}

function choose(s, brain, rand, waited) {
  if (brain.random) {
    const empties = [];
    for (let i = 0; i < s.n; i++) if (!s.grid[i]) empties.push(i);
    const i = empties[Math.floor(rand() * empties.length)];
    return { c: i % s.cols, r: Math.floor(i / s.cols), o: rand() < 0.5 ? "h" : "v" };
  }

  const view = perceive(s, brain, rand);
  if (view.state !== "play") return null;
  const empties = [];
  for (let i = 0; i < view.n; i++) if (!view.grid[i]) empties.push(i);
  if (!empties.length) return null;

  // Losing a life hurts more the fewer you have.
  const lifeCost = brain.lifeCost * (1 + 2 / Math.max(1, view.lives - 1));
  // The longer nothing safe turns up, the smaller a claim is worth taking —
  // the clock is running.
  const need = Math.max(1, brain.minGain * (1 - waited / brain.patience));

  let best = null;
  for (let k = 0; k < brain.samples; k++) {
    const i = empties[Math.floor(rand() * empties.length)];
    const c = i % view.cols, r = Math.floor(i / view.cols);
    for (const o of ["h", "v"]) {
      const e = evaluate(view, c, r, o);
      if (!e || e.dead) continue;
      const value = e.gained + (e.clear ? 400 : 0) - e.lost * lifeCost;
      if (!best || value > best.value) best = { c, r, o, value, e };
    }
  }
  if (!best || best.value < need) return null;
  return best;
}

// Play the level Game is currently on, to the end.
function playLevel(brain, rand, log) {
  let waited = 0;
  while (Game.phase === "play") {
    const think = brain.think + brain.perBall * Game.sim.balls.length;
    stepFor(think);
    if (Game.phase !== "play") break;
    const plan = choose(Game.sim, brain, rand, waited);
    if (!plan) { waited += think; continue; }
    stepFor(brain.latency || 0);
    if (Game.phase !== "play") break;
    if (!Game.build(plan.c, plan.r, plan.o)) { waited += brain.think; continue; }
    if (log) log.builds++;
    for (let k = 0; k < 3000 && Game.phase === "play" && Game.sim.wall; k++) Game.update(1 / 30);
    waited = 0;
  }
}

function playRun(name, seed, maxLevel = 30) {
  const brain = BRAINS[name];
  S.__reseed(seed * 7919 + name.length * 131);
  const rand = S.__rand;
  Game.newRun(seed);
  const levels = [];
  for (;;) {
    const s = Game.sim;
    const log = { builds: 0 };
    playLevel(brain, rand, log);
    levels.push({
      level: s.level,
      outcome: Game.phase === "clear" ? "clear" : s.reason,
      used: s.timeStart - s.time,
      given: s.timeStart,
      livesLost: s.livesStart - s.lives,
      livesStart: s.livesStart,
      pct: Math.floor((100 * s.filled) / s.n),
      builds: log.builds,
    });
    if (Game.phase !== "clear" || s.level >= maxLevel) break;
    Game.nextLevel();
  }
  return { ...Game.result(), levels };
}

module.exports = { BRAINS, playRun, choose, perceive, evaluate };
