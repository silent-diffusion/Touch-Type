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

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const store = req.result.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("date", "date");
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

  TT.newRoundId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  TT.rounds = {
    save: (rec) => tx("readwrite", (s) => s.put(rec)).catch(() => {}),
    get: (id) => tx("readonly", (s) => s.get(id)).catch(() => undefined),
    clear: () => tx("readwrite", (s) => s.clear()).catch(() => {}),

    // Newest first.
    async recent(limit) {
      try {
        const db = await open();
        return await new Promise((resolve, reject) => {
          const out = [];
          const req = db.transaction(STORE).objectStore(STORE).index("date").openCursor(null, "prev");
          req.onsuccess = () => {
            const cur = req.result;
            if (!cur || out.length >= limit) return resolve(out);
            out.push(cur.value);
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
