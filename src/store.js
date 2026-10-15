// Saved data: test history (with per-test key misses), lifetime totals, settings.
window.TT = window.TT || {};

(() => {
  const STORAGE_KEY = "touchtype.v1";
  const MAX_HISTORY = 2000;

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
    autoUpdate: false, // desktop app only; off means the app never goes online by itself
  };

  function load() {
    let s = null;
    try {
      s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {}
    if (!s || typeof s !== "object") s = {};
    return {
      version: 2,
      history: Array.isArray(s.history) ? s.history : [],
      keyStats: s.keyStats || {},   // lifetime: letter -> { expected, missed }
      weakWords: s.weakWords || {}, // lifetime: word -> times typed with a mistake
      games: s.games || {},         // game id -> { best, plays, history }
      settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) },
    };
  }

  TT.store = load();

  TT.save = () => {
    const h = TT.store.history;
    if (h.length > MAX_HISTORY) h.splice(0, h.length - MAX_HISTORY);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(TT.store));
    } catch {}
  };

  TT.resetData = () => {
    TT.store.history = [];
    TT.store.keyStats = {};
    TT.store.weakWords = {};
    TT.store.games = {};
    TT.save();
  };
})();
