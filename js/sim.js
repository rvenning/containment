// The containment field — one level of the game, as a pure simulation.
//
// No DOM, no canvas, no Math.random. Everything that happens is a function of
// the seed and the calls made on it, which is what lets tests/bot.test.js play
// whole runs headlessly and what lets a bot clone the field to look ahead.
//
// The rules are JezzBall's:
//   * Particles bounce around a grid at a constant speed, diagonally.
//   * Tap an empty cell to start a line there. It grows in BOTH directions at
//     once, as two independent halves, until each half reaches something solid.
//   * A finished half becomes wall. Any region of the field that no longer
//     holds a particle is sealed off and counts as claimed.
//   * A particle touching a half that is still growing destroys that half and
//     costs a life. The other half carries on.
//   * Only one line at a time.
//   * Claim 75% of the field to clear the level. Run out of lives or time and
//     the run is over.
//
// Coordinates are in CELLS: the field is cols x rows cells, a cell is 1 unit,
// and (0,0) is the top-left corner of the top-left cell. Outside the field
// counts as solid.

// Portrait, and taller than it first was: at 24x34 a phone's stage left a
// quarter of its height empty. 24x38 fills ~89% of a 375x812 screen.
const FIELD = { cols: 24, rows: 38 };

const TUNING = {
  ballSpeed: 8,       // cells per second, along the diagonal
  ballR: 0.42,        // particle radius, cells
  wallSpeed: 8,       // cells per second, per half
  target: 0.75,       // fraction of the field to claim
  // Seconds on the clock at level n: timeBase + timePerBall * (n + 1). Set from
  // tests/diag.js — at 20 + 10n the careful bots were timing out from level 10
  // while still holding most of their lives, which made the clock the whole
  // game rather than the pressure on it.
  timeBase: 25,
  timePerBall: 11,
};

// Grid values.
const EMPTY = 0, WALL = 1, CLAIMED = 2;

// Classic JezzBall: level n has n+1 particles and n+1 lives.
function levelSpec(n) {
  return {
    level: n,
    balls: n + 1,
    lives: n + 1,
    time: TUNING.timeBase + TUNING.timePerBall * (n + 1),
  };
}

// The clear bonus, as three rules a player can say out loud. Every part is
// multiplied by the level, so surviving deeper is always worth more.
const BONUS = {
  perLife: 100,       // for each life left
  perSecond: 5,       // for each whole second left on the clock
  perPercentOver: 60, // for each whole percent claimed past 75
};

