// Splitting the songs you add into vocals, drums, bass and other instruments, for Tiles' ×4 visuals
// (the vocal line, the outline and the sparks each follow their own part).
//
// It needs the separation pack, which the user downloads with one click in Settings → Music (in
// the desktop app; electron/pack.js). With it installed, every added song is separated in the
// background, one at a time, by separate-worker.js, on the GPU when there is one. Songs can be
// played straight away: until a song's parts are ready, Tiles uses its quick split instead.
//
// A song's parts are kept in IndexedDB ("stems"): { id, model, rate, length, vocals, drums, bass,
// other }, each part mono 16-bit at 11,025 Hz (about 2.6 MB for four minutes). They're only for
// the visuals, never played out loud.
(() => {
  const STORE = "stems";
  const MODEL = "spleeter-4stems-1"; // a new model would separate songs again
  const PARTS = ["vocals", "drums", "bass", "other"];
  const RATE_IN = 44100;

  const desktop = () => !!(window.touchType && window.touchType.pack);
  // pack: the pack's state; songs: songId → { status: queued | working | done | failed, percent, error }
  const state = { pack: { status: "none", percent: 0, error: null, size: 0 }, device: null, songs: {}, dev: false };
  const listeners = new Set();
  const changed = () => listeners.forEach((f) => { try { f(); } catch {} });
  const done = new Set();   // saved ids that have parts
  let queue = [];           // song ids waiting
  let worker = null, workerReady = null, running = false;
  let loaded = { id: null, stems: null }; // the parts of the last song played, as AudioBuffers

  async function tx(mode, fn) {
    const db = await TT.openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req && "result" in req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  const savedId = (songId) => String(songId).replace(/^u:/, "");

  // Where the pack's files are, if it's installed: the desktop app's, or a local copy (src/_pack/)
  // when testing in a browser.
  const base = () => (state.dev ? "_pack/" : desktop() && state.pack.status === "installed" ? window.touchType.pack.base : null);

  // ---------- the worker ----------

  function startWorker() {
    if (workerReady) return workerReady;
    worker = new Worker("separate-worker.js");
    workerReady = new Promise((resolve, reject) => {
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === "ready") {
          state.device = m.device;
          changed();
          resolve();
        } else if (m.type === "error" && m.id == null) reject(new Error(m.message));
        else if (worker.onJob) worker.onJob(m);
      };
      worker.onerror = (e) => reject(new Error(e.message || "The separator couldn't start."));
      worker.postMessage({ type: "init", base: base() });
    });
    return workerReady;
  }
  function stopWorker() {
    if (worker) worker.terminate();
    worker = null;
    workerReady = null;
  }

  // The song's audio as 44.1 kHz stereo, decoded on its own (not through the player's cache, so a
  // song being played isn't touched).
  async function stereo44(songId) {
    const decoded = await TT.music.decodeCopy(songId);
    const len = Math.ceil(decoded.duration * RATE_IN);
    const off = new OfflineAudioContext(2, len, RATE_IN);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const out = await off.startRendering();
    return [out.getChannelData(0), out.getChannelData(1)];
  }

  async function separateOne(songId) {
    const song = (state.songs[songId] = { status: "working", percent: 0 });
    changed();
    await startWorker();
    const [left, right] = await stereo44(songId);
    const stems = await new Promise((resolve, reject) => {
      worker.onJob = (m) => {
        if (m.id !== songId) return;
        if (m.type === "progress") {
          song.percent = Math.round(m.done * 100);
          changed();
        } else if (m.type === "done") resolve(m);
        else if (m.type === "error") reject(new Error(m.message));
      };
      worker.postMessage({ type: "separate", id: songId, left, right }, [left.buffer, right.buffer]);
    });
    const rec = { id: savedId(songId), model: MODEL, rate: stems.rate, length: stems.stems.vocals.length, made: new Date().toISOString() };
    for (const p of PARTS) rec[p] = stems.stems[p].buffer;
    await tx("readwrite", (s) => s.put(rec));
    done.add(rec.id);
    state.songs[songId] = { status: "done", percent: 100 };
    changed();
  }

  async function run() {
    if (running) return;
    running = true;
    try {
      while (queue.length && base()) {
        const songId = queue.shift();
        if (done.has(savedId(songId)) || !TT.songs.get(songId)) continue;
        try {
          await separateOne(songId);
        } catch (e) {
          state.songs[songId] = { status: "failed", error: (e && e.message) || String(e) };
          changed();
          // the separator itself couldn't start: don't try the rest now
          if (!state.device) break;
        }
      }
    } finally {
      running = false;
      stopWorker(); // frees the model (and the GPU) once the queue is done
      changed();
    }
  }

  // Every added song without parts waits its turn.
  function queueAll() {
    if (!base()) return;
    for (const song of TT.music.list()) {
      const id = savedId(song.id);
      if (done.has(id) || queue.includes(song.id) || (state.songs[song.id] && state.songs[song.id].status === "working")) continue;
      queue.push(song.id);
      state.songs[song.id] = { status: "queued" };
    }
    changed();
    run();
  }

  // ---------- the API ----------

  TT.separate = {
    PARTS,
    // in the desktop app, or with a local copy of the pack for testing in a browser
    supported: () => desktop() || state.dev,
    state: () => state,
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },

    // Called once at start, after the added songs are loaded.
    async start() {
      try {
        const all = await tx("readonly", (s) => s.getAllKeys());
        // only parts made by this model count
        for (const id of all || []) {
          const rec = await tx("readonly", (s) => s.get(id));
          if (rec && rec.model === MODEL) done.add(id);
        }
      } catch {}
      if (desktop()) {
        const p = window.touchType.pack;
        state.pack = await p.getState();
        p.onState((st) => {
          const was = state.pack.status;
          state.pack = st;
          changed();
          if (st.status === "installed" && was !== "installed") queueAll();
          if (st.status !== "installed") { queue = []; stopWorker(); }
        });
      } else if (location.protocol.startsWith("http")) {
        // a local copy of the pack, for testing
        try {
          const r = await fetch("_pack/NOTICE.txt", { method: "HEAD", cache: "no-store" });
          state.dev = r.ok;
          if (r.ok) state.pack = { status: "installed", percent: 100, error: null, size: 0 };
        } catch {}
      }
      changed();
      queueAll();
    },

    install: () => desktop() && window.touchType.pack.install(),
    cancel: () => desktop() && window.touchType.pack.cancel(),
    remove: () => desktop() && window.touchType.pack.remove(),

    // A song was added, or a song's parts should be made again.
    add(songId) {
      queueAll();
      return songId;
    },
    // A song was deleted.
    async forget(songId) {
      const id = savedId(songId);
      queue = queue.filter((x) => x !== songId);
      delete state.songs[songId];
      done.delete(id);
      if (loaded.id === id) loaded = { id: null, stems: null };
      try { await tx("readwrite", (s) => s.delete(id)); } catch {}
      changed();
    },

    // How a song stands: "done", "working" (with percent), "queued", "failed", or "none".
    statusOf(songId) {
      if (done.has(savedId(songId))) return { status: "done" };
      return state.songs[songId] || { status: "none" };
    },
    counts() {
      const songs = TT.music.list();
      return { total: songs.length, done: songs.filter((x) => done.has(savedId(x.id))).length };
    },

    // The parts of a song as AudioBuffers for the player (song.stems), or null if it has none.
    // Only the last song played is kept.
    async stemsFor(songId) {
      const id = savedId(songId);
      if (!done.has(id)) return null;
      if (loaded.id === id) return loaded.stems;
      const rec = await tx("readonly", (s) => s.get(id));
      if (!rec || rec.model !== MODEL) return null;
      const ctx = TT.tilesAudio.get();
      if (!ctx) return null;
      const stems = {};
      for (const p of PARTS) {
        const pcm = new Int16Array(rec[p]);
        const buf = ctx.createBuffer(1, pcm.length, rec.rate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32767;
        stems[p] = buf;
      }
      loaded = { id, stems };
      return stems;
    },
  };
})();
