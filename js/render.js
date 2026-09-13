// Canvas, input and the frame loop. The engine never calls into here and this
// file never decides anything about the game — it draws whatever Game holds
// and turns pointers into Game.build() calls.
//
// Input. A tap builds a line in the orientation the switch under the field is
// set to. A SWIPE builds in the direction you swiped, from where the swipe
// started — on a phone that is quicker than reaching for the switch. Nothing
// commits until you lift: pressing shows a preview of exactly where the line
// will run, and sliding a little moves it, so a 14px cell is aimable. A mouse
// gets JezzBall's own controls — left click builds, right click turns the
// line — with the preview following the cursor.

const MAX_CELL = 30;

const COLORS = {
  bg: "#060a14",
  field: "#0c1426",
  grid: "rgba(110,160,255,.07)",
  rim: "#2a3d66",
  wall: "#5a6f99",
  wallTop: "#8aa0cc",
  claimed: "#12303d",
  claimedLine: "#1b4a58",
  flash: "120,255,226",
  neg: "#ff4f6e",     // the half that grows left / up
  pos: "#47b3ff",     // the half that grows right / down
};

const Render = {
  W: 360, H: 520, cell: 14, ox: 0, oy: 0, bw: 0, bh: 0,
  clock: 0,
  ghost: null,         // { c, r, o } — the preview under the pointer
  press: null,         // the gesture in progress
  lit: null,           // per-cell time a cell was sealed, for the fill flash
  litSim: null,

  boot() {
    this.cv = document.getElementById("cv");
    this.ctx = this.cv.getContext("2d");
    this.stage = document.getElementById("stage");
    this.bindInput();
    addEventListener("resize", () => this.resize());
    addEventListener("orientationchange", () => setTimeout(() => this.resize(), 350));
    if (window.visualViewport) visualViewport.addEventListener("resize", () => this.resize());
  },

  resize() {
    if (!this.stage) return;
    const box = this.stage.getBoundingClientRect();
    if (box.width < 50 || box.height < 50) return;   // hidden screen: keep the last good layout
    this.W = box.width; this.H = box.height;
    // Display size comes from the stylesheet (100% x 100%); only the backing
    // store is sized here, or the canvas overflows every retina screen.
    const dpr = window.devicePixelRatio || 1;
    this.cv.width = Math.round(this.W * dpr);
    this.cv.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layout();
  },

  layout() {
    const pad = 6;
    this.cell = Math.max(6, Math.min(MAX_CELL,
      Math.floor(Math.min((this.W - pad * 2) / FIELD.cols, (this.H - pad * 2) / FIELD.rows))));
    this.bw = this.cell * FIELD.cols;
    this.bh = this.cell * FIELD.rows;
    this.ox = Math.round((this.W - this.bw) / 2);
    // Sit a little low: on a tall phone the spare space goes above the field,
    // nearer the top of the screen, and the field nearer the thumb.
    this.oy = Math.round((this.H - this.bh) * 0.62);
  },

  cellAt(x, y) {
    const c = Math.floor((x - this.ox) / this.cell);
    const r = Math.floor((y - this.oy) / this.cell);
    if (c < 0 || r < 0 || c >= FIELD.cols || r >= FIELD.rows) return null;
    return { c, r };
  },

  /* -------------------------------------------------------------- input -- */

  bindInput() {
    const cv = this.cv;
    const local = (e) => {
      const b = cv.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    // Far enough to be a swipe rather than a nudge.
    const swipeDist = () => Math.max(26, this.cell * 2.2);

    cv.addEventListener("pointerdown", (e) => {
      if (e.button === 2) return;                  // right click turns the line; see contextmenu
      e.preventDefault();
      if (!Game.running()) return;
      const p = local(e);
      const at = this.cellAt(p.x, p.y);
      // State first, capture second: setPointerCapture throws for a pointer
      // the browser does not consider active, and that must not leave a
      // half-built gesture behind.
      this.press = { x: p.x, y: p.y, start: at, swipe: null };
      this.ghost = at && { ...at, o: Game.orient };
      try { cv.setPointerCapture?.(e.pointerId); } catch { /* the gesture still works uncaptured */ }
    }, { passive: false });

    const move = (x, y, hover) => {
      if (!this.press) {
        if (hover && Game.running()) {
          const at = this.cellAt(x, y);
          this.ghost = at && { ...at, o: Game.orient };
        }
        return;
      }
      const dx = x - this.press.x, dy = y - this.press.y;
      if (this.press.start && Math.max(Math.abs(dx), Math.abs(dy)) > swipeDist()) {
        this.press.swipe = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        this.ghost = { ...this.press.start, o: this.press.swipe };
      } else {
        this.press.swipe = null;
        const at = this.cellAt(x, y);
        this.ghost = at && { ...at, o: Game.orient };
      }
    };
    // PointerEvent.pressure is 0 for ordinary touch on iOS, so never gate a
    // move on it; ask what kind of pointer it is instead.
    cv.addEventListener("pointermove", (e) => {
      const p = local(e);
      if (e.pointerType === "touch" || e.buttons || this.press) { e.preventDefault(); move(p.x, p.y, false); }
      else if (e.pointerType === "mouse" || e.pointerType === "pen") move(p.x, p.y, true);
    }, { passive: false });
    cv.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      const b = cv.getBoundingClientRect();
      move(t.clientX - b.left, t.clientY - b.top, false);
    }, { passive: false });

    const end = (e) => {
      const g = this.ghost, pr = this.press;
      this.press = null;
      if (e.pointerType !== "mouse") this.ghost = null;
      if (!pr || !g) return;
      App.tryBuild(g.c, g.r, g.o);
    };
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", () => { this.press = null; this.ghost = null; });
    cv.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && !this.press) this.ghost = null; });

    cv.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      App.toggleOrient();
      if (this.ghost) this.ghost.o = Game.orient;
    });
  },

  /* -------------------------------------------------------------- frame -- */

  drainEvents() {
    const s = Game.sim;
    if (!s) return;
    if (this.litSim !== s) { this.litSim = s; this.lit = new Float32Array(s.n).fill(-9); }
    const k = this.cell;
    const px = (cx) => this.ox + cx * k, py = (cy) => this.oy + cy * k;
    for (const ev of s.events) {
      if (ev.type === "build") Sfx.build(ev.orient);
      else if (ev.type === "seal") {
        const cells = ev.line.concat(ev.claimed);
        for (const i of cells) this.lit[i] = this.clock;
        Sfx.seal(cells.length);
        if (ev.claimed.length) {
          // Float the points over the middle of what was just claimed.
          let sx = 0, sy = 0;
          for (const i of ev.claimed) { sx += i % s.cols; sy += Math.floor(i / s.cols); }
          const n = ev.claimed.length;
          Fx.text(px(sx / n + 0.5), py(sy / n + 0.5), `+${ev.points}`, { color: "#7dffe2", size: n > 120 ? 20 : 15 });
          if (n > 120) Fx.addShake(3);
        }
      } else if (ev.type === "breach") {
        Sfx.breach();
        const color = ev.dir < 0 ? COLORS.neg : COLORS.pos;
        Fx.burst(px(ev.x), py(ev.y), color, 26, 190, 0.6, 2.6);
        Fx.burst(px(ev.x), py(ev.y), "#ffffff", 10, 120, 0.4, 2);
        Fx.addShake(9);
        Fx.addFlash(0.28, "#ff2a4d");
        Fx.text(px(ev.x), py(ev.y) - 10, "−1 ❤", { color: "#ff8fa3", size: 16 });
        App.hud();
      } else if (ev.type === "clear") {
        Fx.confetti(this.W, this.H, ["#36e2c4", "#47b3ff", "#ff4f6e", "#ffffff"], 60);
      }
    }
    s.events.length = 0;

    for (const ev of Game.events) {
      if (ev.type === "levelClear") App.levelClear(ev);
      else if (ev.type === "gameOver") App.gameOver(ev);
    }
    Game.events.length = 0;
  },

  update(dt) {
    const b = this.stage.getBoundingClientRect();
    if (b.width > 50 && b.height > 50 && (Math.abs(b.width - this.W) > 1 || Math.abs(b.height - this.H) > 1)) this.resize();

    // Pausing has to stop everything around the simulation too — effects,
    // the render clock, the event queue — not just the simulation itself.
    if (Game.paused) return;
    this.clock += dt;
    const before = Game.sim ? Math.ceil(Game.sim.time) : 0;
    Game.update(dt);
    if (Game.phase === "play" && Game.sim.time <= 10 && Math.ceil(Game.sim.time) < before) Sfx.lowTime();
    this.drainEvents();
    Fx.update(dt);
    App.hud();
  },

  /* --------------------------------------------------------------- draw -- */

  draw() {
    const c = this.ctx;
    if (!c || this.W < 2) return;
    c.save();
    c.fillStyle = COLORS.bg;
    c.fillRect(0, 0, this.W, this.H);
    const s = Game.sim;
    if (!s) { c.restore(); return; }

    const [shx, shy] = Fx.shakeOffset();
    c.translate(shx, shy);
    const k = this.cell, ox = this.ox, oy = this.oy;

    // The chamber rim.
    c.fillStyle = COLORS.rim;
    c.fillRect(ox - 4, oy - 4, this.bw + 8, this.bh + 8);
    c.fillStyle = "#03060d";
    c.fillRect(ox - 2, oy - 2, this.bw + 4, this.bh + 4);

    c.fillStyle = COLORS.field;
    c.fillRect(ox, oy, this.bw, this.bh);
    c.strokeStyle = COLORS.grid;
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 1; x < s.cols; x++) { c.moveTo(ox + x * k + 0.5, oy); c.lineTo(ox + x * k + 0.5, oy + this.bh); }
    for (let y = 1; y < s.rows; y++) { c.moveTo(ox, oy + y * k + 0.5); c.lineTo(ox + this.bw, oy + y * k + 0.5); }
    c.stroke();

    this.drawSolids(s);
    this.drawGhost(s);
    this.drawWall(s);
    this.drawBalls(s);

    Fx.render(c);
    c.restore();
  },

  drawSolids(s) {
    const c = this.ctx, k = this.cell, ox = this.ox, oy = this.oy, cols = s.cols;
    // Claimed space in row runs, so a mostly-claimed field is a few dozen
    // rectangles rather than several hundred.
    c.fillStyle = COLORS.claimed;
    for (let r = 0; r < s.rows; r++) {
      let run = -1;
      for (let col = 0; col <= cols; col++) {
        const on = col < cols && s.grid[r * cols + col] === CLAIMED;
        if (on && run < 0) run = col;
        if (!on && run >= 0) { c.fillRect(ox + run * k, oy + r * k, (col - run) * k, k); run = -1; }
      }
    }
    // A diagonal hatch over the claimed space, clipped to it, so claimed reads
    // as sealed material and not as a darker patch of open field.
    c.save();
    c.beginPath();
    for (let i = 0; i < s.n; i++) if (s.grid[i] === CLAIMED) c.rect(ox + (i % cols) * k, oy + Math.floor(i / cols) * k, k, k);
    c.clip();
    c.strokeStyle = COLORS.claimedLine;
    c.lineWidth = Math.max(1, k * 0.12);
    c.beginPath();
    const step = Math.max(5, k * 0.7);
    for (let d = -this.bh; d < this.bw; d += step) { c.moveTo(ox + d, oy + this.bh); c.lineTo(ox + d + this.bh, oy); }
    c.stroke();
    c.restore();

    // Built walls: a raised steel bar per cell.
    for (let i = 0; i < s.n; i++) {
      if (s.grid[i] !== WALL) continue;
      const x = ox + (i % cols) * k, y = oy + Math.floor(i / cols) * k;
      c.fillStyle = COLORS.wall;
      c.fillRect(x, y, k, k);
      c.fillStyle = COLORS.wallTop;
      c.fillRect(x, y, k, Math.max(1, k * 0.18));
    }

    // The flash on freshly sealed cells.
    const now = this.clock, lit = this.lit;
    if (lit && this.litSim === s) {
      for (let i = 0; i < s.n; i++) {
        const age = now - lit[i];
        if (age < 0 || age > 0.55) continue;
        c.fillStyle = `rgba(${COLORS.flash},${(0.55 * (1 - age / 0.55)).toFixed(3)})`;
        c.fillRect(ox + (i % cols) * k, oy + Math.floor(i / cols) * k, k, k);
      }
    }
  },

  drawWall(s) {
    const w = s.wall;
    if (!w) return;
    const c = this.ctx, k = this.cell;
    for (const h of w.halves) {
      if (!h.alive || h.done) continue;
      const q = Sim.halfRect(w, h);
      const x = this.ox + q.x0 * k, y = this.oy + q.y0 * k;
      const ww = (q.x1 - q.x0) * k, hh = (q.y1 - q.y0) * k;
      const col = h.dir < 0 ? COLORS.neg : COLORS.pos;
      c.save();
      c.shadowColor = col;
      c.shadowBlur = 12;
      c.fillStyle = col;
      c.fillRect(x, y, ww, hh);
      c.restore();
      // A white-hot growing tip.
      c.fillStyle = "rgba(255,255,255,.85)";
      const tip = Math.max(2, k * 0.3);
      if (w.orient === "h") c.fillRect(h.dir < 0 ? x : x + ww - tip, y, tip, hh);
      else c.fillRect(x, h.dir < 0 ? y : y + hh - tip, ww, tip);
    }
  },

  drawGhost(s) {
    const g = this.ghost;
    if (!g || Game.phase !== "play") return;
    const c = this.ctx, k = this.cell;
    const x0 = this.ox + g.c * k, y0 = this.oy + g.r * k;
    if (!Sim.canBuild(s, g.c, g.r)) {
      // Somewhere you cannot build: say so where the finger is.
      c.strokeStyle = "rgba(255,120,140,.8)";
      c.lineWidth = 2;
      c.strokeRect(x0 + 1, y0 + 1, k - 2, k - 2);
      return;
    }
    const { lo, hi } = Sim.span(s, g.c, g.r, g.o);
    c.save();
    c.fillStyle = "rgba(255,255,255,.10)";
    c.strokeStyle = "rgba(255,255,255,.55)";
    c.setLineDash([Math.max(3, k * 0.35), Math.max(3, k * 0.25)]);
    c.lineWidth = 1.5;
    if (g.o === "h") {
      c.fillRect(this.ox + lo * k, y0, (hi - lo + 1) * k, k);
      c.strokeRect(this.ox + lo * k + 0.5, y0 + 0.5, (hi - lo + 1) * k - 1, k - 1);
    } else {
      c.fillRect(x0, this.oy + lo * k, k, (hi - lo + 1) * k);
      c.strokeRect(x0 + 0.5, this.oy + lo * k + 0.5, k - 1, (hi - lo + 1) * k - 1);
    }
    c.restore();
    // The origin, with the two colours it will grow in.
    const half = k / 2;
    c.fillStyle = COLORS.neg;
    if (g.o === "h") c.fillRect(x0, y0, half, k); else c.fillRect(x0, y0, k, half);
    c.fillStyle = COLORS.pos;
    if (g.o === "h") c.fillRect(x0 + half, y0, half, k); else c.fillRect(x0, y0 + half, k, half);
  },

  drawBalls(s) {
    const c = this.ctx, k = this.cell;
    const R = s.r * k;
    s.balls.forEach((b, i) => {
      const x = this.ox + b.x * k, y = this.oy + b.y * k;
      const g = c.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.1, x, y, R);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.45, i % 2 ? "#ffd1d9" : "#d6ecff");
      g.addColorStop(1, i % 2 ? "#e2334f" : "#2f86d6");
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, R, 0, Math.PI * 2);
      c.fill();
      // A spinning band, so the particles read as alive even in a still frame
      // of a crowded field.
      c.strokeStyle = "rgba(255,255,255,.55)";
      c.lineWidth = Math.max(1, R * 0.22);
      const a = this.clock * 6 * (b.vx > 0 ? 1 : -1) + i;
      c.beginPath();
      c.ellipse(x, y, R * 0.78, R * 0.3, a, 0, Math.PI * 2);
      c.stroke();
    });
  },
};

// The frame loop, separate so the screen-change hook can stop it dead.
const Engine = {
  raf: 0,
  last: 0,

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (t) => { this.raf = requestAnimationFrame(loop); this.frame(t); };
    this.raf = requestAnimationFrame(loop);
  },

  // One frame. Steppable by hand — verification feeds timestamps straight in —
  // and it schedules nothing itself, so doing that cannot start a second loop.
  frame(t) {
    // Clamp at BOTH ends — a timestamp from a different clock must never run
    // the field backwards.
    const dt = Math.max(0, Math.min(0.05, (t - this.last) / 1000));
    this.last = t;
    GK.Debug.frame(dt);
    Render.update(dt);
    Render.draw();
  },

  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; },
};
