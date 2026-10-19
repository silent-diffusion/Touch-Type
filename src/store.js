// Saved data. Settings are shared; everything else (test history with per-test key misses,
// lifetime totals, game progress) belongs to the active profile.
//
// localStorage keys:
//   touchtype.v1        { version, settings }            shared settings
//   touchtype.profiles  { active, list: [{ id, name }] }  the profiles
//   touchtype.p.<id>    { history, keyStats, weakWords, games }  one profile's data
window.TT = window.TT || {};

(() => {
  const GLOBAL_KEY = "touchtype.v1";
  const PROFILES_KEY = "touchtype.profiles";
  const dataKey = (id) => `touchtype.p.${id}`;
  const MAX_HISTORY = 2000;
  const MAX_NAME = 24;

  const DEFAULT_SETTINGS = {
    mode: "time",
    amount: 30,
    practiceAmount: 30,
    theme: "sand",
    accent: "rust",
    second: false,
    uiFont: "archivo",
    typingFont: "jetbrains",
    size: "m",
    caret: "line",
    mix: 60,
    tilesSong: "twinkle",
    tilesDiff: "medium",
    tilesMusic: true,
    tilesMetronome: false,
    tilesScope: true,
    tilesLyrics: true,
    fhMusic: true, // Forest Hop's music and sound effects, each on or off
    fhSfx: true,
    grTrack: "sprint", // Ghost Race: the track, who to race (best, last, pace or p:<profile id>), the pace
    grVs: "best",
    grPace: 45,
    grMusic: true,
    grSfx: true,
    autoUpdate: false, // desktop app only; off means the app never goes online by itself
  };

  const read = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };
  const cleanData = (d) => ({
    history: Array.isArray(d && d.history) ? d.history : [],
    keyStats: (d && d.keyStats) || {},   // lifetime: letter -> { expected, missed }
    weakWords: (d && d.weakWords) || {}, // lifetime: word -> times typed with a mistake
    games: (d && d.games) || {},         // game id -> progress
  });
  const cleanName = (name) => String(name || "").trim().replace(/\s+/g, " ").slice(0, MAX_NAME);

  const global = read(GLOBAL_KEY) || {};
  let profiles = read(PROFILES_KEY);

  // First run with profiles: everything saved so far becomes "Player 1". The old copy is only
  // removed once the new one has been written and read back.
  if (!profiles || !Array.isArray(profiles.list) || !profiles.list.length) {
    profiles = { active: "default", list: [{ id: "default", name: "Player 1", created: new Date().toISOString() }] };
    if (write(dataKey("default"), cleanData(global)) && read(dataKey("default"))) {
      write(PROFILES_KEY, profiles);
      write(GLOBAL_KEY, { version: 3, settings: global.settings || {} });
    }
  }
  if (!profiles.list.some((p) => p.id === profiles.active)) profiles.active = profiles.list[0].id;

  TT.store = {
    version: 3,
    settings: { ...DEFAULT_SETTINGS, ...(global.settings || {}) },
    ...cleanData(read(dataKey(profiles.active)) || global),
  };

  TT.save = () => {
    const s = TT.store;
    if (s.history.length > MAX_HISTORY) s.history.splice(0, s.history.length - MAX_HISTORY);
    write(GLOBAL_KEY, { version: 3, settings: s.settings });
    write(dataKey(profiles.active), { history: s.history, keyStats: s.keyStats, weakWords: s.weakWords, games: s.games });
  };

  // Clears the active profile's results and progress (settings and other profiles are kept).
  TT.resetData = () => {
    Object.assign(TT.store, cleanData(null));
    TT.save();
    if (TT.rounds) TT.rounds.clear(); // its recordings
  };

  const saveProfiles = () => write(PROFILES_KEY, profiles);

  TT.profiles = {
    MAX_NAME,
    list: () => profiles.list.map((p) => ({ ...p })),
    activeId: () => profiles.active,
    active: () => ({ ...profiles.list.find((p) => p.id === profiles.active) }),

    summary(id) {
      const d = id === profiles.active ? TT.store : cleanData(read(dataKey(id)));
      const tests = d.history.filter((h) => h.kind !== "game");
      return {
        tests: tests.length,
        games: d.history.length - tests.length,
        best: tests.reduce((m, h) => Math.max(m, h.wpm), 0),
      };
    },

    // A profile's game progress, read-only (the leaderboard compares every profile).
    games(id) {
      return id === profiles.active ? TT.store.games : cleanData(read(dataKey(id))).games;
    },

    create(name) {
      const clean = cleanName(name);
      if (!clean) return null;
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      profiles.list.push({ id, name: clean, created: new Date().toISOString() });
      write(dataKey(id), cleanData(null));
      saveProfiles();
      return id;
    },

    rename(id, name) {
      const p = profiles.list.find((x) => x.id === id);
      const clean = cleanName(name);
      if (!p || !clean) return false;
      p.name = clean;
      saveProfiles();
      return true;
    },

    // Permanently deletes a profile and its data. The active profile can't be deleted.
    remove(id) {
      if (id === profiles.active || profiles.list.length < 2) return false;
      profiles.list = profiles.list.filter((p) => p.id !== id);
      saveProfiles();
      try {
        localStorage.removeItem(dataKey(id));
      } catch {}
      if (TT.rounds) TT.rounds.clearProfile(id);
      return true;
    },

    switchTo(id) {
      if (id === profiles.active || !profiles.list.some((p) => p.id === id)) return false;
      TT.save();
      profiles.active = id;
      saveProfiles();
      Object.assign(TT.store, cleanData(read(dataKey(id))));
      return true;
    },
  };
})();
