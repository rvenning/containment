// Persistence — gamekit storage configured for Containment.
// ctm_* localStorage keys, "containment" Firestore collection.
//
// An arcade run leaves only records behind: your best score, the deepest level
// you reached, and running totals. Every one of them only ever goes up, so two
// devices meeting keep the larger of each. There is no currency and no mid-run
// save — a run is played in one sitting, which is what keeps a leaderboard
// score honest.
//
// blank/merge are named before being handed to createStorage, because
// createStorage keeps them in a closure, and merge is the one function here
// that can permanently destroy a save.

const PROGRESS = {
  blank: () => ({
    best: 0,          // best run score
    bestLevel: 0,     // deepest level reached in any run
    runs: 0,
    levelsCleared: 0, // across every run
    claimed: 0,       // cells claimed, across every run
    updated: 0,
  }),

  merge: (a, b) => ({
    // Spread first so a field a newer build added survives an older client's
    // merge, then pin everything we know how to reconcile.
    ...a, ...b,
    best: Math.max(a.best || 0, b.best || 0),
    bestLevel: Math.max(a.bestLevel || 0, b.bestLevel || 0),
    runs: Math.max(a.runs || 0, b.runs || 0),
    levelsCleared: Math.max(a.levelsCleared || 0, b.levelsCleared || 0),
    claimed: Math.max(a.claimed || 0, b.claimed || 0),
  }),
};

const Storage = GK.createStorage({
  prefix: "ctm",
  collection: "containment",
  firebaseConfig: window.FIREBASE_CONFIG,
  blankProgress: PROGRESS.blank,
  mergeProgress: PROGRESS.merge,
});

Object.assign(Storage, {
  // Returns the updated save and whether this run set a new best.
  recordRun(profileId, res) {
    const prog = this.getProgress(profileId);
    const newBest = res.score > (prog.best || 0);
    const deeper = res.level > (prog.bestLevel || 0);
    prog.runs = (prog.runs || 0) + 1;
    prog.levelsCleared = (prog.levelsCleared || 0) + (res.cleared || 0);
    prog.claimed = (prog.claimed || 0) + (res.claimed || 0);
    if (newBest) prog.best = res.score;
    if (deeper) prog.bestLevel = res.level;
    this.saveProgress(profileId, prog);
    return { prog, newBest, deeper };
  },
});
