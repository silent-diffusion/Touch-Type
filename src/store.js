// Saved data. Settings are shared; everything else (test history with per-test key misses,
// lifetime totals, game progress) belongs to the active profile.
//
// localStorage keys:
//   touchtype.v1        { version, settings }            shared settings
//   touchtype.profiles  { active, list: [{ id, name }], main: { id, t } }  the profiles
//   touchtype.p.<id>    { history, keyStats, weakWords, games }  one profile's data
//
// The main profile: profiles.main = { id, t }, id the main profile's id or null for none, t when it
// was last chosen or cleared (ms since 1970). At most one profile is main. It's the same pair the
// Apple app's iCloud sync keeps, so a future sync can take the latest choice by t. Older data
// without it simply has no main profile.
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
    tilesWords: "mix", // Tiles' words: mix (lyrics, favouring your weak letters), lyrics, or practice
    fhMusic: true, // Forest Hop's music and sound effects, each on or off
    fhSfx: true,
    grTrack: "60m", // Ghost Race: the track, who to race (best, last, pace or p:<profile id>), the pace
    grVs: "best",
    grPace: 45,
    grMusic: true,
    grSfx: true,
    wmPack: "mixed", // Wormhole: Blitz's pack of prompts (or mixed), music and sound effects
    wmMusic: true,
    wmSfx: true,
    autoUpdate: false, // desktop app only; off means the app never goes online by itself
  };

  const read = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  };
  // While everything on this device is being deleted (TT.wipeDevice), nothing is written back.
  let wiping = false;
  const write = (key, value) => {
    if (wiping) return false;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };
  // Saved data is only trusted for its shape as far as it's checked here: whatever is of the wrong
  // kind is left out, so damaged (or tampered-with) data can't stop the app from starting.
  const isObject = (x) => !!x && typeof x === "object" && !Array.isArray(x);
  // A table keyed by letters or words has no prototype, so a key like "constructor" (a word in a
  // song's lyrics, say) or "__proto__" is only ever a key and never one of Object's own members.
  const table = (x) => Object.assign(Object.create(null), isObject(x) ? x : null);
  const cleanData = (d) => {
    const games = isObject(d && d.games) ? d.games : {};
    for (const id of Object.keys(games)) if (!isObject(games[id])) delete games[id];
    return {
      history: Array.isArray(d && d.history) ? d.history.filter(isObject) : [],
      keyStats: table(d && d.keyStats),   // lifetime: letter -> { expected, missed }
      weakWords: table(d && d.weakWords), // lifetime: word -> times typed with a mistake
      games,                              // game id -> progress
    };
  };
  const cleanName = (name) => String(name || "").trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
  // The saved profiles, or null if there are none that can be used: each needs an id of its own.
  const cleanProfiles = (p) => {
    if (!isObject(p) || !Array.isArray(p.list)) return null;
    const ids = new Set();
    const list = p.list.filter((x) => isObject(x) && typeof x.id === "string" && x.id && !ids.has(x.id) && ids.add(x.id));
    for (const x of list) x.name = cleanName(x.name) || "Player";
    return list.length ? { ...p, list } : null;
  };

  const savedGlobal = read(GLOBAL_KEY);
  const global = isObject(savedGlobal) ? savedGlobal : {};
  let profiles = cleanProfiles(read(PROFILES_KEY));

  // First run with profiles: everything saved so far becomes "Player 1". The old copy is only
  // removed once the new one has been written and read back. (If the first profile's data is there
  // already, the list of profiles was lost or damaged: its data is kept as it is.)
  if (!profiles) {
    profiles = { active: "default", list: [{ id: "default", name: "Player 1", created: new Date().toISOString() }] };
    if ((read(dataKey("default")) || write(dataKey("default"), cleanData(global))) && read(dataKey("default"))) {
      write(PROFILES_KEY, profiles);
      write(GLOBAL_KEY, { version: 3, settings: global.settings || {} });
    }
  }
  if (!profiles.list.some((p) => p.id === profiles.active)) profiles.active = profiles.list[0].id;
  const m = profiles.main;
  profiles.main = m && typeof m === "object" && profiles.list.some((p) => p.id === m.id)
    ? { id: m.id, t: Number(m.t) || 0 }
    : { id: null, t: (m && Number(m.t)) || 0 };

  TT.store = {
    version: 3,
    settings: { ...DEFAULT_SETTINGS, ...(global.settings || {}) },
    ...cleanData(read(dataKey(profiles.active)) || global),
  };

  // Just the settings, for when a setting is all that changed: the profile's data (its history can
  // be a megabyte) isn't written out again for it.
  TT.saveSettings = () => write(GLOBAL_KEY, { version: 3, settings: TT.store.settings });

  TT.save = () => {
    const s = TT.store;
    if (s.history.length > MAX_HISTORY) s.history.splice(0, s.history.length - MAX_HISTORY);
    TT.saveSettings();
    write(dataKey(profiles.active), { history: s.history, keyStats: s.keyStats, weakWords: s.weakWords, games: s.games });
  };

  // Clears the active profile's results and progress (settings and other profiles are kept).
  TT.resetData = () => {
    Object.assign(TT.store, cleanData(null));
    TT.save();
    if (TT.rounds) TT.rounds.clear(); // its recordings
  };

  const saveProfiles = () => write(PROFILES_KEY, profiles);

  // Another profile's game progress and summary, as last read. The leaderboard and Ghost Race's
  // list of ghosts ask for them on every redraw, and reading a profile means parsing its whole
  // history (up to a megabyte), so they're kept for as long as what's stored is the same text.
  const others = new Map(); // id -> { raw, games, summary }
  const summarize = (d) => {
    const tests = d.history.filter((h) => h.kind !== "game");
    return {
      tests: tests.length,
      games: d.history.length - tests.length,
      best: tests.reduce((m, h) => Math.max(m, h.wpm), 0),
    };
  };
  function other(id) {
    let raw = null;
    try {
      raw = localStorage.getItem(dataKey(id));
    } catch {}
    let o = others.get(id);
    if (!o || o.raw !== raw) {
      const d = cleanData(read(dataKey(id)));
      o = { raw, games: d.games, summary: summarize(d) };
      others.set(id, o);
    }
    return o;
  }

  TT.profiles = {
    MAX_NAME,
    list: () => profiles.list.map((p) => ({ ...p })),
    activeId: () => profiles.active,
    active: () => ({ ...profiles.list.find((p) => p.id === profiles.active) }),
    mainId: () => profiles.main.id,

    // Makes a profile the main one (only one can be), or none with null.
    setMain(id) {
      if (id !== null && !profiles.list.some((p) => p.id === id)) return false;
      profiles.main = { id, t: Date.now() };
      saveProfiles();
      return true;
    },

    summary(id) {
      return id === profiles.active ? summarize(TT.store) : { ...other(id).summary };
    },

    // A profile's game progress, read-only (the leaderboard compares every profile).
    games(id) {
      return id === profiles.active ? TT.store.games : other(id).games;
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
      if (profiles.main.id === id) profiles.main = { id: null, t: Date.now() };
      saveProfiles();
      try {
        localStorage.removeItem(dataKey(id));
      } catch {}
      others.delete(id);
      if (TT.rounds) TT.rounds.clearProfile(id);
      return true;
    },

    switchTo(id) {
      if (id === profiles.active || !profiles.list.some((p) => p.id === id)) return false;
      TT.save();
      profiles.active = id;
      others.delete(id); // (it's read from TT.store from now on)
      saveProfiles();
      Object.assign(TT.store, cleanData(read(dataKey(id))));
      return true;
    },
  };

  // Deletes everything Touch Type keeps on this device: every profile (the active one too), all
  // settings, results, replays, added songs and their parts, and game progress; then reloads, so the
  // app starts fresh as on its first run. models: also delete the downloaded models (desktop app).
  // In the Apple app the app itself does it (window.touchType.data.wipeDevice), since it also keeps
  // copies for iCloud sync; it reloads the page when done.
  TT.wipeDevice = async ({ models = false } = {}) => {
    const native = window.touchType && window.touchType.data && window.touchType.data.wipeDevice;
    if (native) return native();
    wiping = true;
    if (models && TT.models && TT.models.supported()) {
      for (const m of TT.models.catalog()) {
        if (TT.models.state(m.id).status === "installed") {
          try { await TT.models.remove(m.id); } catch {}
        }
      }
    }
    if (TT.closeDB) TT.closeDB();
    // Only Touch Type's own database (rounds.js) and its own keys (touchtype.*) go. In a browser,
    // other pages can share this page's storage (every page opened from a file does, in Chrome),
    // and what they keep there isn't ours to delete.
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase("touchtype");
      req.onsuccess = req.onerror = () => resolve();
      // still open somewhere (a worker finishing): the delete goes through once it closes, before
      // the reloaded page can open it again
      req.onblocked = () => setTimeout(resolve, 1500);
    });
    const removeOurs = (storage) => {
      for (const key of Object.keys(storage)) if (key.startsWith("touchtype.")) storage.removeItem(key);
    };
    try { removeOurs(localStorage); } catch {}
    try { removeOurs(sessionStorage); } catch {}
    // the desktop app's window can't navigate itself (electron/main.js), so it reloads the page for it
    const win = window.touchType && window.touchType.window;
    if (win && win.reload) await win.reload();
    else location.reload();
  };
})();
