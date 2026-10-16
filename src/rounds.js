// Round recordings: the full keystroke log of every test, practice round and game, kept in
// IndexedDB (localStorage is too small for thousands of them). Replays and keystroke analysis
// are worked out from these logs, so new kinds of analysis also apply to old rounds.
//
// A recording: { id, date, kind, ..., keys, times }
//   keys  — one character per key press: a-z / A-Z, " " space, "<" backspace, "{" ctrl+backspace
//   times — milliseconds from the first key press, one per entry in keys
(() => {
  const DB_NAME = "touchtype";
  const STORE = "rounds";
  let dbPromise = null;

  // Version 2 added the "music" store for songs added to Tiles (see music.js), version 3 the "stems"
  // store for their separated parts (separate.js).
  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 3);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" }).createIndex("date", "date");
          if (!db.objectStoreNames.contains("music")) db.createObjectStore("music", { keyPath: "id" });
          if (!db.objectStoreNames.contains("stems")) db.createObjectStore("stems", { keyPath: "id" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function tx(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const result = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(result && "result" in result ? result.result : undefined);
      t.onerror = () => reject(t.error);
    });
  }

  TT.openDB = open;
  TT.newRoundId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // Each recording belongs to a profile. Ones saved before profiles existed belong to the first one.
  const activeProfile = () => (TT.profiles ? TT.profiles.activeId() : "default");
  const belongs = (rec, id) => (rec.profile || "default") === id;

  // Deletes every recording that belongs to a profile.
  async function clearProfile(id) {
    try {
      const db = await open();
      await new Promise((resolve, reject) => {
        const t = db.transaction(STORE, "readwrite");
        const req = t.objectStore(STORE).openCursor();
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) return;
          if (belongs(cur.value, id)) cur.delete();
          cur.continue();
        };
        t.oncomplete = resolve;
        t.onerror = () => reject(t.error);
      });
    } catch {}
  }

  TT.rounds = {
    save: (rec) => tx("readwrite", (s) => s.put({ profile: activeProfile(), ...rec })).catch(() => {}),
    get: (id) => tx("readonly", (s) => s.get(id)).catch(() => undefined),
    clear: () => clearProfile(activeProfile()),
    clearProfile,

    // The active profile's recordings, newest first.
    async recent(limit) {
      const id = activeProfile();
      try {
        const db = await open();
        return await new Promise((resolve, reject) => {
          const out = [];
          const req = db.transaction(STORE).objectStore(STORE).index("date").openCursor(null, "prev");
          req.onsuccess = () => {
            const cur = req.result;
            if (!cur || out.length >= limit) return resolve(out);
            if (belongs(cur.value, id)) out.push(cur.value);
            cur.continue();
          };
          req.onerror = () => reject(req.error);
        });
      } catch {
        return [];
      }
    },
  };
})();
