// Game sounds, layered on gamekit's defaults. All synthesized.
//
// Clean lab electronics: a rising zip when a line starts, a solid thunk when a
// half seals, a sweep whose length says how much you just claimed, and a harsh
// crackle for a breach — the one sound that has to cut through everything.

const Sfx = GK.Sfx;

Object.assign(Sfx, {
  build(orient) {
    const f = orient === "h" ? 440 : 520;
    this.tone({ freq: f, type: "square", dur: 0.06, vol: 0.06, slide: 260 });
    this.tone({ freq: f * 1.5, type: "sine", dur: 0.12, vol: 0.05, when: 0.03, slide: 200 });
  },

  toggle(orient) {
    this.tone({ freq: orient === "h" ? 620 : 760, type: "triangle", dur: 0.05, vol: 0.07 });
  },

  refuse() { this.tone({ freq: 190, type: "square", dur: 0.08, vol: 0.06, slide: -40 }); },

  // Bigger claims get a longer, lower sweep underneath the thunk.
  seal(cells) {
    const big = Math.min(1, cells / 220);
    this.tone({ freq: 140, type: "sine", dur: 0.14, vol: 0.2, slide: -50 });
    this.noise({ dur: 0.05, vol: 0.05 });
    if (cells > 6) {
      this.tone({ freq: 300 + big * 120, type: "triangle", dur: 0.18 + big * 0.35, vol: 0.08 + big * 0.06, when: 0.04, slide: 500 + big * 700 });
    }
  },

  breach() {
    this.noise({ dur: 0.35, vol: 0.22 });
    this.tone({ freq: 220, type: "sawtooth", dur: 0.3, vol: 0.16, slide: -170 });
    this.tone({ freq: 96, type: "square", dur: 0.22, vol: 0.1, when: 0.05, slide: -40 });
  },

  levelClear() {
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => this.tone({ freq: f, type: "triangle", dur: 0.22, vol: 0.16, when: i * 0.08 }));
    notes.forEach((f, i) => this.tone({ freq: f / 2, type: "sine", dur: 0.26, vol: 0.08, when: i * 0.08 }));
  },

  tally() { this.tone({ freq: 880, type: "square", dur: 0.03, vol: 0.04 }); },

  gameOver() {
    [392, 330, 262, 196].forEach((f, i) =>
      this.tone({ freq: f, type: "sawtooth", dur: 0.26, vol: 0.1, when: i * 0.16, slide: -20 }));
  },

  newBest() {
    [784, 988, 1175, 1568].forEach((f, i) =>
      this.tone({ freq: f, type: "square", dur: 0.12, vol: 0.11, when: i * 0.09 }));
  },

  lowTime() { this.tone({ freq: 1200, type: "sine", dur: 0.05, vol: 0.05 }); },
});