const Sim = {
  create(level, seed, overrides) {
    const spec = { ...levelSpec(level), ...(overrides || {}) };
    const cols = spec.cols || FIELD.cols, rows = spec.rows || FIELD.rows;
    const rand = RNG.make(seed);
    const s = {
      level, seed, cols, rows,
      n: cols * rows,
      grid: new Uint8Array(cols * rows),
      balls: [],
      r: TUNING.ballR,
      hitR: TUNING.ballR,      // radius used ONLY for breaking lines; a bot's clone inflates it for caution
      wall: null,
      lives: spec.lives,
      livesStart: spec.lives,
      time: spec.time,
      timeStart: spec.time,
      t: 0,
      filled: 0,
      score: 0,                // points earned on this level so far (claims only)
      state: "play",           // play | clear | over
      reason: "",              // why it is over: lives | time
      walls: 0, breaches: 0,
      events: [],
    };

    // Scatter the particles, keeping them clear of the rim and of each other so
    // no level opens with two already touching.
    const d = TUNING.ballSpeed / Math.SQRT2;
    for (let i = 0; i < spec.balls; i++) {
      let x = 0, y = 0;
      for (let tries = 0; tries < 200; tries++) {
        x = 1.5 + rand() * (cols - 3);
        y = 1.5 + rand() * (rows - 3);
        if (s.balls.every((b) => Math.hypot(b.x - x, b.y - y) > 2.4)) break;
      }
      s.balls.push({ x, y, vx: rand() < 0.5 ? -d : d, vy: rand() < 0.5 ? -d : d });
    }
    return s;
  },

  // A deep copy that a bot can run forward without touching the real field.
  clone(s) {
    return {
      ...s,
      grid: s.grid.slice(),
      balls: s.balls.map((b) => ({ ...b })),
      wall: s.wall && { ...s.wall, halves: s.wall.halves.map((h) => ({ ...h })) },
      events: [],
    };
  },

  solid(s, c, r) {
    if (c < 0 || r < 0 || c >= s.cols || r >= s.rows) return true;
    return s.grid[r * s.cols + c] !== EMPTY;
  },

  // Does a particle overlap anything solid? Tested as a CIRCLE against each
  // cell, the same shape the breach test uses. A bounding square here would
  // disagree with it at the corners: a particle could miss a growing line by a
  // hair, have the finished wall appear inside its square, and then bounce in
  // place forever because every move out still "overlaps".
  boxSolid(s, x, y) {
    const R = s.r;
    const c0 = Math.floor(x - R), c1 = Math.floor(x + R - 1e-9);
    const r0 = Math.floor(y - R), r1 = Math.floor(y + R - 1e-9);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!this.solid(s, c, r)) continue;
        const dx = x - Math.max(c, Math.min(x, c + 1));
        const dy = y - Math.max(r, Math.min(y, r + 1));
        if (dx * dx + dy * dy < R * R) return true;
      }
    }
    return false;
  },

  percent(s) { return s.filled / s.n; },

  /* ----------------------------------------------------------- building -- */

  // Where a line started at (c, r) would stop, without starting it. The
  // renderer uses this for the preview, so what you see is exactly what grows.
  span(s, c, r, orient) {
    if (orient === "h") {
      let lo = c, hi = c;
      while (!this.solid(s, lo - 1, r)) lo--;
      while (!this.solid(s, hi + 1, r)) hi++;
      return { lo, hi };
    }
    let lo = r, hi = r;
    while (!this.solid(s, c, lo - 1)) lo--;
    while (!this.solid(s, c, hi + 1)) hi++;
    return { lo, hi };
  },

  canBuild(s, c, r) {
    return s.state === "play" && !s.wall && Number.isInteger(c) && Number.isInteger(r)
      && c >= 0 && r >= 0 && c < s.cols && r < s.rows && !this.solid(s, c, r);
  },

  build(s, c, r, orient) {
    if (!this.canBuild(s, c, r)) return false;
    orient = orient === "h" ? "h" : "v";
    const { lo, hi } = this.span(s, c, r, orient);
    const at = orient === "h" ? c : r;
    // Each half starts already covering the origin cell, so the line is there
    // from the first frame. limit = how many cells that half will cover.
    s.wall = {
      orient, c, r,
      halves: [
        { dir: -1, len: 1, limit: at - lo + 1, alive: true, done: false },
        { dir: +1, len: 1, limit: hi - at + 1, alive: true, done: false },
      ],
    };
    s.walls++;
    s.events.push({ type: "build", c, r, orient });
    return true;
  },

  // The rectangle a half currently covers.
  halfRect(w, h) {
    const a = w.orient === "h" ? w.c : w.r;
    const lo = h.dir < 0 ? a + 1 - h.len : a;
    const hi = h.dir < 0 ? a + 1 : a + h.len;
    return w.orient === "h"
      ? { x0: lo, x1: hi, y0: w.r, y1: w.r + 1 }
      : { x0: w.c, x1: w.c + 1, y0: lo, y1: hi };
  },

  halfCells(s, w, h) {
    const out = [];
    for (let k = 0; k < h.limit; k++) {
      const off = h.dir < 0 ? -k : k;
      const c = w.orient === "h" ? w.c + off : w.c;
      const r = w.orient === "h" ? w.r : w.r + off;
      out.push(r * s.cols + c);
    }
    return out;
  },

  /* ------------------------------------------------------------ the clock -- */

  step(s, dt) {
    // !(dt > 0) also rejects NaN and undefined; a backwards timestamp must
    // never run the field in reverse.
    if (!(dt > 0) || s.state !== "play") return;
    dt = Math.min(dt, 0.1);
    // Sub-step so nothing moves more than a fifth of a cell at a time: a
    // particle can then never tunnel through a one-cell wall, and a half can
    // never grow past a particle between two checks.
    const fastest = Math.max(TUNING.ballSpeed, TUNING.wallSpeed);
    const n = Math.max(1, Math.ceil((fastest * dt) / 0.2));
    const h = dt / n;
    for (let k = 0; k < n && s.state === "play"; k++) {
      s.t += h;
      s.time -= h;
      this.moveBalls(s, h);
      this.collideBalls(s);
      if (s.wall) this.growWall(s, h);
      if (s.state === "play" && s.time <= 0) this.end(s, "time");
    }
  },

  moveBalls(s, h) {
    for (const b of s.balls) {
      b.x += b.vx * h;
      if (this.boxSolid(s, b.x, b.y)) { b.x -= b.vx * h; b.vx = -b.vx; }
      b.y += b.vy * h;
      if (this.boxSolid(s, b.x, b.y)) { b.y -= b.vy * h; b.vy = -b.vy; }
    }
  },

  // Particles of equal mass meeting head on simply trade velocities, which
  // keeps every particle on a diagonal for the whole level.
  collideBalls(s) {
    const bs = s.balls, D = s.r * 2;
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], b = bs[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        if (dx * dx + dy * dy >= D * D) continue;
        if ((b.vx - a.vx) * dx + (b.vy - a.vy) * dy >= 0) continue;   // already parting
        const vx = a.vx, vy = a.vy;
        a.vx = b.vx; a.vy = b.vy;
        b.vx = vx; b.vy = vy;
      }
    }
  },

  growWall(s, h) {
    const w = s.wall;
    for (const half of w.halves) {
      if (half.alive && !half.done) half.len = Math.min(half.limit, half.len + TUNING.wallSpeed * h);
    }

    // Breaches. One particle touching the line costs one life, even where it
    // clips both halves at once across the origin cell.
    for (const b of s.balls) {
      let hit = false;
      for (const half of w.halves) {
        if (!half.alive || half.done) continue;
        const q = this.halfRect(w, half);
        const nx = Math.max(q.x0, Math.min(b.x, q.x1));
        const ny = Math.max(q.y0, Math.min(b.y, q.y1));
        const dx = b.x - nx, dy = b.y - ny;
        if (dx * dx + dy * dy < s.hitR * s.hitR) {
          half.alive = false;
          hit = true;
          s.events.push({ type: "breach", x: b.x, y: b.y, dir: half.dir, orient: w.orient });
        }
      }
      if (hit) { s.lives--; s.breaches++; }
    }
    if (s.lives <= 0) { s.lives = 0; this.end(s, "lives"); return; }

    for (const half of w.halves) {
      if (half.alive && !half.done && half.len >= half.limit) this.seal(s, w, half);
      if (s.state !== "play") return;
    }

    if (w.halves.every((x) => !x.alive || x.done)) {
      s.wall = null;
      s.events.push({ type: "lineEnd" });
    }
  },

  // A half reached solid ground: it becomes wall, and every region left
  // without a particle in it is claimed.
  seal(s, w, half) {
    half.done = true;
    const line = [];
    for (const i of this.halfCells(s, w, half)) {
      if (s.grid[i] === EMPTY) { s.grid[i] = WALL; line.push(i); }
    }
    const claimed = this.claim(s);
    const gained = line.length + claimed.length;
    s.filled += gained;
    const points = gained * s.level;
    s.score += points;
    s.events.push({ type: "seal", dir: half.dir, orient: w.orient, line, claimed, points });
    if (this.percent(s) >= TUNING.target) this.clear(s);
  },

  // Flood out from every particle; whatever empty space it cannot reach is
  // sealed. Four-connected, because a particle is too wide to slip between two
  // cells that only touch at a corner.
  claim(s) {
    const { cols, rows, grid } = s;
    const seen = new Uint8Array(s.n);
    const stack = [];
    for (const b of s.balls) {
      const i = Math.floor(b.y) * cols + Math.floor(b.x);
      if (grid[i] === EMPTY && !seen[i]) { seen[i] = 1; stack.push(i); }
    }
    while (stack.length) {
      const i = stack.pop();
      const c = i % cols, r = (i - c) / cols;
      if (c > 0 && !seen[i - 1] && grid[i - 1] === EMPTY) { seen[i - 1] = 1; stack.push(i - 1); }
      if (c < cols - 1 && !seen[i + 1] && grid[i + 1] === EMPTY) { seen[i + 1] = 1; stack.push(i + 1); }
      if (r > 0 && !seen[i - cols] && grid[i - cols] === EMPTY) { seen[i - cols] = 1; stack.push(i - cols); }
      if (r < rows - 1 && !seen[i + cols] && grid[i + cols] === EMPTY) { seen[i + cols] = 1; stack.push(i + cols); }
    }
    const out = [];
    for (let i = 0; i < s.n; i++) {
      if (grid[i] === EMPTY && !seen[i]) { grid[i] = CLAIMED; out.push(i); }
    }
    return out;
  },

  clear(s) {
    s.state = "clear";
    s.wall = null;
    s.events.push({ type: "clear", bonus: this.bonus(s) });
  },

  end(s, reason) {
    s.state = "over";
    s.reason = reason;
    if (reason === "time") s.time = 0;
    s.wall = null;
    s.events.push({ type: "over", reason });
  },

  bonus(s) {
    const L = s.level;
    const pct = Math.floor((100 * s.filled) / s.n);
    const over = Math.max(0, pct - Math.round(TUNING.target * 100));
    const lives = s.lives * BONUS.perLife * L;
    const time = Math.max(0, Math.floor(s.time)) * BONUS.perSecond * L;
    const overfill = over * BONUS.perPercentOver * L;
    return { pct, over, livesLeft: s.lives, secondsLeft: Math.max(0, Math.floor(s.time)), lives, time, overfill, total: lives + time + overfill };
  },
};
