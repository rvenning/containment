// The run — level after level of the field in sim.js, until you run out of
// lives or time. Still no DOM: main.js and render.js watch `phase` and the
// event queue, and the bots drive exactly the same object.
//
// There is no level map on purpose. This is JezzBall's shape: a single
// continuous run, level n brings n+1 particles and n+1 lives, and the only
// thing you carry from one level to the next is your score.

const Game = {
  sim: null,
  run: null,
  phase: "idle",      // idle | play | clear | over
  paused: false,
  orient: "v",        // what a plain tap builds: "v" (up and down) or "h" (across)
  events: [],         // run-level events for the app shell: levelClear, gameOver

  newRun(seed) {
    this.run = { seed: seed >>> 0, level: 1, banked: 0, claimed: 0, walls: 0, breaches: 0, lastBonus: null };
    this.paused = false;
    this.events.length = 0;
    this.startLevel();
  },

  startLevel() {
    this.sim = Sim.create(this.run.level, RNG.hash("containment", this.run.seed, this.run.level));
    this.phase = "play";
  },

  // Score as it stands right now: everything banked plus this level's claims.
  score() {
    if (!this.run) return 0;
    return this.run.banked + (this.phase === "play" && this.sim ? this.sim.score : 0);
  },

  running() { return this.phase === "play" && !this.paused; },

  build(c, r, orient) {
    if (!this.running()) return false;
    return Sim.build(this.sim, c, r, orient || this.orient);
  },

  update(dt) {
    if (!(dt > 0) || !this.running()) return;
    const s = this.sim;
    Sim.step(s, dt);
    if (s.state === "clear") this.finishLevel();
    else if (s.state === "over") this.finishRun();
  },

  finishLevel() {
    const s = this.sim, run = this.run;
    const bonus = Sim.bonus(s);
    run.banked += s.score + bonus.total;
    run.claimed += s.filled;
    run.walls += s.walls;
    run.breaches += s.breaches;
    run.lastBonus = { ...bonus, level: s.level, claimPoints: s.score };
    this.phase = "clear";
    this.events.push({ type: "levelClear", level: s.level, bonus: run.lastBonus, score: run.banked });
  },

  finishRun() {
    const s = this.sim, run = this.run;
    run.banked += s.score;       // claims made on the level you fell on still count
    run.claimed += s.filled;
    run.walls += s.walls;
    run.breaches += s.breaches;
    this.phase = "over";
    this.events.push({ type: "gameOver", reason: s.reason, result: this.result() });
  },

  nextLevel() {
    if (this.phase !== "clear") return false;
    this.run.level++;
    this.startLevel();
    return true;
  },

  // Giving up part way counts as a finished run: the score so far is real.
  quit() {
    if (this.phase !== "play") return null;
    this.sim.state = "over";
    this.sim.reason = "quit";
    this.finishRun();
    return this.result();
  },

  result() {
    const run = this.run;
    return {
      score: run.banked,
      // The deepest level you reached, even if you did not clear it.
      level: run.level,
      cleared: this.phase === "clear" ? run.level : run.level - 1,
      claimed: run.claimed,
      walls: run.walls,
      breaches: run.breaches,
      reason: this.sim ? this.sim.reason : "",
    };
  },
};
