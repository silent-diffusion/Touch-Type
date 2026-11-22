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
  // For deleting everything (TT.wipeDevice): closes the database and keeps it closed, so it can be
  // deleted and nothing reopens it before the page reloads.
  TT.closeDB = () => {
    const was = dbPromise;
    dbPromise = Promise.reject(new Error("The saved data is being deleted."));
    dbPromise.catch(() => {});
    if (was) was.then((db) => db.close(), () => {});
  };
  TT.newRoundId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // Each recording belongs to a profile. Ones saved before profiles existed belong to the first one.
  const activeProfile = () => (TT.profiles ? TT.profiles.activeId() : "default");
  const belongs = (rec, id) => (rec.profile || "default") === id;

  // A recording read back is trusted for its shape only as far as it's checked here, like the rest
  // of the saved data (store.js). The replays put its words and keys into the page a letter at a
  // time, the analysis makes them keys of its tables, and its times and points are added up, so a
  // recording with anything of the wrong kind there is left out, like one that can't be read. A Forest
  // Hop animal or a Tiles difficulty that isn't one of the game's own reads as none (a frog, medium).
  const isObject = (x) => !!x && typeof x === "object" && !Array.isArray(x);
  const isNum = (x) => typeof x === "number";
  const isStr = (x) => typeof x === "string";
  const listOf = (x, ok) => Array.isArray(x) && x.every(ok);
  const NUMBERS = ["duration", "lead", "seed", "v", "wpmScale", "offset", "fall", "endT", "cols"];
  // The words: Forest Hop's come as a set for the four directions, and Tiles' may have a gap (it
  // deals "word" there). A set holds those four words and nothing else: a speed test's start-up
  // check and Ghost Race read any recording's words a letter at a time, whatever its game.
  const wordsOk = (rec) => listOf(rec.words,
    rec.game === "forest" ? (set) => isObject(set) && Object.keys(set).length === 4 && ["up", "left", "right", "down"].every((d) => isStr(set[d]))
      : rec.game === "tiles" ? (w) => w == null || isStr(w) : isStr);
  // Wormhole (wormhole.js): a key is a character, a prompt its number, and an answer that counted
  // has a name, points and a tier; a Daily picked up part way brings its earlier picks and their points.
  const answerOk = (r) => isObject(r) && (!r.name || (isStr(r.name) && isNum(r.pts) && isNum(r.tier) && Object.hasOwn(TT.wormCore.TIERS, r.tier)));
  const eventOk = ([t, type, data]) => isNum(t) && (type === "key" ? isStr(data) : type === "prompt" ? isNum(data)
    : type === "submit" ? isObject(data) && answerOk(data.r) : type === "timeout" ? isObject(data) : true);
  const pickOk = (p) => !(p && p.name) || isNum(p.pts);
  const wormOk = ({ spec, ev }) => isObject(spec) && Array.isArray(spec.prompts) && (spec.date == null || isStr(spec.date)) &&
    (spec.resume == null || (isObject(spec.resume) && (spec.resume.picks == null || listOf(spec.resume.picks, pickOk)))) &&
    listOf(ev, (e) => Array.isArray(e) && eventOk(e));

  function clean(rec) {
    try {
      if (!isObject(rec)) return undefined;
      if (rec.keys != null && !isStr(rec.keys)) return undefined;
      if (rec.times != null && !listOf(rec.times, isNum)) return undefined;
      if (NUMBERS.some((k) => rec[k] != null && !isNum(rec[k]))) return undefined;
      if (rec.title != null && !isStr(rec.title)) return undefined;
      if (rec.words != null && !wordsOk(rec)) return undefined;
      // Tiles: before v4 each tile's word and column; the times the tiles are hit and their columns
      if (rec.tiles != null && !listOf(rec.tiles, (x) => !x || (isObject(x) && isStr(x.w) && (x.l == null || isNum(x.l))))) return undefined;
      if (rec.hits != null && !listOf(rec.hits, isNum)) return undefined;
      if (rec.lanes != null && !listOf(rec.lanes, isNum)) return undefined;
      // Path Runner: its rows of paths, with their words
      if (rec.rows != null && !(typeof rec.rows === "object" &&
        Object.values(rec.rows).every((row) => isObject(row) && listOf(row.cells, (c) => isObject(c) && (c.word == null || isStr(c.word)))))) return undefined;
      if (rec.game === "worm" && !wormOk(rec)) return undefined;
      if (rec.animal != null && !Object.hasOwn(TT.forestCore.THEMES, rec.animal)) delete rec.animal;
      if (rec.diff != null && !Object.hasOwn(TT.tilesCore.DIFFS, rec.diff)) delete rec.diff;
      return rec;
    } catch {
      return undefined;
    }
  }

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
    get: (id) => tx("readonly", (s) => s.get(id)).then(clean).catch(() => undefined),
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
            const rec = belongs(cur.value, id) && clean(cur.value);
            if (rec) out.push(rec);
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
