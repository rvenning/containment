// App shell — splash, roster, the lobby, the run, results and the family
// leaderboard. Profiles, PINs, sync and install come from gamekit; this file
// only decides what goes on each screen.

const AVATARS = ["⚛️", "🧪", "🔬", "🧲", "🛰️", "🦊", "🐱", "🦉", "🐼", "🐙", "🦖", "🐝"];

const App = {
  profile: null,
  token: 0,          // bumped on every run start and quit; delayed transitions check it

  el(id) { return document.getElementById(id); },

  init() {
    Sfx.enabled = Storage.getSettings().sound !== false;

    GK.UI.onScreenChange = (name) => {
      if (name !== "game") Engine.stop();
      if (name === "splash") this.refreshSplash();
    };
    GK.UI.bindSoundToggle(Storage);
    GK.UI.bindMenuClicks();

    GK.Profiles.init({
      storage: Storage,
      avatars: AVATARS,
      meta: (p, prog) => `🏆 ${this.fmt(prog.best || 0)} · deepest level ${prog.bestLevel || 0}`,
      onEnter: (p) => { this.profile = p; this.showLobby(); },
      addLabel: "New Researcher",
    });

    GK.initPWA({ appName: "Containment" });
    Render.boot();
    this.bindKeys();

    GK.Debug.init({ storage: Storage, title: "CONTAINMENT" })
      .jump("level", 30, (n) => this.startRun(n))
      .action("claim to 74%", () => {
        const s = Game.sim;
        if (!s || Game.phase !== "play") return;
        const goal = Math.floor(s.n * 0.74);
        for (let i = s.n - 1; i >= 0 && s.filled < goal; i--) {
          const c = i % s.cols, r = Math.floor(i / s.cols);
          if (s.grid[i] || s.balls.some((b) => Math.abs(b.x - c - 0.5) < 2 && Math.abs(b.y - r - 0.5) < 2)) continue;
          s.grid[i] = CLAIMED; s.filled++;
        }
      })
      .action("lose a life", () => { if (Game.sim) Game.sim.lives = 1; });

    this.showScreen("splash");
    Storage.initFirebase().then((ok) => {
      this.el("sync-badge").textContent = ok ? "☁️ family sync on" : "📴 offline";
      if (ok && GK.UI.screen === "profiles") GK.Profiles.renderList();
      if (ok && GK.UI.screen === "splash") this.refreshSplash();
      if (ok && GK.UI.screen === "lobby") this.showLobby();
      if (ok && GK.UI.screen === "leaderboard") this.showLeaderboard(true);
    });

    // Leaving the tab mid-run pauses it rather than letting the clock run out.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && Game.running() && GK.UI.screen === "game") this.pause();
    });
  },

  showScreen(name) { GK.UI.showScreen(name); },
  progress() { return Storage.getProgress(this.profile.id); },
  fmt(n) { return Math.round(n).toLocaleString("en-AU"); },

  bindKeys() {
    addEventListener("keydown", (e) => {
      if (GK.UI.screen !== "game") return;
      if (document.querySelector(".modal.visible")) {
        if ((e.key === "Escape" || e.key === "p") && Game.paused) { e.preventDefault(); this.resume(); }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === " " || k === "r") { e.preventDefault(); this.toggleOrient(); }
      else if (k === "h") this.setOrient("h");
      else if (k === "v") this.setOrient("v");
      else if (k === "escape" || k === "p") this.pause();
      else if (k === "enter" && Game.phase === "clear") this.nextLevel();
    });
  },

  /* ------------------------------------------------------------- splash -- */

  refreshSplash() {
    const last = GK.Profiles.lastProfile();
    const cont = this.el("btn-continue-as"), start = this.el("btn-start");
    if (last) {
      cont.hidden = false;
      cont.textContent = `⚛️ Continue as ${last.avatar} ${last.name}`;
      cont.onclick = () => { Sfx.init(); GK.Profiles.select(last); };
      start.className = "btn ghost";
      start.textContent = "👥 Switch researcher";
    } else {
      cont.hidden = true;
      start.className = "btn big";
      start.textContent = "⚛️ Enter the lab";
    }
  },

  play() {
    Sfx.init();
    GK.Profiles.renderList();
    this.showScreen("profiles");
  },

  howTo() { GK.UI.openModal("modal-howto"); },

  /* -------------------------------------------------------------- lobby -- */

  showLobby() {
    if (!this.profile) return this.play();
    const prog = this.progress();
    this.el("lobby-who").innerHTML = `${this.profile.avatar} <b>${GK.util.esc(this.profile.name)}</b>`;
    this.el("lobby-stats").innerHTML = [
      ["Best score", this.fmt(prog.best || 0)],
      ["Deepest level", prog.bestLevel || "—"],
      ["Runs", prog.runs || 0],
    ].map(([k, v]) => `<div class="stat"><span class="stat-v">${v}</span><span class="stat-k">${k}</span></div>`).join("");
    this.showScreen("lobby");
  },

  /* --------------------------------------------------------------- run -- */

  startRun(level = 1) {
    Sfx.init();
    this.token++;
    const seed = (Math.random() * 4294967296) >>> 0;
    Game.newRun(seed);
    if (level > 1) { Game.run.level = level; Game.startLevel(); }
    this.el("level-card").hidden = true;
    GK.UI.closeModal("modal-pause");
    this.showScreen("game");
    // The stage measures 0x0 while the screen is hidden, so this runs after
    // showScreen, not before it.
    Render.resize();
    this.hud();
    this.flashBanner(`Level ${Game.sim.level}`, `${Game.sim.balls.length} particles · ${Game.sim.lives} lives`);
    Engine.start();
  },

  tryBuild(c, r, o) {
    if (!Game.running()) return;
    if (Game.build(c, r, o)) return;
    Sfx.refuse();
    if (Game.sim.wall) GK.UI.toast("One line at a time");
  },

  setOrient(o) {
    if (Game.orient === o) return;
    Game.orient = o;
    Sfx.toggle(o);
    if (Render.ghost) Render.ghost.o = o;
    this.hud();
  },

  toggleOrient() { this.setOrient(Game.orient === "h" ? "v" : "h"); },

  hud() {
    const s = Game.sim;
    if (!s) return;
    this.el("hud-level").textContent = `L${s.level}`;
    this.el("hud-lives").textContent = `❤ ${s.lives}`;
    this.el("hud-score").textContent = this.fmt(Game.score());
    const pct = Math.floor((100 * s.filled) / s.n);
    this.el("hud-pct").textContent = `${pct}%`;
    this.el("meter-fill").style.width = `${Math.min(100, (pct / 75) * 100)}%`;
    this.el("meter-fill").classList.toggle("done", pct >= 75);
    const t = Math.max(0, s.time);
    this.el("hud-time").textContent = `${Math.ceil(t)}s`;
    this.el("time-fill").style.width = `${(100 * t) / s.timeStart}%`;
    this.el("time-fill").classList.toggle("low", t <= 10);

    const across = this.el("btn-across"), down = this.el("btn-down");
    across.classList.toggle("on", Game.orient === "h");
    down.classList.toggle("on", Game.orient === "v");
    across.setAttribute("aria-pressed", String(Game.orient === "h"));
    down.setAttribute("aria-pressed", String(Game.orient === "v"));
  },

  flashBanner(title, sub) {
    const b = this.el("banner");
    b.innerHTML = `<b>${title}</b><span>${sub}</span>`;
    b.classList.remove("show");
    void b.offsetWidth;
    b.classList.add("show");
  },

  pause() {
    if (!Game.running()) return;
    Game.paused = true;
    Render.press = null; Render.ghost = null;
    GK.UI.openModal("modal-pause");
  },

  resume() {
    GK.UI.closeModal("modal-pause");
    Game.paused = false;
    Engine.last = performance.now();
  },

  quitRun() {
    GK.UI.closeModal("modal-pause");
    Game.paused = false;
    if (Game.phase === "clear") {
      // Walking away between levels: the run ends with what is banked, and the
      // level just cleared still counts — so read the result BEFORE the phase
      // changes, since result() decides "cleared" from it.
      Game.sim.reason = "quit";
      const res = Game.result();
      Game.phase = "over";
      this.token++;
      this.showResults(res);
      return;
    }
    const res = Game.quit();
    Game.events.length = 0;
    this.token++;
    if (res) this.showResults(res);
    else this.showLobby();
  },

  // Delayed transitions carry the token, so quitting inside the delay cannot
  // throw you back into a screen belonging to a run you walked away from.
  later(fn, ms) {
    const token = this.token;
    setTimeout(() => { if (this.token === token) fn(); }, ms);
  },

  levelClear(ev) {
    Sfx.levelClear();
    const b = ev.bonus, L = b.level;
    const rows = [
      [`Claimed ${b.pct}%`, `+${this.fmt(b.claimPoints)}`],
      [`${b.livesLeft} ${b.livesLeft === 1 ? "life" : "lives"} left × ${BONUS.perLife * L}`, `+${this.fmt(b.lives)}`],
      [`${b.secondsLeft}s left × ${BONUS.perSecond * L}`, `+${this.fmt(b.time)}`],
      [`${b.over}% past 75 × ${BONUS.perPercentOver * L}`, `+${this.fmt(b.overfill)}`],
    ];
    this.el("card-title").textContent = `Level ${L} contained`;
    this.el("card-rows").innerHTML = rows.map(([k, v]) => `<div class="card-row"><span>${k}</span><b>${v}</b></div>`).join("");
    this.el("card-total").textContent = this.fmt(ev.score);
    const next = this.el("btn-next");
    next.textContent = `▶ Level ${L + 1} · ${L + 2} particles`;
    this.later(() => {
      this.el("level-card").hidden = false;
      next.focus({ preventScroll: true });
    }, 750);
  },

  nextLevel() {
    if (!Game.nextLevel()) return;
    this.el("level-card").hidden = true;
    Render.ghost = null;
    this.hud();
    this.flashBanner(`Level ${Game.sim.level}`, `${Game.sim.balls.length} particles · ${Game.sim.lives} lives · ${Game.sim.timeStart}s`);
  },

  gameOver(ev) {
    Sfx.gameOver();
    this.later(() => this.showResults(ev.result), 1300);
  },

  /* ------------------------------------------------------------ results -- */

  showResults(res) {
    Engine.stop();
    const { newBest, prog } = Storage.recordRun(this.profile.id, res);
    const why = { lives: "Out of lives", time: "Out of time", quit: "Run ended" }[res.reason] || "Run over";
    this.el("res-title").textContent = why;
    this.el("res-score").textContent = this.fmt(res.score);
    const lv = (n) => `${n} ${n === 1 ? "level" : "levels"}`;
    this.el("res-level").textContent = res.cleared >= res.level
      ? `Cleared ${lv(res.cleared)}`
      : res.cleared ? `Cleared ${lv(res.cleared)} · stopped on level ${res.level}` : `Stopped on level ${res.level}`;
    this.el("res-stats").innerHTML = [
      `🧱 ${res.walls} lines built`,
      `💥 ${res.breaches} breaches`,
      `▦ ${this.fmt(res.claimed)} cells claimed`,
      `🏆 best ${this.fmt(prog.best)}`,
    ].map((b) => `<div>${b}</div>`).join("");
    this.el("res-best").hidden = !newBest;
    if (newBest) setTimeout(() => Sfx.newBest(), 350);
    this.showScreen("results");
  },

  /* -------------------------------------------------------- leaderboard -- */

  showLeaderboard(silent) {
    GK.Profiles.renderLeaderboard("lb-rows", {
      cols: (r) => `<span class="lb-stat">🏆 ${this.fmt(r.progress.best || 0)}</span>
        <span class="lb-stat">L${r.progress.bestLevel || 0}</span>`,
      sort: (a, b) => (b.progress.best || 0) - (a.progress.best || 0)
        || (b.progress.bestLevel || 0) - (a.progress.bestLevel || 0),
      meId: this.profile?.id,
      empty: "No runs yet — be the first on the board.",
    });
    this.showScreen("leaderboard");
  },
};

// Pinch zoom sticks forever on iOS once it happens, so block it at the source.
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("gesturechange", (e) => e.preventDefault());

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => App.init());
else App.init();
